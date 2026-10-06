const { r2Client, bucket } = require('../config/r2');
const {
  DeleteObjectsCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

/**
 * Delete specific object keys from R2
 */
async function deleteR2Keys(keys) {
  if (!keys || keys.length === 0) return 0;
  const validKeys = keys.filter(k => k);
  if (validKeys.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < validKeys.length; i += 1000) {
    const chunk = validKeys.slice(i, i + 1000).map(k => ({ Key: k }));
    try {
      await r2Client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true }
      }));
      deleted += chunk.length;
    } catch (err) {
      console.error(`⚠️  R2 batch delete failed (chunk ${i}):`, err.message);
    }
  }

  if (deleted > 0) console.log(`🗑  R2 deleted ${deleted} keys`);
  return deleted;
}

/**
 * Delete all objects under a prefix (e.g., "places/1/")
 */
async function deleteR2Prefix(prefix) {
  if (!prefix) return 0;

  let deleted = 0;
  let continuationToken;

  try {
    do {
      const listRes = await r2Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      }));

      if (listRes.Contents && listRes.Contents.length > 0) {
        const keys = listRes.Contents.map(o => ({ Key: o.Key }));
        await r2Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys, Quiet: true }
        }));
        deleted += keys.length;
      }

      continuationToken = listRes.IsTruncated
        ? listRes.NextContinuationToken
        : null;
    } while (continuationToken);

    if (deleted > 0) {
      console.log(`🗑  R2 deleted ${deleted} objects under "${prefix}"`);
    }
  } catch (err) {
    console.error(`⚠️  R2 prefix delete failed (${prefix}):`, err.message);
  }

  return deleted;
}

module.exports = { deleteR2Keys, deleteR2Prefix };