// Tests du moteur Risk : node tests/risk-engine-test.mjs
import '../supabase/functions/yeti-risk/engine.js';
const E = globalThis.RiskEngine, out = [];
const ok = (name, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); out.push(`${pass ? '✅' : '❌'} ${name}${pass ? '' : ` : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`); };
let seed = 7; const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
ok('42 territoires', E.IDS.length, 42);
ok('Territoires par continent', Object.values(E.CONT).map(c => c.terr.length), [9, 4, 7, 6, 12, 4]);
ok('Voisinages symétriques', E.IDS.flatMap(t => E.TERR[t].adj.filter(x => !E.TERR[x] || !E.TERR[x].adj.includes(t)).map(x => t + '>' + x)), []);
ok('Échanges : 4 6 8 10 12 15 20', [0, 1, 2, 3, 4, 5, 6].map(E.tradeValue), [4, 6, 8, 10, 12, 15, 20]);
ok('Sets valides', [['alaska', 'alberta', 'wus'].map(t => E.CARD_KIND[t]), E.setKind(['alaska', 'nwt', 'greenland'])], [['soldat', 'soldat', 'soldat'], 'mix']);
ok('Set invalide', E.setKind(['alaska', 'nwt', 'ontario']), null);
ok('Chameaux au Moyen-Orient, tigres en Chine', [E.animalOf('mideast'), E.animalOf('china'), E.animalOf('wus')], ['chameau', 'tigre', 'taureau']);
// Partie à 3 : distribution
const st = E.newGame({players: [1, 2, 3]}, rng);
ok('Au départ, le monde est vide', [st.phase, E.IDS.every(t => st.owner[t] === null)], ['claim', true]);
let thr = ''; try { E.claim(st, (st.turn + 1) % 3, 'alaska'); } catch (e) { thr = e.message; } ok('Pas de choix hors de son tour', thr.length > 0, true);
const t0 = st.turn; E.claim(st, t0, 'alaska'); thr = ''; try { E.claim(st, st.turn, 'alaska'); } catch (e) { thr = e.message; }
ok('Territoire pris : refusé', [st.owner.alaska, thr.length > 0], [t0, true]);
while (st.phase === 'claim') E.claim(st, st.turn, E.IDS.find(t => st.owner[t] === null));
ok('Chaque territoire a 1 armée après les choix', E.IDS.every(t => st.armies[t] === 1), true);
ok('14 territoires chacun à 3', [0, 1, 2].map(s => E.IDS.filter(t => st.owner[t] === s).length), [14, 14, 14]);
ok('35 armées au total chacun', [0, 1, 2].map(s => E.IDS.filter(t => st.owner[t] === s).length + st.toPlace[s]), [35, 35, 35]);
ok('3 missions chacun', st.missions.map(m => m.length), [3, 3, 3]);
// placement de départ
for (let s = 0; s < 3; s++) { const t = E.IDS.find(x => st.owner[x] === s); E.setupPlace(st, s, {[t]: st.toPlace[s]}); }
ok('Après la mise en place : renforts du premier joueur', [st.phase, st.toPlace[st.turn]], ['reinforce', E.reinforcements(st, st.turn)]);
// Attaque forcée : on fabrique une situation
const s0 = st.turn, f = E.IDS.find(t => st.owner[t] === s0 && E.TERR[t].adj.some(x => st.owner[x] !== s0));
const to = E.TERR[f].adj.find(x => st.owner[x] !== s0);
E.place(st, s0, {[f]: st.toPlace[s0]}); st.armies[f] = 30; st.armies[to] = 1;
const r = E.attack(st, s0, f, to, 3, rng, true);
ok('Blitz 30 contre 1 : conquête', [r.won, st.owner[to]], [true, s0]);
ok('Phase déplacement après conquête', st.phase, 'move');
E.moveIn(st, s0, 3);
ok('Déplacement fait', [st.armies[to], st.phase], [3, 'attack']);
E.endAttack(st, s0); E.endTurn(st, s0, rng);
ok('Carte gagnée après une conquête', st.hands[s0].length >= 1, true);
let threw = ''; try { E.attack(st, st.turn, f, to, 3, rng); } catch (e) { threw = e.message; }
ok('Pas d’attaque pendant les renforts', threw.length > 0, true);
// Simulation : parties 100 % bots
let fin = 0, maxRounds = 0, missions = 0;
for (let g = 0; g < 60; g++) {
  const P = 2 + g % 6, lv = ['easy', 'normal', 'hard'];
  const s = E.newGame({players: Array.from({length: P}, (_, i) => -(i + 1)), bots: Object.fromEntries(Array.from({length: P}, (_, i) => [i, lv[(g + i) % 3]]))}, Math.random);
  for (let i = 0; i < 200 && s.phase !== 'done'; i++) E.runBots(s, Math.random);
  for (const t of E.IDS) if (s.armies[t] < 1 && s.phase !== 'done') throw new Error('armée < 1 ' + t);
  if (s.phase === 'done') fin++;
  maxRounds = Math.max(maxRounds, s.round); missions += s.done.flat().length;
}
ok('60 parties de bots terminées', fin, 60);
console.log(out.join('\n'));
console.log(`tours max ${maxRounds}, missions réussies ${missions}`);
if (out.some(l => l.startsWith('❌'))) process.exit(1);
