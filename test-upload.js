require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

(async () => {
  try {
    const buffer = fs.readFileSync('/tmp/test-photos/photo1.png');
    console.log('File size:', buffer.length, 'bytes');

    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test/manual-upload.png',
      Body: buffer,
      ContentType: 'image/png'
    }));

    console.log('✅ Upload OK');
    console.log('Public URL:', process.env.R2_PUBLIC_URL + '/test/manual-upload.png');
  } catch (err) {
    console.error('❌ Error:', err.Code || err.name);
    console.error('   Message:', err.message);
  }
})();
