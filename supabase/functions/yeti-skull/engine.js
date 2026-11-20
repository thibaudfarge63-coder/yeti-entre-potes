/* Skull King : moteur de règles (pur, sans réseau). Tourne côté serveur (fonction Edge Supabase) et dans les tests.
   Règles : cahier des charges du 21 oct. 2026 + décisions validées (projet YETI, claude/skull-king-decisions.md).
   Prévu pour accueillir plus tard les pouvoirs des Pirates et le barème « Rascal » (voir SCORING et les points d'extension). */
(() => {
  'use strict';

  // ---------- Cartes ----------
  // Identifiants uniques : g/y/p/k = vert/jaune/violet/noir. Base : g1..g14. Extension : xg7, xg8, xg0 (le 0/14), j15.
  const SUITS = ['g', 'y', 'p', 'k'];
  const SUIT_NAME = {g: 'vert', y: 'jaune', p: 'violet', k: 'noir'};
  const LEVIATHANS = ['kraken', 'whale', 'ray'];
  const CARDS = {};
  const add = (id, def) => { CARDS[id] = Object.freeze({id, ...def}); };
  for (const s of SUITS) for (let v = 1; v <= 14; v++) add(s + v, {t: 'num', suit: s, val: v, base: true});
  for (const s of SUITS) { add('x' + s + '7', {t: 'num', suit: s, val: 7, ext: 7}); add('x' + s + '8', {t: 'num', suit: s, val: 8, ext: 8}); add('x' + s + '0', {t: 'num', suit: s, val: null, ext: 0}); }
  add('j15', {t: 'num', suit: null, val: 15, joker: true});
  for (let i = 1; i <= 5; i++) add('esc' + i, {t: 'escape'});
  for (let i = 1; i <= 5; i++) add('pir' + i, {t: 'pirate'});
  add('tig', {t: 'tigress'});
  add('king', {t: 'king'});
  add('mer1', {t: 'mermaid'}); add('mer2', {t: 'mermaid'});
  add('loot1', {t: 'loot'}); add('loot2', {t: 'loot'});
  add('kraken', {t: 'kraken'}); add('whale', {t: 'whale'}); add('ray', {t: 'ray'});
  add('second', {t: 'second'}); add('davy', {t: 'davy'}); add('salvo', {t: 'salvo'}); add('plank', {t: 'plank'});
  add('wind', {t: 'wind'}); // Vent tournant (règle maison, 20 nov. 2026)

  // Options (cartes activables à la création). Fuites, Pirates et cartes de couleur de base sont toujours présents.
  const OPTION_KEYS = ['ext', 'joker', 'tig', 'king', 'mer', 'loot', 'kraken', 'whale', 'ray', 'second', 'davy', 'salvo', 'plank', 'wind'];
  const OPTION_CARDS = {
    ext: id => /^x[gypk][780]$/.test(id), joker: id => id === 'j15', tig: id => id === 'tig', king: id => id === 'king',
    mer: id => /^mer\d$/.test(id), loot: id => /^loot\d$/.test(id), kraken: id => id === 'kraken', whale: id => id === 'whale',
    ray: id => id === 'ray', second: id => id === 'second', davy: id => id === 'davy', salvo: id => id === 'salvo', plank: id => id === 'plank',
    wind: id => id === 'wind',
  };
  function normOptions(o, nPlayers) {
    const r = {};
    for (const k of OPTION_KEYS) r[k] = !o || o[k] !== false;
    if (!r.kraken && !r.whale && !r.ray) r.davy = false; // le Casier n'a de sens qu'avec un léviathan
    return r;
  }
  function buildDeck(options, nPlayers) {
    const o = normOptions(options, nPlayers);
    return Object.keys(CARDS).filter(id => {
      for (const k of OPTION_KEYS) if (OPTION_CARDS[k](id) && !o[k]) return false;
      if (nPlayers === 2 && (id === 'j15' || id === 'plank' || /^x[gypk]0$/.test(id))) return false; // règle à 2 joueurs
      return true;
    });
  }

  // ---------- Lecture d'une carte posée ----------
  // pc = {s: siège, c: id, d: déclaration {tig:'pirate'|'escape', zero:0|14, color:'g'|'y'|'p'}}
  function info(pc) {
    const k = CARDS[pc.c], d = pc.d || {};
    if (k.t === 'tigress') return {t: d.tig === 'escape' ? 'escape' : 'pirate', tig: true};
    if (k.t === 'num') {
      if (k.joker) return {t: 'num', suit: d.color || 'y', val: 15, joker: true};
      if (k.ext === 0) return {t: 'num', suit: k.suit, val: d.zero === 14 ? 14 : 0, zero: true};
      return {t: 'num', suit: k.suit, val: k.val, base: !!k.base, ext: k.ext};
    }
    // Vent tournant : se joue comme une Fuite (le décalage des cartes se fait en fin de pli, voir finishTrick)
    if (k.t === 'wind') return {t: 'escape', wind: true};
    return {t: k.t};
  }
  // Règle maison (17 nov. 2026) : la couleur demandée est celle de la 1re carte de couleur posée dans le pli,
  // quelles que soient les cartes spéciales posées avant (Fuite, Pirate, Sirène, Roi, Kraken…).
  // Couleur demandée d'un pli (liste de cartes posées dans l'ordre). null = pas (encore) de couleur.
  function leadSuit(cards) {
    for (const pc of cards) { const i = info(pc); if (i.t === 'num') return i.suit; }
    return null;
  }
  // Une couleur peut-elle encore être fixée par la prochaine carte ?
  function leadOpen(cards) { return leadSuit(cards) === null; }

  // ---------- Cartes jouables ----------
  const isSpecial = id => CARDS[id].t !== 'num';
  function legalFrom(hand, trickCards, free) {
    if (free) return hand.slice();
    const lead = leadSuit(trickCards);
    if (!lead) return hand.slice();
    const follows = id => { const k = CARDS[id]; if (k.t !== 'num') return false; if (k.joker) return lead !== 'k'; return k.suit === lead; };
    const hasLead = hand.some(id => { const k = CARDS[id]; return k.t === 'num' && !k.joker && k.suit === lead; }) || (lead !== 'k' && hand.includes('j15'));
    if (!hasLead) return hand.slice();
    return hand.filter(id => isSpecial(id) || follows(id));
  }
  // Choix à faire en posant cette carte, compte tenu du pli en cours.
  function declNeeded(id, trickCards, free) {
    const k = CARDS[id];
    if (k.t === 'tigress') return 'tig';
    if (k.t === 'num' && k.ext === 0) return 'zero';
    if (k.joker) { const lead = free ? null : leadSuit(trickCards); return lead && lead !== 'k' ? null : 'color'; }
    return null;
  }
  function cleanDecl(id, decl, trickCards, free) {
    const k = CARDS[id], d = decl || {};
    if (k.t === 'tigress') { if (d.tig !== 'pirate' && d.tig !== 'escape') throw err('Choisis Pirate ou Fuite pour la Tigresse.'); return {tig: d.tig}; }
    if (k.t === 'num' && k.ext === 0) { if (d.zero !== 0 && d.zero !== 14) throw err('Choisis 0 ou 14.'); return {zero: d.zero}; }
    if (k.joker) {
      const lead = free ? null : leadSuit(trickCards);
      if (lead && lead !== 'k') return {color: lead};
      if (!['g', 'y', 'p'].includes(d.color)) throw err('Choisis la couleur du Joker : jaune, violet ou vert.');
      return {color: d.color};
    }
    return undefined;
  }

  // ---------- Résolution d'un pli ----------
  // cards : cartes posées (y compris la carte en plus de la Dernière salve, à la fin). plankPick : index du Pirate retiré.
  // Renvoie {win: index gagnant | null, next: siège qui ouvre ensuite, kraken, removed: index retiré, destroyed: [index], applied}
  function resolve(cards, plankPick) {
    let alive = cards.map((_, i) => i);
    const I = cards.map(info);
    const destroyed = [];
    // 2. Casier de Davy Jones
    if (alive.some(i => I[i].t === 'davy')) {
      for (const i of alive) if (LEVIATHANS.includes(I[i].t)) destroyed.push(i);
      alive = alive.filter(i => !destroyed.includes(i));
    }
    // 3. Supplice de la planche
    let removed = null;
    if (alive.some(i => I[i].t === 'plank')) {
      const pirates = alive.filter(i => I[i].t === 'pirate');
      if (pirates.length === 1) removed = pirates[0];
      else if (pirates.length > 1) {
        if (!pirates.includes(plankPick)) throw err('La Planche doit choisir un Pirate du pli.');
        removed = plankPick;
      }
      if (removed !== null) alive = alive.filter(i => i !== removed);
    }
    // 4. Léviathans : seul le dernier posé garde son pouvoir ; ceux posés avant comptent comme des Fuites
    //    (FAQ officielle de l'éditeur : le second posé garde son pouvoir, le premier compte comme une Fuite)
    const levs = alive.filter(i => LEVIATHANS.includes(I[i].t));
    if (levs.length) {
      const last = levs[levs.length - 1];
      for (const i of levs) if (i !== last) I[i] = {t: 'escape', lev: true};
      const others = alive.filter(i => i !== last);
      if (I[last].t === 'kraken') {
        const wb = others.length ? core(cards, I, others) : null;
        return {win: null, kraken: true, wouldBe: wb, next: wb !== null ? cards[wb].s : cards[last].s, removed, destroyed, applied: 'kraken', alive};
      }
      const nums = others.filter(i => I[i].t === 'num');
      if (nums.length) {
        let best = nums[0];
        for (const i of nums) if (I[last].t === 'whale' ? I[i].val > I[best].val : I[i].val < I[best].val) best = i;
        return {win: best, next: cards[best].s, removed, destroyed, applied: I[last].t, alive};
      }
      // pas de carte numérotée : les spéciales sont devenues des Fuites, la première posée gagne ; sinon personne
      if (others.length) return {win: others[0], next: cards[others[0]].s, removed, destroyed, applied: I[last].t, alive};
      return {win: null, next: cards[last].s, removed, destroyed, applied: I[last].t, alive};
    }
    const w = core(cards, I, alive);
    return {win: w, next: cards[w].s, removed, destroyed, applied: null, alive};
  }
  // Étapes 5 à 12, sur des cartes sans léviathan. Égalité : la première posée gagne
  // (deux Sirènes : la première posée, même si la seconde vient de la Dernière salve, toujours rangée en dernier).
  function core(cards, I, alive) {
    const first = t => alive.find(i => I[i].t === t);
    const mer = first('mermaid'), king = first('king'), sec = first('second'), pir = first('pirate');
    const has = x => x !== undefined;
    if (has(king) && has(mer)) return mer;                         // 5. Sirène + Roi
    if (has(pir) && has(mer) && has(sec) && !has(king)) return mer; // cas tranché
    if (has(king)) return king;                                    // 6. Roi
    if (has(sec)) return has(mer) ? mer : sec;                     // 7. Second (perd contre les Sirènes)
    if (has(pir)) return pir;                                      // 8. Pirates
    if (has(mer)) return mer;                                      // 9. Sirènes
    const nums = alive.filter(i => I[i].t === 'num');
    const best = list => list.reduce((b, i) => (b === null || I[i].val > I[b].val ? i : b), null);
    const black = best(nums.filter(i => I[i].suit === 'k'));
    if (black !== null) return black;                              // 10. Atout noir
    let lead = leadSuit(alive.map(i => cards[i]));
    if (!lead && nums.length) lead = I[nums[0]].suit;              // couleur d'ouverture détruite : la 1re carte numérotée fixe la couleur
    const ls = best(nums.filter(i => I[i].suit === lead));
    if (ls !== null) return ls;                                    // 11. Couleur demandée
    return alive[0];                                               // 12. Que des Fuites (ou Salve/Planche/Casier) : la première posée
  }

  // ---------- Barème (classique) ----------
  const SCORING = {
    classic: {
      bid(bid, won, dealt) {
        if (bid === 0) return won === 0 ? 10 * dealt : -10 * dealt;
        return won === bid ? 20 * bid : -10 * Math.abs(won - bid);
      },
    },
  };
  // Bonus d'un pli (versés seulement si le pari est réussi). Renvoie [{s, pts, why}]
  function trickBonuses(cards, res) {
    if (res.kraken) return {items: [], alliances: []};
    const items = [], alliances = [];
    const I = cards.map(info), inTrick = res.alive.filter(i => !LEVIATHANS.includes(I[i].t));
    if (res.win !== null) {
      const ws = cards[res.win].s, wt = I[res.win].t;
      for (const i of inTrick) {
        const x = I[i];
        if (x.t !== 'num' || x.zero || x.joker) continue;
        if (x.base && x.val === 14) items.push({s: ws, pts: x.suit === 'k' ? 20 : 10, why: `14 ${SUIT_NAME[x.suit]}`});
        if (x.ext === 8) items.push({s: ws, pts: 5, why: `8 ${SUIT_NAME[x.suit]} (extension)`});
        if (x.ext === 7) items.push({s: ws, pts: -5, why: `7 ${SUIT_NAME[x.suit]} (extension)`});
      }
      const count = t => inTrick.filter(i => I[i].t === t).length;
      if (!res.applied) {
        if (wt === 'pirate' && count('mermaid')) items.push({s: ws, pts: 20 * count('mermaid'), why: 'Pirate qui capture une Sirène'});
        if (wt === 'king' && count('pirate')) items.push({s: ws, pts: 30 * count('pirate'), why: 'Roi qui capture un Pirate'});
        if (wt === 'mermaid' && count('king')) items.push({s: ws, pts: 40, why: 'Sirène qui capture le Roi'});
        if ((wt === 'king' || wt === 'mermaid') && count('second')) items.push({s: ws, pts: 30, why: 'Capture du Second'});
        // Butin : alliance avec le gagnant (pas sous Baleine/Raie, où le Butin est devenu une Fuite)
        for (const i of inTrick) if (I[i].t === 'loot' && cards[i].s !== ws) alliances.push([cards[i].s, ws]);
      }
    }
    // Casier de Davy Jones : +20 par léviathan détruit, au joueur qui l'a posé
    if (res.destroyed.length) {
      const d = cards.findIndex(pc => CARDS[pc.c].t === 'davy');
      items.push({s: cards[d].s, pts: 20 * res.destroyed.length, why: 'Casier de Davy Jones'});
    }
    return {items, alliances};
  }

  // ---------- Partie ----------
  function err(m) { const e = new Error(m); e.game = true; return e; }
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function newGame({players, rounds, options}, rng) {
    const P = players.length;
    if (P < 2 || P > 9) throw err('Il faut de 2 à 9 joueurs.');
    const R = Math.max(1, Math.min(10, Math.floor(Number(rounds) || 10)));
    const st = {v: 1, players: players.slice(), P, R, opts: normOptions(options, P), scoring: 'classic',
      round: 0, scores: Array(P).fill(0), history: [], phase: 'bid'};
    startRound(st, rng);
    return st;
  }
  function startRound(st, rng) {
    if (st.opts && st.opts.wind === undefined) st.opts.wind = false; // parties créées avant le Vent tournant : pas de nouvelle carte en cours de route
    st.round += 1;
    const deck = shuffle(buildDeck(st.opts, st.P), rng);
    const n = Math.min(st.round, Math.floor(deck.length / st.P));
    st.dealt = n;
    st.hands = Array.from({length: st.P}, (_, s) => deck.slice(s * n, s * n + n));
    st.bids = Array(st.P).fill(null);
    st.won = Array(st.P).fill(0);
    st.pend = Array.from({length: st.P}, () => []);
    st.alliances = [];
    st.starter = (st.round - 1) % st.P;
    st.tricks = 0;
    st.trick = null; // lastTrick garde le dernier pli de la manche précédente (affichage)
    st.phase = 'bid'; st.turn = null;
  }
  function placeBid(st, s, n) {
    if (st.phase !== 'bid') throw err('Les paris sont terminés.');
    if (st.bids[s] !== null) throw err('Tu as déjà parié.');
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > st.dealt) throw err(`Pari entre 0 et ${st.dealt}.`);
    st.bids[s] = n;
    if (st.bids.every(b => b !== null)) { st.phase = 'play'; openTrick(st, st.starter); }
  }
  const nextWithCards = (st, s) => { for (let k = 0; k < st.P; k++) { const x = (s + k) % st.P; if (st.hands[x].length) return x; } return null; };
  function openTrick(st, leader) {
    const l = nextWithCards(st, leader);
    st.trick = {leader: l, cards: [], todo: st.hands.map((h, s) => h.length > 0).map((ok, s) => ok ? s : -1).filter(s => s >= 0), salvo: null, extraDone: false};
    st.turn = l;
  }
  function legal(st, s) {
    if (st.turn !== s) return [];
    if (st.phase === 'play') return legalFrom(st.hands[s], st.trick.cards, false);
    if (st.phase === 'salvo') return st.hands[s].slice();
    return [];
  }
  function playCard(st, s, id, decl) {
    if (st.phase !== 'play' && st.phase !== 'salvo') throw err('Ce n’est pas le moment de poser une carte.');
    if (st.turn !== s) throw err('Ce n’est pas ton tour.');
    if (!st.hands[s].includes(id)) throw err('Tu n’as pas cette carte.');
    const free = st.phase === 'salvo';
    if (!legal(st, s).includes(id)) throw err('Tu dois suivre la couleur demandée (ou jouer une carte spéciale).');
    const d = cleanDecl(id, decl, st.trick.cards, free);
    st.hands[s] = st.hands[s].filter(x => x !== id);
    const pc = {s, c: id}; if (d) pc.d = d; if (free) pc.extra = true;
    st.trick.cards.push(pc);
    if (CARDS[id].t === 'salvo' && !free) st.trick.salvo = s;
    if (free) st.trick.extraDone = true;
    advance(st);
  }
  function advance(st) {
    const t = st.trick;
    const played = new Set(t.cards.filter(pc => !pc.extra).map(pc => pc.s));
    const waiting = t.todo.filter(s => !played.has(s));
    if (waiting.length) {
      // prochain siège dans le sens horaire qui doit encore jouer
      let s = st.turn;
      for (let k = 1; k <= st.P; k++) { const x = (s + k) % st.P; if (waiting.includes(x)) { st.turn = x; st.phase = 'play'; return; } }
    }
    // 1. Dernière salve : une carte de plus, si son joueur a encore une carte
    if (t.salvo !== null && !t.extraDone && st.hands[t.salvo].length) { st.phase = 'salvo'; st.turn = t.salvo; return; }
    // 3. Planche : choix du Pirate s'il y en a plusieurs
    const I = t.cards.map(info);
    const plank = t.cards.findIndex(pc => CARDS[pc.c].t === 'plank');
    const pirates = I.map((x, i) => (x.t === 'pirate' ? i : -1)).filter(i => i >= 0);
    if (plank >= 0 && pirates.length > 1 && t.plankPick === undefined) { st.phase = 'plank'; st.turn = t.cards[plank].s; return; }
    finishTrick(st);
  }
  function choosePlank(st, s, idx) {
    if (st.phase !== 'plank' || st.turn !== s) throw err('Ce n’est pas à toi de choisir.');
    const pc = st.trick.cards[idx];
    if (!pc || info(pc).t !== 'pirate') throw err('Choisis un Pirate du pli.');
    st.trick.plankPick = idx;
    finishTrick(st);
  }
  // Vent tournant (règle maison, 20 nov. 2026) : en fin de pli, chaque carte posée passe au joueur suivant
  // (sens du jeu), Vent compris. Le pli, les bonus, le Butin et l'ouverture du pli suivant vont au nouveau
  // propriétaire de la carte. Deux Vents = deux crans. L'ordre de pose ne change pas.
  function windTurn(st, cards) {
    const n = cards.filter(pc => CARDS[pc.c].t === 'wind').length % st.P;
    if (!n) return cards;
    return cards.map(pc => ({...pc, s: (pc.s + n) % st.P, from: pc.s}));
  }
  function finishTrick(st) {
    const t = st.trick, cards = windTurn(st, t.cards), res = resolve(cards, t.plankPick);
    const b = trickBonuses(cards, res);
    for (const it of b.items) st.pend[it.s].push({pts: it.pts, why: it.why});
    for (const a of b.alliances) st.alliances.push(a);
    const winner = res.win === null ? null : cards[res.win].s;
    if (winner !== null) st.won[winner] += 1;
    st.tricks += 1;
    st.lastTrick = {round: st.round, cards, wind: cards !== t.cards, win: res.win, winner, kraken: !!res.kraken, removed: res.removed, destroyed: res.destroyed, applied: res.applied, n: st.tricks,
      bonus: b.items};
    if (st.hands.every(h => !h.length)) return endRound(st);
    st.phase = 'play';
    openTrick(st, res.next);
  }
  function endRound(st) {
    const rule = SCORING[st.scoring];
    const hit = st.bids.map((b, s) => b === st.won[s]);
    const rows = st.players.map((_, s) => {
      const base = rule.bid(st.bids[s], st.won[s], st.dealt);
      const bonus = [];
      if (hit[s]) {
        for (const x of st.pend[s]) bonus.push(x);
        for (const [a, c] of st.alliances) if ((a === s || c === s) && hit[a] && hit[c]) bonus.push({pts: 20, why: 'Alliance de Butin'});
      }
      const pts = base + bonus.reduce((t, x) => t + x.pts, 0);
      st.scores[s] += pts;
      return {bid: st.bids[s], won: st.won[s], base, bonus, pts, total: st.scores[s]};
    });
    st.history.push({round: st.round, dealt: st.dealt, rows});
    st.trick = null; st.turn = null;
    if (st.round >= st.R) { st.phase = 'done'; return; }
    st.phase = 'next';
  }
  function nextRound(st, rng) { if (st.phase !== 'next') throw err('La manche n’est pas finie.'); startRound(st, rng); }

  // Coup automatique (joueur absent) : pari de 0, carte légale au hasard, choix au hasard.
  function autoAct(st, s, rng) {
    if (st.phase === 'bid' && st.bids[s] === null) return placeBid(st, s, 0);
    if (st.turn !== s) return;
    if (st.phase === 'plank') { const p = st.trick.cards.map((pc, i) => (info(pc).t === 'pirate' ? i : -1)).filter(i => i >= 0); return choosePlank(st, s, p[Math.floor(rng() * p.length)]); }
    if (st.phase === 'play' || st.phase === 'salvo') {
      const L = legal(st, s), id = L[Math.floor(rng() * L.length)];
      const pick = a => a[Math.floor(rng() * a.length)];
      return playCard(st, s, id, {tig: pick(['pirate', 'escape']), zero: pick([0, 14]), color: pick(['g', 'y', 'p'])});
    }
  }

  // Vue d'un joueur : sa main seulement, paris cachés tant que tout le monde n'a pas parié.
  function view(st, s) {
    const allBid = st.bids.every(b => b !== null);
    const me = s >= 0 && s < st.P ? s : -1;
    const t = st.trick;
    const v = {phase: st.phase, round: st.round, R: st.R, dealt: st.dealt, P: st.P, players: st.players, opts: st.opts, scores: st.scores,
      starter: st.starter, turn: st.turn, tricks: st.tricks, won: st.won,
      bids: st.bids.map((b, i) => (allBid || i === me ? b : null)), hasBid: st.bids.map(b => b !== null),
      counts: st.hands.map(h => h.length),
      trick: t ? {leader: t.leader, cards: t.cards, lead: leadSuit(t.cards), salvo: t.salvo} : null,
      lastTrick: st.lastTrick, history: st.history, me};
    if (me >= 0) {
      v.hand = st.hands[me].slice();
      v.playable = legal(st, me);
      v.decl = Object.fromEntries(v.hand.map(id => [id, declNeeded(id, t ? t.cards : [], st.phase === 'salvo')]));
      v.pend = allBid || st.phase !== 'bid' ? st.pend[me] : [];
      if (st.phase === 'plank' && st.turn === me) v.plankChoices = t.cards.map((pc, i) => (info(pc).t === 'pirate' ? i : -1)).filter(i => i >= 0);
    }
    return v;
  }

  const api = {CARDS, SUITS, SUIT_NAME, OPTION_KEYS, buildDeck, normOptions, info, leadSuit, leadOpen, legalFrom, declNeeded, resolve, trickBonuses, SCORING,
    newGame, placeBid, playCard, choosePlank, nextRound, legal, autoAct, view, shuffle};
  globalThis.SkullEngine = Object.freeze(api);
})();
