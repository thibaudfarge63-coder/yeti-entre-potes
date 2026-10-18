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
  let chess = null, lastKey = '', navalDraft = null, navalPick = 0, navalVertical = false, hoverCell = -1;

  const $ = s => root.querySelector(s);
  const esc = t => ctx.escape(String(t));
  const pl = id => ctx.player(id) || {name: '?', color: '#999'};
  const me = () => (cur && cur.viewer) || 0;
  const isPlayer = () => cur && (me() === cur.challenger || me() === cur.opponent);
  const other = () => (cur ? (me() === cur.challenger ? cur.opponent : cur.challenger) : 0);

  function glyph(t) { return GLYPH[t] + '︎'; }

  // ---------- ouverture / fermeture ----------
  async function open(duelId, options) {
    ctx = options; root = ctx.root;
    if (cur && cur.id !== duelId) close(true);
    cur = {id: duelId, loading: true}; lastKey = ''; sel = null; navalDraft = null; navalPick = 0; chess = null;
    root.hidden = false; root.className = 'board-stage';
    root.innerHTML = '<div class="gb-loading"><span class="spinner"></span><p>Chargement de la partie…</p></div>';
    ctx.onOpen && ctx.onOpen();
    await load(true);
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(false); }, 2000);
  }
  function close(silent) {
    clearInterval(timer); timer = null; cur = null; chess = null; drag = null;
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
        ctx.toast(last.s ? `☠️ ${pl(other()).name} a coulé un de tes bateaux !` : last.h ? `💥 ${pl(other()).name} t’a touché en ${cellName(last.c)} !` : `🌊 ${pl(other()).name} a tiré dans l’eau (${cellName(last.c)}). À toi !`);
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
    const why = {checkmate: 'par échec et mat', resign: 'par abandon', timeout: 'par forfait (24 h sans jouer)', sunk: 'en coulant toute la flotte', stalemate: 'pat', draw: 'nulle', agreed: 'nulle d’un commun accord'}[end] || '';
    if (w === 0) return `🤝 Partie nulle${end === 'stalemate' ? ' (pat)' : end === 'agreed' ? ' d’un commun accord' : ''}`;
    if (isPlayer()) return w === me() ? `🏆 Tu as gagné ${why} !` : `😵 ${pl(w).name} a gagné ${why}.`;
    return `🏆 ${pl(w).name} a gagné ${why}.`;
  }
  function head() {
    const g = GAMES[cur.game], A = pl(cur.challenger), B = pl(cur.opponent);
    let status;
    if (cur.status === 'pending') status = `⏳ En attente que ${esc(B.name)} accepte le défi`;
    else if (cur.status === 'refused') status = '❌ Défi refusé';
    else if (cur.finished_at) status = esc(resultText());
    else if (!isPlayer()) status = '👁️ Tu regardes la partie';
    else if (myTurn()) status = cur.game === 'naval' && cur.state.phase === 'place' ? '⚓ Place ta flotte' : cur.game === 'naval' ? '🎯 À toi de tirer !' : '🟢 À toi de jouer !';
    else status = cur.game === 'naval' && cur.state.phase === 'place' ? `⏳ ${esc(pl(other()).name)} place sa flotte…` : `⏳ ${esc(pl(other()).name)} réfléchit…`;
    return `<div class="gb-head"><button type="button" class="gb-back" data-act="exit">← Retour au Yéti</button><div class="gb-title"><b>${g.icon} ${g.name}</b><span>${esc(A.name)} vs ${esc(B.name)}</span></div><span class="gb-status ${myTurn() ? 'go' : ''} ${cur.finished_at ? 'end' : ''}" id="gb-status">${status}</span></div>`;
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
    h += `<button type="button" class="gb-btn danger" data-act="resign">${confirmResign > Date.now() ? 'Confirmer l’abandon ?' : '🏳️ Abandonner'}</button>`;
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
    return `<div class="gb-strip ${top ? 'top' : ''} ${turn ? 'turn' : ''}">${ctx.avatar(p)}<span class="gb-name"><b>${esc(p.name)}</b><small>${color === 'w' ? 'Blancs' : 'Noirs'}${turn ? ' · au trait' : ''}</small></span><span class="gb-taken ${color === 'w' ? 'from-b' : 'from-w'}">${taken.map(t => `<i>${glyph(t)}</i>`).join('')}${adv > 0 ? `<em>+${adv}</em>` : ''}</span></div>`;
  }
  function renderChess() {
    syncChess();
    const col = myColor(), m = material(), oppId = isPlayer() ? other() : (Number(cur.state.white) === cur.challenger ? cur.opponent : cur.challenger);
    const meId = isPlayer() ? me() : Number(cur.state.white);
    root.innerHTML = head() + `<div class="chess-wrap"><div class="chess-main">${strip(oppId, col === 'w' ? 'b' : 'w', m, true)}<div class="chess-board ${col === 'b' ? 'flip' : ''}" id="chess-board"></div>${strip(meId, col, m, false)}</div>
      <aside class="chess-side"><div class="chess-moves" id="chess-moves"></div>${actions()}</aside></div><div class="chess-promo" id="chess-promo" hidden></div>`;
    drawBoard(); drawMoves();
  }
  function lastMove() { const mv = chess._moves || []; return mv.length ? mv[mv.length - 1] : null; }
  function drawBoard() {
    const el = $('#chess-board'); if (!el) return;
    const col = myColor(), lm = lastMove(), board = chess.board();
    const targets = sel ? chess.moves({square: sel, verbose: true}) : [];
    const tset = new Map(targets.map(t => [t.to, t]));
    let checkSq = '';
    if (chess.in_check()) { const t = chess.turn(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const q = board[r][f]; if (q && q.type === 'k' && q.color === t) checkSq = FILES[f] + (8 - r); } }
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
      h += `<div class="${cls.join(' ')}" data-sq="${sq}">${rowEdge ? `<span class="cr">${8 - r}</span>` : ''}${colEdge ? `<span class="cf">${FILES[f]}</span>` : ''}${piece ? `<span class="pc ${piece.color}" data-pc="${piece.color}">${glyph(piece.type)}</span>` : ''}</div>`;
    }
    el.innerHTML = h;
  }
  function drawMoves() {
    const el = $('#chess-moves'); if (!el) return;
    const mv = chess._moves || [];
    if (!mv.length) { el.innerHTML = `<p class="chess-empty">${cur.status === 'accepted' ? (isPlayer() ? (myTurn() ? 'Tu as les blancs : à toi d’ouvrir la partie !' : `${esc(pl(Number(cur.state.white)).name)} a les blancs et commence.`) : 'La partie n’a pas commencé.') : 'La partie commencera quand le défi sera accepté.'}</p>`; return; }
    let h = '<ol>';
    for (let i = 0; i < mv.length; i += 2) h += `<li><span>${i / 2 + 1}.</span><b class="${i === mv.length - 1 ? 'last' : ''}">${esc(mv[i].san)}</b><b class="${i + 1 === mv.length - 1 ? 'last' : ''}">${mv[i + 1] ? esc(mv[i + 1].san) : ''}</b></li>`;
    el.innerHTML = h + '</ol>'; el.scrollTop = el.scrollHeight;
  }
  function canMove() { return myTurn() && !pending && chess && chess.turn() === myColor(); }
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
    p.innerHTML = `<div class="promo-card"><p>Promotion</p>${['q', 'r', 'b', 'n'].map(t => `<button type="button" data-promo="${t}" class="pc ${c}">${glyph(t)}</button>`).join('')}<button type="button" class="promo-x" data-promo="">✕</button></div>`;
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
      const g = document.createElement('span'); g.className = 'pc drag-ghost ' + myColor(); g.textContent = drag.pc.textContent;
      g.style.fontSize = getComputedStyle(drag.pc).fontSize; document.body.appendChild(g); drag.ghost = g; drag.pc.style.opacity = '.25';
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
  function grid(kind, cellsHTML) {
    let h = `<div class="nv-grid ${kind}"><span class="nv-corner"></span>`;
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
  }
  function navalPlacement() {
    if (!navalDraft) navalDraft = SHIPS.map(() => null);
    const shipOf = new Map(); navalDraft.forEach((cells, i) => cells && cells.forEach(c => shipOf.set(c, i)));
    const g = grid('mine place', c => { const i = shipOf.get(c); return `<button type="button" class="nv-cell${i !== undefined ? shipShape(navalDraft[i], c) : ''}" data-cell="${c}" aria-label="${cellName(c)}"></button>`; });
    const done = navalDraft.every(Boolean);
    return `<div class="nv-place"><div class="nv-board"><p class="nv-cap">⚓ Place tes 5 bateaux</p>${g}</div><div class="nv-panel">
      <p class="nv-help">Choisis un bateau, puis touche la case de départ. Touche un bateau posé pour le reprendre.</p>
      <div class="nv-ships">${SHIPS.map((sh, i) => `<button type="button" class="nv-ship ${navalPick === i ? 'on' : ''} ${navalDraft[i] ? 'done' : ''}" data-ship="${i}"><span class="nv-hull">${'<i></i>'.repeat(sh.n)}</span><span>${sh.name} · ${sh.n}</span>${navalDraft[i] ? '<em>✓</em>' : ''}</button>`).join('')}</div>
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
    });
    const own = grid('mine', c => { const x = hitMe.get(c), sh = mineOf.get(c); return `<span class="nv-cell${sh ? shipShape(sh, c) : ''}${x ? (x.h ? ' hit' : ' miss') : ''}${sh && sh.every(q => hitMe.has(q) && hitMe.get(q).h) ? ' sunk' : ''}"></span>`; });
    const waitPlace = s.phase === 'place';
    return `<div class="nv-battle"><div class="nv-board"><p class="nv-cap">🎯 Flotte de ${esc(pl(other()).name)} <small>${cur.finished_at ? '' : `${sunk.length}/5 coulés`}</small></p>${waitPlace ? '<div class="nv-fog"><p>⏳ ' + esc(pl(other()).name) + ' place sa flotte…</p></div>' : enemy}</div>
      <div class="nv-board small"><p class="nv-cap">🛡️ Ta flotte <small>${mySunk}/5 coulés</small></p>${own}</div></div>
      ${s.phase === 'play' && !cur.finished_at ? `<p class="nv-rule">Touché = tu rejoues. Le premier qui coule les 5 bateaux gagne.</p>` : ''}`;
  }
  function navalSpectator(s) {
    const a = cur.challenger, b = cur.opponent;
    const view = (shooter) => { const shots = new Map(((s.shots || {})[shooter] || []).map(x => [Number(x.c), x])); return grid('enemy', c => { const x = shots.get(c); return `<span class="nv-cell${x ? (x.h ? ' hit' : ' miss') : ''}"></span>`; }); };
    return `<div class="nv-battle"><div class="nv-board"><p class="nv-cap">Tirs de ${esc(pl(a).name)}</p>${view(a)}</div><div class="nv-board"><p class="nv-cap">Tirs de ${esc(pl(b).name)}</p>${view(b)}</div></div>`;
  }

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
        if (act === 'draw-offer') { await send({draw: 'offer'}); ctx.toast('🤝 Nulle proposée.'); return; }
        if (act === 'draw-accept') { await send({draw: 'accept'}); return; }
        if (act === 'draw-decline') { await send({draw: 'decline'}); return; }
        if (act === 'rotate') { navalVertical = !navalVertical; render(); return; }
        if (act === 'random') { randomFleet(); navalPick = -1; render(); return; }
        if (act === 'clear') { navalDraft = SHIPS.map(() => null); navalPick = 0; render(); return; }
        if (act === 'fleet') { if (!navalDraft || !navalDraft.every(Boolean)) return; a.disabled = true; const r = await send({fleet: navalDraft}); if (r) ctx.toast('⚓ Flotte placée !'); return; }
      }
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
        if (r) { ctx.toast(r.win ? '🏆 Toute la flotte est coulée, tu as gagné !' : r.sunk ? '☠️ Coulé ! Tu rejoues.' : r.hit ? `💥 Touché en ${cellName(c)} ! Tu rejoues.` : `🌊 Dans l’eau (${cellName(c)}).`); ctx.sound && ctx.sound(r.hit ? 'capture' : 'move'); }
      }
    });
    el.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const c = e.target.closest('[data-cell]'); if (c && navalDraft && cur && cur.game === 'naval') { hoverCell = Number(c.dataset.cell); paintPreview(); } });
    el.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-cell]')) { hoverCell = -1; paintPreview(); } });
    el.addEventListener('pointerdown', e => { if (cur && cur.game === 'chess' && e.target.closest('#chess-board')) onChessDown(e); });
    window.addEventListener('pointermove', onChessMove, {passive: false});
    window.addEventListener('pointerup', onChessUp);
    window.addEventListener('pointercancel', () => { if (drag) { if (drag.ghost) drag.ghost.remove(); drag.pc.style.opacity = ''; drag = null; } });
    document.addEventListener('keydown', e => { if (cur && cur.game === 'naval' && navalDraft && (e.key === 'r' || e.key === 'R') && !/input|textarea/i.test(e.target.tagName)) { navalVertical = !navalVertical; render(); } });
  }

  let bound = false;
  window.YetiGames = Object.freeze({
    GAMES,
    open(id, options) { if (!bound) { bind(options.root); bound = true; } return open(Number(id), options); },
    close: () => close(),
    get openId() { return cur ? cur.id : null; },
    refresh() { lastKey = ''; return load(false); },
  });
})();
