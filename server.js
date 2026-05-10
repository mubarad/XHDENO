import express from 'express';
const app = express();
const TARGET = process.env.TARGET_DOMAIN?.replace(/\/$/, "");

if (!TARGET) {
  console.error("TARGET_DOMAIN not set");
  process.exit(1);
}

app.all('*', async (req, res) => {
  const targetUrl = TARGET + req.url;
  const headers = {};
  
  // ✅ Fix: Use Object.entries() for Express (plain object headers)
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (['host','connection','keep-alive','transfer-encoding'].includes(k) || k.startsWith('x-')) continue;
    headers[key] = value;
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
      redirect: 'manual',
      duplex: 'half'
    });
    
    res.status(response.status);
    response.headers.forEach((v, k) => res.set(k, v));
    const buf = await response.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(502).send('Upstream error');
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Running'));
