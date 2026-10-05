require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

console.log('═══ 1. DNS Resolve ═══');
const host = process.env.R2_ENDPOINT.replace('https://', '').split('/')[0];
console.log('Host:', host);

dns.lookup(host, { family: 4, all: true }, (err, addrs) => {
  if (err) {
    console.error('❌ DNS fail:', err.code);
    return;
  }
  console.log('IPv4 addresses:', addrs.map(a => a.address));
  console.log('');

  testConnection();
});

async function testConnection() {
  console.log('═══ 2. Direct HTTP Test ═══');
  const https = require('https');
  const req = https.request({
    hostname: host,
    port: 443,
    path: '/',
    method: 'GET',
    timeout: 10000,
    family: 4  // 👈 Force IPv4
  }, (res) => {
    console.log('✅ HTTP Status:', res.statusCode);
    console.log('Headers:', res.headers);
    res.destroy();
    testS3();
  });

  req.on('error', (err) => {
    console.error('❌ HTTP Error:', err.code || err.name, '-', err.message);
    console.error('   → Network/firewall issue');
    testS3();
  });

  req.on('timeout', () => {
    console.error('❌ HTTP Timeout after 10s');
    req.destroy();
    testS3();
  });

  req.end();
}

async function testS3() {
  console.log('');
  console.log('═══ 3. S3 SDK Test ═══');
  const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    requestHandler: {
      httpsAgent: new (require('https').Agent)({
        family: 4,  // 👈 Force IPv4
        keepAlive: true
      })
    },
    maxAttempts: 1,
    requestHandler: undefined
  });

  try {
    const start = Date.now();
    const res = await client.send(new ListBucketsCommand({}));
    console.log(`✅ R2 Connected in ${Date.now() - start}ms`);
    console.log('Buckets:', res.Buckets?.map(b => b.Name));
  } catch (err) {
    console.error('❌', err.Code || err.name, '-', err.message);
    console.error('   $metadata:', JSON.stringify(err.$metadata, null, 2));
  }
}
