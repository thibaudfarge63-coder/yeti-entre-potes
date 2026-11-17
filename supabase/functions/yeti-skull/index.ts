// Yeti rich club : Skull King en ligne (2 à 9 joueurs). Le serveur fait autorité :
// il distribue, garde les mains secrètes, valide chaque carte et calcule les scores avec le moteur ./engine.js.
// Accès base par l'API HTTP (rapide) avec des fonctions réservées au rôle service (sk_open, sk_save…).
import "./engine.js";

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).SkullEngine;
const BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const rng = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const IDLE_MS = 2 * 60 * 1000;
class GameError extends Error {}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` }, body: JSON.stringify(args),
  });
  const t = await r.text();
  const data = t ? JSON.parse(t) : null;
  if (!r.ok) throw new GameError((data && data.message) || "Base indisponible.");
  return data;
}

// deno-lint-ignore no-explicit-any
type Row = any;
function viewOf(g: Row, viewer: number) {
  const meta = { id: g.id, status: g.status, host: g.host, seats: g.seats.map(Number), seat_state: g.seat_state, config: g.config, version: g.version,
    created_at: g.created_at, moved_at: g.moved_at, finished_at: g.finished_at, server_time: new Date().toISOString(), viewer };
  if (!g.state) return meta;
  return { ...meta, game: E.view(g.state, g.state.players.indexOf(viewer)) };
}
// Qui doit agir maintenant (pour les notifications)
// deno-lint-ignore no-explicit-any
const actors = (st: any): number[] => !st ? [] : st.phase === "bid" ? st.players.filter((_: number, i: number) => st.bids[i] === null)
  : st.turn !== null && st.turn !== undefined ? [st.players[st.turn]] : [];
const push = (room: string, who: number[], title: string, body: string, id: number) =>
  who.length ? rpc("sk_push", { p_room: room, p_players: who, p_title: title, p_body: body, p_url: "?open=skull&id=" + id, p_tag: "skull-" + id }).catch(() => {}) : null;

function start(g: Row) {
  const keep = g.seat_state.map((s: string, i: number) => (s === "invited" ? -1 : i)).filter((i: number) => i >= 0);
  g.seats = keep.map((i: number) => Number(g.seats[i]));
  g.seat_state = keep.map((i: number) => g.seat_state[i]);
  g.state = E.newGame({ players: g.seats, rounds: g.config.rounds, options: g.config.options }, rng);
  g.status = "playing";
}

// Applique une action à une copie de la partie. Renvoie {g, notify} ou {deleted}.
// deno-lint-ignore no-explicit-any
function apply(g: Row, me: number, action: string, b: any) {
  const before = actors(g.state);
  if (action === "answer") {
    const i = g.seats.map(Number).indexOf(me);
    if (g.status !== "lobby" || i < 0 || g.seat_state[i] !== "invited") throw new GameError("Invitation expirée.");
    if (b.accept) g.seat_state[i] = "joined";
    else { g.seats.splice(i, 1); g.seat_state.splice(i, 1); }
    if (!g.seat_state.includes("invited") && g.seat_state.length >= 2) start(g);
  } else if (action === "start") {
    if (g.host !== me) throw new GameError("Seul l’organisateur peut lancer la partie.");
    if (g.status !== "lobby") throw new GameError("La partie a déjà commencé.");
    if (g.seat_state.filter((x: string) => x !== "invited").length < 2) throw new GameError("Il faut au moins un autre joueur qui a rejoint.");
    start(g);
  } else if (action === "cancel") {
    if (g.host !== me || g.status !== "lobby") throw new GameError("Impossible d’annuler.");
    return { deleted: true };
  } else {
    if (g.status !== "playing") throw new GameError("La partie n’est pas en cours.");
    const st = g.state, seat = st.players.indexOf(me);
    if (seat < 0) throw new GameError("Tu ne joues pas dans cette partie.");
    try {
      if (action === "bid") E.placeBid(st, seat, b.n);
      else if (action === "play") E.playCard(st, seat, String(b.card), b.decl || {});
      else if (action === "plank") E.choosePlank(st, seat, Number(b.idx));
      else if (action === "nudge") {
        if (Date.now() - Date.parse(g.moved_at) < IDLE_MS) throw new GameError("Laisse-lui au moins 2 minutes.");
        const late = actors(st).filter((p: number) => p !== me);
        if (!late.length) throw new GameError("Personne à faire jouer.");
        for (const p of late) E.autoAct(st, st.players.indexOf(p), rng);
      } else throw new GameError("Action inconnue.");
    } catch (e) { throw new GameError((e as Error).message); }
    if (st.phase === "next") E.nextRound(st, rng);
    if (st.phase === "done") g.status = "done";
  }
  const after = actors(g.state), fresh = after.filter((p: number) => p !== me && !before.includes(p));
  let notify = null;
  if (g.status === "playing" && fresh.length) {
    notify = g.state.phase === "bid" ? { who: fresh, title: `☠️ Skull King : manche ${g.state.round}`, body: "À toi de parier !" }
      : { who: fresh, title: "☠️ Skull King : à toi de jouer !", body: "Pose ta carte, la table t’attend." };
  }
  return { g, notify };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return fail("method", 405);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch (_) { return fail("JSON attendu"); }
  const code = String(b.code || "").slice(0, 128);
  if (code.length < 4) return fail("Code du groupe incorrect", 401);
  const action = String(b.action || "");
  try {
    const gid = b.game ? Number(b.game) : null;
    const ctx = await rpc("sk_open", { p_code: code, p_player: Number(b.player) || null, p_token: b.token ? String(b.token) : null, p_game: gid });
    if (!ctx.room) return fail("Code du groupe incorrect", 401);
    const me = Number(ctx.me) || 0;
    if (action === "state") {
      if (!ctx.row) return fail("Partie introuvable.", 404);
      return json(viewOf(ctx.row, me));
    }
    if (!me) return fail("Reconnecte-toi pour jouer.", 401);
    if (action === "create") {
      const invite = [...new Set((Array.isArray(b.invite) ? b.invite : []).map(Number).filter((x: number) => x && x !== me))].slice(0, 8) as number[];
      if (!invite.length) return fail("Invite au moins un pote (2 à 9 joueurs).");
      const rounds = Math.max(1, Math.min(10, Math.floor(Number(b.rounds) || 10)));
      const config = { rounds, options: E.normOptions(b.options || {}, invite.length + 1) };
      const row = await rpc("sk_insert", { p_room: ctx.room, p_host: me, p_seats: [me, ...invite], p_config: config });
      await push(ctx.room, invite, `☠️ ${ctx.name || "Quelqu’un"} t’invite au Skull King`, "Rejoins la partie dans Compétitions › Skull King.", row.id);
      return json(viewOf(row, me));
    }
    let row = ctx.row;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!row) return fail("Partie introuvable.", 404);
      const version = row.version;
      const res = apply(structuredClone(row), me, action, b);
      if ("deleted" in res) {
        if (await rpc("sk_delete", { p_game: row.id, p_version: version })) return json({ ok: true, deleted: true });
      } else {
        const g = res.g;
        const saved = await rpc("sk_save", { p_game: g.id, p_version: version, p_seats: g.seats.map(Number), p_seat_state: g.seat_state, p_status: g.status,
          p_state: g.state, p_finished: g.status === "done" });
        if (saved) {
          if (res.notify) await push(ctx.room, res.notify.who, res.notify.title, res.notify.body, g.id);
          return json(viewOf(saved, me));
        }
      }
      // quelqu'un a joué en même temps : on relit et on réessaie
      row = (await rpc("sk_open", { p_code: code, p_player: null, p_token: null, p_game: gid })).row;
    }
    return fail("La partie bouge beaucoup, réessaie.", 409);
  } catch (e) {
    return fail(e instanceof GameError ? e.message : "Erreur du serveur de jeu.", e instanceof GameError ? 400 : 500);
  }
});
