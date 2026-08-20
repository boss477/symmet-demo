import { getSupabase } from "./supabase.js";
import { generateShareToken } from "../lib/shareLink.js";

function client() {
  var sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb;
}

/** Ensure the project has a share_token; return it. */
export async function ensureShareToken(projectId) {
  var sb = client();
  var got = await sb.from("projects").select("share_token").eq("id", projectId).maybeSingle();
  if (got.error) throw got.error;
  if (got.data && got.data.share_token) return got.data.share_token;
  var token = generateShareToken();
  var upd = await sb.from("projects").update({ share_token: token }).eq("id", projectId).select();
  if (upd.error) throw upd.error;
  if (!upd.data || upd.data.length === 0) throw new Error("Could not set share token (project not found or write blocked)");
  return token;
}

/** Publish to the gallery: set published, title, and (optional) cover; also ensure a token. */
export async function publishProject(projectId, opts) {
  opts = opts || {};
  var patch = { published: true };
  if (opts.title != null) patch.title = String(opts.title);
  if (opts.coverImageUrl != null) patch.cover_image_url = String(opts.coverImageUrl);
  var sb = client();
  var upd = await sb.from("projects").update(patch).eq("id", projectId).select();
  if (upd.error) throw upd.error;
  if (!upd.data || upd.data.length === 0) throw new Error("Could not publish (project not found or write blocked)");
  return ensureShareToken(projectId);
}

/** Resolve a share_token to a project id, or null. */
export async function getProjectIdByToken(token) {
  var got = await client().from("projects").select("id").eq("share_token", token).maybeSingle();
  if (got.error) throw got.error;
  return got.data ? got.data.id : null;
}

/** List published projects for the gallery feed. */
export async function listPublished() {
  var got = await client()
    .from("projects")
    .select("id, title, name, share_token, cover_image_url, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (got.error) throw got.error;
  return got.data || [];
}
