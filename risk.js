/* Risk : salon, carte du monde en relief, troupes (soldat / animal de la région / char) et animations.
   Toute la logique tourne sur le serveur (fonction yeti-risk) ; ici on affiche la vue de chaque joueur et on envoie ses ordres.
   Carte : risk-map.js (Natural Earth, domaine public). Silhouettes : risk-art.js (game-icons.net, CC BY 3.0). */
(() => {
  'use strict';
  const E = () => window.RiskEngine;
  const MAP = () => window.RISK_MAP;
  const ICON = () => window.RISK_ICONS || {};
  const COLORS = ['#e0483e', '#3b82e0', '#3fb25c', '#f0a92e', '#9a5ce0', '#22b8c0', '#e05cae'];
  const DARK = ['#8f241d', '#1e4f94', '#1f6e35', '#a3680f', '#5e2d9a', '#0f6f75', '#932a68'];
  const LEVEL = {easy: 'facile', normal: 'normal', hard: 'fort'};
  const BOT_NAMES = ['Général Grizzli', 'Amiral Morse', 'Colonel Caribou', 'Major Marmotte', 'Capitaine Castor', 'Sergent Pingouin'];
  const ANIMAL_NAME = {taureau: 'taureaux', lama: 'lamas', vache: 'vaches', elephant: 'éléphants', chameau: 'chameaux', tigre: 'tigres', kangourou: 'kangourous'};
  const ANIMAL_ICON = {taureau: 'taureau', lama: 'lama', vache: 'vache', elephant: 'elephant', chameau: 'chameau', tigre: 'tigre', kangourou: 'kangourou'};
  const fmtT = t => { const d = new Date(t), tz = {timeZone: 'Europe/Paris'}, day = x => new Intl.DateTimeFormat('fr-FR', {...tz, day: '2-digit', month: '2-digit'}).format(x);
    const h = new Intl.DateTimeFormat('fr-FR', {...tz, hour: '2-digit', minute: '2-digit'}).format(d).replace(':', 'h'); return day(d) === day(new Date()) ? h : day(d) + ' ' + h; };

  let ctx = null, panelEl = null, root = null, list = [], listLoaded = false, listTimer = null, knownInv = null, lastBadge = -1;
  let pick = new Set(), nBots = 2, botLevel = 'normal', missionsOn = true, creating = false;
  let cur = null, timer = null, busy = false;
  // sélection locale
  let plan = {}, planStack = [], sel = null, target = null, dice = 3, fortN = 0, moveN = 0, sheet = null, fullView = false, seenEv = 0, queue = [], playing = false;
  const esc = s => ctx.escape(String(s));
  const pl = id => (id > 0 && ctx.player(id)) || null;
  const sess = () => ctx.session();
  const meId = () => { const s = sess(); return s ? s.player : 0; };
  const nameOf = id => (id < 0 ? BOT_NAMES[(-id - 1) % BOT_NAMES.length] : pl(id) ? pl(id).name : '?');
  const seatName = (G, s) => { const id = G.players[s]; const n = nameOf(id); return id > 0 && G.bots[s] ? n + ' (bot)' : n; };
  const T = id => E().TERR[id];

  async function api(body) {
    const s = sess(), r = await ctx.request('/api/risk', {...body, player: s ? s.player : 0, token: s ? s.token : ''});
    if (body.action !== 'state' && rt) rt.ping();
    return r;
  }
  // ---------- temps réel : simple « ping » Supabase Realtime, le relevé toutes les 2 s reste en secours ----------
  let rt = null;
  function rtOpen(id) {
    rtClose();
    const c = window.YETI_CONFIG || {};
    if (!c.supabaseUrl || !c.publishableKey || !window.WebSocket) return;
    const topic = 'realtime:yeti-risk-' + id, me = {ref: 1, hb: null};
    const ws = new WebSocket(c.supabaseUrl.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(c.publishableKey) + '&vsn=1.0.0');
    const send = (event, payload, t = topic) => { if (ws.readyState === 1) ws.send(JSON.stringify({topic: t, event, payload, ref: String(++me.ref), join_ref: '1'})); };
    ws.onopen = () => { send('phx_join', {config: {broadcast: {self: false}, presence: {key: ''}, postgres_changes: [], private: false}}); me.hb = setInterval(() => send('heartbeat', {}, 'phoenix'), 25000); };
    ws.onmessage = e => { try { if (JSON.parse(e.data).event === 'broadcast' && cur && cur.id === id) load(false); } catch (_) {} };
    ws.onclose = () => { clearInterval(me.hb); if (rt === me) { rt = null; setTimeout(() => { if (cur && cur.id === id && !rt) rtOpen(id); }, 3000); } };
    me.ws = ws; me.ping = () => send('broadcast', {type: 'broadcast', event: 'moved', payload: {}});
    rt = me;
  }
  function rtClose() { const r = rt; rt = null; if (r) { clearInterval(r.hb); r.ws.close(); } }

  // ---------- panneau (salon) ----------
  function init(options) {
    ctx = options; panelEl = ctx.panel;
    panelEl.addEventListener('click', onPanelClick);
    panelEl.addEventListener('change', e => {
      const l = e.target.closest('[data-rk-level]'); if (l) { botLevel = l.value; renderPanel(); }
      const m = e.target.closest('[data-rk-missions]'); if (m) { missionsOn = m.checked; renderPanel(); }
    });
    clearInterval(listTimer); listTimer = setInterval(() => { if (!document.hidden) loadList(); }, 12000);
    loadList(); setTimeout(loadList, 2500); setTimeout(loadList, 6000);
  }
  async function loadList() {
    if (!ctx || !ctx.ready()) return;
    try { const r = await ctx.request('/api/risk/list', {}); list = (r && r.games) || []; listLoaded = true; } catch (_) { return; }
    const me = meId();
    if (me) {
      const inv = list.filter(g => g.status === 'lobby' && g.seats.some((p, i) => p === me && g.seat_state[i] === 'invited'));
      if (knownInv) for (const g of inv) if (!knownInv.has(g.id)) ctx.toast(`🎲 ${nameOf(g.host)} t’invite au Risk !`);
      knownInv = new Set(inv.map(g => g.id));
    }
    renderPanel();
  }
  const todoFor = (g, me) => g.status === 'lobby' ? g.seats.some((p, i) => p === me && g.seat_state[i] === 'invited') : g.status === 'playing' && (g.waiting || []).includes(me);
  function renderPanel() {
    if (!panelEl) return;
    const me = meId(), players = ctx.players().filter(p => p.id !== me);
    const todo = me ? list.filter(g => todoFor(g, me)).length : 0;
    if (todo !== lastBadge) { lastBadge = todo; ctx.badge(todo); }
    const maxBots = 6 - pick.size;
    if (nBots > maxBots) nBots = maxBots;
    const total = 1 + pick.size + nBots;
    const form = me ? `<div class="sk-new rk-new">
        <p class="duel-pick-label">Invite des potes (2 à 7 joueurs, bots compris) :</p>
        <div class="duel-pick">${players.map(p => `<button type="button" class="duel-opp ${pick.has(p.id) ? 'on' : ''}" data-rk-pick="${p.id}" aria-pressed="${pick.has(p.id)}">${ctx.avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>
        <div class="rk-botrow"><span>🤖 Bots</span><button type="button" data-rk-bots="-1" ${nBots <= 0 ? 'disabled' : ''} aria-label="Un bot de moins">−</button><b>${nBots}</b><button type="button" data-rk-bots="1" ${nBots >= maxBots ? 'disabled' : ''} aria-label="Un bot de plus">+</button>
          <label>Niveau <select data-rk-level>${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${botLevel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <label class="rk-check"><input type="checkbox" data-rk-missions ${missionsOn ? 'checked' : ''}> 📜 Missions annexes (3 objectifs secrets chacun, bonus en jeu)</label>
        <button type="button" class="sk-go" data-rk-create ${creating || total < 2 ? 'disabled' : ''}>🎲 ${total < 2 ? 'Ajoute un pote ou un bot' : pick.size ? `Inviter ${pick.size} pote${pick.size > 1 ? 's' : ''}${nBots ? ` + ${nBots} bot${nBots > 1 ? 's' : ''}` : ''}` : `Jouer contre ${nBots} bot${nBots > 1 ? 's' : ''}`} · ${total} joueurs</button>
      </div>` : '<p class="br-empty">Connecte-toi pour lancer une partie.</p>';
    const boss = !!(ctx.boss && ctx.boss());
    const mine = list.filter(g => g.seats.includes(me) && g.status !== 'done');
    const others = list.filter(g => !g.seats.includes(me) && g.status === 'playing');
    const done = list.filter(g => g.status === 'done').slice(0, 5);
    const row = g => {
      const ids = g.players || [...g.seats, ...(g.config.bots || []).map((_, i) => -(i + 1))], i = g.seats.indexOf(me), invited = g.status === 'lobby' && i >= 0 && g.seat_state[i] === 'invited';
      const chips = ids.map((p, k) => `<span class="cam-chip ${(g.waiting || []).includes(p) ? 'turn' : ''} ${g.alive && !g.alive[k] ? 'out' : ''}"><i style="background:${COLORS[k % 7]}"></i>${p < 0 ? '🤖 ' : ''}${esc(nameOf(p))}${g.territories ? ` · ${g.territories[k]}🗺️` : ''}${g.status === 'lobby' && g.seat_state[k] === 'invited' ? ' ⏳' : ''}</span>`).join('');
      let st, act;
      if (g.status === 'lobby') {
        st = invited ? `<b>${esc(nameOf(g.host))} t’invite !</b>` : 'En attente des invités…';
        act = invited ? `<button type="button" class="cam-yes" data-rk-answer="${g.id}" data-ok="1">Rejoindre</button><button type="button" class="cam-no" data-rk-answer="${g.id}" data-ok="0">Refuser</button>`
          : `<button type="button" data-rk-open="${g.id}">Ouvrir</button>`;
      } else if (g.status === 'playing') {
        const m2 = todoFor(g, me);
        st = m2 ? `<b class="cam-you">${g.phase === 'setup' ? 'Place tes armées !' : g.phase === 'claim' ? 'Choisis un territoire !' : 'À toi de jouer !'}</b>` : g.phase === 'setup' ? 'Mise en place' : g.phase === 'claim' ? 'Partage du monde' : `Tour ${g.round}`;
        act = `<button type="button" class="${m2 ? 'cam-yes' : ''}" data-rk-open="${g.id}">${i >= 0 ? 'Jouer' : 'Regarder'}</button>`;
      } else {
        st = g.winner !== null && g.winner !== undefined && g.players ? `🏆 ${esc(nameOf(g.players[g.winner]))} conquiert le monde` : 'Terminée';
        act = `<button type="button" data-rk-open="${g.id}">Voir</button>`;
      }
      const when = g.started_at ? `🕒 début ${fmtT(g.started_at)}` : g.created_at ? `✉️ créée ${fmtT(g.created_at)}` : '';
      return `<div class="cam-row"><div class="cam-chips">${chips}</div><div class="cam-row-foot"><span class="cam-st">${st}<small class="cam-when">${when}</small></span><span class="cam-acts">${act}${boss ? `<button type="button" class="del-game" data-del-kind="risk" data-del-id="${g.id}" title="Supprimer cette partie" aria-label="Supprimer">🗑️</button>` : ''}</span></div></div>`;
    };
    const html = form + (boss && list.length ? '<div class="del-bar"><button type="button" class="del-all" data-del-kind="risk" data-del-scope="done">🗑️ Vider les terminées</button><button type="button" class="del-all hard" data-del-kind="risk" data-del-scope="all">💣 Tout supprimer</button></div>' : '')
      + (mine.length ? '<p class="duel-sep">Tes parties</p>' + mine.map(row).join('') : '')
      + (others.length ? '<p class="duel-sep">En cours dans le club</p>' + others.map(row).join('') : '')
      + (done.length ? '<p class="duel-sep">Terminées</p>' + done.map(row).join('') : '')
      + (!mine.length && !others.length && !done.length ? '<p class="br-empty">Aucune partie pour l’instant.</p>' : '');
    if (panelEl._html !== html) { panelEl.innerHTML = html; panelEl._html = html; }
  }
  async function onPanelClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.rkPick) { const id = Number(b.dataset.rkPick); if (pick.has(id)) pick.delete(id); else if (pick.size < 6) pick.add(id); else ctx.toast('7 joueurs maximum.'); renderPanel(); return; }
    if (b.dataset.rkBots) { nBots = Math.max(0, Math.min(6 - pick.size, nBots + Number(b.dataset.rkBots))); renderPanel(); return; }
    if ('rkCreate' in b.dataset) {
      creating = true; renderPanel();
      try {
        const g = await api({action: 'create', invite: [...pick], bots: Array(nBots).fill(botLevel), missions: missionsOn});
        ctx.toast(pick.size ? '🎲 Invitations envoyées !' : '🎲 C’est parti contre les bots !');
        pick.clear(); await loadList(); open(g.id);
      } catch (err) { ctx.toast(err.message || 'Impossible de créer la partie.'); }
      finally { creating = false; renderPanel(); }
      return;
    }
    if (b.dataset.rkAnswer) {
      const ok = b.dataset.ok === '1', id = Number(b.dataset.rkAnswer);
      try { await api({action: 'answer', game: id, accept: ok}); await loadList(); if (ok) open(id); else ctx.toast('Invitation refusée.'); }
      catch (err) { ctx.toast(err.message || 'Oups.'); loadList(); }
      return;
    }
    if (b.dataset.rkOpen) open(Number(b.dataset.rkOpen));
  }

  // ---------- ouverture de la table ----------
  async function open(id) {
    if (!ctx) return;
    if (cur && cur.id !== id) close(true);
    ctx.onOpen && ctx.onOpen(id);
    root = ctx.root; root.hidden = false; root.className = 'board-stage rk-stage';
    root.innerHTML = '<div class="gb-loading"><span class="spinner"></span><p>On déplie la carte du monde…</p></div>';
    root._mode = '';
    rtOpen(id); cur = {id, loading: true}; resetSel(); seenEv = -1; queue = []; playing = false; sheet = null;
    await load(true);
    clearInterval(timer); timer = setInterval(poll, 2000);
  }
  function close(silent) {
    clearInterval(timer); timer = null; rtClose(); cur = null; sheet = null; fullView = false; queue = [];
    if (root) { root.hidden = true; root.innerHTML = ''; root._mode = ''; root.className = 'board-stage'; }
    if (!silent && ctx && ctx.onClose) ctx.onClose();
    loadList();
  }
  let loading = null, loadedAt = 0, fails = 0, polling = false;
  async function poll() {
    if (!cur || document.hidden || polling) return;
    polling = true;
    try { const v = await ctx.request('/api/risk/version', {game: cur.id}); fails = 0; if (cur && v && (v.version !== cur.version || Date.now() - loadedAt > 15000)) await load(false); else renderStatus(); }
    catch (_) { fails += 1; }
    finally { polling = false; }
  }
  function load(first) {
    if (!cur) return Promise.resolve();
    if (loading) return loading;
    const id = cur.id;
    loading = (async () => {
      try { const g = await api({action: 'state', game: id}); loadedAt = Date.now(); fails = 0; if (cur && g.id === cur.id) take(g); }
      catch (err) {
        if (first && root && cur && cur.loading) { root.innerHTML = `<div class="gb-loading"><p>${esc(err.message || 'Partie introuvable.')}</p><button type="button" data-rk-close>Fermer</button></div>`; root.querySelector('[data-rk-close]').onclick = () => close(); clearInterval(timer); cur = null; }
        else fails += 1;
      }
      finally { loading = null; }
    })();
    return loading;
  }
  const wake = () => { if (cur && !document.hidden) load(false); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);

  function resetSel() { plan = {}; planStack = []; sel = null; target = null; fortN = 0; moveN = 0; }
  function take(g) {
    const prev = cur && cur.game;
    const prevKey = prev ? prev.phase + ':' + prev.turn + ':' + prev.round : '';
    cur = g;
    const G = g.game;
    if (G) {
      const key = G.phase + ':' + G.turn + ':' + G.round;
      if (key !== prevKey) resetSel();
      if (G.move && G.move.to) moveN = moveN && moveN >= G.move.min && moveN <= G.move.max ? moveN : G.move.max;
      if (sel && G.owner[sel] !== G.me) { sel = null; target = null; }
      if (target && G.owner[target] === G.me && G.phase === 'attack') target = null;
      // événements à animer
      if (seenEv < 0) seenEv = G.seq || 0;
      else { const fresh = (G.ev || []).filter(e => e.id > seenEv); if (fresh.length) { queue.push(...fresh); seenEv = fresh[fresh.length - 1].id; } }
      if (g.status === 'done' && prev && prev.phase !== 'done') setTimeout(() => ctx.party && ctx.party(), 400);
    }
    render();
    runQueue();
  }

  // ---------- rendu ----------
  function render() {
    if (!root || !cur) return;
    if (cur.status === 'lobby' || !cur.game) return renderLobby();
    if (root._mode !== 'table') mount();
    root.classList.toggle('rk-full', fullView);
    paintMap(); renderStatus(); renderSide(); renderSheet();
  }
  function renderLobby() {
    const g = cur, me = meId(), boss = g.host === me;
    const bots = (g.config.bots || []);
    root._mode = 'lobby';
    root.innerHTML = `<div class="cam-head"><button type="button" class="gb-back" data-rk-close>🚪 Quitter</button><h3>🎲 Risk</h3><span class="cam-need-tag">${g.seats.length + bots.length} joueurs</span></div>
      <div class="rk-lobby"><p>En attente des invités…</p><div class="cam-chips">${g.seats.map((p, i) => `<span class="cam-chip"><i style="background:${COLORS[i % 7]}"></i>${esc(nameOf(p))} ${g.seat_state[i] === 'invited' ? '⏳' : '✅'}</span>`).join('')}
        ${bots.map((l, i) => `<span class="cam-chip"><i style="background:${COLORS[(g.seats.length + i) % 7]}"></i>🤖 ${esc(nameOf(-(i + 1)))} (${LEVEL[l] || l})</span>`).join('')}</div>
        ${boss ? `<div class="rk-lobby-acts"><button type="button" class="sk-go" data-rk-start ${g.seat_state.filter(s => s !== 'invited').length + bots.length < 2 ? 'disabled' : ''}>🎲 Lancer sans attendre</button><button type="button" class="cam-no" data-rk-cancel>Annuler la partie</button></div>` : ''}</div>`;
    root.querySelector('[data-rk-close]').onclick = () => close();
    const s = root.querySelector('[data-rk-start]'); if (s) s.onclick = () => act({action: 'start'});
    const c = root.querySelector('[data-rk-cancel]'); if (c) c.onclick = async () => { try { await api({action: 'cancel', game: cur.id}); ctx.toast('Partie annulée.'); close(); } catch (e) { ctx.toast(e.message); } };
  }
  const icon = (k, size, fill, x = 0, y = 0) => ICON()[k] ? `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true"><path d="${ICON()[k]}" fill="${fill}"/></svg>` : '';
  function mount() {
    const M = MAP(), ids = E().IDS;
    root._mode = 'table';
    const lands = ids.map(t => `<path class="rk-land" data-t="${t}" d="${M.t[t].d}"/>`).join('');
    const sides = ids.map(t => `<path d="${M.t[t].d}"/>`).join('');
    const links = M.links.map(([a, b]) => {
      const A = M.t[a], B = M.t[b];
      if ((a === 'alaska' && b === 'kamchatka') || (a === 'kamchatka' && b === 'alaska')) {
        const K = M.t.kamchatka, L = M.t.alaska;
        return `<path class="rk-link" d="M${L.x},${L.y} L-10,${L.y - 6}"/><path class="rk-link" d="M${K.x},${K.y} L${M.w + 10},${K.y - 20}"/>`;
      }
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - Math.hypot(A.x - B.x, A.y - B.y) * .12;
      return `<path class="rk-link" d="M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}"/>`;
    }).join('');
    root.innerHTML = `<div class="rk-top"><button type="button" class="gb-back" data-rk-close title="Ta place est gardée : reviens quand tu veux avec « Tes parties en cours »">🚪 Quitter la partie</button>
        <b class="rk-title">🎲 Risk</b><span class="rk-round" data-rk-round></span>
        <span class="rk-top-acts"><button type="button" data-rk-sheet="cards">🃏 <span data-rk-ncards>0</span></button><button type="button" data-rk-sheet="missions">📜 Missions</button><button type="button" data-rk-sheet="help" title="Règles">❔</button><button type="button" data-rk-full title="Plein écran">⛶</button></span></div>
      <div class="rk-status" data-rk-status></div>
      <div class="rk-main"><div class="rk-mapwrap"><div class="rk-map3d">
        <svg class="rk-map" viewBox="0 0 ${M.w} ${M.h}" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="rk-sea" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a7fb0"/><stop offset=".7" stop-color="#174e78"/><stop offset="1" stop-color="#0c2f4d"/></radialGradient>
            <pattern id="rk-wave" width="40" height="16" patternUnits="userSpaceOnUse"><path d="M0 8q10-6 20 0t20 0" fill="none" stroke="#9fd3f5" stroke-width=".8" opacity=".35"/></pattern>
            <linearGradient id="rk-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
            <marker id="rk-head-attack" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#ffd23a"/></marker>
            <marker id="rk-head-move" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#bff0ff"/></marker>
            <filter id="rk-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <rect width="${M.w}" height="${M.h}" fill="url(#rk-sea)"/>
          <rect class="rk-waves" x="-40" width="${M.w + 80}" height="${M.h}" fill="url(#rk-wave)"/>
          <g class="rk-sides" transform="translate(0 5)">${sides}</g>
          <g class="rk-sides2" transform="translate(0 2.5)">${sides}</g>
          <g class="rk-lands">${lands}</g>
          <g class="rk-shine" pointer-events="none">${ids.map(t => `<path d="${M.t[t].d}"/>`).join('')}</g>
          <g class="rk-links" pointer-events="none">${links}</g>
          <g class="rk-arrows" pointer-events="none" data-rk-arrows></g>
          <g class="rk-troops" data-rk-troops></g>
          <g class="rk-fx" pointer-events="none" data-rk-fx></g>
        </svg></div>
        <div class="rk-dice" data-rk-dice hidden></div><div class="rk-banner" data-rk-banner hidden></div><div class="rk-tip" data-rk-tip hidden></div>
      </div><aside class="rk-side" data-rk-side></aside></div>
      <div class="rk-sheet" data-rk-sheetbox hidden></div>`;
    root.querySelector('[data-rk-close]').onclick = () => close();
    root.querySelector('[data-rk-full]').onclick = () => { fullView = !fullView; render(); };
    root.querySelectorAll('[data-rk-sheet]').forEach(b => { b.onclick = () => { sheet = sheet === b.dataset.rkSheet ? null : b.dataset.rkSheet; renderSheet(); }; });
    const svg = root.querySelector('.rk-map');
    svg.addEventListener('click', e => { const p = e.target.closest('[data-t]'); if (p) clickTerr(p.dataset.t, e); });
    svg.addEventListener('contextmenu', e => { const p = e.target.closest('[data-t]'); if (p) { e.preventDefault(); clickTerr(p.dataset.t, e, true); } });
    svg.addEventListener('mousemove', e => { const p = e.target.closest('[data-t]'); showTip(p ? p.dataset.t : null, e); });
    svg.addEventListener('mouseleave', () => showTip(null));
    root.addEventListener('click', onRootClick);
  }
  function showTip(t, e) {
    const tip = root && root.querySelector('[data-rk-tip]'); if (!tip) return;
    if (!t || !cur || !cur.game || matchMedia('(hover: none)').matches) { tip.hidden = true; return; }
    const G = cur.game, o = G.owner[t], c = T(t).cont, cont = E().CONT[c];
    tip.innerHTML = `<b>${esc(T(t).name)}</b><span>${o === null ? 'Libre' : `${esc(seatName(G, o))} · ${G.armies[t]} armée${G.armies[t] > 1 ? 's' : ''}`}</span><small>${cont.name} (+${cont.bonus}) · ${esc(ANIMAL_NAME[E().animalOf(t)])}</small>`;
    const box = root.querySelector('.rk-mapwrap').getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 180) + 'px'; tip.style.top = (e.clientY - box.top + 14) + 'px'; tip.hidden = false;
  }
  // Troupes : char = 10, animal de la région = 5, soldat = 1
  function troopsSVG(t, n, s) {
    const c = Math.floor(n / 10), a = Math.floor((n % 10) / 5), so = n % 5, an = ANIMAL_ICON[E().animalOf(t)];
    const parts = [];
    if (c) parts.push(['char', c]); if (a) parts.push([an, a]); if (so) parts.push(['soldat', so]);
    const w = parts.length * 11 + 14, h = 15;
    let x = -w / 2 + 3, inner = '';
    for (const [k] of parts) { inner += icon(k, 11, '#fff', x, -h / 2 + 2); x += 11; }
    return `<g class="rk-tk" data-t="${t}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7.5" fill="${DARK[s % 7]}" stroke="#fff" stroke-width=".8"/>${inner}<text x="${w / 2 - 6}" y="4" text-anchor="middle">${n}</text></g>`;
  }
  function paintMap() {
    const G = cur.game, M = MAP(), me = G.me;
    const shown = displayArmies(G);
    const hl = highlights(G);
    root.querySelectorAll('.rk-land').forEach(p => {
      const t = p.dataset.t, s = G.owner[t];
      p.setAttribute('fill', s === null ? '#d9cfb4' : COLORS[s % 7]);
      p.classList.toggle('free', s === null);
      p.classList.toggle('mine', s === me);
      p.classList.toggle('sel', t === sel || t === target);
      p.classList.toggle('can', hl.can.has(t));
      p.classList.toggle('dim', hl.dim && !hl.can.has(t) && t !== sel && t !== target);
    });
    root.querySelectorAll('.rk-sides path, .rk-sides2 path').forEach((p, i) => { const t = E().IDS[i % 42]; p.setAttribute('fill', G.owner[t] === null ? '#8c826a' : DARK[G.owner[t] % 7]); });
    const troops = E().IDS.filter(t => G.owner[t] !== null).map(t => `<g transform="translate(${M.t[t].x} ${M.t[t].y})" class="rk-tkw ${plan[t] ? 'plus' : ''}" data-t="${t}">${troopsSVG(t, shown[t], G.owner[t])}${plan[t] ? `<text class="rk-plus" y="-11" text-anchor="middle">+${plan[t]}</text>` : ''}</g>`).join('');
    const tg = root.querySelector('[data-rk-troops]');
    if (tg._html !== troops) { tg.innerHTML = troops; tg._html = troops; }
    const ar = root.querySelector('[data-rk-arrows]');
    const arrow = sel && target ? arrowSVG(sel, target, G.phase === 'fortify' ? 'move' : 'attack') : '';
    if (ar._sel !== arrow) { ar.innerHTML = arrow; ar._sel = arrow; }
  }
  const displayArmies = G => { const a = {...G.armies}; for (const t in plan) a[t] += plan[t]; return a; };
  function arrowSVG(a, b, kind) {
    const M = MAP(), A = M.t[a], B = M.t[b];
    let bx = B.x, by = B.y;
    if ((a === 'alaska' && b === 'kamchatka')) bx = -20; if (a === 'kamchatka' && b === 'alaska') bx = M.w + 20;
    const mx = (A.x + bx) / 2, my = (A.y + by) / 2 - Math.hypot(A.x - bx, A.y - by) * .25;
    return `<path class="rk-arrow ${kind}" d="M${A.x},${A.y} Q${mx},${my} ${bx},${by}" marker-end="url(#rk-head-${kind})"/>`;
  }
  // Territoires cliquables selon la phase
  function highlights(G) {
    const me = G.me, can = new Set(), myTurn = G.turn === me && me >= 0;
    const mine = t => G.owner[t] === me;
    if (G.phase === 'claim') { if (myTurn) E().IDS.filter(t => G.owner[t] === null).forEach(t => can.add(t)); return {can, dim: false}; }
    if (G.phase === 'setup' && me >= 0 && !G.setupDone[me]) { E().IDS.filter(mine).forEach(t => can.add(t)); return {can, dim: false}; }
    if (!myTurn) return {can, dim: false};
    if (G.phase === 'reinforce' && !G.mustTrade) E().IDS.filter(mine).forEach(t => can.add(t));
    if (G.phase === 'attack') {
      if (!sel) E().IDS.filter(t => mine(t) && G.armies[t] > 1 && T(t).adj.some(x => !mine(x))).forEach(t => can.add(t));
      else T(sel).adj.filter(x => !mine(x)).forEach(t => can.add(t));
      return {can, dim: !!sel};
    }
    if (G.phase === 'fortify') {
      if (!sel) E().IDS.filter(t => mine(t) && G.armies[t] > 1).forEach(t => can.add(t));
      else E().IDS.filter(t => mine(t) && t !== sel && E().connected({owner: G.owner}, me, sel, t)).forEach(t => can.add(t));
      return {can, dim: !!sel};
    }
    return {can, dim: false};
  }
  function clickTerr(t, e, minus) {
    if (busy || !cur || !cur.game) return;
    const G = cur.game, me = G.me, mine = G.owner[t] === me;
    if (G.phase === 'claim') {
      if (G.turn !== me) return ctx.toast('Ce n’est pas ton tour de choisir.');
      if (G.owner[t] !== null) return ctx.toast('Ce territoire est déjà pris : choisis-en un libre.');
      return act({action: 'claim', t});
    }
    const placing = (G.phase === 'setup' && me >= 0 && !G.setupDone[me]) || (G.phase === 'reinforce' && G.turn === me && !G.mustTrade);
    if (placing) {
      if (!mine) return ctx.toast('Place tes armées sur tes propres territoires.');
      const left = G.toPlace[me] - Object.values(plan).reduce((a, b) => a + b, 0);
      const k = minus || (e && e.shiftKey) ? -1 : 1;
      if (k > 0 && left <= 0) return ctx.toast('Plus d’armées à placer : valide !');
      if (k < 0 && !plan[t]) return;
      plan[t] = (plan[t] || 0) + k; if (!plan[t]) delete plan[t];
      if (k > 0) planStack.push(t); else planStack.splice(planStack.lastIndexOf(t), 1);
      if (ctx.sound) ctx.sound('move');
      return render();
    }
    if (G.turn !== me) return;
    if (G.phase === 'attack') {
      if (mine) { if (G.armies[t] < 2) return ctx.toast('Il faut au moins 2 armées pour attaquer.'); if (!T(t).adj.some(x => G.owner[x] !== me)) return ctx.toast('Aucun ennemi autour de ce territoire.'); sel = sel === t ? null : t; target = null; dice = Math.min(3, G.armies[t] - 1); return render(); }
      if (!sel) return ctx.toast('Choisis d’abord un de tes territoires.');
      if (!T(sel).adj.includes(t)) return ctx.toast(`${T(t).name} n’est pas voisin de ${T(sel).name}.`);
      target = t; dice = Math.min(3, G.armies[sel] - 1); return render();
    }
    if (G.phase === 'fortify') {
      if (!mine) return;
      if (!sel || (t === sel)) { if (G.armies[t] < 2 && !sel) return ctx.toast('Il faut au moins 2 armées pour en déplacer.'); sel = sel === t ? null : t; target = null; return render(); }
      if (!E().connected({owner: G.owner}, me, sel, t)) return ctx.toast('Pas de chemin par tes territoires.');
      target = t; fortN = G.armies[sel] - 1; return render();
    }
  }
  // Barre d'action
  function renderStatus() {
    if (!root || !cur || !cur.game || root._mode !== 'table') return;
    const G = cur.game, me = G.me, el = root.querySelector('[data-rk-status]');
    root.querySelector('[data-rk-round]').textContent = G.phase === 'claim' ? 'Partage du monde' : G.phase === 'setup' ? 'Mise en place' : G.phase === 'done' ? 'Terminée' : `Tour ${G.round}`;
    root.querySelector('[data-rk-ncards]').textContent = me >= 0 ? (G.hand || []).length : '–';
    const used = Object.values(plan).reduce((a, b) => a + b, 0);
    const who = s => `<b style="color:${COLORS[s % 7]}">${esc(seatName(G, s))}</b>`;
    let h = '', mineTurn = false;
    const free = E().IDS.filter(t => G.owner[t] === null).length;
    if (G.phase === 'done') h = `🏆 ${who(G.winner)} a conquis le monde !`;
    else if (G.phase === 'claim') {
      if (G.turn === me) { mineTurn = true; h = `<span>🚩 À toi de choisir un territoire libre (en beige) : pose ta 1re armée dessus. Encore ${free} territoire${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}.</span>`; }
      else h = `${idleHtml(G)}Partage du monde : ${who(G.turn)} choisit un territoire… (${free} libre${free > 1 ? 's' : ''})`;
    }
    else if (G.phase === 'setup') {
      if (me >= 0 && !G.setupDone[me]) { mineTurn = true; const left = G.toPlace[me] - used;
        h = `<span>Place tes armées de départ : <b>${left}</b> restante${left > 1 ? 's' : ''}. Touche tes territoires (clic droit ou Maj+clic pour retirer).</span>
          <span class="rk-acts"><button type="button" data-rk="undo" ${!planStack.length ? 'disabled' : ''}>↩️</button><button type="button" data-rk="spread">🎯 Auto</button><button type="button" class="go" data-rk="setup" ${left ? 'disabled' : ''}>✅ Valider</button></span>`; }
      else h = `Les autres placent leurs armées… ${G.setupDone.map((d, s) => d ? '' : who(s)).filter(Boolean).join(', ')}`;
    } else if (G.turn !== me) h = `${idleHtml(G)}C’est à ${who(G.turn)} de jouer${G.phase === 'reinforce' ? ' (renforts)' : G.phase === 'attack' || G.phase === 'move' ? ' (attaque)' : ' (déplacement)'}…`;
    else {
      mineTurn = true;
      if (G.phase === 'reinforce') {
        const left = G.toPlace[me] - used;
        h = G.mustTrade ? `<span>🃏 Tu as ${G.hand.length} cartes : échange un set avant de placer.</span><span class="rk-acts"><button type="button" class="go" data-rk-sheet2="cards">🃏 Échanger</button></span>`
          : `<span>Renforts : <b>${left}</b> armée${left > 1 ? 's' : ''} à placer${G.bonus ? '' : ''}. Touche tes territoires.</span>
            <span class="rk-acts">${E().canTradeAny(G.hand || []) ? '<button type="button" data-rk-sheet2="cards">🃏 Échanger</button>' : ''}<button type="button" data-rk="undo" ${!planStack.length ? 'disabled' : ''}>↩️</button><button type="button" data-rk="all" ${!sel && !planStack.length ? '' : ''}>⏬ Tout sur le dernier</button><button type="button" class="go" data-rk="place" ${!used ? 'disabled' : ''}>✅ Placer ${used || ''}</button></span>`;
      } else if (G.phase === 'attack') {
        if (sel && target) {
          const max = Math.min(3, G.armies[sel] - 1);
          h = `<span>⚔️ ${esc(T(sel).name)} (${G.armies[sel]}) → ${esc(T(target).name)} (${G.armies[target]})</span><span class="rk-acts rk-dicepick">${[1, 2, 3].map(d => `<button type="button" class="${dice === d ? 'on' : ''}" data-rk-dice="${d}" ${d > max ? 'disabled' : ''}>${'🎲'.repeat(d)}</button>`).join('')}
            <button type="button" class="go" data-rk="attack">⚔️ Attaquer</button><button type="button" data-rk="blitz" title="Attaque jusqu’à la victoire ou jusqu’à ce qu’il ne reste qu’une armée">⚡ Blitz</button><button type="button" data-rk="cancel">✖</button></span>`;
        } else h = `<span>${sel ? `Depuis ${esc(T(sel).name)} : choisis une cible.` : 'Attaque : choisis un de tes territoires (2 armées ou plus).'}${G.gold[me] ? ' 🎲 Dé en or prêt !' : ''}</span><span class="rk-acts">${sel ? '<button type="button" data-rk="cancel">✖</button>' : ''}<button type="button" data-rk="endattack">➡️ Fin des attaques</button></span>`;
      } else if (G.phase === 'move') {
        const m = G.move;
        h = `<span>🚩 ${esc(T(m.to).name)} conquis ! Combien d’armées y envoyer ?</span><span class="rk-acts rk-step"><button type="button" data-rk-mv="-1" ${moveN <= m.min ? 'disabled' : ''}>−</button><b>${moveN}</b><button type="button" data-rk-mv="1" ${moveN >= m.max ? 'disabled' : ''}>+</button><button type="button" class="go" data-rk="move">✅ Envoyer</button></span>`;
      } else if (G.phase === 'fortify') {
        if (sel && target) h = `<span>🚚 ${esc(T(sel).name)} → ${esc(T(target).name)}</span><span class="rk-acts rk-step"><button type="button" data-rk-fn="-1" ${fortN <= 1 ? 'disabled' : ''}>−</button><b>${fortN}</b><button type="button" data-rk-fn="1" ${fortN >= G.armies[sel] - 1 ? 'disabled' : ''}>+</button><button type="button" class="go" data-rk="fortify">✅ Déplacer et finir</button><button type="button" data-rk="cancel">✖</button></span>`;
        else h = `<span>Déplacement de fin de tour (un seul) : ${sel ? 'choisis où envoyer les troupes.' : 'choisis un territoire de départ, ou finis ton tour.'}</span><span class="rk-acts">${sel ? '<button type="button" data-rk="cancel">✖</button>' : ''}<button type="button" class="go" data-rk="endturn">🏁 Finir le tour</button></span>`;
      }
    }
    const html = `<div class="rk-st ${mineTurn ? 'mine' : ''}">${h}</div>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }
  function idleHtml(G) {
    const boss = cur.boss, s = G.turn, id = G.players[s];
    if (!boss || id < 0 || G.bots[s]) return '';
    const idle = Date.now() - Date.parse(cur.moved_at) >= 2 * 60 * 1000;
    return `<span class="rk-acts rk-boss">${idle ? `<button type="button" data-rk-auto="${s}" title="Joue son tour à sa place">🤖 Faire jouer</button>` : ''}<button type="button" data-rk-kick="${s}" title="Un bot prend sa place jusqu’à la fin">🔁 Remplacer par un bot</button></span>`;
  }
  function renderSide() {
    const G = cur.game, el = root.querySelector('[data-rk-side]');
    const terr = s => E().IDS.filter(t => G.owner[t] === s).length;
    const arm = s => E().IDS.filter(t => G.owner[t] === s).reduce((a, t) => a + G.armies[t], 0);
    const conts = s => Object.keys(E().CONT).filter(c => E().CONT[c].terr.every(t => G.owner[t] === s));
    const rows = G.order.map(s => {
      const id = G.players[s], p = pl(id);
      return `<div class="rk-pl ${G.turn === s && G.phase !== 'setup' && G.phase !== 'done' ? 'turn' : ''} ${G.alive[s] ? '' : 'out'} ${s === G.me ? 'me' : ''}" style="--c:${COLORS[s % 7]}">
        <span class="rk-av">${p ? ctx.avatar(p) : '🤖'}</span><span class="rk-pn"><b>${esc(seatName(G, s))}</b><small>${G.alive[s] ? `🗺️ ${terr(s)} · ⚔️ ${arm(s)} · 🃏 ${G.cardCount[s]}${G.done[s].length ? ` · 📜 ${G.done[s].length}` : ''}` : '💀 éliminé'}</small>
        ${conts(s).length ? `<small class="rk-conts">${conts(s).map(c => E().CONT[c].name).join(', ')}</small>` : ''}</span></div>`;
    }).join('');
    const html = `<div class="rk-pls">${rows}</div><div class="rk-legend">${icon('soldat', 14, '#ffe08a')} = 1 ${icon(ANIMAL_ICON.vache, 14, '#ffe08a')} = 5 <small>(animal de la région)</small> ${icon('char', 14, '#ffe08a')} = 10<br><small>Prochain échange de cartes : +${G.nextTrade}</small></div>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }
  // Fenêtres : cartes, missions, aide
  const KIND_ICON = {soldat: 'soldat', animal: 'vache', char: 'char'};
  let cardPick = new Set();
  function cardHTML(c, G) {
    const kind = E().CARD_KIND[c], t = T(c);
    const ic = kind === 'joker' ? '🃏' : icon(kind === 'animal' ? ANIMAL_ICON[E().animalOf(c)] : KIND_ICON[kind], 44, '#3a2a12');
    return `<button type="button" class="rk-card ${cardPick.has(c) ? 'on' : ''} ${t && G.owner[c] === G.me ? 'own' : ''}" data-rk-card="${c}"><span class="rk-card-ic">${ic}</span><b>${t ? esc(t.name) : 'Joker'}</b><small>${kind === 'joker' ? 'remplace tout' : kind === 'animal' ? esc(ANIMAL_NAME[E().animalOf(c)]) : kind}</small>${t && G.owner[c] === G.me ? '<i>+2 ici</i>' : ''}</button>`;
  }
  function renderSheet() {
    if (!root || root._mode !== 'table') return;
    const box = root.querySelector('[data-rk-sheetbox]'), G = cur.game;
    if (!sheet) { box.hidden = true; box._html = ''; cardPick.clear(); return; }
    let h = '';
    if (sheet === 'cards') {
      const hand = G.hand || [], canTrade = G.turn === G.me && G.phase === 'reinforce', set = cardPick.size === 3 && E().setKind([...cardPick]);
      h = `<h4>🃏 Tes cartes (${hand.length})</h4><p class="rk-note">Échange 3 cartes identiques, 3 différentes, ou avec un joker. Prochain échange : <b>+${G.nextTrade}</b> armées.</p>
        <div class="rk-cards">${hand.length ? hand.map(c => cardHTML(c, G)).join('') : '<p class="rk-note">Aucune carte : conquiers au moins un territoire pendant ton tour pour en gagner une.</p>'}</div>
        ${canTrade ? `<button type="button" class="sk-go" data-rk="trade" ${set ? '' : 'disabled'}>🔁 Échanger ${set ? `(+${G.nextTrade})` : ''}</button>` : hand.length >= 3 ? '<p class="rk-note">Les échanges se font au début de ton tour.</p>' : ''}`;
    } else if (sheet === 'missions') {
      const M = E().MISSIONS;
      h = `<h4>📜 Tes missions secrètes</h4>${G.missions && G.missions.length ? `<ul class="rk-mis">${G.missions.map(m => `<li><b>${esc(M[m].text)}</b><span>${esc(E().rewardText(M[m].reward))}</span></li>`).join('')}</ul>` : '<p class="rk-note">Pas de missions dans cette partie.</p>'}
        ${G.me >= 0 && G.done[G.me].length ? `<p class="rk-note">Réussies : ${G.done[G.me].map(m => esc(M[m].text)).join(' · ')}</p>` : ''}${G.me >= 0 && G.bonus ? `<p class="rk-note">Bonus en attente : +${G.bonus} renforts au prochain tour.</p>` : ''}`;
    } else {
      h = `<h4>❔ Rappel des règles</h4><ul class="rk-help"><li><b>Renforts</b> : 1 armée par 3 territoires (3 minimum) + bonus des continents tenus en entier (Asie 7, Amérique du Nord 5, Europe 5, Afrique 3, Amérique du Sud 2, Océanie 2).</li>
        <li><b>Attaque</b> : jusqu’à 3 dés contre 2, on compare les plus forts ; égalité = le défenseur gagne. ⚡ Blitz enchaîne les lancers.</li>
        <li><b>Cartes</b> : une par tour si tu as conquis un territoire. Échanges : 4, 6, 8, 10, 12, 15 puis +5. À 5 cartes, échange obligatoire.</li>
        <li><b>Déplacement</b> : une fois en fin de tour, entre deux de tes territoires reliés.</li>
        <li><b>Missions</b> : 3 objectifs secrets, chacun rapporte un bonus (renforts, carte ou 🎲 dé en or : +1 à ton meilleur dé).</li>
        <li><b>Troupes</b> : soldat = 1, animal de la région = 5 (taureaux, lamas, vaches, éléphants, chameaux, tigres, kangourous), char = 10.</li></ul>`;
    }
    h = `<div class="rk-sheet-in"><button type="button" class="rk-x" data-rk-sheet-close>✖</button>${h}</div>`;
    if (box._html !== h) { box.innerHTML = h; box._html = h; }
    box.hidden = false;
  }
  async function onRootClick(e) {
    const b = e.target.closest('button'); if (!b || !cur || !cur.game) return;
    if (b.dataset.rkSheetClose !== undefined && 'rkSheetClose' in b.dataset) { sheet = null; renderSheet(); return; }
    if (b.dataset.rkSheet2) { sheet = b.dataset.rkSheet2; renderSheet(); return; }
    if (b.dataset.rkCard) { const c = b.dataset.rkCard; if (cardPick.has(c)) cardPick.delete(c); else if (cardPick.size < 3) cardPick.add(c); box_(); return; }
    if (b.dataset.rkDice) { dice = Number(b.dataset.rkDice); renderStatus(); return; }
    if (b.dataset.rkMv) { const m = cur.game.move; moveN = Math.max(m.min, Math.min(m.max, moveN + Number(b.dataset.rkMv))); renderStatus(); return; }
    if (b.dataset.rkFn) { fortN = Math.max(1, Math.min(cur.game.armies[sel] - 1, fortN + Number(b.dataset.rkFn))); renderStatus(); return; }
    if (b.dataset.rkAuto) { if (confirm('Faire jouer son tour automatiquement ?')) act({action: 'auto', seat: Number(b.dataset.rkAuto)}); return; }
    if (b.dataset.rkKick) { if (confirm('Remplacer ce joueur par un bot jusqu’à la fin de la partie ?')) act({action: 'kick', seat: Number(b.dataset.rkKick)}); return; }
    const k = b.dataset.rk; if (!k) return;
    const G = cur.game, me = G.me;
    if (k === 'undo') { const t = planStack.pop(); if (t) { plan[t] -= 1; if (!plan[t]) delete plan[t]; } render(); return; }
    if (k === 'spread') { autoSpread(G); render(); return; }
    if (k === 'all') { const t = planStack[planStack.length - 1]; if (!t) return ctx.toast('Touche d’abord un territoire.'); const left = G.toPlace[me] - Object.values(plan).reduce((a, x) => a + x, 0); for (let i = 0; i < left; i++) { plan[t] = (plan[t] || 0) + 1; planStack.push(t); } render(); return; }
    if (k === 'setup') return act({action: 'setup', plan}, true);
    if (k === 'place') return act({action: 'place', plan}, true);
    if (k === 'cancel') { sel = null; target = null; render(); return; }
    if (k === 'attack' || k === 'blitz') return act({action: 'attack', from: sel, to: target, dice, blitz: k === 'blitz'});
    if (k === 'endattack') return act({action: 'endattack'});
    if (k === 'move') return act({action: 'move', n: moveN});
    if (k === 'fortify') return act({action: 'fortify', from: sel, to: target, n: fortN});
    if (k === 'endturn') return act({action: 'endturn'});
    if (k === 'trade') { const cards = [...cardPick]; cardPick.clear(); sheet = null; return act({action: 'trade', cards}); }
  }
  const box_ = () => { const box = root.querySelector('[data-rk-sheetbox]'); box._html = ''; renderSheet(); };
  function autoSpread(G) {
    const me = G.me, B = E().IDS.filter(t => G.owner[t] === me && T(t).adj.some(x => G.owner[x] !== me));
    const pool = B.length ? B : E().IDS.filter(t => G.owner[t] === me);
    let left = G.toPlace[me] - Object.values(plan).reduce((a, b) => a + b, 0);
    for (let i = 0; left > 0; i++, left--) { const t = pool[i % pool.length]; plan[t] = (plan[t] || 0) + 1; planStack.push(t); }
  }
  async function act(body, clearPlan) {
    if (!cur || busy) return;
    busy = true; root.classList.add('rk-busy');
    try {
      if (loading) await loading;
      const g = await api({...body, game: cur.id});
      if (clearPlan) { plan = {}; planStack = []; }
      if (body.action === 'attack') { /* la cible reste sélectionnée pour enchaîner */ }
      busy = false; take(g);
    } catch (err) { busy = false; ctx.toast(err.message || 'Ordre refusé.'); load(false); }
    finally { busy = false; if (root) root.classList.remove('rk-busy'); }
  }

  // ---------- animations ----------
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function runQueue() {
    if (playing || !root || root._mode !== 'table') return;
    playing = true;
    try {
      while (queue.length && cur && cur.game) {
        const e = queue.shift(), fast = queue.length > 6;
        await animate(e, fast);
      }
    } finally { playing = false; }
  }
  const pt = t => MAP().t[t];
  function fx(html) { const g = root && root.querySelector('[data-rk-fx]'); if (!g) return null; g.insertAdjacentHTML('beforeend', html); return g.lastElementChild; }
  function floatText(t, text, cls) { const p = pt(t); const el = fx(`<text class="rk-float ${cls}" x="${p.x}" y="${p.y - 8}" text-anchor="middle">${text}</text>`); setTimeout(() => el && el.remove(), 1600); }
  function banner(html, ms = 1800) {
    const b = root && root.querySelector('[data-rk-banner]'); if (!b) return;
    b.innerHTML = html; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, ms);
  }
  const PIPS = {1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]};
  const dieHTML = (v, cls, i) => `<span class="rk-die ${cls}" style="--i:${i};--r:${(Math.random() * 60 - 30).toFixed(0)}deg">${Array.from({length: 9}, (_, k) => `<i class="${PIPS[v].includes(k + 1) ? 'on' : ''}"></i>`).join('')}</span>`;
  async function showDice(G, e, roll, fast) {
    const d = root.querySelector('[data-rk-dice]'); if (!d) return;
    const cA = COLORS[e.s % 7], cD = COLORS[e.def % 7];
    d.innerHTML = `<div class="rk-dice-row" style="--c:${cA}"><b>${esc(seatName(G, e.s))}</b>${roll.ad.map((v, i) => dieHTML(v, 'att' + (roll.gold && i === 0 ? ' gold' : ''), i)).join('')}</div>
      <div class="rk-dice-vs">⚔️</div><div class="rk-dice-row" style="--c:${cD}"><b>${esc(seatName(G, e.def))}</b>${roll.dd.map((v, i) => dieHTML(v, 'def', i)).join('')}</div>
      <div class="rk-dice-res">${roll.dl ? `<span class="bad">−${roll.dl} défense</span>` : ''}${roll.al ? `<span class="bad">−${roll.al} attaque</span>` : ''}</div>`;
    d.hidden = false; d.classList.remove('roll'); void d.offsetWidth; d.classList.add('roll');
    if (ctx.sound) ctx.sound('move');
    await wait(fast ? 500 : 1300);
    d.hidden = true;
  }
  async function animate(e, fast) {
    const G = cur.game, me = G.me;
    if (e.k === 'attack') {
      const ar = fx(arrowSVG(e.from, e.to, 'attack').replace('class="rk-arrow attack"', 'class="rk-arrow attack live"'));
      const last = e.rolls[e.rolls.length - 1];
      if (e.rolls.length > 1 && !fast) await showDice(G, e, e.rolls[0], true);
      await showDice(G, e, last, fast);
      if (e.dl) floatText(e.to, `−${e.dl}`, 'loss');
      if (e.al) floatText(e.from, `−${e.al}`, 'loss');
      if (e.rolls.length > 1) floatText(e.to, `⚡ ${e.rolls.length} lancers`, 'info');
      setTimeout(() => { if (ar) ar.remove(); }, 600);
      await wait(fast ? 150 : 350);
    } else if (e.k === 'conquer') {
      const p = pt(e.to), flag = fx(`<g class="rk-flag" transform="translate(${p.x} ${p.y})"><g class="rk-flag-in">${icon('drapeau', 26, COLORS[e.s % 7], -4, -30)}</g></g>`);
      const land = root.querySelector(`.rk-land[data-t="${e.to}"]`); if (land) { land.classList.remove('boom'); land.getBoundingClientRect(); land.classList.add('boom'); }
      if (ctx.sound) ctx.sound(e.s === me ? 'capture' : 'move');
      setTimeout(() => flag && flag.remove(), 1700);
      await wait(fast ? 200 : 700);
    } else if (e.k === 'claim') {
      const p = pt(e.t), flag = fx(`<g class="rk-flag" transform="translate(${p.x} ${p.y})"><g class="rk-flag-in">${icon('drapeau', 22, COLORS[e.s % 7], -4, -26)}</g></g>`);
      setTimeout(() => flag && flag.remove(), 1500);
      await wait(fast ? 120 : 450);
    } else if (e.k === 'place') {
      for (const t in e.plan) floatText(t, `+${e.plan[t]}`, 'gain');
      await wait(fast ? 150 : 500);
    } else if (e.k === 'move' || e.k === 'fortify') {
      if (e.k === 'fortify') { const ar = fx(arrowSVG(e.from, e.to, 'move').replace('class="rk-arrow move"', 'class="rk-arrow move live"')); setTimeout(() => ar && ar.remove(), 900); floatText(e.to, `+${e.n}`, 'gain'); }
      await wait(fast ? 100 : e.k === 'fortify' ? 700 : 200);
    } else if (e.k === 'turn') {
      if (!fast) banner(`<span style="color:${COLORS[e.s % 7]}">${e.s === me ? '⭐ À toi de jouer !' : `Au tour de ${esc(seatName(G, e.s))}`}</span><small>+${e.armies} renforts</small>`, 1500);
      if (e.s === me && ctx.sound) ctx.sound('turn');
      await wait(fast ? 100 : 700);
    } else if (e.k === 'elim') {
      banner(`💀 ${esc(seatName(G, e.def))} est éliminé par ${esc(seatName(G, e.s))} !`, 2400);
      await wait(1200);
    } else if (e.k === 'mission') {
      if (e.s === me) ctx.toast(`📜 Mission réussie : ${e.text} (${e.reward})`);
      else if (!fast) floatText(E().IDS.find(t => G.owner[t] === e.s) || 'congo', `📜 ${seatName(G, e.s)}`, 'info');
      await wait(fast ? 100 : 400);
    } else if (e.k === 'trade') {
      if (!fast) banner(`🃏 ${esc(seatName(G, e.s))} échange 3 cartes : +${e.armies} armées`, 1500);
      await wait(fast ? 100 : 600);
    } else if (e.k === 'win') {
      banner(`🏆 ${esc(seatName(G, e.s))} a conquis le monde !`, 5000);
      if (ctx.party) ctx.party();
    }
  }

  window.YetiRisk = Object.freeze({init, open, close, refresh: loadList, get openId() { return cur ? cur.id : null; }, get loaded() { return listLoaded; },
    mine: me => list.filter(g => g.status === 'playing' && (g.players || g.seats).includes(me)).map(g => ({id: g.id, label: `🎲 Risk · ${g.phase === 'claim' ? 'partage du monde' : g.phase === 'setup' ? 'mise en place' : `tour ${g.round}`}`, turn: (g.waiting || []).includes(me)}))});
})();
