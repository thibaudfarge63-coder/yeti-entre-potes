// Edge Function Supabase « yeti-push » : envoi des notifications push (appelée par la base via pg_net).
// Déployée sur le projet bmqkhumtkdtrdxsjjubt (verify_jwt = false, authentifiée par le secret partagé de yeti_private.settings).
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
let cfg: Record<string, string> | null = null;
async function settings() {
  if (!cfg) {
    const rows = await sql`select key, value from yeti_private.settings`;
    cfg = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    webpush.setVapidDetails(cfg.site_url, cfg.vapid_public, cfg.vapid_private);
  }
  return cfg;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  let data: any;
  try { data = await req.json(); } catch { return new Response("json", { status: 400 }); }
  const c = await settings();
  if (!data || data.secret !== c.push_secret) return new Response("forbidden", { status: 403 });
  const subs = Array.isArray(data.subs) ? data.subs.slice(0, 200) : [];
  const payload = JSON.stringify(data.payload || {});
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s: any) => {
    try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: "high" }); sent++; }
    catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint); else console.error("push error", e?.statusCode, e?.body); }
  }));
  if (dead.length) await sql`delete from yeti_private.push_subscriptions where endpoint = any(${dead})`;
  return new Response(JSON.stringify({ sent, dead: dead.length }), { headers: { "Content-Type": "application/json" } });
});
