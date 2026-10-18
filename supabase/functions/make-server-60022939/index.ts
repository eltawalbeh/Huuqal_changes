// HuuQa CMS API — deploy with verify_jwt=true.
// Uses the caller's JWT and the anon key, NOT service_role, so database
// Row Level Security (RLS) limits privileges to the existing CMS policies.
// IMPORTANT: the current CMS RLS policies also permit anon writes. A separate
// auth/RLS migration is required to secure administrator actions.

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const CMS_KEYS = new Set([
  "settings", "content", "seo", "menu", "seed_version", "categories", "revision",
]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...COMMON_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function failure(error: { message?: string } | null, status = 500): Response {
  const safeStatus = status >= 400 && status <= 599 ? status : 502;
  return json({ error: error?.message ?? "Supabase request failed" }, safeStatus);
}

function clientFor(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Supabase function environment is incomplete");

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? ("Bearer " + anonKey),
      },
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: COMMON_HEADERS });
  }

  const url = new URL(req.url);
  // The browser uses /functions/v1/make-server-60022939/{route}.
  // Also accept the legacy doubled Make prefix for compatibility.
  const pathname = url.pathname.replace(/^\/make-server-60022939(?=\/)/, "");

  if (pathname === "/health") {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    return json({ status: "ok", service: "huuqa-cms", version: 1 });
  }

  try {
    const keyMatch = /^\/cms\/([a-z_]+)$/.exec(pathname);
    if (keyMatch) {
      const section = keyMatch[1];
      if (!CMS_KEYS.has(section)) return json({ error: "Unknown CMS key" }, 400);
      if (req.method !== "GET" && req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const supabase = clientFor(req);
      const table = supabase.from("kv_store_0947ad50");
      const key = "cms:" + section;

      if (req.method === "GET") {
        const { data, error, status } = await table.select("value").eq("key", key).maybeSingle();
        if (error) return failure(error, status);
        return json({ value: data?.value ?? null });
      }

      const rawBody = await req.text();
      if (rawBody.length > 1024 * 1024) return json({ error: "CMS payload too large" }, 413);
      let value: unknown;
      try { value = JSON.parse(rawBody); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { error, status } = await table.upsert({ key, value }, { onConflict: "key" });
      if (error) return failure(error, status);
      return json({ ok: true });
    }

    if (pathname === "/upload") {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const size = Number(req.headers.get("content-length") ?? "0");
      // Base64 is approximately 4/3 of the image size.
      if (size > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8192) {
        return json({ error: "Image upload exceeds 6 MB" }, 413);
      }

      const payload = await req.json().catch(() => null) as
        { base64?: string; filename?: string; contentType?: string } | null;
      const contentType = payload?.contentType ?? "";
      const ext = IMAGE_TYPES[contentType];
      if (!ext) return json({ error: "Supported images: JPG, PNG, WebP, GIF" }, 415);
      if (typeof payload?.base64 !== "string") return json({ error: "Missing image data" }, 400);

      const b64 = payload.base64.includes(",")
        ? payload.base64.substring(payload.base64.indexOf(",") + 1)
        : payload.base64;
      if (b64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) {
        return json({ error: "Image upload exceeds 6 MB" }, 413);
      }

      let binary: string;
      try { binary = atob(b64); }
      catch { return json({ error: "Invalid base64 image" }, 400); }
      if (binary.length > MAX_IMAGE_BYTES) return json({ error: "Image upload exceeds 6 MB" }, 413);

      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const path = "menu/" + Date.now() + "_" + crypto.randomUUID() + "." + ext;
      const supabase = clientFor(req);
      // New, unique, immutable filenames only. Existing images are untouched.
      const { error, data } = await supabase.storage
        .from("make-a3f1a5bb-media")
        .upload(path, bytes, { contentType, cacheControl: "604800", upsert: false });
      if (error) return failure(error, Number(error.statusCode) || 502);
      const { data: publicObject } = supabase.storage
        .from("make-a3f1a5bb-media").getPublicUrl(data?.path ?? path);
      return json({ url: publicObject.publicUrl });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("HuuQa Edge API error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Internal function error" }, 500);
  }
});
