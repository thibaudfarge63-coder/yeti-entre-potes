/* Skull King : salon, table de jeu et cartes (visuels faits maison). Toute la logique tourne sur le serveur (fonction yeti-skull) :
   ici on affiche la vue de chaque joueur, on grise les cartes injouables et on envoie les choix. */
(() => {
  'use strict';
  // Heure de début (ou de création tant que la partie attend ses invités), heure de Paris
  const fmtT = t => { const d = new Date(t), tz = {timeZone: 'Europe/Paris'}, day = x => new Intl.DateTimeFormat('fr-FR', {...tz, day: '2-digit', month: '2-digit'}).format(x);
    const h = new Intl.DateTimeFormat('fr-FR', {...tz, hour: '2-digit', minute: '2-digit'}).format(d).replace(':', 'h'); return day(d) === day(new Date()) ? h : day(d) + ' ' + h; };
  const startText = g => (g.started_at ? `🕒 début ${fmtT(g.started_at)}` : g.created_at ? `✉️ créée ${fmtT(g.created_at)}` : '');
  const SUIT = {g: {name: 'Vert', icon: '⚓', cls: 'g'}, y: {name: 'Jaune', icon: '🪙', cls: 'y'}, p: {name: 'Violet', icon: '🔭', cls: 'p'}, k: {name: 'Noir (atout)', icon: '🏴', cls: 'k'}};
  const SPECIAL = {
    escape: {icon: '🏳️', name: 'Fuite', tip: 'Ne gagne que si le pli n’a que des Fuites. Perd contre toute autre carte.'},
    loot: {icon: '💰', name: 'Butin', tip: 'Comme une Fuite. Alliance avec le gagnant du pli : +20 chacun si les deux réussissent leur pari.'},
    tigress: {icon: '🐯', name: 'Tigresse', tip: 'Déclarée Pirate ou Fuite en la posant.'},
    pirate: {icon: '🗡️', name: 'Pirate', tip: 'Bat les Sirènes et les cartes numérotées ; perd contre le Roi et le Second.'},
    mermaid: {icon: '🧜‍♀️', name: 'Sirène', tip: 'Bat les cartes numérotées et le Roi ; perd contre les Pirates.'},
    king: {icon: '👑', name: 'Le Roi', tip: 'Bat les Pirates, le Second et les cartes numérotées ; perd contre une Sirène.'},
    second: {icon: '⚔️', name: 'Second', tip: 'Bat tout sauf le Roi et les Sirènes. Aucun bonus pour les Pirates capturés.'},
    kraken: {icon: '🐙', name: 'Kraken', tip: 'Personne ne gagne le pli. Celui qui l’aurait gagné ouvre le suivant.'},
    whale: {icon: '🐋', name: 'Baleine blanche', tip: 'Les spéciales deviennent des Fuites ; la carte numérotée la plus haute gagne, toutes couleurs confondues.'},
    ray: {icon: '🐠', name: 'Raie tachetée', tip: 'Comme la Baleine, mais la carte numérotée la plus basse gagne.'},
    davy: {icon: '🔒', name: 'Casier de Davy Jones', tip: 'Détruit tous les léviathans du pli (+20 chacun si ton pari est réussi), puis résolution normale.'},
    salvo: {icon: '💥', name: 'Dernière salve', tip: 'Tu poses une carte de plus après tout le monde (au choix) ; tu finis la manche avec une carte de moins.'},
    plank: {icon: '🪵', name: 'Supplice de la planche', tip: 'En fin de pli, retire un Pirate du pli : il ne gagne plus et ne rapporte rien.'},
  };
  const OPTIONS = [['ext', '7, 8 et 0/14 (extension)'], ['joker', 'Joker 15'], ['tig', 'Tigresse'], ['king', 'Le Roi'], ['mer', 'Sirènes'], ['loot', 'Butins'],
    ['kraken', 'Kraken'], ['whale', 'Baleine blanche'], ['ray', 'Raie tachetée'], ['second', 'Second'], ['davy', 'Casier de Davy Jones'], ['salvo', 'Dernière salve'], ['plank', 'Planche']];

  // ---------- cartes ----------
  function kind(id) {
    let m = /^([gypk])(\d+)$/.exec(id); if (m) return {t: 'num', suit: m[1], val: +m[2], base: true};
    m = /^x([gypk])([780])$/.exec(id); if (m) return {t: 'num', suit: m[1], val: m[2] === '0' ? '0/14' : +m[2], ext: true};
    if (id === 'j15') return {t: 'num', joker: true, val: 15};
    const t = id.replace(/\d+$/, '').replace(/^esc$/, 'escape').replace(/^pir$/, 'pirate').replace(/^mer$/, 'mermaid').replace(/^tig$/, 'tigress');
    return {t};
  }
  function tipOf(id) {
    const k = kind(id);
    if (k.joker) return 'Joker 15 : un 15 jaune, violet ou vert (jamais noir) ; perd contre l’atout noir.';
    if (k.t === 'num') {
      if (k.val === '0/14') return `0/14 ${SUIT[k.suit].name.toLowerCase()} : vaut 0 ou 14, à déclarer en la posant. Aucun bonus.`;
      if (k.ext && k.val === 8) return `8 ${SUIT[k.suit].name.toLowerCase()} (extension) : +5 pour qui le capture (pari réussi).`;
      if (k.ext && k.val === 7) return `7 ${SUIT[k.suit].name.toLowerCase()} (extension) : −5 pour qui le capture (pari réussi).`;
      if (k.val === 14) return `14 ${SUIT[k.suit].name.toLowerCase()} : +${k.suit === 'k' ? 20 : 10} pour qui le capture (pari réussi).`;
      return `${k.val} ${SUIT[k.suit].name.toLowerCase()}`;
    }
    const s = SPECIAL[k.t]; return s ? `${s.name} : ${s.tip}` : id;
  }
  // d = déclaration éventuelle (cartes posées)
  function cardHTML(id, opts = {}) {
    const k = kind(id), d = opts.d || {};
    let cls = 'skc', inner = '';
    if (k.t === 'num') {
      const suit = k.joker ? (d.color || 'j') : k.suit, S = SUIT[suit];
      let v = k.val;
      if (k.val === '0/14') v = d.zero === undefined ? '0/14' : d.zero;
      cls += ' n-' + (k.joker ? 'joker' + (d.color ? ' ' + d.color : '') : suit) + (k.ext ? ' ext' : '');
      inner = `<b class="skc-v">${v}</b><span class="skc-i">${k.joker ? '🃏' : S.icon}</span><b class="skc-v r">${v}</b>${k.ext ? '<i class="skc-x">ext</i>' : ''}`;
    } else {
      const S = SPECIAL[k.t] || {icon: '?', name: id};
      let name = S.name;
      if (k.t === 'tigress' && d.tig) name += d.tig === 'pirate' ? ' · Pirate' : ' · Fuite';
      cls += ' sp sp-' + k.t;
      inner = `<span class="skc-i big">${S.icon}</span><span class="skc-n">${name}</span>`;
    }
    if (opts.cls) cls += ' ' + opts.cls;
    const tag = opts.button ? 'button' : 'div';
    return `<${tag} ${opts.button ? 'type="button"' : ''} class="${cls}" ${opts.attrs || ''} title="${opts.escape ? opts.escape(tipOf(id)) : ''}">${inner}</${tag}>`;
  }
  const ORDER = id => { const k = kind(id); if (k.t !== 'num') return 1000 + Object.keys(SPECIAL).indexOf(k.t); const so = {g: 0, y: 1, p: 2, k: 3}[k.suit] ?? 2.5; return so * 100 + (k.val === '0/14' ? 0 : k.val === 15 ? 15 : k.val) + (k.ext ? 0.5 : 0); };

  // ---------- état ----------
  let ctx = null, panelEl = null, root = null, list = [], listTimer = null, knownInv = null, lastBadge = -1;
  let pick = new Set(), rounds = 10, opts = Object.fromEntries(OPTIONS.map(([k]) => [k, true])), creating = false;
  let cur = null, timer = null, busy = false, showTrickUntil = 0, shownTrickKey = '', lastRoundSeen = 0, pendingDecl = null, nudgeAt = 0;
  const esc = s => ctx.escape(String(s));
  const pl = id => (id && ctx.player(id)) || null;
  const nameOf = id => (pl(id) ? pl(id).name : '?');
  const sess = () => ctx.session();
  const meId = () => { const s = sess(); return s ? s.player : 0; };
  async function api(body) { const s = sess(); return ctx.request('/api/skull', {...body, player: s ? s.player : 0, token: s ? s.token : ''}); }

  // ---------- panneau ----------
  function init(options) {
    ctx = options; panelEl = ctx.panel;
    panelEl.addEventListener('click', onPanelClick);
    panelEl.addEventListener('change', e => { const o = e.target.closest('[data-sk-opt]'); if (o) { opts[o.dataset.skOpt] = o.checked; renderPanel(); } const r = e.target.closest('[data-sk-rounds]'); if (r) { rounds = Number(r.value); renderPanel(); } });
    clearInterval(listTimer); listTimer = setInterval(() => { if (!document.hidden) loadList(); }, 12000);
    loadList(); setTimeout(loadList, 2500); setTimeout(loadList, 6000);
  }
  async function loadList() {
    if (!ctx || !ctx.ready()) return;
    try { const r = await ctx.request('/api/skull/list', {}); list = (r && r.games) || []; } catch (_) { return; }
    const me = meId();
    if (me) {
      const inv = list.filter(g => g.status === 'lobby' && g.seats.some((p, i) => p === me && g.seat_state[i] === 'invited'));
      if (knownInv) for (const g of inv) if (!knownInv.has(g.id)) ctx.toast(`☠️ ${nameOf(g.host)} t’invite au Skull King !`);
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
    const noLev = !opts.kraken && !opts.whale && !opts.ray;
    const form = me ? `<div class="sk-new">
        <p class="duel-pick-label">Invite de 1 à 8 potes (2 à 9 joueurs) :</p>
        <div class="duel-pick">${players.map(p => `<button type="button" class="duel-opp ${pick.has(p.id) ? 'on' : ''}" data-sk-pick="${p.id}" aria-pressed="${pick.has(p.id)}">${ctx.avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>
        <div class="sk-row"><label class="sk-rounds">Manches <select data-sk-rounds>${Array.from({length: 10}, (_, i) => `<option value="${i + 1}" ${rounds === i + 1 ? 'selected' : ''}>${i + 1}${i === 9 ? ' (partie complète)' : ''}</option>`).join('')}</select></label></div>
        <details class="sk-opts"><summary>Cartes actives (${OPTIONS.filter(([k]) => opts[k] && !(k === 'davy' && noLev)).length}/${OPTIONS.length})</summary><div class="sk-opt-grid">${OPTIONS.map(([k, label]) => `<label class="${k === 'davy' && noLev ? 'off' : ''}"><input type="checkbox" data-sk-opt="${k}" ${opts[k] ? 'checked' : ''} ${k === 'davy' && noLev ? 'disabled' : ''}> ${label}</label>`).join('')}</div>
          <p class="sk-note">Fuites, Pirates et cartes de couleur sont toujours là. À 2 joueurs, le Joker 15, la Planche et les 0/14 sont retirés.${noLev ? ' Le Casier a besoin d’au moins un léviathan.' : ''}</p></details>
        <button type="button" class="sk-go" data-sk-create ${creating || !pick.size ? 'disabled' : ''}>☠️ ${pick.size ? `Inviter ${pick.size} pote${pick.size > 1 ? 's' : ''}` : 'Choisis au moins un pote'}</button>
      </div>` : '<p class="br-empty">Connecte-toi pour lancer une partie.</p>';
    const mine = list.filter(g => g.seats.includes(me) && g.status !== 'done');
    const others = list.filter(g => !g.seats.includes(me) && g.status === 'playing');
    const done = list.filter(g => g.status === 'done').slice(0, 5);
    const row = g => {
      const ids = g.players || g.seats, i = g.seats.indexOf(me), invited = g.status === 'lobby' && i >= 0 && g.seat_state[i] === 'invited';
      const chips = ids.map((p, k) => `<span class="cam-chip ${(g.waiting || []).includes(p) ? 'turn' : ''}"><i style="background:${pl(p) ? pl(p).color : '#999'}"></i>${esc(nameOf(p))}${g.scores ? ` · ${g.scores[k]}` : ''}${g.status === 'lobby' && g.seat_state[k] === 'invited' ? ' ⏳' : ''}</span>`).join('');
      let st, act;
      if (g.status === 'lobby') {
        st = invited ? `<b>${esc(nameOf(g.host))} t’invite !</b>` : 'En attente des invités…';
        act = invited ? `<button type="button" class="cam-yes" data-sk-answer="${g.id}" data-ok="1">Rejoindre</button><button type="button" class="cam-no" data-sk-answer="${g.id}" data-ok="0">Refuser</button>`
          : `<button type="button" data-sk-open="${g.id}">Ouvrir</button>`;
      } else if (g.status === 'playing') {
        const mine2 = todoFor(g, me);
        st = mine2 ? `<b class="cam-you">${g.phase === 'bid' ? 'À toi de parier !' : 'À toi de jouer !'}</b>` : `Manche ${g.round}/${g.R}`;
        act = `<button type="button" class="${mine2 ? 'cam-yes' : ''}" data-sk-open="${g.id}">${i >= 0 ? 'Jouer' : 'Regarder'}</button>`;
      } else {
        const best = g.scores ? g.scores.indexOf(Math.max(...g.scores)) : -1;
        st = best >= 0 ? `🏆 ${esc(nameOf(g.players[best]))} gagne avec ${g.scores[best]} pts` : 'Terminée';
        act = `<button type="button" data-sk-open="${g.id}">Voir</button>`;
      }
      return `<div class="cam-row"><div class="cam-chips">${chips}</div><div class="cam-row-foot"><span class="cam-st">${st} · ${g.R} manche${g.R > 1 ? 's' : ''}<small class="cam-when">${startText(g)}</small></span><span class="cam-acts">${act}</span></div></div>`;
    };
    const html = form + (mine.length ? '<p class="duel-sep">Tes parties</p>' + mine.map(row).join('') : '')
      + (others.length ? '<p class="duel-sep">En cours dans le club</p>' + others.map(row).join('') : '')
      + (done.length ? '<p class="duel-sep">Terminées</p>' + done.map(row).join('') : '')
      + (!mine.length && !others.length && !done.length ? '<p class="br-empty">Aucune partie pour l’instant.</p>' : '');
    if (panelEl._html !== html) { panelEl.innerHTML = html; panelEl._html = html; }
  }
  async function onPanelClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.skPick) { const id = Number(b.dataset.skPick); if (pick.has(id)) pick.delete(id); else if (pick.size < 8) pick.add(id); else ctx.toast('8 invités maximum.'); renderPanel(); return; }
    if ('skCreate' in b.dataset) {
      creating = true; renderPanel();
      try { const g = await api({action: 'create', invite: [...pick], rounds, options: opts}); pick.clear(); await loadList(); open(g.id); ctx.toast('☠️ Invitations envoyées !'); }
      catch (err) { ctx.toast(err.message || 'Impossible de créer la partie.'); }
      finally { creating = false; renderPanel(); }
      return;
    }
    if (b.dataset.skAnswer) {
      const ok = b.dataset.ok === '1', id = Number(b.dataset.skAnswer);
      try { await api({action: 'answer', game: id, accept: ok}); await loadList(); if (ok) open(id); else ctx.toast('Invitation refusée.'); }
      catch (err) { ctx.toast(err.message || 'Oups.'); loadList(); }
      return;
    }
    if (b.dataset.skOpen) open(Number(b.dataset.skOpen));
  }

  // ---------- table ----------
  async function open(id) {
    if (!ctx) return;
    if (cur && cur.id !== id) close(true);
    ctx.onOpen && ctx.onOpen();
    root = ctx.root; root.hidden = false; root.className = 'board-stage sk-stage';
    root.innerHTML = '<div class="gb-loading"><span class="spinner"></span><p>On mélange les cartes…</p></div>';
    cur = {id, loading: true}; showTrickUntil = 0; shownTrickKey = ''; lastRoundSeen = 0; pendingDecl = null;
    await load(true);
    clearInterval(timer); timer = setInterval(poll, 1500);
  }
  function close(silent) {
    clearInterval(timer); timer = null; cur = null; pendingDecl = null; sheetOpen = false; fullView = false;
    if (root) { root.hidden = true; root.innerHTML = ''; root._html = ''; root.className = 'board-stage'; }
    if (!silent && ctx && ctx.onClose) ctx.onClose();
    loadList();
  }
  async function poll() {
    if (!cur || busy || document.hidden) return;
    try { const v = await ctx.request('/api/skull/version', {game: cur.id}); if (cur && v && v.version !== cur.version) await load(false); else render(); } catch (_) {}
  }
  async function load(first) {
    if (!cur || busy) return;
    busy = true;
    try { const g = await api({action: 'state', game: cur.id}); if (cur && g.id === cur.id) take(g); }
    catch (err) { if (first && root) { root.innerHTML = `<div class="gb-loading"><p>${esc(err.message || 'Partie introuvable.')}</p><button type="button" data-sk-close>Fermer</button></div>`; root.querySelector('[data-sk-close]').onclick = () => close(); clearInterval(timer); cur = null; } }
    finally { busy = false; }
  }
  function take(g) {
    const was = cur && cur.game;
    cur = g;
    const G = g.game;
    if (G && G.lastTrick) {
      const key = G.lastTrick.round + ':' + G.lastTrick.n;
      if (shownTrickKey && key !== shownTrickKey) { showTrickUntil = Date.now() + 2800; setTimeout(render, 1850); setTimeout(render, 2850); if (ctx.sound && G.lastTrick.winner === G.me) ctx.sound('capture'); }
      shownTrickKey = key;
    }
    if (G && was && G.history.length > lastRoundSeen && lastRoundSeen > 0) roundSummary(G.history[G.history.length - 1], G);
    if (G) lastRoundSeen = G.history.length;
    if (g.status === 'done' && was && was.phase !== 'done') ctx.toast('🏁 Partie terminée !');
    render();
  }
  function seatName(G, s) { return nameOf(G.players[s]); }
  // ---------- table façon Board Game Arena : joueurs autour de la table, carte posée devant chacun, main en bas ----------
  let fullView = false, sheetOpen = false;
  function seatPos(G, s) {
    const me = G.me >= 0 ? G.me : 0, k = (s - me + G.P) % G.P, a = (90 + k * 360 / G.P) * Math.PI / 180;
    return {x: 50 + 43 * Math.cos(a), y: 50 + 39 * Math.sin(a), cx: 50 + 23 * Math.cos(a), cy: 50 + 21 * Math.sin(a)};
  }
  function statusBar(G, me, myTurn) {
    const waitBid = G.hasBid.map((h, s) => (h ? null : esc(seatName(G, s)))).filter(Boolean);
    if (G.phase === 'done') return {mine: false, html: '🏁 Partie terminée'};
    if (G.phase === 'bid') {
      if (me >= 0 && !G.hasBid[me]) return {mine: true, html: `<span>Manche ${G.round} : <b>combien de plis vas-tu gagner ?</b></span><span class="skb-bids">${Array.from({length: G.dealt + 1}, (_, n) => `<button type="button" data-sk-bid="${n}">${n}</button>`).join('')}</span>`};
      return {mine: false, html: `${me >= 0 ? `Ton pari : <b>${G.bids[me]}</b>. ` : ''}En attente du pari de ${waitBid.join(', ')}…`};
    }
    if (myTurn) {
      if (G.phase === 'plank') return {mine: true, html: '<b>Supplice de la planche :</b> touche le Pirate à retirer du pli.'};
      if (G.phase === 'salvo') return {mine: true, html: '<b>Dernière salve :</b> pose une carte de plus, celle que tu veux.'};
      const lead = G.trick && G.trick.lead;
      return {mine: true, html: `<b>À toi de jouer une carte.</b>${lead ? ` Couleur demandée : ${SUIT[lead].icon} ${SUIT[lead].name.toLowerCase()}.` : ''}`};
    }
    if (G.turn !== null && G.turn !== undefined) return {mine: false, html: `<b>${esc(seatName(G, G.turn))}</b> ${G.phase === 'plank' ? 'choisit le Pirate à faire passer par la planche' : G.phase === 'salvo' ? 'tire sa Dernière salve' : 'doit jouer une carte'}…`};
    return {mine: false, html: '…'};
  }
  function render() {
    if (!cur || !root || cur.loading) return;
    if (cur.status === 'lobby') return renderLobby();
    const G = cur.game, me = G.me;
    const showing = Date.now() < showTrickUntil && G.lastTrick;
    const collect = showing && Date.now() > showTrickUntil - 1000;
    const myTurn = G.turn === me && me >= 0 && ['play', 'salvo', 'plank'].includes(G.phase);
    root.classList.toggle('sk-full', fullView);
    const top = `<div class="skb-top"><button type="button" class="gb-back" data-sk-close>← Retour au Yéti</button><b class="skb-title">☠️ Skull King</b>
      <span class="skb-round">${G.phase === 'done' ? 'Partie terminée' : `Manche <b>${G.round}</b>/${G.R} · ${G.dealt} carte${G.dealt > 1 ? 's' : ''}`}</span>
      <span class="skb-tools"><button type="button" data-sk-sheet title="Feuille de score">📜 Scores</button><button type="button" data-sk-full title="${fullView ? 'Quitter le plein écran' : 'Plein écran'}">${fullView ? '✕' : '⛶'}</button></span></div>`;
    const st = statusBar(G, me, myTurn);
    // joueurs autour de la table
    const winSeat = showing && G.lastTrick.winner !== null ? G.lastTrick.winner : null;
    const seats = G.players.map((p, s) => {
      const pos = seatPos(G, s), b = G.bids[s];
      const active = G.phase === 'bid' ? !G.hasBid[s] : G.turn === s && G.phase !== 'done';
      const bid = G.phase === 'done' ? '' : b !== null ? `<i class="skb-bid" title="Pari">🎯 ${b}</i>` : `<i class="skb-bid ${G.hasBid[s] ? 'ok' : 'wait'}" title="Pari">${G.hasBid[s] ? '🎯 ✓' : '🎯 …'}</i>`;
      const won = G.phase !== 'bid' && G.phase !== 'done' ? `<i class="skb-won" title="Plis gagnés">✋ ${G.won[s]}</i>` : '';
      return `<div class="skb-seat ${active ? 'turn' : ''} ${s === me ? 'me' : ''} ${winSeat === s ? 'win' : ''}" style="left:${pos.x}%;top:${pos.y}%">
        ${pl(p) ? ctx.avatar(pl(p)) : ''}<b>${esc(nameOf(p))}${s === G.starter && G.phase !== 'done' ? ' <i title="Ouvre la manche">⛵</i>' : ''}</b>
        <span class="skb-badges">${bid}${won}</span></div>`;
    }).join('');
    // cartes posées devant chaque joueur
    let played = '', caption = '';
    if (G.phase === 'done') caption = '';
    else {
      const cards = showing ? G.lastTrick.cards : (G.trick ? G.trick.cards : []);
      const last = showing ? G.lastTrick : null;
      const wp = winSeat !== null ? seatPos(G, winSeat) : null;
      const extraSeen = {};
      played = cards.map((pc, i) => {
        const pos = seatPos(G, pc.s), n = extraSeen[pc.s] = (extraSeen[pc.s] || 0) + 1;
        let cls = '';
        if (last) { if (i === last.win) cls = 'win'; if (i === last.removed || (last.destroyed || []).includes(i)) cls = 'gone'; }
        const pick = !showing && G.phase === 'plank' && G.turn === me && (G.plankChoices || []).includes(i);
        const x0 = `calc(${pos.cx}% + ${(n - 1) * 14}px)`, y0 = `calc(${pos.cy}% + ${(n - 1) * 8}px)`;
        const anim = collect && wp ? 'collect' : !showing && i === cards.length - 1 ? 'new' : '';
        return `<div class="skb-card ${cls} ${anim}" style="left:${x0};top:${y0};z-index:${i + 2};--x0:${x0};--y0:${y0};--x1:${wp ? wp.x : 50}%;--y1:${wp ? wp.y : 50}%">${cardHTML(pc.c, {d: pc.d, button: pick, escape: esc, cls: pick ? 'can' : '', attrs: pick ? `data-sk-plank="${i}"` : ''})}${pc.extra ? '<i class="skb-extra">+1</i>' : ''}</div>`;
      }).join('');
      if (last) {
        caption = last.kraken ? '🐙 Le Kraken engloutit le pli' : last.winner === null ? 'Personne ne gagne ce pli' : `<b>${esc(seatName(G, last.winner))}</b> remporte le pli${last.applied === 'whale' ? ' (Baleine)' : last.applied === 'ray' ? ' (Raie)' : ''} !`;
        if (last.destroyed && last.destroyed.length) caption += '<br>🔒 Léviathans détruits';
        if (last.removed !== null && last.removed !== undefined) caption += '<br>🪵 Un Pirate passe par la planche';
      } else if (G.phase === 'bid') caption = `<span class="skb-big">${G.round}</span>Manche ${G.round} : les paris`;
      else if (G.trick && G.trick.lead) caption = `<span class="skb-lead n-${G.trick.lead}">${SUIT[G.trick.lead].icon}</span>${SUIT[G.trick.lead].name}`;
      else caption = cards.length ? 'Pas de couleur demandée' : `Pli ${G.tricks + 1}/${G.dealt}`;
    }
    const center = G.phase === 'done' ? `<div class="skb-center final">${finalBoard(G)}</div>` : `<div class="skb-center">${caption}</div>`;
    // panneaux des joueurs (colonne de droite, comme sur BGA)
    const rank = G.scores.slice().sort((a, b) => b - a);
    const panels = G.players.map((p, s) => `<div class="skb-panel ${(G.phase === 'bid' ? !G.hasBid[s] : G.turn === s) && G.phase !== 'done' ? 'turn' : ''} ${s === me ? 'me' : ''}">
        ${pl(p) ? ctx.avatar(pl(p)) : ''}<span class="skb-pn"><b>${esc(nameOf(p))}</b><small>${G.phase === 'done' ? `${rank.indexOf(G.scores[s]) + 1}${rank.indexOf(G.scores[s]) ? 'e' : 'er'}` : `🎯 ${G.bids[s] !== null ? G.bids[s] : G.hasBid[s] ? '✓' : '–'} · ✋ ${G.won[s]} · 🂠 ${G.counts[s]}`}</small></span><span class="skb-ps">${G.scores[s]}</span></div>`).join('');
    // jeu auto des absents
    const idle = (Date.parse(cur.server_time) - Date.parse(cur.moved_at)) / 6e4;
    const late = G.phase === 'bid' ? G.hasBid.some((h, s) => !h && s !== me) : G.turn !== null && G.turn !== me;
    const acts = [];
    if (me >= 0 && G.phase !== 'done' && late && idle >= 2) acts.push(`<button type="button" data-sk-nudge>⏩ Faire jouer les absents (${Math.floor(idle)} min)</button>`);
    if (G.phase === 'done' && me >= 0) acts.push('<button type="button" class="cam-yes" data-sk-again>🔁 Rejouer avec les mêmes</button>');
    // main
    let hand = '';
    if (me >= 0 && G.hand && G.phase !== 'done') {
      const sorted = G.hand.slice().sort((a, b) => ORDER(a) - ORDER(b));
      const canPlay = myTurn && (G.phase === 'play' || G.phase === 'salvo');
      const pend = G.pend && G.pend.length ? `<span class="skb-pend">Bonus en jeu : ${G.pend.map(x => `${x.pts > 0 ? '+' : ''}${x.pts} ${esc(x.why)}`).join(' · ')}</span>` : '';
      hand = `<div class="skb-handbar"><b>Ta main</b>${pend}</div><div class="skb-hand ${canPlay ? 'active' : ''}">${sorted.map(id => cardHTML(id, {button: true, escape: esc, cls: canPlay ? (G.playable.includes(id) ? 'can' : 'no') : '', attrs: `data-sk-card="${id}" ${canPlay && G.playable.includes(id) ? '' : 'disabled'}`})).join('') || '<p class="sk-empty">Plus de carte pour cette manche.</p>'}</div>`;
    }
    const sheet = sheetOpen ? `<div class="sk-decl" role="dialog" aria-label="Feuille de score"><div class="sk-decl-card skb-sheet"><p>📜 Feuille de score</p>${historyHTML(G)}<button type="button" class="cam-no" data-sk-sheet>Fermer</button></div></div>` : '';
    const html = `<div class="skb">${top}<div class="skb-status ${st.mine ? 'mine' : ''}">${st.html}</div>
      <div class="skb-main"><div class="skb-table P${G.P}"><div class="skb-felt"></div>${center}${seats}${played}</div><aside class="skb-panels">${panels}</aside></div>
      ${acts.length ? `<div class="cam-actions skb-acts">${acts.join('')}</div>` : ''}${hand}${declDialog()}${sheet}
      <details class="sk-help"><summary>Aide des cartes</summary><ul>${Object.values(SPECIAL).map(s => `<li>${s.icon} <b>${s.name}</b> : ${s.tip}</li>`).join('')}<li>🃏 <b>Joker 15</b> : un 15 jaune, violet ou vert, jamais noir.</li><li>🏴 <b>Noir</b> : l’atout, bat les trois autres couleurs.</li></ul></details></div>`;
    if (root._html !== html) { root.innerHTML = html; root._html = html; bind(); }
  }
  function historyHTML(G) {
    if (!G.history.length) return '<p class="sk-note">Aucune manche terminée.</p>';
    return `<div class="sk-hist"><table><thead><tr><th>Manche</th>${G.players.map(p => `<th>${esc(nameOf(p))}</th>`).join('')}</tr></thead><tbody>${G.history.map(h => `<tr><td>${h.round}</td>${h.rows.map(r => `<td title="${esc(r.bonus.map(x => `${x.pts > 0 ? '+' : ''}${x.pts} ${x.why}`).join(', '))}"><b class="${r.pts >= 0 ? 'pos' : 'neg'}">${r.pts > 0 ? '+' : ''}${r.pts}</b><small>${r.won}/${r.bid}${r.bonus.length ? ' ★' : ''}</small></td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td>Total</td>${G.scores.map(s => `<td><b>${s}</b></td>`).join('')}</tr></tfoot></table></div>`;
  }
  function finalBoard(G) {
    const rank = G.players.map((p, s) => ({p, s: G.scores[s]})).sort((a, b) => b.s - a.s);
    return `<div class="sk-final"><p class="sk-final-t">🏁 Classement final</p>${rank.map((r, i) => `<div class="sk-final-row ${i === 0 ? 'first' : ''}"><span>${['🥇', '🥈', '🥉'][i] || i + 1 + '.'}</span><b>${esc(nameOf(r.p))}</b><span>${r.s} pts</span></div>`).join('')}</div>`;
  }
  function roundSummary(h, G) {
    const me = G.me, r = me >= 0 ? h.rows[me] : null;
    if (r) ctx.toast(`Manche ${h.round} : ${r.won} pli${r.won > 1 ? 's' : ''} pour un pari de ${r.bid} → ${r.pts > 0 ? '+' : ''}${r.pts} pts${r.bonus.length ? ' (bonus compris)' : ''}`);
  }
  function renderLobby() {
    const g = cur, me = meId(), i = g.seats.indexOf(me), invited = i >= 0 && g.seat_state[i] === 'invited';
    const html = `<div class="cam-head"><button type="button" class="gb-back" data-sk-close>← Retour au Yéti</button><h3>☠️ Skull King</h3><span class="cam-need-tag">${g.config.rounds} manche${g.config.rounds > 1 ? 's' : ''}</span></div>
      <div class="cam-lobby"><p>${g.host === me ? 'Invitations envoyées. La partie démarre quand tout le monde a répondu, ou dès que tu la lances avec ceux qui ont rejoint.' : invited ? `<b>${esc(nameOf(g.host))}</b> t’invite à jouer !` : 'En attente des invités…'}</p>
      <div class="cam-seats">${g.seats.map((p, k) => `<div class="cam-pl">${pl(p) ? ctx.avatar(pl(p)) : ''}<span><b>${esc(nameOf(p))}</b><small>${{host: 'organise', joined: '✅ prêt', invited: '⏳ invité'}[g.seat_state[k]] || ''}</small></span></div>`).join('')}</div>
      <div class="cam-actions">${invited ? '<button type="button" class="cam-yes" data-sk-join="1">Rejoindre</button><button type="button" class="cam-no" data-sk-join="0">Refuser</button>' : ''}${g.host === me ? `<button type="button" class="cam-yes" data-sk-start ${g.seat_state.filter(x => x !== 'invited').length < 2 ? 'disabled' : ''}>☠️ Lancer maintenant</button><button type="button" class="cam-no" data-sk-cancel>Annuler la partie</button>` : ''}</div></div>`;
    if (root._html !== html) { root.innerHTML = html; root._html = html; bind(); }
  }
  function declDialog() {
    if (!pendingDecl) return '';
    const {id, need} = pendingDecl;
    const choices = need === 'tig' ? [['tig', 'pirate', '🗡️ Pirate'], ['tig', 'escape', '🏳️ Fuite']]
      : need === 'zero' ? [['zero', 0, '0'], ['zero', 14, '14']]
      : [['color', 'y', '🪙 Jaune'], ['color', 'p', '🔭 Violet'], ['color', 'g', '⚓ Vert']];
    return `<div class="sk-decl" role="dialog"><div class="sk-decl-card">${cardHTML(id, {escape: esc})}<p>${need === 'tig' ? 'La Tigresse joue en…' : need === 'zero' ? 'Cette carte vaut…' : 'Couleur du Joker 15 :'}</p>
      <div class="sk-decl-btns">${choices.map(([k, v, l]) => `<button type="button" data-sk-decl="${k}" data-v="${v}">${l}</button>`).join('')}</div><button type="button" class="cam-no" data-sk-decl-cancel>Annuler</button></div></div>`;
  }
  function bind() {
    root.querySelectorAll('[data-sk-close]').forEach(b => b.onclick = () => close());
    root.onclick = onClick;
  }
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled || !cur) return;
    const G = cur.game;
    if (b.dataset.skBid !== undefined) return act({action: 'bid', n: Number(b.dataset.skBid)});
    if (b.dataset.skCard) {
      const id = b.dataset.skCard, need = G.decl && G.decl[id];
      if (need) { pendingDecl = {id, need}; root._html = ''; render(); return; }
      return act({action: 'play', card: id});
    }
    if (b.dataset.skDecl) {
      if (!pendingDecl || busy) return;
      const {id} = pendingDecl; const k = b.dataset.skDecl, v = k === 'zero' ? Number(b.dataset.v) : b.dataset.v;
      pendingDecl = null; root._html = ''; render(); return act({action: 'play', card: id, decl: {[k]: v}});
    }
    if ('skDeclCancel' in b.dataset) { pendingDecl = null; root._html = ''; render(); return; }
    if (b.dataset.skPlank !== undefined) return act({action: 'plank', idx: Number(b.dataset.skPlank)});
    if ('skSheet' in b.dataset) { sheetOpen = !sheetOpen; render(); return; }
    if ('skFull' in b.dataset) { fullView = !fullView; render(); if (fullView) root.scrollTop = 0; else root.scrollIntoView({block: 'start'}); return; }
    if ('skNudge' in b.dataset) { nudgeAt = Date.now(); return act({action: 'nudge'}); }
    if (b.dataset.skJoin !== undefined) { const ok = b.dataset.skJoin === '1'; try { await api({action: 'answer', game: cur.id, accept: ok}); if (!ok) { close(); return; } await load(false); } catch (err) { ctx.toast(err.message || 'Oups.'); } return; }
    if ('skStart' in b.dataset) return act({action: 'start'});
    if ('skCancel' in b.dataset) { try { await api({action: 'cancel', game: cur.id}); close(); ctx.toast('Partie annulée.'); } catch (err) { ctx.toast(err.message || 'Oups.'); } return; }
    if ('skAgain' in b.dataset) {
      const me = meId(), others = G.players.filter(p => p !== me);
      try { const g = await api({action: 'create', invite: others, rounds: G.R, options: G.opts}); close(true); open(g.id); ctx.toast('☠️ Nouvelle partie, invitations envoyées !'); } catch (err) { ctx.toast(err.message || 'Impossible.'); }
    }
  }
  async function act(body) {
    if (!cur || busy) return;
    busy = true;
    root.classList.add('sk-busy');
    try { const g = await api({...body, game: cur.id}); busy = false; take(g); }
    catch (err) { busy = false; ctx.toast(err.message || 'Action refusée.'); load(false); }
    finally { busy = false; if (root) root.classList.remove('sk-busy'); }
  }

  window.YetiSkull = Object.freeze({init, open, close, refresh: loadList, cardHTML, get openId() { return cur ? cur.id : null; }});
})();
