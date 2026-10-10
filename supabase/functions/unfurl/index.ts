import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Unfurls a pasted article URL into its card metadata (image, title,
// description) so webapp-created posts get photos just like extension
// clips. Called from CreatePage before publishing.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }
  if (req.method !== "POST") {
    return json({ error: "POST a JSON body like {\"url\": \"https://…\"}" }, 405);
  }

  let url = "";
  try {
    const body = await req.json();
    url = String(body?.url || "").trim();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return json({ error: "That URL does not parse." }, 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return json({ error: "Only http(s) URLs can be unfurled." }, 400);
  }
  if (isPrivateHost(target.hostname)) {
    return json({ error: "That host is not allowed." }, 400);
  }
  try {
    const resolved = await Deno.resolveDns(target.hostname, "A");
    if ((resolved || []).some((ip) => isPrivateIp(ip))) {
      return json({ error: "That host is not allowed." }, 400);
    }
  } catch {
    // DNS failure surfaces as a fetch failure below; keep going.
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(target.href, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AnnotatedBot/1.0; +https://annotated4.pages.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return json({ error: `Source returned ${res.status}.` }, 502);
    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html/i.test(contentType)) return json({ error: "Not an article page." }, 422);
    const length = Number(res.headers.get("content-length") || 0);
    if (length > 2_000_000) return json({ error: "Page too large." }, 422);
    const html = await res.text();
    // Meta tags can sit hundreds of KB deep (ad-bloated heads), so search
    // well past the opening markup. Cap far above any real page.
    const head = html.length > 1_500_000 ? html.slice(0, 1_500_000) : html;
    const pick = (patterns: RegExp[]): string => {
      for (const re of patterns) {
        const m = head.match(re);
        if (m && m[1]) {
          const abs = absolutize(m[1].trim(), target);
          if (abs) return abs;
        }
      }
      return "";
    };
    const image = pick([
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const text = (patterns: RegExp[]): string => {
      for (const re of patterns) {
        const m = head.match(re);
        if (m && m[1] && m[1].trim()) return m[1].trim().slice(0, 300);
      }
      return "";
    };
    const title = text([
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);
    const description = text([
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    return json({ image, title, description });
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError"
      ? "Source took too long to respond."
      : "Could not read that page.";
    return json({ error: message }, 502);
  } finally {
    clearTimeout(timer);
  }
});

function absolutize(raw: string, base: URL): string {
  if (!raw || raw.startsWith("data:")) return "";
  try {
    const abs = new URL(raw, base.href).href;
    return /^https?:\/\//.test(abs) ? abs : "";
  } catch {
    return "";
  }
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return isPrivateIp(h);
}

function isPrivateIp(hostOrIp: string): boolean {
  const h = hostOrIp.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }
  if (h.includes(":")) {
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  }
  return false;
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
