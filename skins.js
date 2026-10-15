/* Skins : recolore le yéti du SWF, lui pose une tête emoji et teinte le pingouin selon le podium, au chargement, dans le navigateur. */
(() => {
  'use strict';

  // Échelle calibrée sur les scores du club (médiane ≈ 230 m, 90 % ≈ 300 m, record ≈ 400 m, 500 m quasi inatteignable).
  // Chaque skin garde le corps animé du yéti (bras, jambes, lancer) : fourrure recolorée + tête emoji.
  // kind : 'base' | 'record' (record perso) | 'defi' (formule) | 'ultra' (ultra rare) | 'curse' (imposé automatiquement)
  const parisHour = d => Number(new Intl.DateTimeFormat('fr-FR', {timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23'}).format(new Date(d)));
  const streak = (list, n, ok) => { let run = 0; for (const s of list) { run = ok(s.score) ? run + 1 : 0; if (run >= n) return true; } return false; };
  const count = (list, ok) => list.filter(s => ok(s.score)).length;
  const last = (list, n, ok) => list.length >= n && list.slice(-n).every(s => ok(s.score));
  const SKINS = [
    {id:'yeti',   kind:'base',   emoji:null, fur:null,                  name:'Le Yéti',          tag:'L’original'},
    // Paliers de record
    {id:'pig',    kind:'record', min:50,  emoji:'🐷', fur:['#6e2f3f','#ffc7d4'], name:'Le cochon',      tag:'Groin groin'},
    {id:'frog',   kind:'record', min:100, emoji:'🐸', fur:['#173f17','#a6e07c'], name:'La grenouille',  tag:'Ça saute'},
    {id:'panda',  kind:'record', min:150, emoji:'🐼', fur:['#101010','#f4f4f4'], name:'Le panda',       tag:'Mange, dort, lance'},
    {id:'monkey', kind:'record', min:200, emoji:'🐵', fur:['#3b220f','#cf9a6a'], name:'Le singe',       tag:'Retour aux origines'},
    {id:'bear',   kind:'record', min:250, emoji:'🐻', fur:['#2d1709','#a8713f'], name:'L’ours',         tag:'Câlin brutal'},
    {id:'clown',  kind:'record', min:300, emoji:'🤡', fur:['#4b1470','#ffc9f0'], name:'Le clown',       tag:'On rigole moins'},
    {id:'tiger',  kind:'record', min:330, emoji:'🐯', fur:['#6b2f00','#ffb24a'], name:'Le tigre',       tag:'Œil du tigre'},
    {id:'lion',   kind:'record', min:360, emoji:'🦁', fur:['#5c3d08','#f6cf63'], name:'Le lion',        tag:'Roi de la banquise'},
    {id:'fox',    kind:'record', min:380, emoji:'🦊', fur:['#6e2a00','#ff9a4a'], name:'Le renard',      tag:'Malin comme pas deux'},
    {id:'alien',  kind:'record', min:400, emoji:'👽', fur:['#124a2b','#a9f2c4'], name:'L’alien',        tag:'Gros crack confirmé'},
    {id:'shark',  kind:'record', min:410, emoji:'🦈', fur:['#0f2a44','#8fc3e8'], name:'Le requin',      tag:'Ça mord fort'},
    {id:'dragon', kind:'record', min:420, emoji:'🐲', fur:['#0d3d1f','#7ee08f'], name:'Le dragon',      tag:'Crache du feu'},
    {id:'eagle',  kind:'record', min:430, emoji:'🦅', fur:['#2b1a0c','#e9d3a8'], name:'L’aigle',        tag:'Vue d’en haut'},
    {id:'unicorn',kind:'record', min:440, emoji:'🦄', fur:['#5a2a7a','#f6d6ff'], name:'La licorne',     tag:'Ça n’existe pas'},
    {id:'wizard', kind:'record', min:450, emoji:'🧙', fur:['#1f1a5c','#a9a2ff'], name:'Le sorcier',     tag:'Magie noire'},
    {id:'robot',  kind:'record', min:460, emoji:'🤖', fur:['#26313b','#d3dee8'], name:'Le robot',       tag:'Suspicion de triche'},
    {id:'devil',  kind:'record', min:470, emoji:'😈', fur:['#3d0a3d','#e07be0'], name:'Le diable',      tag:'Pacte signé'},
    {id:'ogre',   kind:'record', min:480, emoji:'👹', fur:['#5a0b0b','#ff7b6b'], name:'L’ogre',         tag:'Il a faim de mètres'},
    {id:'skull',  kind:'record', min:490, emoji:'💀', fur:['#1a1a1a','#e8e8e8'], name:'La légende',     tag:'Mort de rire'},
    {id:'prime',  kind:'record', min:500, emoji:'👑', fur:['#4f3300','#ffe98a'], hat:true, name:'PRIME', tag:'Le roi des yétis'},
    // Défis
    {id:'sniper', kind:'defi', emoji:'🎯', fur:['#3a0d12','#ff8a8a'], name:'Le sniper',      tag:'5 lancers de suite ≥ 250 m', test:l => streak(l, 5, v => v >= 250)},
    {id:'fire',   kind:'defi', emoji:'🔥', fur:['#5a1500','#ffb14a'], name:'En feu',         tag:'3 lancers de suite ≥ 300 m', test:l => streak(l, 3, v => v >= 300)},
    {id:'yoyo',   kind:'defi', emoji:'🎢', fur:['#1d3a6e','#9ec5ff'], name:'Le yo-yo',       tag:'< 50 m puis ≥ 350 m juste après', test:l => l.some((s, i) => i && l[i - 1].score < 50 && s.score >= 350)},
    {id:'jackpot',kind:'defi', emoji:'🤑', fur:['#0f4d25','#9bf0a8'], name:'Le jackpot',     tag:'Faire pile 111, 222, 333 ou 444 m', test:l => l.some(s => [111, 222, 333, 444].includes(Math.floor(s.score)))},
    {id:'owl',    kind:'defi', emoji:'🦉', fur:['#2a2238','#b9a7d6'], name:'Le noctambule',  tag:'Un lancer entre minuit et 5 h', test:l => l.some(s => parisHour(s.played_at) < 5)},
    {id:'ghost',  kind:'defi', emoji:'👻', fur:['#555b66','#ffffff'], name:'Le revenant',    tag:'Revenir après 7 jours sans jouer', test:l => l.some((s, i) => i && Date.parse(s.played_at) - Date.parse(l[i - 1].played_at) >= 7 * 864e5)},
    {id:'turtle', kind:'defi', emoji:'🐢', fur:['#1f4a2a','#9ed39b'], name:'Le marathonien', tag:'50 lancers au compteur', test:l => l.length >= 50},
    {id:'fossil', kind:'defi', emoji:'🦖', fur:['#2f3d12','#c8e06a'], name:'Le fossile',     tag:'100 lancers au compteur', test:l => l.length >= 100},
    {id:'boss',   kind:'defi', emoji:'😎', fur:['#101820','#8fa6bd'], name:'Le boss',        tag:'10 lancers ≥ 300 m', test:l => count(l, v => v >= 300) >= 10},
    // Ultra rares
    {id:'meteor', kind:'ultra', emoji:'☄️', fur:['#3a1600','#ffb066'], name:'Le météore', tag:'1 lancer ≥ 400 m', test:l => count(l, v => v >= 400) >= 1},
    {id:'ninja',  kind:'ultra', emoji:'🥷', fur:['#0a0a0a','#5c5c66'], name:'Le ninja',   tag:'2 lancers ≥ 400 m', test:l => count(l, v => v >= 400) >= 2},
    {id:'vampire',kind:'ultra', emoji:'🧛', fur:['#2a0008','#c2183a'], name:'Le vampire', tag:'3 lancers ≥ 400 m', test:l => count(l, v => v >= 400) >= 3},
    {id:'genie',  kind:'ultra', emoji:'🧞', fur:['#06284f','#5ec8ff'], name:'Le génie',   tag:'5 lancers ≥ 400 m', test:l => count(l, v => v >= 400) >= 5},
    {id:'cosmic', kind:'ultra', emoji:'🌌', fur:['#14063a','#c9a6ff'], name:'Le cosmique',tag:'10 lancers ≥ 400 m', test:l => count(l, v => v >= 400) >= 10},
    // Malédictions (imposées, priorité dans l'ordre)
    {id:'poop',   kind:'curse', emoji:'💩', fur:['#2e1b0e','#b9844f'], name:'Le caca',    tag:'3 lancers de suite < 50 m', until:'Fais 50 m ou plus pour t’en débarrasser.', test:l => last(l, 3, v => v < 50)},
    {id:'snail',  kind:'curse', emoji:'🐌', fur:['#4a3a1a','#d9c48c'], name:'L’escargot', tag:'5 lancers de suite < 150 m', until:'Fais 150 m ou plus pour t’en débarrasser.', test:l => last(l, 5, v => v < 150)},
    {id:'imany',  kind:'perso', owner:'imany', photo:'skins/imany.png', emoji:'👩', name:'Imany', tag:'Skin perso, réservé à Imany'},
  ];
  // Couleur du pingouin selon le podium du club : [ombres, lumières].
  // Pingouin trophée : lingot poli, opaque, reflets marqués + contour. Purement visuel : aucune influence sur le jeu.
  const PODIUM = {
    gold:   {ramp:['#3d2200','#8a5600','#d69a00','#ffcf1a','#fff07a','#fffbe6'], line:'#2e1900'},
    silver: {ramp:['#12161a','#475059','#8a94a0','#c9d1da','#f2f5f8','#ffffff'], line:'#1a1e22'},
    bronze: {ramp:['#260c01','#66290a','#a3501c','#dc8240','#ffbf85','#ffeedd'], line:'#2a1003'},
  };
  const YETI_IDS = new Set(), PENGUIN_IDS = new Set();
  for (let id = 168; id <= 297; id++) YETI_IDS.add(id);
  for (let id = 106; id <= 132; id++) PENGUIN_IDS.add(id);
  const FLOE_TOP = 112;

  let original = null;
  const cache = new Map();

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d', {willReadFrequently: true})];
  }

  // Décode une image du SWF en RGBA non prémultiplié.
  async function decode(code, body) {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    if (code === 35) {
      const alphaOffset = view.getUint32(2, true);
      let jpeg = body.subarray(6, 6 + alphaOffset);
      if (jpeg[0] === 0xff && jpeg[1] === 0xd9 && jpeg[2] === 0xff && jpeg[3] === 0xd8) jpeg = jpeg.subarray(4);
      // Les SWF séparent souvent tables et image par FFD9 FFD8 : on recolle en un seul flux JPEG.
      for (let i = 2; i < jpeg.length - 3; i++) if (jpeg[i] === 0xff && jpeg[i + 1] === 0xd9 && jpeg[i + 2] === 0xff && jpeg[i + 3] === 0xd8) {
        const joined = new Uint8Array(jpeg.length - 4); joined.set(jpeg.subarray(0, i)); joined.set(jpeg.subarray(i + 4), i); jpeg = joined; break;
      }
      const bitmap = await createImageBitmap(new Blob([jpeg], {type: 'image/jpeg'}));
      const [, ctx] = canvas(bitmap.width, bitmap.height); ctx.drawImage(bitmap, 0, 0);
      const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const alpha = await inflate(body.subarray(6 + alphaOffset));
      for (let i = 0; i < alpha.length; i++) {
        const a = alpha[i], p = i * 4; img.data[p + 3] = a;
        if (a && a < 255) for (let k = 0; k < 3; k++) img.data[p + k] = Math.min(255, Math.round(img.data[p + k] * 255 / a));
      }
      return img;
    }
    // DefineBitsLossless2, format 5 (ARGB prémultiplié)
    const w = view.getUint16(3, true), h = view.getUint16(5, true);
    const argb = await inflate(body.subarray(7));
    const img = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const a = argb[i * 4], p = i * 4; img.data[p + 3] = a;
      for (let k = 0; k < 3; k++) img.data[p + k] = a ? Math.min(255, Math.round(argb[i * 4 + 1 + k] * 255 / a)) : 0;
    }
    return img;
  }

  async function encodeLossless(id, img) {
    const {width: w, height: h, data} = img, argb = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3]; argb[i * 4] = a;
      for (let k = 0; k < 3; k++) argb[i * 4 + 1 + k] = Math.round(data[i * 4 + k] * a / 255);
    }
    const z = await deflate(argb), body = new Uint8Array(7 + z.length), v = new DataView(body.buffer);
    v.setUint16(0, id, true); body[2] = 5; v.setUint16(3, w, true); v.setUint16(5, h, true); body.set(z, 7);
    return body;
  }

  // Pingouin tenu par le yéti (écran de rotation) : on repère ses pixels (ventre blanc, bec jaune, dos noir sous le cou).
  function heldPenguinMask(img) {
    const {width: w, height: h, data} = img, N = w * h;
    const lumAt = i => (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    const op = i => data[i * 4 + 3] > 30;
    let top = -1;
    for (let y = 0; y < FLOE_TOP && top < 0; y++) { let n = 0; for (let x = 0; x < w; x++) if (op(y * w + x)) n++; if (n >= 3) top = y; }
    if (top < 0) return null;
    const yMin = Math.ceil(top + 0.25 * (FLOE_TOP - top)), yMax = FLOE_TOP - 2;
    // 1) Plus grande tache blanche (ventre du pingouin) : les petits reflets du poil sont ignorés.
    const seen = new Uint8Array(N); let best = null;
    for (let y = yMin; y < yMax; y++) for (let x = 0; x < w; x++) {
      const i0 = y * w + x; if (seen[i0] || !op(i0) || lumAt(i0) < 0.84) continue;
      const comp = [], q = [i0]; seen[i0] = 1;
      while (q.length) { const i = q.pop(); comp.push(i); const cx = i % w, cy = (i / w) | 0;
        for (const j of [i - 1, i + 1, i - w, i + w]) { const jx = j % w, jy = (j / w) | 0; if (j < 0 || j >= N || Math.abs(jx - cx) > 1 || jy < yMin || jy >= yMax || seen[j] || !op(j) || lumAt(j) < 0.84) continue; seen[j] = 1; q.push(j); } }
      // La banquise est large et collée en bas : on l'écarte.
      let minX = w, maxX = 0, maxY = 0; for (const i of comp) { const cx = i % w, cy = (i / w) | 0; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy); }
      let minY = h; for (const i of comp) minY = Math.min(minY, (i / w) | 0);
      if (maxX - minX > 40 || maxY - minY < 6 || minY > FLOE_TOP - 10) continue; // éclats de banquise, pas le pingouin
      if (comp.length >= 25 && (!best || comp.length > best.length)) best = comp;
    }
    if (!best) return null;
    const m = new Uint8Array(N); let bx0 = w, bx1 = 0, by0 = h, by1 = 0;
    for (const i of best) { m[i] = 1; const x = i % w, y = (i / w) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    bx0 -= 10; bx1 += 10; by0 -= 6; by1 = Math.min(FLOE_TOP - 5, by1 + 10);
    // 1b) Franchit le bord flou entre le ventre et le dos.
    for (let pass = 0; pass < 2; pass++) { const add = [];
      for (let y = Math.max(1, by0); y <= Math.min(h - 2, by1); y++) for (let x = Math.max(1, bx0); x <= Math.min(w - 2, bx1); x++) {
        const i = y * w + x; if (m[i] || !op(i) || (y >= FLOE_TOP - 2 && lumAt(i) > 0.6)) continue;
        if (m[i - 1] || m[i + 1] || m[i - w] || m[i + w]) add.push(i);
      } for (const i of add) m[i] = 1; }
    // 2) Étend au dos noir, au bec/pattes jaunes et au blanc flou voisins.
    for (let pass = 0; pass < 12; pass++) for (let y = Math.max(0, by0); y <= by1; y++) for (let x = Math.max(1, bx0); x <= Math.min(w - 2, bx1); x++) {
      const i = y * w + x; if (m[i] || !op(i)) continue;
      if (!(m[i - 1] || m[i + 1] || (i >= w && m[i - w]) || (i + w < N && m[i + w]))) continue;
      const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2], l = lumAt(i), sat = Math.max(r, g, b) - Math.min(r, g, b);
      const ice = y >= FLOE_TOP - 2 && l > 0.6;
      if (!ice && (l > 0.74 || l < 0.36 || (r > 140 && g > 100 && b < 110 && sat > 50))) m[i] = 1;
    }
    return m;
  }

  function yetiFrame(img, skin, tint) {
    let out = img;
    if (skin.id !== 'yeti' && window.YetiCostumes && window.YetiCostumes.has(skin.id)) out = window.YetiCostumes.dress(img, skin.id, FLOE_TOP) || img;
    if (tint) {
      const m = heldPenguinMask(img);
      if (m) {
        const ramp = tint.ramp.map(hex), o = new ImageData(new Uint8ClampedArray(out.data), out.width, out.height);
        const shade = t => { t = Math.min(1, Math.max(0, t)) * (ramp.length - 1); const i = Math.min(ramp.length - 2, Math.floor(t)), u = t - i; return ramp[i].map((c, k) => c + (ramp[i + 1][k] - c) * u); };
        for (let i = 0; i < m.length; i++) if (m[i]) {
          const p = i * 4, l = (0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2]) / 255;
          const c = shade(0.22 + 0.5 * l + 0.08 * Math.sin((i % out.width) * 0.9)); // le dos noir devient du métal sombre, le ventre blanc le reflet
          o.data[p] = c[0]; o.data[p + 1] = c[1]; o.data[p + 2] = c[2];
        }
        out = o;
      }
    }
    return out;
  }

  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function tintPenguin(img, {ramp, line}) {
    const r = ramp.map(hex), l = hex(line), {width: w, height: h, data} = img, out = new ImageData(w, h), o = out.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 60;
    let top = h, bottom = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { if (y < top) top = y; if (y > bottom) bottom = y; }
    const shade = t => { t = Math.min(1, Math.max(0, t)) * (r.length - 1); const i = Math.min(r.length - 2, Math.floor(t)), u = t - i; return r[i].map((c, k) => Math.round(c + (r[i + 1][k] - c) * u)); };
    for (let y = 0; y < h; y++) {
      let x0 = -1, x1 = -1;
      for (let x = 0; x < w; x++) if (solid(x, y)) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      const v = (y - top) / Math.max(1, bottom - top);
      for (let x = x0; x <= x1; x++) {
        if (!solid(x, y)) continue;
        const p = (y * w + x) * 4, edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
        let c;
        if (edge) c = shade(0.2); // bord fondu dans le métal au lieu d'un trait noir
        else {
          const u = (x - x0) / Math.max(1, x1 - x0);
          // Volume arrondi + reflet principal vif + liseré lumineux à droite + reflets diagonaux.
          let t = 0.32 + 0.38 * Math.sin(Math.PI * u) - 0.12 * v;
          t += 0.75 * Math.exp(-(((u - 0.3) / 0.11) ** 2));
          t += 0.30 * Math.exp(-(((u - 0.86) / 0.06) ** 2));
          const d = (x + y * 0.6) % 9; if (d < 1.2) t += 0.22;
          c = shade(t);
        }
        o[p] = c[0]; o[p + 1] = c[1]; o[p + 2] = c[2]; o[p + 3] = edge ? 170 : 255;
      }
    }
    // Éclats de brillance.
    const sparkle = (x, y) => { for (const [dx, dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (solid(xx, yy)) { const p = (yy * w + xx) * 4; o[p] = o[p + 1] = o[p + 2] = 255; } } };
    let n = 0; for (let y = top + 6; y < bottom - 4 && n < 3; y += Math.max(8, Math.round((bottom - top) / 3.2))) {
      let x0 = -1, x1 = -1; for (let x = 0; x < w; x++) if (solid(x, y)) { if (x0 < 0) x0 = x; x1 = x; }
      if (x1 - x0 > 6) { sparkle(Math.round(x0 + (x1 - x0) * (n % 2 ? 0.7 : 0.32)), y); n++; }
    }
    return out;
  }

  async function patch(skin, tintName) {
    if (!original) original = new Uint8Array(await (await fetch('game.swf?v=1', {cache: 'force-cache'})).arrayBuffer());
    const src = original, tint = PODIUM[tintName] || null;
    if (src[0] !== 0x46) throw new Error('Format de jeu inattendu');
    const nbits = src[8] >> 3, headerEnd = 8 + Math.ceil((5 + 4 * nbits) / 8) + 4;
    const parts = [src.subarray(0, headerEnd)], dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    let pos = headerEnd;
    while (pos < src.length) {
      const start = pos, h = dv.getUint16(pos, true), code = h >> 6; let len = h & 63; pos += 2;
      if (len === 63) { len = dv.getUint32(pos, true); pos += 4; }
      const body = src.subarray(pos, pos + len); pos += len;
      const id = (code === 35 || code === 36 || code === 20) ? body[0] | (body[1] << 8) : -1;
      const yeti = (skin.id !== 'yeti' || tint) && YETI_IDS.has(id) && (code === 35 || (code === 36 && body[2] === 5));
      const peng = tint && PENGUIN_IDS.has(id) && (code === 35 || (code === 36 && body[2] === 5));
      if (yeti || peng) {
        const img = await decode(code, body);
        const nb = await encodeLossless(id, yeti ? yetiFrame(img, skin, tint) : tintPenguin(img, tint));
        const head = new Uint8Array(6), hv = new DataView(head.buffer);
        hv.setUint16(0, (36 << 6) | 63, true); hv.setUint32(2, nb.length, true);
        parts.push(head, nb);
      } else parts.push(src.subarray(start, pos));
      if (code === 0) break;
    }
    const total = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    new DataView(out.buffer).setUint32(4, total, true);
    return out.buffer;
  }

  window.YetiSkins = Object.freeze({
    list: SKINS,
    byId(id) { return SKINS.find(s => s.id === id) || SKINS[0]; },
    // scores : lancers d'un joueur. Renvoie les skins débloqués et l'éventuelle malédiction en cours.
    evaluate(scores, ownerName) {
      const list = [...scores].sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at) || String(a.id).localeCompare(String(b.id)));
      const best = list.reduce((m, s) => Math.max(m, s.score), 0), unlocked = new Set(['yeti']);
      for (const k of SKINS) {
        if (k.kind === 'record' && best >= k.min) unlocked.add(k.id);
        if ((k.kind === 'defi' || k.kind === 'ultra') && k.test(list)) unlocked.add(k.id);
        if (k.kind === 'perso' && ownerName && ownerName.trim().toLowerCase() === k.owner) unlocked.add(k.id);
      }
      const curse = SKINS.find(k => k.kind === 'curse' && k.test(list)) || null;
      const next = SKINS.find(k => k.kind === 'record' && k.min > best) || null;
      return {best, unlocked, curse, next};
    },
    async build(id, tintName) {
      const skin = this.byId(id), tint = PODIUM[tintName] ? tintName : null;
      if (skin.id === 'yeti' && !tint) return null; // jeu d'origine
      if (window.YetiCostumes && window.YetiCostumes.ready) await window.YetiCostumes.ready;
      const key = skin.id + '|' + (tint || '');
      if (!cache.has(key)) cache.set(key, patch(skin, tint).catch(e => { cache.delete(key); throw e; }));
      return cache.get(key);
    },
  });
})();
