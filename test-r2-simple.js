require('dotenv').config();
const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');

console.log('SDK:', require('@aws-sdk/client-s3/package.json').version);
console.log('Node:', process.version);
console.log('Endpoint:', process.env.R2_ENDPOINT);
console.log('Bucket:', process.env.R2_BUCKET_NAME);
console.log('AccessKey length:', (process.env.R2_ACCESS_KEY_ID || '').length);
console.log('');

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

(async () => {
  console.log('Sending HeadBucket...');
  const start = Date.now();
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET_NAME }));
    console.log(`✅ OK in ${Date.now() - start}ms`);
  } catch (err) {
    console.error(`❌ ${err.Code || err.name} in ${Date.now() - start}ms`);
    console.error('   Message:', err.message);
    console.error('   HTTP:', err.$metadata?.httpStatusCode);
    if (err.$response) {
      console.error('   Response:', err.$response.statusCode);
    }
  }
})();
