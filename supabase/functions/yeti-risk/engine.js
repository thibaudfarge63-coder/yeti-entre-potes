/* Risk : moteur de règles (pur, sans réseau). Tourne côté serveur (fonction Edge Supabase yeti-risk) et dans les tests.
   Règles classiques (carte du monde, 42 territoires, dés 3 contre 2, cartes à échanger, déplacement de fin de tour)
   + missions annexes (bonus en jeu) + bots. Décisions : projet YETI, claude/risk-decisions.md. */
(() => {
  'use strict';

  // ---------- Carte ----------
  // [id, nom, continent, voisins]
  const T = [
    ['alaska', 'Alaska', 'na', ['nwt', 'alberta', 'kamchatka']],
    ['nwt', 'Territoires du Nord-Ouest', 'na', ['alaska', 'alberta', 'ontario', 'greenland']],
    ['greenland', 'Groenland', 'na', ['nwt', 'ontario', 'quebec', 'iceland']],
    ['alberta', 'Alberta', 'na', ['alaska', 'nwt', 'ontario', 'wus']],
    ['ontario', 'Ontario', 'na', ['nwt', 'alberta', 'wus', 'eus', 'quebec', 'greenland']],
    ['quebec', 'Québec', 'na', ['ontario', 'eus', 'greenland']],
    ['wus', 'États-Unis de l’Ouest', 'na', ['alberta', 'ontario', 'eus', 'camerica']],
    ['eus', 'États-Unis de l’Est', 'na', ['wus', 'ontario', 'quebec', 'camerica']],
    ['camerica', 'Amérique centrale', 'na', ['wus', 'eus', 'venezuela']],
    ['venezuela', 'Venezuela', 'sa', ['camerica', 'peru', 'brazil']],
    ['peru', 'Pérou', 'sa', ['venezuela', 'brazil', 'argentina']],
    ['brazil', 'Brésil', 'sa', ['venezuela', 'peru', 'argentina', 'nafrica']],
    ['argentina', 'Argentine', 'sa', ['peru', 'brazil']],
    ['iceland', 'Islande', 'eu', ['greenland', 'gb', 'scandinavia']],
    ['gb', 'Grande-Bretagne', 'eu', ['iceland', 'scandinavia', 'neurope', 'weurope']],
    ['scandinavia', 'Scandinavie', 'eu', ['iceland', 'gb', 'neurope', 'ukraine']],
    ['neurope', 'Europe du Nord', 'eu', ['gb', 'scandinavia', 'ukraine', 'seurope', 'weurope']],
    ['weurope', 'Europe de l’Ouest', 'eu', ['gb', 'neurope', 'seurope', 'nafrica']],
    ['seurope', 'Europe du Sud', 'eu', ['weurope', 'neurope', 'ukraine', 'mideast', 'egypt', 'nafrica']],
    ['ukraine', 'Ukraine', 'eu', ['scandinavia', 'neurope', 'seurope', 'mideast', 'afghanistan', 'ural']],
    ['nafrica', 'Afrique du Nord', 'af', ['brazil', 'weurope', 'seurope', 'egypt', 'eafrica', 'congo']],
    ['egypt', 'Égypte', 'af', ['nafrica', 'seurope', 'mideast', 'eafrica']],
    ['eafrica', 'Afrique de l’Est', 'af', ['egypt', 'nafrica', 'congo', 'safrica', 'madagascar', 'mideast']],
    ['congo', 'Congo', 'af', ['nafrica', 'eafrica', 'safrica']],
    ['safrica', 'Afrique du Sud', 'af', ['congo', 'eafrica', 'madagascar']],
    ['madagascar', 'Madagascar', 'af', ['safrica', 'eafrica']],
    ['ural', 'Oural', 'as', ['ukraine', 'siberia', 'china', 'afghanistan']],
    ['siberia', 'Sibérie', 'as', ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china']],
    ['yakutsk', 'Iakoutie', 'as', ['siberia', 'kamchatka', 'irkutsk']],
    ['kamchatka', 'Kamtchatka', 'as', ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska']],
    ['irkutsk', 'Irkoutsk', 'as', ['siberia', 'yakutsk', 'kamchatka', 'mongolia']],
    ['mongolia', 'Mongolie', 'as', ['irkutsk', 'kamchatka', 'japan', 'china', 'siberia']],
    ['japan', 'Japon', 'as', ['kamchatka', 'mongolia']],
    ['afghanistan', 'Afghanistan', 'as', ['ukraine', 'ural', 'china', 'india', 'mideast']],
    ['china', 'Chine', 'as', ['afghanistan', 'ural', 'siberia', 'mongolia', 'siam', 'india']],
    ['mideast', 'Moyen-Orient', 'as', ['ukraine', 'afghanistan', 'india', 'egypt', 'eafrica', 'seurope']],
    ['india', 'Inde', 'as', ['mideast', 'afghanistan', 'china', 'siam']],
    ['siam', 'Siam', 'as', ['india', 'china', 'indonesia']],
    ['indonesia', 'Indonésie', 'oc', ['siam', 'newguinea', 'waustralia']],
    ['newguinea', 'Nouvelle-Guinée', 'oc', ['indonesia', 'waustralia', 'eaustralia']],
    ['waustralia', 'Australie de l’Ouest', 'oc', ['indonesia', 'newguinea', 'eaustralia']],
    ['eaustralia', 'Australie de l’Est', 'oc', ['waustralia', 'newguinea']],
  ];
  const TERR = {}, IDS = [];
  for (const [id, name, cont, adj] of T) { TERR[id] = Object.freeze({id, name, cont, adj: Object.freeze(adj)}); IDS.push(id); }
  const CONT = {
    na: {name: 'Amérique du Nord', bonus: 5}, sa: {name: 'Amérique du Sud', bonus: 2}, eu: {name: 'Europe', bonus: 5},
    af: {name: 'Afrique', bonus: 3}, as: {name: 'Asie', bonus: 7}, oc: {name: 'Océanie', bonus: 2},
  };
  for (const c in CONT) CONT[c].terr = IDS.filter(t => TERR[t].cont === c);
  // Animal des troupes (valeur 5) selon la région où elles se trouvent
  const ANIMAL = {na: 'taureau', sa: 'lama', eu: 'vache', af: 'elephant', as: 'tigre', oc: 'kangourou'};
  const animalOf = t => (t === 'mideast' ? 'chameau' : ANIMAL[TERR[t].cont]);

  // Cartes : une par territoire (soldat / animal / char en alternance) + 2 jokers
  const KINDS = ['soldat', 'animal', 'char'];
  const CARD_KIND = {};
  IDS.forEach((t, i) => { CARD_KIND[t] = KINDS[i % 3]; });
  CARD_KIND.joker1 = 'joker'; CARD_KIND.joker2 = 'joker';
  // Valeur des échanges successifs (tous joueurs confondus) : 4, 6, 8, 10, 12, 15, puis +5
  const tradeValue = n => (n < 5 ? 4 + 2 * n : 15 + 5 * (n - 5));
  const START = {2: 40, 3: 35, 4: 30, 5: 25, 6: 20, 7: 20};

  // ---------- Missions annexes ----------
  // Récompenses : {armies: n} (renforts au prochain placement), {card: 1}, {gold: 1} (dé en or : +1 au meilleur dé de ta prochaine attaque)
  const MISSIONS = {
    oce2: {text: 'Tenir l’Océanie à la fin de 2 de tes tours d’affilée', reward: {armies: 5}},
    conq5: {text: 'Conquérir 5 territoires en un seul tour', reward: {card: 1}},
    david: {text: 'Gagner un duel en attaquant avec 1 seul dé contre 2', reward: {gold: 1}},
    elim: {text: 'Éliminer un joueur', reward: {armies: 5}},
    fort5: {text: 'Prendre un territoire défendu par au moins 5 armées', reward: {card: 1}},
    stack15: {text: 'Réunir 15 armées sur un même territoire à la fin de ton tour', reward: {armies: 3}},
    cont3: {text: 'Conquérir des territoires sur 3 continents différents en un tour', reward: {armies: 5}},
    mix: {text: 'Échanger un set soldat + animal + char', reward: {armies: 3}},
    wall: {text: 'Faire perdre 6 armées à un attaquant pendant un même tour adverse', reward: {gold: 1}},
    silk: {text: 'Tenir Moyen-Orient, Afghanistan et Chine à la fin de ton tour', reward: {armies: 3}},
    bering: {text: 'Prendre le Kamtchatka depuis l’Alaska, ou l’Alaska depuis le Kamtchatka', reward: {card: 1}},
    cont2: {text: 'Tenir 2 continents entiers à la fin de ton tour', reward: {armies: 5}},
  };
  const MISSION_IDS = Object.keys(MISSIONS);
  const rewardText = r => (r.armies ? `+${r.armies} renforts` : r.card ? '+1 carte' : '🎲 dé en or');

  // ---------- Outils ----------
  function err(m) { const e = new Error(m); e.game = true; return e; }
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const die = rng => 1 + Math.floor(rng() * 6);
  const owned = (st, s) => IDS.filter(t => st.owner[t] === s);
  const holdsCont = (st, s, c) => CONT[c].terr.every(t => st.owner[t] === s);
  const contsOf = (st, s) => Object.keys(CONT).filter(c => holdsCont(st, s, c));
  function event(st, e) { st.seq = (st.seq || 0) + 1; e.id = st.seq; st.ev.push(e); if (st.ev.length > 60) st.ev.splice(0, st.ev.length - 60); }

  // ---------- Partie ----------
  // players : ids des joueurs (bots = nombres négatifs), bots : {siège: niveau 'easy'|'normal'|'hard'}
  function newGame({players, bots, missions}, rng) {
    const P = players.length;
    if (P < 2 || P > 7) throw err('Il faut de 2 à 7 joueurs (bots compris).');
    const order = shuffle(players.map((_, i) => i), rng);
    const st = {v: 1, players: players.slice(), P, bots: Object.assign({}, bots || {}), missionsOn: missions !== false,
      owner: {}, armies: {}, phase: 'claim', turn: order[0], round: 0, order, alive: players.map(() => true),
      hands: players.map(() => []), deck: shuffle(Object.keys(CARD_KIND), rng), trades: 0,
      toPlace: players.map(() => 0), setupDone: players.map(() => false), bonus: players.map(() => 0), gold: players.map(() => 0),
      missions: players.map(() => []), done: players.map(() => []), track: players.map(() => ({oce: 0})),
      tstat: null, ev: [], seq: 0, winner: null, elim: []};
    // Conquête du monde vide : chacun à son tour pose sa 1re armée sur un territoire libre, jusqu'à ce que les 42 soient pris
    for (const t of IDS) { st.owner[t] = null; st.armies[t] = 0; }
    for (let s = 0; s < P; s++) st.toPlace[s] = START[P];
    if (st.missionsOn) for (let s = 0; s < P; s++) for (let k = 0; k < 3; k++) drawMission(st, s, rng);
    event(st, {k: 'start'});
    return st;
  }
  function drawMission(st, s, rng) {
    const free = MISSION_IDS.filter(m => !st.missions[s].includes(m));
    if (!free.length) return;
    st.missions[s].push(free[Math.floor(rng() * free.length)]);
  }

  function claim(st, s, t) {
    if (st.phase !== 'claim') throw err('Tous les territoires sont déjà pris.');
    if (st.turn !== s) throw err('Ce n’est pas ton tour de choisir.');
    if (!TERR[t] || st.owner[t] !== null) throw err('Choisis un territoire libre.');
    st.owner[t] = s; st.armies[t] = 1; st.toPlace[s] -= 1;
    event(st, {k: 'claim', s, t});
    if (IDS.every(x => st.owner[x] !== null)) { st.phase = 'setup'; st.turn = null; return; }
    st.turn = st.order[(st.order.indexOf(s) + 1) % st.P];
  }
  // Mise en place : chaque joueur envoie d'un coup la répartition de ses armées restantes {territoire: n}
  function setupPlace(st, s, plan) {
    if (st.phase !== 'setup') throw err('La mise en place est terminée.');
    if (st.setupDone[s]) throw err('Tu as déjà placé tes armées.');
    const n = checkPlan(st, s, plan, st.toPlace[s], true);
    for (const t in plan) st.armies[t] += plan[t] | 0;
    st.toPlace[s] -= n; st.setupDone[s] = true;
    event(st, {k: 'place', s, plan: cleanPlan(plan)});
    if (st.setupDone.every(Boolean)) { st.round = 1; startTurn(st, st.order[0]); }
  }
  function checkPlan(st, s, plan, max, exact) {
    if (!plan || typeof plan !== 'object') throw err('Placement invalide.');
    let n = 0;
    for (const t in plan) {
      const k = plan[t];
      if (!TERR[t] || !Number.isInteger(k) || k < 0) throw err('Placement invalide.');
      if (k && st.owner[t] !== s) throw err(`${TERR[t].name} n’est pas à toi.`);
      n += k;
    }
    if (exact ? n !== max : n < 1 || n > max) throw err(exact ? `Place exactement ${max} armée${max > 1 ? 's' : ''}.` : `Tu peux placer de 1 à ${max} armées.`);
    return n;
  }
  const cleanPlan = plan => Object.fromEntries(Object.entries(plan).filter(([, k]) => k > 0));

  function reinforcements(st, s) {
    const n = owned(st, s).length;
    let a = Math.max(3, Math.floor(n / 3));
    for (const c of contsOf(st, s)) a += CONT[c].bonus;
    return a;
  }
  function startTurn(st, s) {
    st.turn = s; st.phase = 'reinforce';
    st.toPlace[s] = reinforcements(st, s) + st.bonus[s];
    st.bonus[s] = 0;
    st.tstat = {s, conq: 0, conts: [], seen: {}, card: false, kills: {}};
    st.mustTrade = st.hands[s].length >= 5;
    st.resume = null;
    event(st, {k: 'turn', s, armies: st.toPlace[s]});
  }

  // ---------- Cartes ----------
  function setKind(cards) {
    const k = cards.map(c => CARD_KIND[c]), j = k.filter(x => x === 'joker').length, r = k.filter(x => x !== 'joker');
    if (cards.length !== 3 || new Set(cards).size !== 3) return null;
    if (j >= 2) return 'joker';
    if (new Set(r).size === 1) return j ? 'joker' : r[0];
    if (new Set(r).size === r.length) return j ? 'joker' : 'mix';
    return null;
  }
  function canTradeAny(hand) {
    for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) if (setKind([hand[a], hand[b], hand[c]])) return [hand[a], hand[b], hand[c]];
    return null;
  }
  function trade(st, s, cards, rng) {
    if (st.turn !== s || st.phase !== 'reinforce') throw err('Tu ne peux échanger des cartes qu’au moment de placer tes renforts.');
    if (!Array.isArray(cards) || !cards.every(c => st.hands[s].includes(c))) throw err('Tu n’as pas ces cartes.');
    const kind = setKind(cards);
    if (!kind) throw err('Il faut 3 cartes identiques, 3 différentes, ou avec un joker.');
    let a = tradeValue(st.trades);
    st.trades += 1;
    // +2 sur un territoire montré qui t'appartient (une seule fois par échange)
    const mine = cards.find(c => TERR[c] && st.owner[c] === s);
    if (mine) st.armies[mine] += 2;
    st.hands[s] = st.hands[s].filter(c => !cards.includes(c));
    st.deck.push(...cards); // les cartes échangées retournent sous la pioche
    st.toPlace[s] += a;
    st.mustTrade = st.hands[s].length >= 5;
    event(st, {k: 'trade', s, cards, armies: a, plus2: mine || null});
    if (kind === 'mix') mission(st, s, 'mix', rng);
  }

  // ---------- Renforts ----------
  function place(st, s, plan) {
    if (st.turn !== s || st.phase !== 'reinforce') throw err('Ce n’est pas le moment de placer des armées.');
    if (st.mustTrade) throw err('Tu as 5 cartes ou plus : échange d’abord un set.');
    const n = checkPlan(st, s, plan, st.toPlace[s], false);
    for (const t in plan) st.armies[t] += plan[t] | 0;
    st.toPlace[s] -= n;
    event(st, {k: 'place', s, plan: cleanPlan(plan)});
    if (!st.toPlace[s]) { st.phase = st.resume || 'attack'; st.resume = null; }
  }

  // ---------- Attaque ----------
  // Le défenseur lance automatiquement le maximum de dés (2, ou 1 s'il n'a qu'une armée).
  function attack(st, s, from, to, dice, rng, blitz) {
    if (st.turn !== s || st.phase !== 'attack') throw err('Ce n’est pas le moment d’attaquer.');
    if (!TERR[from] || !TERR[to] || st.owner[from] !== s) throw err('Choisis un de tes territoires pour attaquer.');
    if (st.owner[to] === s) throw err('Tu ne peux pas attaquer ton propre territoire.');
    if (!TERR[from].adj.includes(to)) throw err('Ces territoires ne sont pas voisins.');
    if (st.armies[from] < 2) throw err('Il faut au moins 2 armées pour attaquer.');
    const rolls = [];
    let dl = 0, al = 0, won = false;
    do {
      const nd = Math.min(blitz ? 3 : Number(dice) || 3, 3, st.armies[from] - 1);
      if (nd < 1) break;
      const def = st.owner[to], ddn = Math.min(2, st.armies[to]);
      st.tstat.seen[to] = Math.max(st.tstat.seen[to] || 0, st.armies[to]);
      const ad = Array.from({length: nd}, () => die(rng)).sort((a, b) => b - a);
      const dd = Array.from({length: ddn}, () => die(rng)).sort((a, b) => b - a);
      let gold = false;
      if (st.gold[s] > 0) { st.gold[s] -= 1; ad[0] = Math.min(6, ad[0] + 1); gold = true; ad.sort((a, b) => b - a); }
      let a1 = 0, d1 = 0;
      for (let i = 0; i < Math.min(ad.length, dd.length); i++) { if (ad[i] > dd[i]) d1++; else a1++; }
      st.armies[from] -= a1; st.armies[to] -= d1; al += a1; dl += d1;
      st.tstat.kills[def] = (st.tstat.kills[def] || 0) + a1;
      rolls.push({ad, dd, al: a1, dl: d1, gold});
      if (nd === 1 && ddn === 2 && d1 > 0) mission(st, s, 'david', rng);
      if ((st.tstat.kills[def] || 0) >= 6) mission(st, def, 'wall', rng);
      if (st.armies[to] === 0) { won = true; break; }
    } while (blitz && st.armies[from] > 1);
    const def = st.owner[to];
    event(st, {k: 'attack', s, def, from, to, rolls, al, dl, won});
    if (won) conquer(st, s, def, from, to, rolls[rolls.length - 1].ad.length, rng);
    return {won, rolls};
  }
  function conquer(st, s, def, from, to, minMove, rng) {
    const seen = st.tstat.seen[to] || 0;
    st.owner[to] = s;
    st.tstat.conq += 1; st.tstat.card = true;
    const c = TERR[to].cont;
    if (!st.tstat.conts.includes(c)) st.tstat.conts.push(c);
    if (seen >= 5) mission(st, s, 'fort5', rng);
    if ((from === 'alaska' && to === 'kamchatka') || (from === 'kamchatka' && to === 'alaska')) mission(st, s, 'bering', rng);
    if (st.tstat.conq >= 5) mission(st, s, 'conq5', rng);
    if (st.tstat.conts.length >= 3) mission(st, s, 'cont3', rng);
    const max = st.armies[from] - 1, min = Math.min(minMove, max);
    st.move = {from, to, min, max};
    event(st, {k: 'conquer', s, def, from, to});
    // joueur éliminé : ses cartes passent au vainqueur
    if (!IDS.some(t => st.owner[t] === def)) {
      st.alive[def] = false; st.elim.push(def);
      st.hands[s].push(...st.hands[def]); st.hands[def] = [];
      event(st, {k: 'elim', s, def});
      mission(st, s, 'elim', rng);
    }
    if (IDS.every(t => st.owner[t] === s)) { st.armies[to] += max; st.armies[from] -= max; st.move = null; st.phase = 'done'; st.winner = s; event(st, {k: 'win', s}); return; }
    if (min === max) { doMove(st, s, max); return; }
    st.phase = 'move';
  }
  function moveIn(st, s, n) {
    if (st.turn !== s || st.phase !== 'move' || !st.move) throw err('Rien à déplacer.');
    n = Number(n);
    if (!Number.isInteger(n) || n < st.move.min || n > st.move.max) throw err(`Déplace entre ${st.move.min} et ${st.move.max} armées.`);
    doMove(st, s, n);
  }
  function doMove(st, s, n) {
    const m = st.move;
    st.armies[m.from] -= n; st.armies[m.to] += n; st.move = null;
    event(st, {k: 'move', s, from: m.from, to: m.to, n});
    st.phase = 'attack';
    // 6 cartes ou plus après une élimination : échange immédiat, puis on reprend l'attaque
    if (st.hands[s].length >= 6) { st.phase = 'reinforce'; st.resume = 'attack'; st.mustTrade = true; }
  }
  function endAttack(st, s) {
    if (st.turn !== s || st.phase !== 'attack') throw err('Ce n’est pas le moment.');
    st.phase = 'fortify';
  }

  // ---------- Déplacement de fin de tour ----------
  // Une seule fois, entre deux territoires reliés par tes propres territoires
  function connected(st, s, from, to) {
    const seen = new Set([from]), q = [from];
    while (q.length) { const x = q.shift(); if (x === to) return true; for (const y of TERR[x].adj) if (!seen.has(y) && st.owner[y] === s) { seen.add(y); q.push(y); } }
    return false;
  }
  function fortify(st, s, from, to, n, rng) {
    if (st.turn !== s || st.phase !== 'fortify') throw err('Ce n’est pas le moment de déplacer.');
    n = Number(n);
    if (!TERR[from] || !TERR[to] || st.owner[from] !== s || st.owner[to] !== s || from === to) throw err('Choisis deux de tes territoires.');
    if (!Number.isInteger(n) || n < 1 || n > st.armies[from] - 1) throw err('Il doit rester au moins 1 armée.');
    if (!connected(st, s, from, to)) throw err('Ces territoires ne sont pas reliés par les tiens.');
    st.armies[from] -= n; st.armies[to] += n;
    event(st, {k: 'fortify', s, from, to, n});
    endTurn(st, s, rng);
  }
  function endTurn(st, s, rng) {
    if (st.turn !== s || (st.phase !== 'fortify' && st.phase !== 'attack')) throw err('Ce n’est pas le moment de finir ton tour.');
    if (st.tstat.card && st.deck.length) { const c = st.deck.shift(); st.hands[s].push(c); event(st, {k: 'card', s}); }
    // missions vérifiées en fin de tour
    const tr = st.track[s];
    tr.oce = holdsCont(st, s, 'oc') ? tr.oce + 1 : 0;
    if (tr.oce >= 2) mission(st, s, 'oce2', rng);
    if (IDS.some(t => st.owner[t] === s && st.armies[t] >= 15)) mission(st, s, 'stack15', rng);
    if (['mideast', 'afghanistan', 'china'].every(t => st.owner[t] === s)) mission(st, s, 'silk', rng);
    if (contsOf(st, s).length >= 2) mission(st, s, 'cont2', rng);
    // joueur suivant encore en vie
    const i = st.order.indexOf(s);
    for (let k = 1; k <= st.P; k++) {
      const x = st.order[(i + k) % st.P];
      if (st.alive[x]) { if ((i + k) % st.P <= i) st.round += 1; startTurn(st, x); return; }
    }
  }
  function mission(st, s, id, rng) {
    if (!st.missionsOn || !st.alive[s]) return;
    const k = st.missions[s].indexOf(id);
    if (k < 0) return;
    const r = MISSIONS[id].reward;
    st.missions[s].splice(k, 1);
    st.done[s].push(id);
    if (r.armies) { if (st.turn === s && st.phase === 'reinforce') st.toPlace[s] += r.armies; else st.bonus[s] += r.armies; }
    if (r.card && st.deck.length) st.hands[s].push(st.deck.shift());
    if (r.gold) st.gold[s] += 1;
    event(st, {k: 'mission', s, m: id, text: MISSIONS[id].text, reward: rewardText(r)});
    drawMission(st, s, rng);
  }

  // ---------- Bots ----------
  const LV = {easy: {ratio: 2.5, rand: .5}, normal: {ratio: 1.6, rand: .15}, hard: {ratio: 1.25, rand: 0}};
  const enemies = (st, s, t) => TERR[t].adj.filter(x => st.owner[x] !== s);
  const border = (st, s) => owned(st, s).filter(t => enemies(st, s, t).length);
  // Intérêt d'un territoire : continent presque à soi, menace des voisins
  function contScore(st, s, c) { const tt = CONT[c].terr, mine = tt.filter(t => st.owner[t] === s).length; return mine / tt.length + CONT[c].bonus / 20 - tt.length / 60; }
  function bestFront(st, s, rng, lv) {
    const B = border(st, s);
    if (!B.length) return owned(st, s)[0];
    if (rng() < lv.rand) return B[Math.floor(rng() * B.length)];
    let best = B[0], bs = -1e9;
    for (const t of B) {
      const weak = Math.min(...enemies(st, s, t).map(x => st.armies[x]));
      const sc = contScore(st, s, TERR[t].cont) * 10 + (st.armies[t] - weak) * .3 + rng() * .5;
      if (sc > bs) { bs = sc; best = t; }
    }
    return best;
  }
  // Joue UNE action pour le bot s (le serveur boucle tant que c'est à un bot)
  function botAct(st, s, rng) {
    const lv = LV[st.bots[s]] || LV.normal;
    if (st.phase === 'claim') {
      if (st.turn !== s) return false;
      const free = IDS.filter(t => st.owner[t] === null);
      let best = free[0], bs = -1e9;
      for (const t of free) {
        const c = CONT[TERR[t].cont], mineC = c.terr.filter(x => st.owner[x] === s).length, foe = c.terr.filter(x => st.owner[x] !== null && st.owner[x] !== s).length;
        const sc = (mineC * 2 - foe) / c.terr.length + c.bonus / c.terr.length * .3 + TERR[t].adj.filter(x => st.owner[x] === s).length * .25 + rng() * (lv.rand + .2);
        if (sc > bs) { bs = sc; best = t; }
      }
      claim(st, s, best); return true;
    }
    if (st.phase === 'setup') {
      if (st.setupDone[s]) return false;
      const plan = {};
      for (let i = 0; i < st.toPlace[s]; i++) { const t = bestFront(st, s, rng, lv); plan[t] = (plan[t] || 0) + 1; }
      setupPlace(st, s, plan); return true;
    }
    if (st.turn !== s) return false;
    if (st.phase === 'reinforce') {
      const set = canTradeAny(st.hands[s]);
      if (set && (st.mustTrade || lv !== LV.easy)) { trade(st, s, set, rng); return true; }
      const t = bestFront(st, s, rng, lv);
      place(st, s, {[t]: st.toPlace[s]}); return true;
    }
    if (st.phase === 'move') {
      const m = st.move, stillBorder = enemies(st, s, m.from).length > 0;
      moveIn(st, s, stillBorder ? Math.max(m.min, Math.floor(m.max / 2)) : m.max); return true;
    }
    if (st.phase === 'attack') {
      let best = null, bs = 0;
      for (const f of border(st, s)) for (const x of enemies(st, s, f)) {
        if (st.armies[f] < 2) continue;
        const r = (st.armies[f] - 1) / st.armies[x];
        const sc = r + contScore(st, s, TERR[x].cont) * .6 + (st.alive[st.owner[x]] && owned(st, st.owner[x]).length === 1 ? .8 : 0);
        if (r >= lv.ratio && sc > bs) { bs = sc; best = [f, x]; }
      }
      if (best && (st.tstat.attacks = (st.tstat.attacks || 0) + 1) <= 40) { attack(st, s, best[0], best[1], 3, rng, true); return true; }
      endAttack(st, s); return true;
    }
    if (st.phase === 'fortify') {
      // la plus grosse pile de l'intérieur part vers le front
      const inner = owned(st, s).filter(t => !enemies(st, s, t).length && st.armies[t] > 1).sort((a, b) => st.armies[b] - st.armies[a]);
      if (inner.length) {
        const f = inner[0], targets = border(st, s).filter(t => connected(st, s, f, t));
        if (targets.length) { const to = targets.sort((a, b) => st.armies[a] - st.armies[b])[0]; fortify(st, s, f, to, st.armies[f] - 1, rng); return true; }
      }
      endTurn(st, s, rng); return true;
    }
    return false;
  }
  // Qui doit agir maintenant (sièges)
  function actors(st) {
    if (st.phase === 'done') return [];
    if (st.phase === 'setup') return st.players.map((_, s) => s).filter(s => !st.setupDone[s]);
    if (st.phase === 'claim') return [st.turn];
    return st.turn === null ? [] : [st.turn];
  }
  // Coup automatique pour un humain absent (déclenché par un admin) : joue son tour comme un bot normal
  function autoTurn(st, s, rng) {
    const lv = st.bots[s];
    st.bots[s] = 'normal';
    try {
      if (st.phase === 'setup' || st.phase === 'claim') return botAct(st, s, rng);
      const start = st.turn;
      for (let i = 0; i < 300 && st.turn === start && st.phase !== 'done'; i++) if (!botAct(st, s, rng)) break;
    } finally { if (lv) st.bots[s] = lv; else delete st.bots[s]; }
  }
  // Joue tous les coups des bots jusqu'à ce qu'un humain doive agir
  function runBots(st, rng) {
    for (let i = 0; i < 5000; i++) {
      const a = actors(st).filter(s => st.bots[s]);
      if (!a.length) return;
      if (!botAct(st, a[0], rng)) return;
    }
  }

  // ---------- Vue d'un joueur ----------
  function view(st, s) {
    const me = s >= 0 && s < st.P ? s : -1;
    const v = {phase: st.phase, P: st.P, players: st.players, bots: st.bots, order: st.order, turn: st.turn, round: st.round, alive: st.alive,
      owner: st.owner, armies: st.armies, toPlace: st.toPlace, setupDone: st.setupDone, trades: st.trades, nextTrade: tradeValue(st.trades),
      cardCount: st.hands.map(h => h.length), missionCount: st.missions.map(m => m.length), done: st.done, gold: st.gold,
      move: st.move, mustTrade: st.turn === me ? st.mustTrade : false, ev: st.ev, seq: st.seq, winner: st.winner, elim: st.elim,
      conquered: st.tstat && st.tstat.s === st.turn ? st.tstat.conq : 0, me};
    if (me >= 0) { v.hand = st.hands[me].slice(); v.missions = st.missions[me].slice(); v.bonus = st.bonus[me]; }
    return v;
  }

  const api = {T, TERR, IDS, CONT, ANIMAL, animalOf, CARD_KIND, MISSIONS, START, tradeValue, setKind, canTradeAny, reinforcements, connected,
    newGame, claim, setupPlace, trade, place, attack, moveIn, endAttack, fortify, endTurn, botAct, runBots, autoTurn, actors, view, shuffle, rewardText};
  globalThis.RiskEngine = Object.freeze(api);
})();
