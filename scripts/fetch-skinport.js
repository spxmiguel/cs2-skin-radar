// Fetches Skinport price data server-side (handles Brotli/gzip/deflate)
// Run by GitHub Actions hourly — saves to data/skinport.json
const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');

const OPTIONS = {
  hostname: 'api.skinport.com',
  path: '/v1/items?app_id=730&currency=USD',
  headers: {
    'Accept':          'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent':      'CS2SkinRadar/1.0 (github.com/spxmiguel/cs2-skin-radar)',
  },
  timeout: 30000,
};

function decompress(res, cb) {
  const enc = (res.headers['content-encoding'] || '').toLowerCase();
  console.log(`HTTP ${res.statusCode} | encoding: ${enc || 'none'}`);
  let stream = res;
  if (enc === 'br')      stream = res.pipe(zlib.createBrotliDecompress());
  else if (enc === 'gzip')   stream = res.pipe(zlib.createGunzip());
  else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
  let body = '';
  stream.on('data', c => { body += c; });
  stream.on('end',  () => cb(null, body));
  stream.on('error', cb);
}

const req = https.get(OPTIONS, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Bad status: ${res.statusCode}`);
    process.exit(1);
  }

  decompress(res, (err, body) => {
    if (err) { console.error('Decompress:', err.message); process.exit(1); }

    let data;
    try { data = JSON.parse(body); }
    catch (e) {
      console.error('JSON parse error:', e.message);
      console.error('Body preview:', body.slice(0, 300));
      process.exit(1);
    }

    if (!Array.isArray(data) || !data.length) {
      console.error('Unexpected data shape:', typeof data, JSON.stringify(data).slice(0, 200));
      process.exit(1);
    }

    const outDir  = path.join(__dirname, '..', 'data');
    const outFile = path.join(outDir, 'skinport.json');
    fs.mkdirSync(outDir, { recursive: true });

    // Write compact JSON + metadata wrapper
    const out = {
      fetched_at: new Date().toISOString(),
      count: data.length,
      items: data,
    };
    fs.writeFileSync(outFile, JSON.stringify(out));

    console.log(`✓ Saved ${data.length} items → data/skinport.json`);
    console.log('  Sample:', JSON.stringify(data[0]).slice(0, 120));
  });
});

req.on('timeout', () => { console.error('Request timed out'); req.destroy(); process.exit(1); });
req.on('error',   e  => { console.error('Request error:', e.message); process.exit(1); });
