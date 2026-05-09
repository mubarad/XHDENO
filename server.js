import express from 'express';

const app = express();
const TARGET = process.env.TARGET_DOMAIN?.replace(/\/$/, "");

if (!TARGET) {
  console.error("❌ Missing TARGET_DOMAIN environment variable");
  process.exit(1);
}

console.log(`✅ Target: ${TARGET}`);

// Disable Express body parsing - we proxy raw bodies
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.all('*', async (req, res) => {
  const path = req.url;
  const targetUrl = TARGET + path;

  // Forward headers (exclude hop-by-hop)
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (["host", "connection", "keep-alive", "transfer-encoding", "upgrade"].includes(k) || 
        k.startsWith("x-vercel") || k.startsWith("x-forwarded") || k === "cf-connecting-ip") {
      continue;
    }
    headers[key] = value;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : null,
      duplex: "half",
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Copy response
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      res.set(key, value);
    });

    // Send body
    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
    
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(502).send("Upstream error: " + err.message);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', target: TARGET });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 XHTTP Relay listening on port ${PORT}`);
});
