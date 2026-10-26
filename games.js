/* Défis 1v1 : échecs (style chess.com) et bataille navale. Remplace la fenêtre du Yéti pendant la partie.
   Les coups passent par /api/game/move, l'état est relu toutes les 2 s tant que la partie est ouverte. */
(() => {
  'use strict';
  const GAMES = {
    chess: {icon: '♟️', name: 'Échecs', label: 'aux échecs'},
    naval: {icon: '🚢', name: 'Bataille navale', label: 'à la bataille navale'},
  };
  const SHIPS = [{n: 5, name: 'Porte-avions'}, {n: 4, name: 'Croiseur'}, {n: 3, name: 'Contre-torpilleur'}, {n: 3, name: 'Sous-marin'}, {n: 2, name: 'Torpilleur'}];
  const GLYPH = {k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'};
  const VALUE = {p: 1, n: 3, b: 3, r: 5, q: 9, k: 0};
  const FILES = 'abcdefgh';
  const COLS = 'ABCDEFGHIJ';
  const START = {p: 8, n: 2, b: 2, r: 2, q: 1};

  let ctx = null, root = null, cur = null, timer = null, busy = false, pending = false, sel = null, drag = null, confirmResign = 0;
  let chess = null, view = null, clockTimer = null, skew = 0, flagAt = 0, lastKey = '', navalDraft = null, navalPick = 0, navalVertical = false, hoverCell = -1;

  const $ = s => root.querySelector(s);
  const esc = t => ctx.escape(String(t));
  const pl = id => ctx.player(id) || {name: '?', color: '#999'};
  const me = () => (cur && cur.viewer) || 0;
  const isPlayer = () => cur && (me() === cur.challenger || me() === cur.opponent);
  const other = () => (cur ? (me() === cur.challenger ? cur.opponent : cur.challenger) : 0);

  function glyph(t) { return GLYPH[t] + '︎'; }
  const pieceEl = (c, t, extra) => `<span class="pc c${c} t${t}${extra ? ' ' + extra : ''}"></span>`;

  // ---------- ouverture / fermeture ----------
  async function open(duelId, options) {
    ctx = options; root = ctx.root;
    if (cur && cur.id !== duelId) close(true);
    cur = {id: duelId, loading: true}; lastKey = ''; sel = null; view = null; navalDraft = null; navalPick = 0; chess = null;
    root.hidden = false; root.className = 'board-stage';
    root.innerHTML = '<div class="gb-loading"><span class="spinner"></span><p>Chargement de la partie…</p></div>';
    ctx.onOpen && ctx.onOpen();
    await load(true);
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(false); }, 2000);
    clearInterval(clockTimer); clockTimer = setInterval(tickClocks, 200);
  }
  function close(silent) {
    clearInterval(timer); timer = null; clearInterval(clockTimer); clockTimer = null; cur = null; chess = null; drag = null; view = null;
    if (root) { root.hidden = true; root.innerHTML = ''; }
    if (!silent && ctx && ctx.onClose) ctx.onClose();
  }
  async function load(first) {
    if (!cur || busy || pending) return;
    busy = true;
    try {
      const s = ctx.session();
      const d = await ctx.request('/api/game/state', {player: s ? s.player : 0, token: s ? s.token : '', duel: cur.id});
      if (!cur || d.id !== cur.id) return;
      const key = JSON.stringify([d.ply, d.status, d.winner, d.finished_at, d.state && d.state.draw_offer, d.viewer]);
      const was = cur;
      if (d.server_ms) skew = Number(d.server_ms) - Date.now();
      cur = {...d, id: Number(d.id), challenger: Number(d.challenger), opponent: Number(d.opponent), viewer: Number(d.viewer) || 0, ply: Number(d.ply) || 0};
      if (key !== lastKey || first) {
        const firstRender = !lastKey; lastKey = key;
        if (!firstRender) announce(was, cur);
        render();
        if (cur.finished_at && !was.finished_at && !firstRender && ctx.onFinished) ctx.onFinished(cur);
      } else renderClock();
    } catch (error) {
      if (first) root.innerHTML = `<div class="gb-loading"><p>${esc(error.message || 'Partie introuvable.')}</p><button type="button" class="gb-btn" data-act="exit">← Retour au Yéti</button></div>`;
    } finally { busy = false; }
  }
  // Ce qui vient de se passer côté adversaire
  function announce(was, now) {
    if (!isPlayer() || !was || was.loading) return;
    if (now.finished_at && !was.finished_at) return;
    if (now.game === 'chess') {
      const mv = now.state.moves || [];
      if (mv.length > ((was.state && was.state.moves) || []).length && myTurn()) { ctx.sound && ctx.sound('move'); }
      if (now.state.draw_offer && now.state.draw_offer === other() && !(was.state && was.state.draw_offer)) ctx.toast(`🤝 ${pl(other()).name} te propose la nulle.`);
    } else if (now.game === 'naval') {
      const theirs = (now.state.shots || {})[other()] || [], before = ((was.state && was.state.shots) || {})[other()] || [];
      if (theirs.length > before.length) {
        const last = theirs[theirs.length - 1];
        setTimeout(() => ctx.toast(last.s ? `☠️ ${pl(other()).name} a coulé un de tes bateaux !` : last.h ? `💥 ${pl(other()).name} t’a touché en ${cellName(last.c)} !` : `🌊 ${pl(other()).name} a tiré dans l’eau (${cellName(last.c)}). À toi !`), 1000);
      }
      if (now.state.phase === 'play' && was.state && was.state.phase === 'place') ctx.toast('🚢 Les deux flottes sont prêtes : la bataille commence !');
    }
  }

  async function send(move, opts) {
    const s = ctx.session();
    if (!s || s.player !== me()) { ctx.toast('Reconnecte-toi pour jouer.'); return null; }
    pending = true;
    try {
      return await ctx.request('/api/game/move', {player: s.player, token: s.token, duel: cur.id, ply: cur.ply, move});
    } catch (error) {
      ctx.toast(error.message || 'Coup refusé.');
      return null;
    } finally {
      pending = false; lastKey = ''; await load(false); if (opts && opts.after) opts.after();
    }
  }

  // ---------- en-tête commun ----------
  function myTurn() {
    if (!cur || cur.finished_at || cur.status !== 'accepted' || !isPlayer()) return false;
    if (cur.game === 'chess') return turnColor() === myColor();
    if (cur.state.phase === 'place') return !(cur.state.placed || []).map(Number).includes(me());
    return Number(cur.state.turn) === me();
  }
  function waitingOnOther() {
    if (!cur || cur.finished_at || cur.status !== 'accepted' || !isPlayer()) return false;
    if (cur.game === 'chess') return turnColor() !== myColor();
    if (cur.state.phase === 'place') { const p = (cur.state.placed || []).map(Number); return p.includes(me()) && !p.includes(other()); }
    return Number(cur.state.turn) === other();
  }
  function idleHours() { return cur && cur.moved_at ? (Date.parse(cur.server_time || new Date()) - Date.parse(cur.moved_at)) / 36e5 : 0; }
  function resultText() {
    const end = cur.state && cur.state.end, w = Number(cur.winner);
    const why = {time: 'au temps (pendule à 0)', checkmate: 'par échec et mat', resign: 'par abandon', timeout: 'par forfait (24 h sans jouer)', sunk: 'en coulant toute la flotte', stalemate: 'pat', draw: 'nulle', agreed: 'nulle d’un commun accord'}[end] || '';
    if (end === 'aborted') return '🚫 Partie annulée avant le 2e coup';
    if (w === 0) return `🤝 Partie nulle${end === 'stalemate' ? ' (pat)' : end === 'agreed' ? ' d’un commun accord' : ''}`;
    if (isPlayer()) return w === me() ? `🏆 Tu as gagné ${why} !` : `😵 ${pl(w).name} a gagné ${why}.`;
    return `🏆 ${pl(w).name} a gagné ${why}.`;
  }
  // « commencée à 9h22 » (ou « le 18/10 à 21h30 » si ce n'est pas aujourd'hui)
  const fmtHM = new Intl.DateTimeFormat('fr-FR', {timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit'});
  const fmtDay = new Intl.DateTimeFormat('fr-FR', {timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit'});
  function whenText(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const hm = fmtHM.format(d).replace(':', 'h');
    return fmtDay.format(d) === fmtDay.format(new Date()) ? `à ${hm}` : `le ${fmtDay.format(d)} à ${hm}`;
  }
  function startedText() { const t = whenText(cur.started_at || (cur.status === 'pending' ? cur.created_at : null)); return t ? (cur.status === 'pending' ? 'défi lancé ' : 'commencée ') + t : ''; }
  function head() {
    const g = GAMES[cur.game], A = pl(cur.challenger), B = pl(cur.opponent);
    let status;
    if (cur.status === 'pending') status = `⏳ En attente que ${esc(B.name)} accepte le défi`;
    else if (cur.status === 'refused') status = '❌ Défi refusé';
    else if (cur.finished_at) status = esc(resultText());
    else if (!isPlayer()) status = '👁️ Tu regardes la partie';
    else if (myTurn()) status = cur.game === 'naval' && cur.state.phase === 'place' ? '⚓ Place ta flotte' : cur.game === 'naval' ? '🎯 À toi de tirer !' : '🟢 À toi de jouer !';
    else status = cur.game === 'naval' && cur.state.phase === 'place' ? `⏳ ${esc(pl(other()).name)} place sa flotte…` : `⏳ ${esc(pl(other()).name)} réfléchit…`;
    const others = ctx.otherTurns ? ctx.otherTurns(cur.id) : [];
    const banner = others.length ? `<div class="gb-other">${others.map(o => `<button type="button" data-act="switch" data-id="${o.id}">${esc(o.text)} ▶</button>`).join('')}</div>` : '';
    return banner + `<div class="gb-head"><button type="button" class="gb-back" data-act="exit" title="Ta place est gardée : reviens quand tu veux avec « Tes parties en cours »">🚪 Quitter la partie</button><div class="gb-title"><b>${g.icon} ${g.name}</b><span>${esc(A.name)} vs ${esc(B.name)}${startedText() ? ' · ' + startedText() : ''}</span></div><span class="gb-status ${myTurn() ? 'go' : ''} ${cur.finished_at ? 'end' : ''}" id="gb-status">${status}</span></div>`;
  }
  function actions() {
    if (!isPlayer() || cur.status !== 'accepted') return '';
    if (cur.finished_at) return `<div class="gb-actions"><button type="button" class="gb-btn" data-act="rematch">🔁 Revanche</button><button type="button" class="gb-btn ghost" data-act="exit">Retour au Yéti</button></div>`;
    let h = '';
    if (cur.game === 'chess') {
      const off = cur.state.draw_offer && Number(cur.state.draw_offer);
      if (off === other()) h += `<span class="gb-offer">🤝 ${esc(pl(other()).name)} propose la nulle</span><button type="button" class="gb-btn" data-act="draw-accept">Accepter</button><button type="button" class="gb-btn ghost" data-act="draw-decline">Refuser</button>`;
      else if (off === me()) h += '<span class="gb-offer">🤝 Nulle proposée…</span>';
      else h += '<button type="button" class="gb-btn ghost" data-act="draw-offer">🤝 Proposer la nulle</button>';
    }
    if (cur.game === 'chess' && cur.ply < 2) h += '<button type="button" class="gb-btn danger" data-act="abort">✖ Annuler la partie</button>';
    else h += `<button type="button" class="gb-btn danger" data-act="resign">${confirmResign > Date.now() ? 'Confirmer l’abandon ?' : '🏳️ Abandonner'}</button>`;
    if (waitingOnOther()) h += idleHours() >= 24 ? '<button type="button" class="gb-btn" data-act="claim">⏰ Réclamer la victoire</button>' : `<span class="gb-idle" id="gb-idle">⏰ Victoire par forfait possible dans ${Math.ceil(24 - idleHours())} h</span>`;
    return `<div class="gb-actions">${h}</div>`;
  }
  function renderClock() { /* l'en-tête suffit, rien à rafraîchir entre deux coups */ }

  function render() {
    if (!cur || cur.loading) return;
    if (cur.game === 'chess') renderChess(); else renderNaval();
  }

  // ---------- ÉCHECS ----------
  function myColor() { if (!isPlayer()) return 'w'; return Number(cur.state.white) === me() ? 'w' : 'b'; }
  function turnColor() { return cur.ply % 2 === 0 ? 'w' : 'b'; }
  function syncChess() {
    const moves = (cur.state && cur.state.moves) || [];
    const c = new window.Chess();
    let ok = true;
    for (const m of moves) { if (!c.move(m.san, {sloppy: true})) { ok = false; break; } }
    if (!ok || (cur.state.fen && c.fen().split(' ').slice(0, 4).join(' ') !== cur.state.fen.split(' ').slice(0, 4).join(' '))) { const d = new window.Chess(); if (cur.state.fen) d.load(cur.state.fen); chess = d; chess._moves = moves; return; }
    chess = c; chess._moves = moves;
  }
  function material() {
    const left = {w: {p: 0, n: 0, b: 0, r: 0, q: 0}, b: {p: 0, n: 0, b: 0, r: 0, q: 0}};
    for (const row of chess.board()) for (const sq of row) if (sq && sq.type !== 'k') left[sq.color][sq.type]++;
    const lost = c => Object.keys(START).flatMap(t => Array(Math.max(0, START[t] - left[c][t])).fill(t));
    const score = c => Object.keys(START).reduce((a, t) => a + left[c][t] * VALUE[t], 0);
    return {takenBy: {w: lost('b'), b: lost('w')}, diff: score('w') - score('b')};
  }
  function strip(pid, color, m, top) {
    const p = pl(pid), taken = m.takenBy[color].sort((a, b) => VALUE[b] - VALUE[a]), adv = color === 'w' ? m.diff : -m.diff;
    const turn = !cur.finished_at && cur.status === 'accepted' && turnColor() === color;
    const mine = isPlayer() && pid === me();
    const tag = turn ? `<em class="gb-turn">${mine ? '▶ À toi de jouer' : `⏳ Au tour de ${esc(p.name)}`}</em>` : '';
    const clk = cur.state.clock ? `<span class="clk ${color} ${turn ? 'run' : ''}" data-clk="${color}">${fmtClock(clockLeft(color))}</span>` : '';
    return `<div class="gb-strip ${top ? 'top' : ''} ${turn ? 'turn' : ''}">${ctx.avatar(p)}<span class="gb-name"><b>${esc(p.name)}</b><small>${color === 'w' ? 'Blancs' : 'Noirs'}</small>${tag}</span><span class="gb-taken ${color === 'w' ? 'from-b' : 'from-w'}">${taken.map(t => pieceEl(color === 'w' ? 'b' : 'w', t, 'mini')).join('')}${adv > 0 ? `<em>+${adv}</em>` : ''}</span>${clk}</div>`;
  }
  // ---------- Pendule 10 min ----------
  function clockLeft(color) {
    const c = cur && cur.state && cur.state.clock; if (!c) return null;
    let left = Number(c[color]);
    if (!cur.finished_at && cur.status === 'accepted' && cur.ply >= 1 && turnColor() === color && cur.state.ts) left -= (Date.now() + skew) - Number(cur.state.ts);
    return Math.max(0, left);
  }
  function fmtClock(ms) {
    if (ms === null) return '';
    if (ms < 20000) return `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}.${Math.floor(ms % 1000 / 100)}`;
    const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
  function tickClocks() {
    if (!cur || cur.game !== 'chess' || !cur.state || !cur.state.clock || !root) return;
    root.querySelectorAll('[data-clk]').forEach(el => { const ms = clockLeft(el.dataset.clk); el.textContent = fmtClock(ms); el.classList.toggle('low', ms !== null && ms < 30000 && !cur.finished_at); });
    // une pendule à 0 : on le signale au serveur, qui termine la partie
    const t = turnColor(), ms = clockLeft(t);
    if (isPlayer() && !cur.finished_at && cur.ply >= 1 && ms === 0 && Date.now() - flagAt > 3000 && !pending) { flagAt = Date.now(); send({flag: true}); }
  }
  function renderChess() {
    syncChess();
    const col = myColor(), m = material(), oppId = isPlayer() ? other() : (Number(cur.state.white) === cur.challenger ? cur.opponent : cur.challenger);
    const meId = isPlayer() ? me() : Number(cur.state.white);
    root.innerHTML = head() + `<div class="chess-wrap"><div class="chess-main">${strip(oppId, col === 'w' ? 'b' : 'w', m, true)}<div class="chess-board ${myTurn() ? 'myturn' : ''}" id="chess-board"></div>${strip(meId, col, m, false)}</div>
      <aside class="chess-side"><div class="chess-nav" id="chess-nav"></div><div class="chess-moves" id="chess-moves"></div>${cur.state.clock ? '<p class="chess-tc">⏱️ 10 min par joueur · la pendule démarre au 1er coup des blancs</p>' : ''}${actions()}</aside></div><div class="chess-promo" id="chess-promo" hidden></div>`;
    drawBoard(); drawMoves(); drawNav();
  }
  function lastMove() { const mv = chess._moves || []; return mv.length ? mv[mv.length - 1] : null; }
  // Revoir les coups : view = nombre de coups affichés (null = position actuelle)
  function posAt(n) { const c = new window.Chess(); for (const m of (chess._moves || []).slice(0, n)) c.move(m.san, {sloppy: true}); return c; }
  function setView(v) {
    const n = (chess && chess._moves || []).length;
    view = v === null || v >= n ? null : Math.max(0, v); sel = null;
    drawBoard(); drawMoves(); drawNav();
  }
  function drawNav() {
    const el = $('#chess-nav'); if (!el) return;
    const n = (chess._moves || []).length, at = view === null ? n : view;
    el.innerHTML = `<button type="button" data-nav="first" ${at ? '' : 'disabled'} aria-label="Début de la partie">⏮</button><button type="button" data-nav="prev" ${at ? '' : 'disabled'} aria-label="Coup précédent">◀</button><button type="button" data-nav="next" ${view === null ? 'disabled' : ''} aria-label="Coup suivant">▶</button><button type="button" data-nav="last" class="${view === null ? '' : 'live'}" ${view === null ? 'disabled' : ''} aria-label="Position actuelle">⏭</button>`
      + (view !== null ? `<span class="chess-review">Coup ${at}/${n}</span>` : '');
  }
  function drawBoard() {
    const el = $('#chess-board'); if (!el) return;
    const live = view === null, pos = live ? chess : posAt(view);
    const col = myColor(), lm = live ? lastMove() : (view ? chess._moves[view - 1] : null), board = pos.board();
    el.classList.toggle('review', !live);
    const targets = sel && live ? chess.moves({square: sel, verbose: true}) : [];
    const tset = new Map(targets.map(t => [t.to, t]));
    let checkSq = '';
    if (pos.in_check()) { const t = pos.turn(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const q = board[r][f]; if (q && q.type === 'k' && q.color === t) checkSq = FILES[f] + (8 - r); } }
    let h = '';
    for (let i = 0; i < 64; i++) {
      const r = col === 'w' ? Math.floor(i / 8) : 7 - Math.floor(i / 8), f = col === 'w' ? i % 8 : 7 - (i % 8);
      const sq = FILES[f] + (8 - r), piece = board[r][f], light = (r + f) % 2 === 0;
      const cls = ['sq', light ? 'l' : 'd'];
      if (lm && (lm.from === sq || lm.to === sq)) cls.push('lm');
      if (sel === sq) cls.push('sel');
      if (checkSq === sq) cls.push('chk');
      const t = tset.get(sq);
      if (t) cls.push(piece || t.flags.includes('e') ? 'cap' : 'dot');
      const rowEdge = col === 'w' ? f === 0 : f === 7, colEdge = col === 'w' ? r === 7 : r === 0;
      h += `<div class="${cls.join(' ')}" data-sq="${sq}">${rowEdge ? `<span class="cr">${8 - r}</span>` : ''}${colEdge ? `<span class="cf">${FILES[f]}</span>` : ''}${piece ? pieceEl(piece.color, piece.type) : ''}</div>`;
    }
    el.innerHTML = h;
  }
  function drawMoves() {
    const el = $('#chess-moves'); if (!el) return;
    const mv = chess._moves || [];
    if (!mv.length) { el.innerHTML = `<p class="chess-empty">${cur.status === 'accepted' ? (isPlayer() ? (myTurn() ? 'Tu as les blancs : à toi d’ouvrir la partie !' : `${esc(pl(Number(cur.state.white)).name)} a les blancs et commence.`) : 'La partie n’a pas commencé.') : 'La partie commencera quand le défi sera accepté.'}</p>`; return; }
    let h = '<ol>';
    const at = (view === null ? mv.length : view) - 1;
    for (let i = 0; i < mv.length; i += 2) h += `<li><span>${i / 2 + 1}.</span><b data-ply="${i + 1}" class="${i === at ? 'last' : ''}">${esc(mv[i].san)}</b><b ${mv[i + 1] ? `data-ply="${i + 2}"` : ''} class="${i + 1 === at ? 'last' : ''}">${mv[i + 1] ? esc(mv[i + 1].san) : ''}</b></li>`;
    el.innerHTML = h + '</ol>';
    const curEl = el.querySelector('b.last'); if (view === null) el.scrollTop = el.scrollHeight; else if (curEl) el.scrollTop = curEl.offsetTop - el.clientHeight / 2;
  }
  function canMove() { return view === null && myTurn() && !pending && chess && chess.turn() === myColor(); }
  function sqAt(x, y) { const n = document.elementFromPoint(x, y); const s = n && n.closest && n.closest('.sq'); return s && root.contains(s) ? s.dataset.sq : null; }
  function tryMove(from, to) {
    const legal = chess.moves({square: from, verbose: true}).filter(m => m.to === to);
    if (!legal.length) return false;
    if (legal.some(m => m.promotion)) { askPromo(from, to); return true; }
    commit(from, to);
    return true;
  }
  function askPromo(from, to) {
    const p = $('#chess-promo'), c = myColor();
    p.innerHTML = `<div class="promo-card"><p>Promotion</p>${['q', 'r', 'b', 'n'].map(t => `<button type="button" data-promo="${t}" class="promo-pc">${pieceEl(c, t)}</button>`).join('')}<button type="button" class="promo-x" data-promo="">✕</button></div>`;
    p.hidden = false;
    p.onclick = e => { const b = e.target.closest('[data-promo]'); if (!b) return; p.hidden = true; if (b.dataset.promo) commit(from, to, b.dataset.promo); else { sel = null; drawBoard(); } };
  }
  async function commit(from, to, promotion) {
    const mv = chess.move({from, to, promotion: promotion || 'q'});
    if (!mv) return;
    sel = null;
    chess._moves = [...(chess._moves || []), {san: mv.san, from, to}];
    const end = chess.in_checkmate() ? 'checkmate' : chess.in_stalemate() ? 'stalemate' : (chess.in_draw() || chess.in_threefold_repetition() || chess.insufficient_material()) ? 'draw' : '';
    drawBoard(); drawMoves(); ctx.sound && ctx.sound(mv.captured ? 'capture' : 'move');
    const st = $('#gb-status'); if (st) { st.textContent = '⏳ Envoi du coup…'; st.classList.remove('go'); }
    await send({san: mv.san, from, to, promotion: mv.promotion || null, fen: chess.fen(), end: end || null});
  }
  function onChessDown(e) {
    const s = e.target.closest('.sq'); if (!s || !chess) return;
    if (view !== null) { setView(null); return; }
    const sq = s.dataset.sq, piece = chess.get(sq);
    if (sel && sel !== sq && canMove() && tryMove(sel, sq)) { e.preventDefault(); return; }
    if (piece && canMove() && piece.color === myColor()) {
      e.preventDefault();
      const wasSel = sel === sq; sel = sq; drawBoard();
      const pc = root.querySelector(`.sq[data-sq="${sq}"] .pc`); if (!pc) return;
      const r = pc.getBoundingClientRect();
      drag = {from: sq, wasSel, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, size: r.width, pc};
    } else if (sel) { sel = null; drawBoard(); }
  }
  function onChessMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      const g = document.createElement('span'); g.className = drag.pc.className + ' drag-ghost';
      g.style.width = g.style.height = drag.size + 'px'; document.body.appendChild(g); drag.ghost = g; drag.pc.style.opacity = '.25';
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    e.preventDefault();
  }
  function onChessUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.moved) {
      const to = sqAt(e.clientX, e.clientY);
      if (to && to !== d.from && tryMove(d.from, to)) return;
      d.pc.style.opacity = '';
      if (to !== d.from) { sel = null; drawBoard(); }
    } else if (d.wasSel) { sel = null; drawBoard(); }
  }

  // ---------- BATAILLE NAVALE ----------
  const cellName = c => COLS[c % 10] + (Math.floor(c / 10) + 1);
  function shipCells(start, n, vertical) {
    const r = Math.floor(start / 10), c = start % 10;
    if (vertical ? r + n > 10 : c + n > 10) return null;
    return Array.from({length: n}, (_, i) => vertical ? start + i * 10 : start + i);
  }
  function draftFree(cells, skip) { const used = new Set(navalDraft.flatMap((s, i) => i === skip || !s ? [] : s)); return cells.every(c => !used.has(c)); }
  function randomFleet() {
    for (let tries = 0; tries < 200; tries++) {
      navalDraft = SHIPS.map(() => null); let ok = true;
      for (let i = 0; i < SHIPS.length && ok; i++) {
        let placed = false;
        for (let k = 0; k < 200 && !placed; k++) { const v = Math.random() < 0.5, cells = shipCells(Math.floor(Math.random() * 100), SHIPS[i].n, v); if (cells && draftFree(cells, i)) { navalDraft[i] = cells; placed = true; } }
        ok = placed;
      }
      if (ok) return;
    }
  }
  function grid(kind, cellsHTML, attrs) {
    let h = `<div class="nv-grid ${kind}" ${attrs || ''}><span class="nv-corner"></span>`;
    for (let c = 0; c < 10; c++) h += `<span class="nv-lab">${COLS[c]}</span>`;
    for (let r = 0; r < 10; r++) { h += `<span class="nv-lab">${r + 1}</span>`; for (let c = 0; c < 10; c++) h += cellsHTML(r * 10 + c); }
    return h + '</div>';
  }
  function shipShape(cells, c) {
    // forme arrondie aux extrémités du bateau
    if (!cells) return '';
    const v = cells.length > 1 && cells[1] - cells[0] === 10, i = cells.indexOf(c);
    return ' ship ' + (v ? 'v' : 'h') + (i === 0 ? ' s0' : '') + (i === cells.length - 1 ? ' s1' : '');
  }
  function renderNaval() {
    const s = cur.state || {}, placed = (s.placed || []).map(Number);
    let body = '';
    if (cur.status !== 'accepted') body = '<p class="nv-wait">La partie commencera quand le défi sera accepté.</p>';
    else if (!isPlayer()) body = navalSpectator(s);
    else if (s.phase === 'place' && !placed.includes(me())) body = navalPlacement();
    else body = navalBattle(s);
    root.innerHTML = head() + `<div class="nv-wrap">${body}</div>` + actions();
    navalFx();
  }
  function navalPlacement() {
    if (!navalDraft) navalDraft = SHIPS.map(() => null);
    const shipOf = new Map(); navalDraft.forEach((cells, i) => cells && cells.forEach(c => shipOf.set(c, i)));
    const g = grid('mine place', c => { const i = shipOf.get(c); return `<button type="button" class="nv-cell${i !== undefined ? shipShape(navalDraft[i], c) : ''}" data-cell="${c}" aria-label="${cellName(c)}"></button>`; }, 'data-g="draft"');
    const done = navalDraft.every(Boolean);
    return `<div class="nv-place"><div class="nv-board"><p class="nv-cap">⚓ Place tes 5 bateaux</p>${g}</div><div class="nv-panel">
      <p class="nv-help">Choisis un bateau, puis touche la case de départ. Touche un bateau posé pour le reprendre.</p>
      <div class="nv-ships">${SHIPS.map((sh, i) => `<button type="button" class="nv-ship ${navalPick === i ? 'on' : ''} ${navalDraft[i] ? 'done' : ''}" data-ship="${i}"><span class="nv-hull svg" style="width:${sh.n * 15}px">${shipSVG(KIND_OF[i], sh.n)}</span><span>${sh.name} · ${sh.n}</span>${navalDraft[i] ? '<em>✓</em>' : ''}</button>`).join('')}</div>
      <div class="nv-tools"><button type="button" class="gb-btn ghost" data-act="rotate">↻ ${navalVertical ? 'Vertical' : 'Horizontal'}</button><button type="button" class="gb-btn ghost" data-act="random">🎲 Au hasard</button><button type="button" class="gb-btn ghost" data-act="clear">Effacer</button></div>
      <button type="button" class="gb-btn big" data-act="fleet" ${done && !pending ? '' : 'disabled'}>✅ Valider ma flotte</button></div></div>`;
  }
  function paintPreview() {
    if (!root || !navalDraft) return;
    const cells = hoverCell >= 0 && navalPick >= 0 && !navalDraft[navalPick] ? shipCells(hoverCell, SHIPS[navalPick].n, navalVertical) : null;
    const bad = !cells || !draftFree(cells, navalPick), set = new Set(cells || (hoverCell >= 0 && navalPick >= 0 && !navalDraft[navalPick] ? [hoverCell] : []));
    root.querySelectorAll('[data-cell]').forEach(b => { const on = set.has(Number(b.dataset.cell)); b.classList.toggle('pv', on); b.classList.toggle('bad', on && bad); });
  }
  function navalBattle(s) {
    const myShots = (s.shots || {})[me()] || [], theirShots = (s.shots || {})[other()] || [], mine = s.mine || [], sunk = s.sunk || [];
    const shotMap = new Map(myShots.map(x => [Number(x.c), x])), hitMe = new Map(theirShots.map(x => [Number(x.c), x]));
    const sunkOf = new Map(); sunk.forEach(cells => cells.forEach(c => sunkOf.set(Number(c), cells.map(Number))));
    const mineOf = new Map(); mine.forEach(cells => cells.forEach(c => mineOf.set(Number(c), cells.map(Number))));
    const mySunk = mine.filter(cells => cells.every(c => hitMe.has(Number(c)) && hitMe.get(Number(c)).h)).length;
    const canShoot = myTurn() && !pending && s.phase === 'play';
    const enemy = grid('enemy' + (canShoot ? ' armed' : ''), c => {
      const x = shotMap.get(c), sk = sunkOf.get(c), revealed = sk && cur.finished_at && !(x && x.h);
      return `<button type="button" class="nv-cell${sk ? shipShape(sk, c) + (revealed ? ' reveal' : ' sunk') : ''}${x ? (x.h ? ' hit' : ' miss') : ''}" data-shot="${c}" ${canShoot && !x ? '' : 'disabled'} aria-label="${cellName(c)}"></button>`;
    }, `data-g="enemy" data-shooter="${me()}"`);
    const own = grid('mine', c => { const x = hitMe.get(c), sh = mineOf.get(c); return `<span class="nv-cell${sh ? shipShape(sh, c) : ''}${x ? (x.h ? ' hit' : ' miss') : ''}${sh && sh.every(q => hitMe.has(q) && hitMe.get(q).h) ? ' sunk' : ''}"></span>`; }, `data-g="mine" data-shooter="${other()}"`);
    const waitPlace = s.phase === 'place';
    return `<div class="nv-battle"><div class="nv-board"><p class="nv-cap">🎯 Flotte de ${esc(pl(other()).name)} <small>${cur.finished_at ? '' : `${sunk.length}/5 coulés`}</small></p>${waitPlace ? '<div class="nv-fog"><p>⏳ ' + esc(pl(other()).name) + ' place sa flotte…</p></div>' : enemy}</div>
      <div class="nv-board small"><p class="nv-cap">🛡️ Ta flotte <small>${mySunk}/5 coulés</small></p>${own}</div></div>
      ${s.phase === 'play' && !cur.finished_at ? `<p class="nv-rule">Touché = tu rejoues. Le premier qui coule les 5 bateaux gagne.</p>` : ''}`;
  }
  function navalSpectator(s) {
    const a = cur.challenger, b = cur.opponent;
    const view = (shooter) => { const shots = new Map(((s.shots || {})[shooter] || []).map(x => [Number(x.c), x])); return grid('enemy', c => { const x = shots.get(c); return `<span class="nv-cell${x ? (x.h ? ' hit' : ' miss') : ''}"></span>`; }, `data-g="spec" data-shooter="${shooter}"`); };
    return `<div class="nv-battle"><div class="nv-board"><p class="nv-cap">Tirs de ${esc(pl(a).name)}</p>${view(a)}</div><div class="nv-board"><p class="nv-cap">Tirs de ${esc(pl(b).name)}</p>${view(b)}</div></div>`;
  }

  // ---------- BATAILLE NAVALE : bateaux dessinés, missiles, explosions, naufrages ----------
  const KIND_OF = ['carrier', 'battleship', 'cruiser', 'sub', 'destroyer'];
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let fxSeen = null, fxQueue = Promise.resolve(), fxGen = 0, audio = null;
  function shipSVG(kind, n) {
    const W = n * 100, s = 'stroke="#2c343c" stroke-width="3" stroke-linejoin="round"';
    const hull = `<path d="M10 50 Q12 20 44 18 L${W - 80} 18 Q${W - 20} 24 ${W - 5} 50 Q${W - 20} 76 ${W - 80} 82 L44 82 Q12 80 10 50Z" fill="#7b8894" ${s}/><path d="M28 50 Q30 31 52 30 L${W - 86} 30 Q${W - 40} 34 ${W - 26} 50 Q${W - 40} 66 ${W - 86} 70 L52 70 Q30 69 28 50Z" fill="#96a3ae"/>`;
    const turret = (x, dir) => `<g transform="translate(${x} 50)"><rect x="${dir > 0 ? 6 : -34}" y="-4" width="28" height="3.5" fill="#39434c"/><rect x="${dir > 0 ? 6 : -34}" y="1" width="28" height="3.5" fill="#39434c"/><circle r="15" fill="#5c6872" ${s}/><circle r="6" fill="#4a555e"/></g>`;
    const bridge = (x, w) => `<rect x="${x}" y="34" width="${w}" height="32" rx="5" fill="#b9c3cb" ${s}/><rect x="${x + 6}" y="40" width="${w - 12}" height="7" rx="2" fill="#3b4a58"/><circle cx="${x + w / 2}" cy="57" r="4" fill="#2c343c"/>`;
    let body = '';
    if (kind === 'carrier') {
      body = `<path d="M6 50 L28 12 L${W - 34} 12 Q${W - 4} 30 ${W - 4} 50 Q${W - 4} 70 ${W - 34} 88 L28 88 Z" fill="#6b7783" ${s}/>
        <rect x="34" y="22" width="${W - 90}" height="56" rx="4" fill="#4e5862"/>
        <line x1="44" y1="50" x2="${W - 60}" y2="50" stroke="#e9eef2" stroke-width="3" stroke-dasharray="20 14"/>
        <line x1="60" y1="70" x2="${W - 140}" y2="30" stroke="#f2c94c" stroke-width="2.5" stroke-dasharray="10 8"/>
        <rect x="${W - 190}" y="4" width="64" height="24" rx="4" fill="#a7b2bb" ${s}/><rect x="${W - 172}" y="-2" width="6" height="12" fill="#2c343c"/>
        ${[90, 150, 210].map(x => `<path d="M${x} 50 l-18 -12 l4 12 l-4 12z M${x - 6} 50 l-10 -4 v8z" fill="#d6dde3" ${s.replace('3"', '1.5"')}/>`).join('')}`;
    } else if (kind === 'sub') {
      body = `<ellipse cx="${W / 2}" cy="50" rx="${W / 2 - 8}" ry="27" fill="#34414c" ${s}/><ellipse cx="${W / 2}" cy="44" rx="${W / 2 - 30}" ry="10" fill="#4b5966"/>
        <rect x="${W / 2 - 34}" y="32" width="58" height="36" rx="12" fill="#2a343d" ${s}/><rect x="${W / 2 - 4}" y="22" width="5" height="20" fill="#1d252c"/>
        <path d="M14 50 l-10 -16 v32z" fill="#2a343d"/>`;
    } else {
      body = hull;
      if (kind === 'battleship') body += turret(W - 110, 1) + turret(W - 160, 1) + bridge(W / 2 - 50, 70) + `<rect x="${W / 2 - 92}" y="42" width="18" height="16" rx="3" fill="#39434c"/>` + turret(80, -1);
      if (kind === 'cruiser') body += turret(W - 95, 1) + bridge(W / 2 - 40, 60) + turret(70, -1);
      if (kind === 'destroyer') body += turret(W - 70, 1) + bridge(40, 56);
    }
    return `<svg viewBox="0 -6 ${W} 106" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">${body}</svg>`;
  }
  function sizeKind(cells, used) { // flotte adverse coulée : on devine le type à la taille
    const n = cells.length; if (n === 5) return 'carrier'; if (n === 4) return 'battleship'; if (n === 2) return 'destroyer';
    const k = used.has('cruiser') ? 'sub' : 'cruiser'; used.add(k); return k;
  }
  const mk = (cls, parent) => { const d = document.createElement('div'); d.className = cls; if (parent) parent.appendChild(d); return d; };
  function cellRect(cellsEl, c) { const e = cellsEl[c]; return {x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight}; }
  function putShip(fx, cellsEl, cells, kind, cls) {
    cells = cells.map(Number).sort((a, b) => a - b);
    const a = cellRect(cellsEl, cells[0]), b = cellRect(cellsEl, cells[cells.length - 1]), v = cells.length > 1 && cells[1] - cells[0] === 10;
    const box = {x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y};
    const d = mk('nv-sprite ' + (cls || ''), fx); Object.assign(d.style, {left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px'});
    const inner = mk('nv-hullimg' + (v ? ' v' : ''), d); if (v) Object.assign(inner.style, {width: box.h + 'px', height: box.w + 'px'});
    inner.innerHTML = shipSVG(kind, cells.length); d.dataset.cells = cells.join(',');
    return d;
  }
  function putMark(fx, cellsEl, c, hit, cls) {
    const r = cellRect(cellsEl, c), d = mk((hit ? 'nv-burn' : 'nv-peg') + ' ' + (cls || ''), fx); d.dataset.c = c;
    Object.assign(d.style, {left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px'});
    if (hit) { mk('nv-flame', d); mk('nv-flame f2', d); mk('nv-smoke', d); } else { mk('nv-dot', d); mk('nv-ripple', d); }
    return d;
  }
  // Petits bruitages synthétisés (sifflement, explosion, plouf)
  function sfx(kind) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime, len = kind === 'boom' ? 1.1 : kind === 'sink' ? 1.6 : kind === 'splash' ? 0.7 : 0.55;
      const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const p = i / d.length; d[i] = (Math.random() * 2 - 1) * (kind === 'whoosh' ? Math.sin(p * Math.PI) : Math.pow(1 - p, kind === 'boom' ? 2.2 : 3)); }
      const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain(); src.buffer = buf;
      if (kind === 'whoosh') { f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + len); g.gain.value = 0.18; }
      else if (kind === 'boom') { f.type = 'lowpass'; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(90, t + len); g.gain.value = 0.9; }
      else if (kind === 'sink') { f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(60, t + len); g.gain.value = 0.6; }
      else { f.type = 'bandpass'; f.Q.value = 0.7; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(500, t + len); g.gain.value = 0.45; }
      src.connect(f).connect(g).connect(audio.destination); src.start(t);
      if (kind === 'boom' || kind === 'sink') { const o = audio.createOscillator(), og = audio.createGain(); o.frequency.setValueAtTime(kind === 'boom' ? 110 : 70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9); o.connect(og).connect(audio.destination); o.start(t); o.stop(t + 0.9); }
    } catch (_) {}
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Un tir : missile qui arrive, puis explosion (touché) ou gerbe d'eau (raté), puis naufrage si coulé.
  async function animateShot(g, fx, cellsEl, shot, mark, sinking, gen) {
    if (gen !== fxGen || !g.isConnected) { if (mark) mark.classList.remove('wait'); return; }
    const r = cellRect(cellsEl, shot.c), cx = r.x + r.w / 2, cy = r.y + r.h / 2, size = 0.75 + Math.random() * 0.7;
    const side = Math.random() < 0.5 ? -1 : 1, sx = cx + side * (g.offsetWidth * (0.3 + Math.random() * 0.35)), sy = -r.h * (2.5 + Math.random() * 2);
    const ang = Math.atan2(cy - sy, cx - sx) * 180 / Math.PI;
    const m = mk('nv-missile', fx); Object.assign(m.style, {left: cx + 'px', top: cy + 'px', width: r.w * 1.5 * size + 'px', height: r.h * 0.34 * size + 'px'});
    sfx('whoosh');
    await m.animate([{transform: `translate(${sx - cx}px,${sy - cy}px) translate(-100%,-50%) rotate(${ang}deg)`, offset: 0}, {transform: `translate(0,0) translate(-100%,-50%) rotate(${ang}deg)`}],
      {duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.5,0,.95,.55)'}).finished.catch(() => {});
    m.remove(); if (!g.isConnected) return;
    if (shot.h) {
      sfx('boom');
      const boom = mk('nv-boom', fx), bs = r.w * (2.2 + size); Object.assign(boom.style, {left: cx - bs / 2 + 'px', top: cy - bs / 2 + 'px', width: bs + 'px', height: bs + 'px'});
      boom.animate([{transform: 'scale(.15)', opacity: 1}, {transform: 'scale(1)', opacity: .95, offset: .35}, {transform: 'scale(1.25)', opacity: 0}], {duration: 700, easing: 'ease-out'}).finished.then(() => boom.remove(), () => {});
      for (let i = 0; i < 10; i++) {
        const sp = mk('nv-spark', fx), a = Math.random() * Math.PI * 2, dist = r.w * (0.8 + Math.random() * 1.6);
        Object.assign(sp.style, {left: cx + 'px', top: cy + 'px'});
        sp.animate([{transform: 'translate(-50%,-50%) scale(1)', opacity: 1}, {transform: `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist + r.h * .6}px) scale(.3)`, opacity: 0}], {duration: 500 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)'}).finished.then(() => sp.remove(), () => {});
      }
      g.animate([{transform: 'translate(0,0)'}, {transform: 'translate(-4px,2px)'}, {transform: 'translate(4px,-2px)'}, {transform: 'translate(-3px,-1px)'}, {transform: 'translate(0,0)'}], {duration: 320});
    } else {
      sfx('splash');
      for (let k = 0; k < 2; k++) { const ring = mk('nv-ring', fx), rs = r.w * 1.8; Object.assign(ring.style, {left: cx - rs / 2 + 'px', top: cy - rs / 2 + 'px', width: rs + 'px', height: rs + 'px'});
        ring.animate([{transform: 'scale(.2)', opacity: .9}, {transform: 'scale(1.3)', opacity: 0}], {duration: 900, delay: k * 220, easing: 'ease-out'}).finished.then(() => ring.remove(), () => {}); }
      for (let i = 0; i < 12; i++) {
        const dr = mk('nv-drop', fx), dx = (Math.random() - 0.5) * r.w * 1.6, up = r.h * (1 + Math.random() * 1.8 * size);
        Object.assign(dr.style, {left: cx + 'px', top: cy + 'px'});
        dr.animate([{transform: 'translate(-50%,-50%)', opacity: 1}, {transform: `translate(${dx * .6}px,${-up}px)`, opacity: 1, offset: .45}, {transform: `translate(${dx}px,${r.h * .3}px)`, opacity: 0}], {duration: 750 + Math.random() * 300, easing: 'ease-out'}).finished.then(() => dr.remove(), () => {});
      }
    }
    if (mark) mark.classList.remove('wait');
    if (sinking) {
      await wait(450); if (!sinking.isConnected) return;
      sinking.classList.remove('wait'); sfx('sink');
      const box = sinking.getBoundingClientRect();
      sinking.animate([{transform: 'none', filter: 'brightness(1)', opacity: 1}, {transform: 'translateY(4%) rotate(3deg)', filter: 'brightness(.8)', opacity: 1, offset: .25}, {transform: 'translateY(22%) rotate(-8deg) scale(.95)', filter: 'brightness(.45) saturate(.4)', opacity: .7}], {duration: 2000, easing: 'ease-in'}).finished
        .then(() => { sinking.classList.add('sunk'); sinking.classList.remove('afloat');
          const cs = (sinking.dataset.cells || '').split(',').map(Number); fx.querySelectorAll('.nv-burn').forEach(b => { if (cs.includes(Number(b.dataset.c))) b.classList.add('out'); }); }, () => {});
      const n = Math.max(6, Math.round(Math.max(box.width, box.height) / 12));
      for (let i = 0; i < n; i++) {
        const bb = mk('nv-bubble', fx), left = sinking.offsetLeft + Math.random() * sinking.offsetWidth, top = sinking.offsetTop + Math.random() * sinking.offsetHeight;
        Object.assign(bb.style, {left: left + 'px', top: top + 'px'});
        bb.animate([{transform: 'translateY(0) scale(.4)', opacity: 0}, {opacity: .9, offset: .2}, {transform: `translateY(${-20 - Math.random() * 30}px) scale(1)`, opacity: 0}], {duration: 900 + Math.random() * 900, delay: 300 + Math.random() * 1400}).finished.then(() => bb.remove(), () => {});
      }
    }
  }
  // Construit le décor de chaque grille et joue les tirs qui n'ont pas encore été montrés.
  function navalFx() {
    if (!cur || cur.game !== 'naval' || !root) return;
    const s = cur.state || {}, gen = ++fxGen, still = reduceMotion();
    if (!fxSeen || fxSeen.id !== cur.id) fxSeen = {id: cur.id, set: null};
    const first = !fxSeen.set; if (first) fxSeen.set = new Set();
    root.querySelectorAll('.nv-grid[data-g]').forEach(g => {
      g.classList.add('fx'); g.querySelectorAll('.nv-fx').forEach(x => x.remove());
      const fx = mk('nv-fx', g), cellsEl = g.querySelectorAll('.nv-cell'); if (cellsEl.length !== 100) return;
      const kindG = g.dataset.g, shooter = Number(g.dataset.shooter) || 0;
      if (kindG === 'draft') { (navalDraft || []).forEach((cells, i) => cells && putShip(fx, cellsEl, cells, KIND_OF[i], 'draft')); return; }
      const shots = ((s.shots || {})[shooter] || []).map(x => ({c: Number(x.c), h: !!x.h, s: !!x.s}));
      const hitSet = new Set(shots.filter(x => x.h).map(x => x.c));
      const fresh = shots.filter(x => !fxSeen.set.has(kindG + shooter + ':' + x.c));
      const freshSet = new Set(fresh.map(x => x.c));
      // bateaux
      const ships = [];
      if (kindG === 'mine') (s.mine || []).forEach((cells, i) => ships.push({cells: cells.map(Number), kind: KIND_OF[i] || 'cruiser'}));
      if (kindG === 'enemy') { const used = new Set(); (s.sunk || []).forEach(cells => ships.push({cells: cells.map(Number), kind: sizeKind(cells, used), enemy: true})); }
      const sinkingOf = new Map();
      ships.forEach(sh => {
        const dead = sh.cells.every(c => hitSet.has(c)), dying = dead && sh.cells.some(c => freshSet.has(c)) && !first && !still;
        const revealOnly = sh.enemy && !dead; // fin de partie : bateaux adverses non coulés
        const el = putShip(fx, cellsEl, sh.cells, sh.kind, revealOnly ? 'reveal' : dead && !dying ? 'sunk' : dying ? 'afloat' + (sh.enemy ? ' wait' : '') : '');
        if (dying) { const last = sh.cells.filter(c => freshSet.has(c)).pop(); sinkingOf.set(last, el); sh.dying = true; }
      });
      // marques (feu / plouf)
      const deadCells = new Set(ships.filter(sh => !sh.dying && sh.cells.every(c => hitSet.has(c))).flatMap(sh => sh.cells));
      const marks = new Map();
      shots.forEach(x => marks.set(x.c, putMark(fx, cellsEl, x.c, x.h, (deadCells.has(x.c) ? 'out' : '') + (freshSet.has(x.c) && !first && !still ? ' wait' : ''))));
      fresh.forEach(x => fxSeen.set.add(kindG + shooter + ':' + x.c));
      if (first || still) return;
      fresh.forEach(x => { fxQueue = fxQueue.then(() => animateShot(g, fx, cellsEl, x, marks.get(x.c), sinkingOf.get(x.c), gen)).then(() => wait(150)); });
    });
  }
  let fxResize = 0;
  window.addEventListener('resize', () => { clearTimeout(fxResize); fxResize = setTimeout(() => { if (cur && cur.game === 'naval' && !cur.loading) { fxGen++; root.querySelectorAll('.nv-grid[data-g]').forEach(() => {}); navalFx(); } }, 200); });

  // ---------- événements ----------
  function bind(el) {
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]');
      if (a && !a.disabled) {
        const act = a.dataset.act;
        if (act === 'exit') { close(); return; }
        if (act === 'rematch') { ctx.rematch && ctx.rematch(cur.game, other()); return; }
        if (act === 'resign') { if (confirmResign > Date.now()) { confirmResign = 0; await send({resign: true}); } else { confirmResign = Date.now() + 4000; render(); setTimeout(() => { if (confirmResign && confirmResign <= Date.now()) { confirmResign = 0; render(); } }, 4100); } return; }
        if (act === 'claim') { await send({claim: true}); return; }
        if (act === 'abort') { await send({abort: true}); return; }
        if (act === 'switch') { const id = Number(a.dataset.id); if (id) open(id, ctx); return; }
        if (act === 'draw-offer') { await send({draw: 'offer'}); ctx.toast('🤝 Nulle proposée.'); return; }
        if (act === 'draw-accept') { await send({draw: 'accept'}); return; }
        if (act === 'draw-decline') { await send({draw: 'decline'}); return; }
        if (act === 'rotate') { navalVertical = !navalVertical; render(); return; }
        if (act === 'random') { randomFleet(); navalPick = -1; render(); return; }
        if (act === 'clear') { navalDraft = SHIPS.map(() => null); navalPick = 0; render(); return; }
        if (act === 'fleet') { if (!navalDraft || !navalDraft.every(Boolean)) return; a.disabled = true; const r = await send({fleet: navalDraft}); if (r) ctx.toast('⚓ Flotte placée !'); return; }
      }
      const nb = e.target.closest('[data-nav]');
      if (nb && !nb.disabled && chess) { const n = (chess._moves || []).length, at = view === null ? n : view; const k = nb.dataset.nav; setView(k === 'first' ? 0 : k === 'prev' ? at - 1 : k === 'next' ? at + 1 : null); return; }
      const mp = e.target.closest('[data-ply]');
      if (mp && chess) { setView(Number(mp.dataset.ply)); return; }
      const sh = e.target.closest('[data-ship]');
      if (sh) { const i = Number(sh.dataset.ship); if (navalDraft && navalDraft[i]) navalDraft[i] = null; navalPick = i; render(); return; }
      const cell = e.target.closest('[data-cell]');
      if (cell && navalDraft) {
        const c = Number(cell.dataset.cell), owner = navalDraft.findIndex(s => s && s.includes(c));
        if (owner >= 0) { navalDraft[owner] = null; navalPick = owner; render(); return; }
        if (navalPick < 0 || navalDraft[navalPick]) navalPick = navalDraft.findIndex(s => !s);
        if (navalPick < 0) return;
        const cells = shipCells(c, SHIPS[navalPick].n, navalVertical);
        if (!cells || !draftFree(cells, navalPick)) { ctx.toast('Le bateau ne rentre pas ici.'); return; }
        navalDraft[navalPick] = cells; navalPick = navalDraft.findIndex(s => !s); render(); return;
      }
      const shot = e.target.closest('[data-shot]');
      if (shot && !shot.disabled && myTurn() && !pending) {
        const c = Number(shot.dataset.shot); shot.classList.add('aim');
        root.querySelectorAll('[data-shot]').forEach(b => { b.disabled = true; });
        const r = await send({shot: c});
        if (r) { const msg = r.win ? '🏆 Toute la flotte est coulée, tu as gagné !' : r.sunk ? '☠️ Coulé ! Tu rejoues.' : r.hit ? `💥 Touché en ${cellName(c)} ! Tu rejoues.` : `🌊 Dans l’eau (${cellName(c)}).`; setTimeout(() => ctx.toast(msg), reduceMotion() ? 0 : 950); }
      }
    });
    el.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const c = e.target.closest('[data-cell]'); if (c && navalDraft && cur && cur.game === 'naval') { hoverCell = Number(c.dataset.cell); paintPreview(); } });
    el.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-cell]')) { hoverCell = -1; paintPreview(); } });
    el.addEventListener('pointerdown', e => { if (cur && cur.game === 'chess' && e.target.closest('#chess-board')) onChessDown(e); });
    window.addEventListener('pointermove', onChessMove, {passive: false});
    window.addEventListener('pointerup', onChessUp);
    window.addEventListener('pointercancel', () => { if (drag) { if (drag.ghost) drag.ghost.remove(); drag.pc.style.opacity = ''; drag = null; } });
    document.addEventListener('keydown', e => {
      if (!cur || cur.game !== 'chess' || !chess || /input|textarea/i.test(e.target.tagName) || root.hidden) return;
      const n = (chess._moves || []).length, at = view === null ? n : view;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setView(at - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); setView(at + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setView(0); } else if (e.key === 'ArrowDown') { e.preventDefault(); setView(null); }
    });
    document.addEventListener('keydown', e => { if (cur && cur.game === 'naval' && navalDraft && (e.key === 'r' || e.key === 'R') && !/input|textarea/i.test(e.target.tagName)) { navalVertical = !navalVertical; render(); } });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && cur && !cur.loading) { lastKey = ''; load(false); } });
  let bound = false;
  window.YetiGames = Object.freeze({
    GAMES,
    open(id, options) { if (!bound) { bind(options.root); bound = true; } return open(Number(id), options); },
    close: () => close(),
    get openId() { return cur ? cur.id : null; },
    refresh() { lastKey = ''; return load(false); },
  });
})();
