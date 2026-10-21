/* Petits chameaux : les petits chevaux à 4 (règles classiques), places libres jouées par des bots côté serveur.
   Le dé est tiré par le serveur ; ici on affiche, on anime le journal des coups et on envoie les actions. */
(() => {
  'use strict';
  const COLORS = ['#e53935', '#1e88e5', '#f9a825', '#43a047'];
  const LIGHT = ['#ffd6d4', '#d3e8fb', '#fff0b8', '#d6f0d4'];
  const CNAME = ['Rouge', 'Bleu', 'Jaune', 'Vert'];
  const NEED = [1, 2, 3, 4];
  // Piste : 56 cases dans le sens des aiguilles d'une montre, case 0 = pied de l'escalier du haut. [ligne, colonne]
  const TRACK = (() => {
    const t = [[0, 7]];
    for (let r = 0; r <= 5; r++) t.push([r, 8]); t.push([6, 8]); for (let c = 9; c <= 14; c++) t.push([6, c]);
    t.push([7, 14]); for (let c = 14; c >= 9; c--) t.push([8, c]); t.push([8, 8]); for (let r = 9; r <= 14; r++) t.push([r, 8]);
    t.push([14, 7]); for (let r = 14; r >= 9; r--) t.push([r, 6]); t.push([8, 6]); for (let c = 5; c >= 0; c--) t.push([8, c]);
    t.push([7, 0]); for (let c = 0; c <= 5; c++) t.push([6, c]); t.push([6, 6]); for (let r = 5; r >= 0; r--) t.push([r, 6]);
    return t;
  })();
  const sq = (s, p) => (1 + 14 * s + p) % 56;
  const STAIR = (s, k) => [[k, 7], [7, 14 - k], [14 - k, 7], [7, k]][s];
  const STABLE = [[0, 9], [9, 9], [9, 0], [0, 0]];
  const SLOT = [[1.5, 1.5], [1.5, 4.5], [4.5, 1.5], [4.5, 4.5]];

  let ctx = null, root = null, cur = null, timer = null, busy = false, anim = null, pos = null, seenSeq = 0, autoT = 0, fast = false;
  let listTimer = null, list = [], panelEl = null, pick = new Set(), need = 4, creating = false, lastBadge = -1, knownInv = null;

  const esc = t => ctx.escape(String(t));
  const pl = id => (id && ctx.player(id)) || null;
  const sess = () => ctx.session();
  const meId = () => { const s = sess(); return s ? s.player : 0; };
  const wait = ms => new Promise(r => setTimeout(r, fast ? Math.min(ms, 15) : ms));

  function seatName(g, s) {
    const id = g.seats[s], st = g.seat_state[s];
    if (!id || st === 'bot' || st === 'declined') return `Bot ${CNAME[s].toLowerCase()}`;
    const p = pl(id); const n = p ? p.name : '?';
    return st === 'resigned' ? `${n} (bot)` : n;
  }
  const isHuman = (g, s) => g.seats[s] && (g.seat_state[s] === 'host' || g.seat_state[s] === 'joined');
  const homeCount = (h, s) => h[s].filter(v => v === 62).length;

  // ---------- API ----------
  async function api(path, body) {
    const s = sess();
    return ctx.request(path, {...body, player: s ? s.player : 0, token: s ? s.token : ''});
  }

  // ---------- liste / panneau des compétitions ----------
  function init(options) {
    ctx = options; panelEl = ctx.panel;
    panelEl.addEventListener('click', onPanelClick);
    clearInterval(listTimer); listTimer = setInterval(() => { if (!document.hidden) loadList(); }, 12000);
    loadList(); setTimeout(loadList, 2500); setTimeout(loadList, 6000);
  }
  async function loadList() {
    if (!ctx || !ctx.ready()) return;
    try { const r = await ctx.request('/api/camel/list', {}); list = (r && r.games) || []; } catch (_) { return; }
    const me = meId();
    if (me) {
      const inv = list.filter(g => g.status === 'lobby' && g.seats.some((p, i) => p === me && g.seat_state[i] === 'invited'));
      if (knownInv) for (const g of inv) if (!knownInv.has(g.id)) ctx.toast(`🐪 ${pl(g.host) ? pl(g.host).name : 'Quelqu’un'} t’invite aux petits chameaux !`);
      knownInv = new Set(inv.map(g => g.id));
    }
    renderPanel();
  }
  function myTodo(g, me) {
    const i = g.seats.indexOf(me);
    if (i < 0) return false;
    if (g.status === 'lobby') return g.seat_state[i] === 'invited';
    return g.status === 'playing' && g.turn === i && isHuman(g, i);
  }
  function renderPanel() {
    if (!panelEl) return;
    const me = meId(), players = ctx.players().filter(p => p.id !== me);
    const todo = me ? list.filter(g => myTodo(g, me)).length : 0;
    if (todo !== lastBadge) { lastBadge = todo; ctx.badge(todo); }
    const form = me ? `<div class="cam-new">
        <p class="duel-pick-label">Invite jusqu’à 3 potes (les places libres sont jouées par l’ordi) :</p>
        <div class="duel-pick cam-pick">${players.map(p => `<button type="button" class="duel-opp ${pick.has(p.id) ? 'on' : ''}" data-cam-pick="${p.id}" aria-pressed="${pick.has(p.id)}">${ctx.avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>
        <p class="duel-pick-label">La partie se termine quand un joueur a rentré au centre :</p>
        <div class="cam-need">${NEED.map(n => `<button type="button" class="${need === n ? 'on' : ''}" data-cam-need="${n}">${n} chameau${n > 1 ? 'x' : ''}${n === 1 ? ' · rapide' : n === 4 ? ' · classique' : ''}</button>`).join('')}</div>
        <button type="button" class="cam-go" data-cam-create ${creating ? 'disabled' : ''}>🐪 ${pick.size ? `Inviter ${pick.size} pote${pick.size > 1 ? 's' : ''}` : 'Jouer contre 3 bots'}</button>
      </div>` : '<p class="br-empty">Connecte-toi pour lancer une partie.</p>';
    const mine = list.filter(g => g.seats.includes(me) && g.status !== 'done');
    const others = list.filter(g => !g.seats.includes(me) && g.status === 'playing');
    const done = list.filter(g => g.status === 'done').slice(0, 5);
    const row = g => {
      const i = g.seats.indexOf(me), invited = i >= 0 && g.status === 'lobby' && g.seat_state[i] === 'invited';
      const chips = [0, 1, 2, 3].map(s => `<span class="cam-chip ${g.status === 'playing' && g.turn === s ? 'turn' : ''} ${g.winner === s && g.status === 'done' ? 'win' : ''}" style="--c:${COLORS[s]}"><i></i>${esc(seatName(g, s))}${g.status === 'lobby' && g.seat_state[s] === 'invited' ? ' ⏳' : ''}${g.home && g.home[s] ? ` · ${g.home[s]}🏁` : ''}</span>`).join('');
      let st = '', act = '';
      if (g.status === 'lobby') {
        st = invited ? `<b>${esc(pl(g.host) ? pl(g.host).name : '?')} t’invite !</b>` : 'En attente des invités…';
        act = invited ? `<button type="button" class="cam-yes" data-cam-answer="${g.id}" data-ok="1">Rejoindre</button><button type="button" class="cam-no" data-cam-answer="${g.id}" data-ok="0">Refuser</button>`
          : g.host === me ? `<button type="button" data-cam-open="${g.id}">Ouvrir</button>` : '';
      } else if (g.status === 'playing') {
        st = myTodo(g, me) ? '<b class="cam-you">À toi de jouer !</b>' : `Au tour de ${esc(seatName(g, g.turn))}`;
        act = `<button type="button" class="${myTodo(g, me) ? 'cam-yes' : ''}" data-cam-open="${g.id}">${i >= 0 ? 'Jouer' : 'Regarder'}</button>`;
      } else {
        st = g.winner !== null && g.winner !== undefined ? `🏆 ${esc(seatName(g, g.winner))} a gagné` : 'Partie arrêtée';
        act = `<button type="button" data-cam-open="${g.id}">Voir</button>`;
      }
      return `<div class="cam-row"><div class="cam-chips">${chips}</div><div class="cam-row-foot"><span class="cam-st">${st} · ${g.need} 🐪 pour gagner</span><span class="cam-acts">${act}</span></div></div>`;
    };
    const html = form
      + (mine.length ? '<p class="duel-sep">Tes parties</p>' + mine.map(row).join('') : '')
      + (others.length ? '<p class="duel-sep">Parties en cours du club</p>' + others.map(row).join('') : '')
      + (done.length ? '<p class="duel-sep">Terminées</p>' + done.map(row).join('') : '')
      + (!mine.length && !others.length && !done.length ? '<p class="br-empty">Aucune partie pour l’instant. Lance la première !</p>' : '');
    if (panelEl._html !== html) { panelEl.innerHTML = html; panelEl._html = html; }
  }
  async function onPanelClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.camPick) { const id = Number(b.dataset.camPick); if (pick.has(id)) pick.delete(id); else if (pick.size < 3) pick.add(id); else ctx.toast('3 invités maximum.'); renderPanel(); return; }
    if (b.dataset.camNeed) { need = Number(b.dataset.camNeed); renderPanel(); return; }
    if ('camCreate' in b.dataset) {
      if (!sess()) { ctx.toast('Reconnecte-toi pour lancer une partie.'); return; }
      creating = true; renderPanel();
      try { const g = await api('/api/camel/create', {invite: [...pick], need}); pick.clear(); await loadList(); open(g.id); ctx.toast(g.status === 'lobby' ? '🐪 Invitations envoyées !' : '🐪 C’est parti contre les bots !'); }
      catch (err) { ctx.toast(err.message || 'Impossible de lancer la partie.'); }
      finally { creating = false; renderPanel(); }
      return;
    }
    if (b.dataset.camAnswer) {
      const ok = b.dataset.ok === '1', id = Number(b.dataset.camAnswer);
      try { await api('/api/camel/answer', {game: id, accept: ok}); await loadList(); if (ok) open(id); else ctx.toast('Invitation refusée, un bot prend ta place.'); }
      catch (err) { ctx.toast(err.message || 'Oups, réessaie.'); loadList(); }
      return;
    }
    if (b.dataset.camOpen) open(Number(b.dataset.camOpen));
  }

  // ---------- partie ----------
  async function open(id) {
    if (!ctx) return;
    if (cur && cur.id !== id) close(true);
    ctx.onOpen && ctx.onOpen();
    root = ctx.root; root.hidden = false; root.className = 'board-stage cam-stage';
    cur = {id, loading: true}; pos = null; seenSeq = 0; anim = null; fast = false;
    root.innerHTML = '<div class="gb-loading"><span class="spinner"></span><p>On selle les chameaux…</p></div>';
    await load(true);
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(false); }, 2000);
  }
  function close(silent) {
    clearInterval(timer); timer = null; clearTimeout(autoT); cur = null; anim = null; pos = null;
    if (root) { root.hidden = true; root.innerHTML = ''; root.className = 'board-stage'; }
    if (!silent && ctx && ctx.onClose) ctx.onClose();
    loadList();
  }
  async function load(first) {
    if (!cur || busy || anim) return;
    busy = true;
    try {
      const g = await api('/api/camel/state', {game: cur.id});
      if (!cur || g.id !== cur.id) return;
      await take(g, first);
    } catch (err) {
      if (first) { root.innerHTML = `<div class="gb-loading"><p>${esc(err.message || 'Partie introuvable.')}</p><button type="button" data-cam-close>Fermer</button></div>`; root.querySelector('[data-cam-close]').onclick = () => close(); clearInterval(timer); cur = null; }
    } finally { busy = false; }
  }
  // Nouvel état du serveur : on anime les coups qu'on n'a pas encore vus.
  async function take(g, first) {
    const was = cur && cur.status ? cur : null;
    if (first || !pos) {
      cur = g; pos = g.h.map(r => r.slice()); seenSeq = g.seq; render(); return;
    }
    const fresh = (g.log || []).filter(ev => ev.n > seenSeq);
    const gap = fresh.length && fresh[0].n !== seenSeq + 1;
    const structural = was && (was.status !== g.status || JSON.stringify(was.seat_state) !== JSON.stringify(g.seat_state));
    if (!fresh.length && !structural && g.seq === seenSeq) { const keep = cur.die; cur = g; if (keep !== g.die) render(); else renderStatus(); return; }
    cur = {...g, h: pos.map(r => r.slice()), die: null, legal: []};
    if (structural) render();
    if (gap || !fresh.length) { pos = g.h.map(r => r.slice()); }
    else {
      anim = true; render(); fast = false;
      try { for (const ev of fresh) { if (!cur || cur.id !== g.id) return; await playEvent(ev, g); } }
      finally { anim = null; }
    }
    if (!cur || cur.id !== g.id) return;
    pos = g.h.map(r => r.slice()); seenSeq = g.seq; cur = g; fast = false;
    render();
    if (g.status === 'done' && was && was.status !== 'done') {
      const w = g.winner;
      ctx.toast(w === null || w === undefined ? 'Partie arrêtée.' : w === g.viewer_seat ? '🏆 Tu as gagné les petits chameaux !' : `🏆 ${seatName(g, w)} gagne la partie.`);
      if (w === g.viewer_seat && ctx.party) ctx.party();
      loadList();
    }
  }
  function xy(s, h, p) {
    if (p === -1) { const [r0, c0] = STABLE[s], [dr, dc] = SLOT[h]; return [c0 + dc, r0 + dr]; }
    if (p <= 55) { const [r, c] = TRACK[sq(s, p)]; return [c + 0.5, r + 0.5]; }
    if (p <= 61) { const [r, c] = STAIR(s, p - 55); return [c + 0.5, r + 0.5]; }
    const o = [[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]][s];
    return [7.5 + o[0] + (h - 1.5) * 0.04, 7.5 + o[1] + (h - 1.5) * 0.04];
  }
  function place(s, h) {
    const el = root.querySelector(`.cam-piece[data-s="${s}"][data-h="${h}"]`); if (!el) return;
    const p = pos[s][h], [x, y] = xy(s, h, p);
    el.style.left = (x / 15 * 100) + '%'; el.style.top = (y / 15 * 100) + '%';
    el.classList.toggle('home', p === 62); el.classList.toggle('stable', p === -1);
  }
  async function playEvent(ev, g) {
    const bot = !isHuman(g, ev.s), step = bot ? 110 : 170;
    if (cur && ev.s !== undefined && cur.turn !== ev.s) { cur.turn = ev.s; renderStatus(); }
    if (ev.resign) { ctx.toast(`🏳️ ${seatName(g, ev.s)} abandonne, un bot prend sa place.`); return; }
    if (ev.nudge) { ctx.toast(`⏩ L’ordi joue pour ${seatName(g, ev.s)}.`); return; }
    if (ev.roll || ev.h === null || ev.h === undefined) {
      await showDie(ev.s, ev.d, bot);
      if (ev.h === null && !ev.roll) { say(`${seatName(g, ev.s)} fait ${ev.d} : aucun chameau ne peut bouger.`); await wait(bot ? 350 : 700); }
      return;
    }
    // déplacement (le lancer a déjà été affiché par l'évènement « roll »)
    const s = ev.s, h = ev.h, path = ev.f === -1 ? [0] : Array.from({length: ev.t - ev.f}, (_, i) => ev.f + 1 + i);
    const el = root.querySelector(`.cam-piece[data-s="${s}"][data-h="${h}"]`); if (el) el.classList.add('moving');
    for (const p of path) { pos[s][h] = p; place(s, h); await wait(step); }
    if (el) el.classList.remove('moving');
    if (ev.x !== null && ev.x !== undefined) {
      const os = Math.floor(ev.x / 4), oh = ev.x % 4; pos[os][oh] = -1; place(os, oh);
      say(`💥 ${seatName(g, s)} mange un chameau ${CNAME[os].toLowerCase()} !`);
      if (ctx.sound) ctx.sound('capture');
      await wait(450);
    } else if (ev.t === 62) { say(`🏁 Un chameau ${CNAME[s].toLowerCase()} arrive au centre !`); await wait(400); }
    if (ev.d === 6 && ev.t !== 62 && g.winner !== ev.s) say(`${seatName(g, s)} a fait 6 : il rejoue.`);
  }
  async function showDie(s, d, bot) {
    const die = root.querySelector('.cam-die'); if (!die) return;
    die.style.setProperty('--c', COLORS[s]); die.classList.add('rolling');
    if (!fast) for (let i = 0; i < (bot ? 3 : 6); i++) { die.innerHTML = pips(1 + Math.floor(Math.random() * 6)); await wait(bot ? 50 : 60); }
    die.classList.remove('rolling'); die.innerHTML = pips(d);
    await wait(bot ? 180 : 250);
  }
  function pips(n) {
    const P = {1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]}[n] || [];
    return Array.from({length: 9}, (_, i) => `<i class="${P.includes(i + 1) ? 'on' : ''}"></i>`).join('');
  }
  function say(t) { const el = root.querySelector('.cam-say'); if (el) el.textContent = t; }

  function boardSVG() {
    let s = '<svg class="cam-svg" viewBox="0 0 15 15" aria-hidden="true">';
    s += '<rect x="0" y="0" width="15" height="15" rx=".4" fill="var(--cam-sand)"/>';
    for (let k = 0; k < 4; k++) {
      const [r, c] = STABLE[k];
      s += `<rect x="${c + 0.25}" y="${r + 0.25}" width="5.5" height="5.5" rx=".5" fill="${LIGHT[k]}" stroke="${COLORS[k]}" stroke-width=".08"/>`;
      for (const [dr, dc] of SLOT) s += `<circle cx="${c + dc}" cy="${r + dr}" r=".62" fill="#fff" stroke="${COLORS[k]}" stroke-width=".06" opacity=".85"/>`;
      s += `<text x="${c + 3}" y="${r + 3.18}" class="cam-oasis">🌴</text>`;
    }
    TRACK.forEach(([r, c], i) => {
      const startOf = (i - 1) % 14 === 0 ? (i - 1) / 14 : -1, foot = i % 14 === 0 ? i / 14 : -1;
      const fill = startOf >= 0 ? COLORS[startOf] : '#fffdf6';
      s += `<rect x="${c + 0.06}" y="${r + 0.06}" width=".88" height=".88" rx=".14" fill="${fill}" stroke="#d9c9a3" stroke-width=".05"/>`;
      if (foot >= 0) s += `<rect x="${c + 0.06}" y="${r + 0.06}" width=".88" height=".88" rx=".14" fill="none" stroke="${COLORS[foot]}" stroke-width=".1"/>`;
      if (startOf >= 0) s += `<text x="${c + 0.5}" y="${r + 0.66}" class="cam-arrow">➜</text>`;
    });
    for (let k = 0; k < 4; k++) for (let n = 1; n <= 6; n++) {
      const [r, c] = STAIR(k, n);
      s += `<rect x="${c + 0.06}" y="${r + 0.06}" width=".88" height=".88" rx=".14" fill="${LIGHT[k]}" stroke="${COLORS[k]}" stroke-width=".05"/><text x="${c + 0.5}" y="${r + 0.68}" class="cam-num" fill="${COLORS[k]}">${n}</text>`;
    }
    s += '<polygon points="7,7 8,7 7.5,7.5" fill="' + COLORS[0] + '"/><polygon points="8,7 8,8 7.5,7.5" fill="' + COLORS[1] + '"/><polygon points="8,8 7,8 7.5,7.5" fill="' + COLORS[2] + '"/><polygon points="7,8 7,7 7.5,7.5" fill="' + COLORS[3] + '"/>';
    return s + '</svg>';
  }
  function render() {
    if (!cur || !root || cur.loading) return;
    const g = cur;
    if (g.status === 'lobby') return renderLobby();
    if (!root.querySelector('.cam-board')) {
      root.innerHTML = `<div class="cam-head"><button type="button" class="gb-back" data-cam-close>← Retour au Yéti</button><h3>🐪 Petits chameaux</h3><span class="cam-need-tag"></span></div>
        <div class="cam-players"></div>
        <div class="cam-main"><div class="cam-board">${boardSVG()}${[0, 1, 2, 3].map(s => [0, 1, 2, 3].map(h => `<button type="button" class="cam-piece" data-s="${s}" data-h="${h}" style="--c:${COLORS[s]}" aria-label="Chameau ${CNAME[s].toLowerCase()} ${h + 1}"><span>🐪</span></button>`).join('')).join('')}</div>
        <div class="cam-side"><button type="button" class="cam-die" aria-label="Lancer le dé"></button><p class="cam-status"></p><p class="cam-say" aria-live="polite"></p><div class="cam-actions"></div>
        <details class="cam-rules"><summary>Règles</summary><ul><li>Il faut un <b>6</b> pour sortir un chameau de l’oasis. Un 6 = tu rejoues.</li><li>On ne saute jamais un chameau. Tomber pile sur un adversaire le renvoie à son oasis.</li><li>Après un tour complet, arrêt <b>pile</b> au pied de ton escalier, puis 1, 2, 3, 4, 5, 6 pour monter chaque marche et un 6 pour entrer au centre.</li></ul></details></div></div>`;
      root.querySelector('.cam-board').addEventListener('click', onBoardClick);
      root.querySelector('.cam-die').addEventListener('click', () => act('roll'));
      root.querySelector('.cam-actions').addEventListener('click', onActionClick);
      root.querySelector('[data-cam-close]').addEventListener('click', () => close());
      root.querySelector('.cam-die').innerHTML = pips(g.die || 6);
    }
    for (let s = 0; s < 4; s++) for (let h = 0; h < 4; h++) place(s, h);
    renderStatus();
  }
  function renderStatus() {
    if (!cur || !root || cur.status === 'lobby') return;
    const g = cur, me = g.viewer_seat, myTurn = !anim && g.status === 'playing' && me >= 0 && g.turn === me && isHuman(g, me);
    const legal = myTurn && g.die ? (g.legal || []) : [];
    root.querySelector('.cam-need-tag').textContent = `${g.need} chameau${g.need > 1 ? 'x' : ''} au centre pour gagner`;
    root.querySelector('.cam-players').innerHTML = [0, 1, 2, 3].map(s => `<div class="cam-pl ${g.status === 'playing' && g.turn === s ? 'turn' : ''} ${g.winner === s ? 'win' : ''} ${s === me ? 'me' : ''}" style="--c:${COLORS[s]}">${isHuman(g, s) && pl(g.seats[s]) ? ctx.avatar(pl(g.seats[s])) : '<span class="cam-bot">🤖</span>'}<span><b>${esc(seatName(g, s))}</b><small>${CNAME[s]} · ${homeCount(pos || g.h, s)}/${g.need} 🏁</small></span></div>`).join('');
    root.querySelectorAll('.cam-piece').forEach(el => {
      const s = Number(el.dataset.s), h = Number(el.dataset.h), can = s === me && legal.includes(h);
      el.classList.toggle('can', can); el.disabled = !can;
    });
    const die = root.querySelector('.cam-die');
    die.style.setProperty('--c', COLORS[g.turn] || '#999');
    if (!anim && g.die) die.innerHTML = pips(g.die);
    const canRoll = myTurn && !g.die;
    die.classList.toggle('ready', canRoll); die.disabled = !canRoll;
    let st;
    if (g.status === 'done') st = g.winner !== null && g.winner !== undefined ? `🏆 ${esc(seatName(g, g.winner))} a gagné !` : 'Partie arrêtée.';
    else if (anim) st = `${esc(seatName(g, g.turn))} joue…`;
    else if (canRoll) st = '<b>À toi ! Touche le dé pour le lancer.</b>';
    else if (myTurn) st = `<b>Tu as fait ${g.die} : choisis un chameau qui brille.</b>`;
    else st = `Au tour de <b>${esc(seatName(g, g.turn))}</b>${isHuman(g, g.turn) ? '' : ' (bot)'}`;
    root.querySelector('.cam-status').innerHTML = st;
    // actions
    const idle = g.moved_at ? (Date.parse(g.server_time) - Date.parse(g.moved_at)) / 6e4 : 0;
    const acts = [];
    if (anim) acts.push('<button type="button" data-cam-act="fast">⏩ Accélérer</button>');
    if (g.status === 'playing' && me >= 0 && !anim && g.turn !== me && isHuman(g, g.turn) && idle >= 2) acts.push(`<button type="button" data-cam-act="nudge">⏩ Faire jouer l’ordi pour ${esc(seatName(g, g.turn))}</button>`);
    if (g.status === 'playing' && me >= 0 && isHuman(g, me)) acts.push('<button type="button" class="cam-quit" data-cam-act="resign">🏳️ Abandonner</button>');
    if (g.status === 'done' && me >= 0) acts.push('<button type="button" class="cam-yes" data-cam-act="again">🔁 Rejouer</button>');
    const html = acts.join('');
    const box = root.querySelector('.cam-actions'); if (box._html !== html) { box.innerHTML = html; box._html = html; }
    // un seul coup possible (ou que des chameaux à l'oasis) : on le joue tout seul
    clearTimeout(autoT);
    if (legal.length && legal.every(h => pos[me][h] === pos[me][legal[0]])) autoT = setTimeout(() => act('move', legal[0]), legal.length === 1 && pos[me][legal[0]] !== -1 ? 650 : 450);
  }
  function renderLobby() {
    const g = cur, me = meId(), i = g.seats.indexOf(me), invited = i >= 0 && g.seat_state[i] === 'invited';
    root.innerHTML = `<div class="cam-head"><button type="button" class="gb-back" data-cam-close>← Retour au Yéti</button><h3>🐪 Petits chameaux</h3><span class="cam-need-tag">${g.need} chameau${g.need > 1 ? 'x' : ''} au centre pour gagner</span></div>
      <div class="cam-lobby"><p>${g.host === me ? 'Tes potes ont reçu l’invitation. La partie démarre quand tout le monde a répondu, ou dès que tu la lances (les places libres seront jouées par l’ordi).' : invited ? `<b>${esc(pl(g.host) ? pl(g.host).name : '?')}</b> t’invite à jouer !` : 'En attente des invités…'}</p>
      <div class="cam-seats">${[0, 1, 2, 3].map(s => `<div class="cam-pl" style="--c:${COLORS[s]}">${g.seats[s] && pl(g.seats[s]) ? ctx.avatar(pl(g.seats[s])) : '<span class="cam-bot">🤖</span>'}<span><b>${esc(seatName(g, s))}</b><small>${CNAME[s]} · ${{host: 'organise', joined: '✅ prêt', invited: '⏳ invité', bot: 'ordi'}[g.seat_state[s]] || ''}</small></span></div>`).join('')}</div>
      <div class="cam-actions">${invited ? '<button type="button" class="cam-yes" data-cam-act="join">Rejoindre</button><button type="button" class="cam-no" data-cam-act="decline">Refuser</button>' : ''}${g.host === me ? '<button type="button" class="cam-yes" data-cam-act="start">🐪 Lancer maintenant</button><button type="button" class="cam-no" data-cam-act="cancel">Annuler la partie</button>' : ''}</div></div>`;
    root.querySelector('[data-cam-close]').addEventListener('click', () => close());
    root.querySelector('.cam-actions').addEventListener('click', onActionClick);
  }
  function onBoardClick(e) {
    const b = e.target.closest('.cam-piece'); if (!b || b.disabled) return;
    act('move', Number(b.dataset.h));
  }
  async function onActionClick(e) {
    const b = e.target.closest('[data-cam-act]'); if (!b || b.disabled) return;
    const a = b.dataset.camAct;
    if (a === 'fast') { fast = true; return; }
    if (a === 'resign' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Sûr ? Un bot finira pour toi'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '🏳️ Abandonner'; } }, 4000); return; }
    if (a === 'again') {
      const me = meId(), humans = cur.seats.filter((p, i) => p && p !== me && (cur.seat_state[i] === 'host' || cur.seat_state[i] === 'joined' || cur.seat_state[i] === 'resigned'));
      try { const g = await api('/api/camel/create', {invite: humans, need: cur.need}); close(true); open(g.id); } catch (err) { ctx.toast(err.message || 'Impossible de relancer.'); }
      return;
    }
    if (a === 'join' || a === 'decline') {
      try { const g = await api('/api/camel/answer', {game: cur.id, accept: a === 'join'}); if (a === 'decline') { close(); return; } cur = g; pos = g.h.map(r => r.slice()); seenSeq = g.seq; root.innerHTML = ''; render(); }
      catch (err) { ctx.toast(err.message || 'Oups.'); }
      return;
    }
    if (a === 'start') { try { const g = await api('/api/camel/start', {game: cur.id}); cur = g; pos = g.h.map(r => r.slice()); seenSeq = g.seq; root.innerHTML = ''; render(); } catch (err) { ctx.toast(err.message || 'Oups.'); } return; }
    if (a === 'cancel') { try { await api('/api/camel/act', {game: cur.id, action: 'cancel'}); close(); ctx.toast('Partie annulée.'); } catch (err) { ctx.toast(err.message || 'Oups.'); } return; }
    act(a);
  }
  async function act(action, horse) {
    if (!cur || busy || anim) return;
    if (action === 'roll' && (cur.die || cur.turn !== cur.viewer_seat)) return;
    clearTimeout(autoT);
    busy = true;
    if (action === 'roll') { const die = root.querySelector('.cam-die'); if (die) { die.disabled = true; die.classList.add('rolling'); } }
    try {
      const g = await api('/api/camel/act', {game: cur.id, seq: cur.seq, action, horse: horse === undefined ? null : horse});
      busy = false;
      await take(g, false);
      if (g.stale) ctx.toast('La partie a bougé, voilà où on en est.');
    } catch (err) {
      busy = false; ctx.toast(err.message || 'Coup refusé.'); const die = root && root.querySelector('.cam-die'); if (die) die.classList.remove('rolling');
      load(false);
    }
  }

  window.YetiCamels = Object.freeze({
    init, open, close, refresh: loadList,
    get openId() { return cur ? cur.id : null; },
  });
})();
