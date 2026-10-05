const pool = require('../config/db');
const { r2Client, bucket, publicUrl } = require('../config/r2');
const { DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

// ═══════════════════════════════════════════
// Upload photos (max 5)
// ═══════════════════════════════════════════
exports.uploadPlacePhotos = async (req, res) => {
  try {
    const { placeId } = req.params;

    const place = await pool.query(
      'SELECT id, photos FROM halal_places WHERE id = $1 AND owner_id = $2',
      [placeId, req.user.id]
    );

    if (!place.rows.length) {
      if (req.files) await deleteR2Objects(req.files.map(f => f.key));
      return res.status(404).json({ message: 'Place not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No photos uploaded' });
    }

    const existing = place.rows[0].photos || [];
    const totalAfter = existing.length + req.files.length;

    if (totalAfter > 5) {
      await deleteR2Objects(req.files.map(f => f.key));
      return res.status(400).json({
        message: `Max 5 photos allowed. You already have ${existing.length}, tried adding ${req.files.length}.`,
        current: existing.length,
        max: 5
      });
    }

    const newPhotos = req.files.map(f => ({
      key: f.key,
      url: `${publicUrl}/${f.key}`,
      filename: f.key.split('/').pop(),
      size: f.size,
      mimetype: f.mimetype,
      uploadedAt: new Date().toISOString()
    }));

    const allPhotos = [...existing, ...newPhotos];

    await pool.query(
      'UPDATE halal_places SET photos = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(allPhotos), placeId]
    );

    console.log(`✅ ${req.files.length} photos uploaded for place ${placeId}`);

    res.json({
      message: `${req.files.length} photo(s) uploaded`,
      placeId: Number(placeId),
      totalPhotos: allPhotos.length,
      maxPhotos: 5,
      photos: allPhotos
    });
  } catch (err) {
    console.error('uploadPlacePhotos error:', err);
    if (req.files) await deleteR2Objects(req.files.map(f => f.key).filter(Boolean));
    res.status(500).json({ message: 'Upload failed', detail: err.message });
  }
};

// ═══════════════════════════════════════════
// Delete photo
// ═══════════════════════════════════════════
exports.deletePlacePhoto = async (req, res) => {
  try {
    const { placeId } = req.params;
    const { key } = req.body;

    if (!key) return res.status(400).json({ message: 'key required' });

    const place = await pool.query(
      'SELECT id, photos FROM halal_places WHERE id = $1 AND owner_id = $2',
      [placeId, req.user.id]
    );

    if (!place.rows.length) return res.status(404).json({ message: 'Place not found' });

    const existing = place.rows[0].photos || [];
    const filtered = existing.filter(p => p.key !== key);

    if (filtered.length === existing.length) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    try {
      await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log('✅ R2 deleted:', key);
    } catch (r2Err) {
      console.warn('⚠️ R2 delete failed:', r2Err.message);
    }

    await pool.query(
      'UPDATE halal_places SET photos = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(filtered), placeId]
    );

    res.json({
      message: 'Photo deleted',
      placeId: Number(placeId),
      totalPhotos: filtered.length,
      photos: filtered
    });
  } catch (err) {
    console.error('deletePlacePhoto error:', err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
};

// ═══════════════════════════════════════════
// List photos
// ═══════════════════════════════════════════
exports.listPlacePhotos = async (req, res) => {
  try {
    const { placeId } = req.params;

    const place = await pool.query(
      'SELECT id, photos FROM halal_places WHERE id = $1 AND owner_id = $2',
      [placeId, req.user.id]
    );

    if (!place.rows.length) return res.status(404).json({ message: 'Place not found' });

    const photos = place.rows[0].photos || [];

    res.json({
      placeId: Number(placeId),
      count: photos.length,
      maxPhotos: 5,
      photos
    });
  } catch (err) {
    console.error('listPlacePhotos error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper
async function deleteR2Objects(keys) {
  if (!keys || keys.length === 0) return;
  try {
    await r2Client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.filter(k => k).map(k => ({ Key: k })), Quiet: true }
    }));
  } catch (err) {
    console.error('R2 batch delete failed:', err.message);
  }
}
