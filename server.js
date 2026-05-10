// server.js - Node.js/Express proxy for Railway (FIXED)
import express from 'express';

const app = express();

// ✅ Fix 1: Parse TARGET_DOMAIN cleanly
const TARGET = process.env.TARGET_DOMAIN?.trim().replace(/\/$/, "");

if (!TARGET) {
  console.error("❌ TARGET_DOMAIN not set");
  process.exit(1);
}
console.log(`✅ Proxying to: ${TARGET}`);

// ✅ Fix 2: Parse PORT as integer
const PORT = parseInt(process.env.PORT, 10) || 3000;
console.log(`✅ Listening on port ${PORT}`);

// Capture raw body for proxying
app.use((req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = chunks.length > 0 ? Buffer.concat(chunks) : null;
    next();
  });
});

app.all('*', async (req, res) => {
  const targetUrl = TARGET + req.url;
  
  // ✅ Fix 3: Use Object.entries() for Express headers (plain object)
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (['host','connection','keep-alive','transfer-encoding','upgrade','content-length'].includes(k) || 
        k.startsWith('x-vercel') || k.startsWith('x-forwarded') || k === 'cf-connecting-ip') {
      continue;
    }
    headers[key] = value;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.rawBody,
      redirect: 'manual',
      signal: controller.signal,
      duplex: 'half',
    });

    clearTimeout(timeout);
    res.status(response.status);
    response.headers.forEach((v, k) => res.set(k, v));
    const buf = await response.arrayBuffer();
    res.send(Buffer.from(buf));
    
  } catch (err) {
    console.error('❌ Proxy error:', err.message);
    res.status(502).json({ error: 'Upstream failed', details: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', target: TARGET, port: PORT });
});

// ✅ Fix 4: Listen with parsed PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
