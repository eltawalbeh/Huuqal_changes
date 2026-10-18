import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "Prefer"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const routes = ["", "/make-server-60022939"] as const;

for (const prefix of routes) {
  app.get(`${prefix}/health`, (c) => c.json({ status: "ok" }));
}

// ── Image upload ──────────────────────────────────────────────────────────────
// Supabase client is initialized lazily inside the handler so a bad env var
// cannot crash the entire server on startup.
for (const prefix of routes) {
app.post(`${prefix}/upload`, async (c) => {
  try {
    const { createClient } = await import("npm:@supabase/supabase-js");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const MEDIA_BUCKET = "make-a3f1a5bb-media";
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === MEDIA_BUCKET)) {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    }

    const { base64, filename, contentType } = await c.req.json();
    if (!base64) return c.json({ error: "No base64 data provided" }, 400);
    if (!contentType?.startsWith("image/")) return c.json({ error: "File must be an image" }, 400);

    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const ext = (filename as string)?.split(".").pop()?.toLowerCase() || contentType.split("/")[1] || "jpg";
    const path = `menu/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType, upsert: false, cacheControl: '604800' });

    if (error) {
      console.log("Storage upload error:", error);
      return c.json({ error: `Storage error: ${error.message}` }, 500);
    }

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return c.json({ url: data.publicUrl });
  } catch (e) {
    console.log("Upload route error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
}

// ── CMS persistence ──────────────────────────────────────────────────────────
const CMS_KEYS = ["settings", "content", "seo", "menu", "seed_version", "categories", "revision"] as const;
type CmsKey = typeof CMS_KEYS[number];

function isCmsKey(k: string): k is CmsKey {
  return (CMS_KEYS as readonly string[]).includes(k);
}

for (const prefix of routes) {
app.get(`${prefix}/cms/:key`, async (c) => {
  const key = c.req.param("key");
  if (!isCmsKey(key)) return c.json({ error: "Unknown CMS key" }, 400);
  try {
    const value = await kv.get(`cms:${key}`);
    return c.json({ value: value ?? null });
  } catch (e) {
    console.log(`Error reading CMS key ${key}:`, e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post(`${prefix}/cms/:key`, async (c) => {
  const key = c.req.param("key");
  if (!isCmsKey(key)) return c.json({ error: "Unknown CMS key" }, 400);
  try {
    const body = await c.req.json();
    await kv.set(`cms:${key}`, body);
    return c.json({ ok: true });
  } catch (e) {
    console.log(`Error writing CMS key ${key}:`, e);
    return c.json({ error: String(e) }, 500);
  }
});
}

Deno.serve(app.fetch);
