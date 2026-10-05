const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const crypto = require('crypto');
const { r2Client, bucket } = require('../config/r2');

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WEBP images allowed'), false);
  }
};

const upload = multer({
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  storage: multerS3({
    s3: r2Client,
    bucket: bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const placeId = req.params.placeId;
      const ext = path.extname(file.originalname).toLowerCase();
      const hash = crypto.randomBytes(8).toString('hex');
      const key = `places/${placeId}/${Date.now()}-${hash}${ext}`;
      cb(null, key);
    }
  })
});

module.exports = {
  uploadPlacePhotosR2: upload.array('photos', 5)
};
