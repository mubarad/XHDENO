import express from 'express';

const app = express();
const TARGET = process.env.TARGET_DOMAIN?.replace(/\/$/, "");

if (!TARGET) {
  console.error("Missing TARGET_DOMAIN environment variable");
  process.exit(1);
}

// Handle all methods
app.all('*', async (req, res) => {
  const path = req.url;
  const targetUrl = TARGET + path;

  const headers = new Headers();
  for (const [key, value] of req.headers) {
    const k = key.toLowerCase();
    if (
      k === "host" ||
      k === "connection" ||
      k === "keep-alive" ||
      k === "transfer-encoding" ||
      k.startsWith("x-vercel") ||
      k === "cf-connecting-ip"
    ) continue;

    headers.set(key, value);
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

    // Copy status and headers
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      res.set(key, value);
    });

    // Send body
    if (upstream.body) {
      upstream.body.pipeTo(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).send("Upstream error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`XHTTP Relay running on port ${PORT}`);
  console.log(`Target: ${TARGET}`);
});
