// Yeti rich club : Risk en ligne (2 à 7 joueurs, bots compris). Le serveur fait autorité :
// il distribue les territoires, lance les dés, garde les cartes et les missions secrètes, et fait jouer les bots (./engine.js).
// Accès base par l'API HTTP avec des fonctions réservées au rôle service (rk_open, rk_save…).
import "./engine.js";

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).RiskEngine;
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
const LEVELS = ["easy", "normal", "hard"];
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
function viewOf(g: Row, viewer: number, boss = false) {
  const meta = { id: g.id, status: g.status, host: g.host, seats: g.seats.map(Number), seat_state: g.seat_state, config: g.config, version: g.version,
    created_at: g.created_at, moved_at: g.moved_at, finished_at: g.finished_at, server_time: new Date().toISOString(), viewer, boss };
  if (!g.state) return meta;
  return { ...meta, game: E.view(g.state, viewer ? g.state.players.indexOf(viewer) : -1) };
}

function start(g: Row) {
  const keep = g.seat_state.map((s: string, i: number) => (s === "invited" ? -1 : i)).filter((i: number) => i >= 0);
  g.seats = keep.map((i: number) => Number(g.seats[i]));
  g.seat_state = keep.map((i: number) => g.seat_state[i]);
  const levels: string[] = (g.config.bots || []).slice(0, 7 - g.seats.length);
  if (g.seats.length + levels.length < 2) throw new GameError("Il faut au moins 2 joueurs (bots compris).");
  const players = [...g.seats, ...levels.map((_, i) => -(i + 1))];
  const bots: Record<number, string> = {};
  levels.forEach((l, i) => { bots[g.seats.length + i] = LEVELS.includes(l) ? l : "normal"; });
  g.state = E.newGame({ players, bots, missions: g.config.missions !== false }, rng);
  E.runBots(g.state, rng);
  g.status = "playing";
}

// Applique une action à une copie de la partie. Renvoie {g} ou {deleted}.
// deno-lint-ignore no-explicit-any
function apply(g: Row, me: number, boss: boolean, action: string, b: any) {
  if (action === "answer") {
    const i = g.seats.map(Number).indexOf(me);
    if (g.status !== "lobby" || i < 0 || g.seat_state[i] !== "invited") throw new GameError("Invitation expirée.");
    if (b.accept) g.seat_state[i] = "joined";
    else { g.seats.splice(i, 1); g.seat_state.splice(i, 1); }
    if (!g.seat_state.includes("invited") && g.seat_state.length + (g.config.bots || []).length >= 2) start(g);
    return { g };
  }
  if (action === "start") {
    if (g.host !== me) throw new GameError("Seul l’organisateur peut lancer la partie.");
    if (g.status !== "lobby") throw new GameError("La partie a déjà commencé.");
    start(g);
    return { g };
  }
  if (action === "cancel") {
    if (g.host !== me || g.status !== "lobby") throw new GameError("Impossible d’annuler.");
    return { deleted: true };
  }
  if (g.status !== "playing") throw new GameError("La partie n’est pas en cours.");
  const st = g.state;
  try {
    if (action === "auto" || action === "kick") {
      if (!boss) throw new GameError("Réservé à Thibaud et Alexandre.");
      const seat = Number(b.seat);
      if (!(seat >= 0 && seat < st.P) || st.players[seat] < 0 || !st.alive[seat]) throw new GameError("Joueur introuvable.");
      if (action === "kick") {
        if (st.bots[seat]) throw new GameError("Déjà remplacé par un bot.");
        st.bots[seat] = "normal";
      } else {
        if (!E.actors(st).includes(seat)) throw new GameError("Ce n’est pas à lui de jouer.");
        if (Date.now() - Date.parse(g.moved_at) < IDLE_MS && st.players[seat] !== me) throw new GameError("Laisse-lui au moins 2 minutes.");
        E.autoTurn(st, seat, rng);
      }
    } else {
      const seat = st.players.indexOf(me);
      if (seat < 0) throw new GameError("Tu ne joues pas dans cette partie.");
      if (st.bots[seat]) throw new GameError("Un bot joue à ta place dans cette partie.");
      if (action === "claim") E.claim(st, seat, String(b.t));
      else if (action === "setup") E.setupPlace(st, seat, b.plan);
      else if (action === "trade") E.trade(st, seat, b.cards, rng);
      else if (action === "place") E.place(st, seat, b.plan);
      else if (action === "attack") E.attack(st, seat, String(b.from), String(b.to), Number(b.dice) || 3, rng, !!b.blitz);
      else if (action === "move") E.moveIn(st, seat, b.n);
      else if (action === "endattack") E.endAttack(st, seat);
      else if (action === "fortify") E.fortify(st, seat, String(b.from), String(b.to), b.n, rng);
      else if (action === "endturn") E.endTurn(st, seat, rng);
      else throw new GameError("Action inconnue.");
    }
    E.runBots(st, rng);
  } catch (e) { throw new GameError((e as Error).message); }
  if (st.phase === "done") g.status = "done";
  return { g };
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
    const ctx = await rpc("rk_open", { p_code: code, p_player: Number(b.player) || null, p_token: b.token ? String(b.token) : null, p_game: gid });
    if (!ctx.room) return fail("Code du groupe incorrect", 401);
    const me = Number(ctx.me) || 0, boss = !!ctx.boss;
    if (action === "state") {
      if (!ctx.row) return fail("Partie introuvable.", 404);
      return json(viewOf(ctx.row, me, boss));
    }
    if (!me) return fail("Reconnecte-toi pour jouer.", 401);
    if (action === "create") {
      const invite = [...new Set((Array.isArray(b.invite) ? b.invite : []).map(Number).filter((x: number) => x && x !== me))].slice(0, 6) as number[];
      const bots = (Array.isArray(b.bots) ? b.bots : []).map((l: string) => (LEVELS.includes(l) ? l : "normal")).slice(0, 6 - invite.length);
      if (invite.length + bots.length < 1) return fail("Invite au moins un pote ou ajoute un bot (2 à 7 joueurs).");
      if (invite.length + bots.length > 6) return fail("7 joueurs maximum, bots compris.");
      const config = { bots, missions: b.missions !== false };
      let row = await rpc("rk_insert", { p_room: ctx.room, p_host: me, p_seats: [me, ...invite], p_config: config });
      // partie solo contre des bots : on lance tout de suite
      if (!invite.length) {
        const g = structuredClone(row); start(g);
        row = await rpc("rk_save", { p_game: g.id, p_version: row.version, p_seats: g.seats.map(Number), p_seat_state: g.seat_state, p_status: g.status, p_state: g.state, p_finished: false }) || row;
      }
      return json(viewOf(row, me, boss));
    }
    let row = ctx.row;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!row) return fail("Partie introuvable.", 404);
      const version = row.version;
      const res = apply(structuredClone(row), me, boss, action, b);
      if ("deleted" in res) {
        if (await rpc("rk_delete", { p_game: row.id, p_version: version })) return json({ ok: true, deleted: true });
      } else {
        const g = res.g;
        const saved = await rpc("rk_save", { p_game: g.id, p_version: version, p_seats: g.seats.map(Number), p_seat_state: g.seat_state, p_status: g.status,
          p_state: g.state, p_finished: g.status === "done" });
        if (saved) return json(viewOf(saved, me, boss));
      }
      // quelqu'un a joué en même temps : on relit et on réessaie
      row = (await rpc("rk_open", { p_code: code, p_player: null, p_token: null, p_game: gid })).row;
    }
    return fail("La partie bouge beaucoup, réessaie.", 409);
  } catch (e) {
    return fail(e instanceof GameError ? e.message : "Erreur du serveur de jeu.", e instanceof GameError ? 400 : 500);
  }
});
