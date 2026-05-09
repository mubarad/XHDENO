// server.js - Node.js proxy for Railway
import express from 'express';

const app = express();
const TARGET = process.env.TARGET_DOMAIN?.replace(/\/$/, "");

if (!TARGET) {
  console.error("❌ TARGET_DOMAIN not set");
  process.exit(1);
}

console.log(`✅ Proxying to: ${TARGET}`);

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
  const path = req.url;
  const targetUrl = TARGET + path;

  // ✅ Fix: Use Object.entries() for Express headers (plain object)
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length'].includes(k) || 
        k.startsWith('x-vercel') || k.startsWith('x-forwarded') || k === 'cf-connecting-ip') {
      continue;
    }
    headers[key] = value;
  }

  // Add content-length if body exists
  if (req.rawBody?.length > 0) {
    headers['content-length'] = req.rawBody.length.toString();
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

    // Send response
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error('❌ Proxy error:', err.message);
    res.status(502).json({ error: 'Upstream failed', details: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', target: TARGET, time: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
