const TARGET = Deno.env.get("TARGET_DOMAIN")?.replace(/\/$/, "");

async function handleRequest(req: Request): Promise<Response> {
  if (!TARGET) {
    return new Response("TARGET_DOMAIN not set", { 
      status: 500,
      headers: { "content-type": "text/plain" }
    });
  }

  const url = new URL(req.url);
  const path = url.pathname + url.search;
  const targetUrl = TARGET + path;

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const k = key.toLowerCase();
    if (["host", "connection", "keep-alive", "transfer-encoding", "upgrade"].includes(k) || 
        k.startsWith("x-vercel") || k.startsWith("x-forwarded") || k === "cf-connecting-ip") {
      continue;
    }
    headers.set(key, value);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : null,
      redirect: "manual",
      signal: controller.signal,
      duplex: "half",
    });

    clearTimeout(timeout);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response("Bad Gateway", { 
      status: 502,
      headers: { "content-type": "text/plain" }
    });
  }
}

Deno.serve(handleRequest);
