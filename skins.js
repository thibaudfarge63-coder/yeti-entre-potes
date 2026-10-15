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

  function yetiFrame(img, skin) {
    const {width: w, height: h, data} = img, [d, l] = skin.fur.map(hex);
    const out = new ImageData(new Uint8ClampedArray(data), w, h), o = out.data;
    let minY = h, maxY = 0, minX = w, maxX = 0;
    for (let y = 0; y < FLOE_TOP + 8; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4; if (o[p + 3] < 20) continue;
      const r = o[p], g = o[p + 1], b = o[p + 2], lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (y >= FLOE_TOP - 6 && lum > 0.72) continue; // glace de la banquise
      if (r > 150 && g > 110 && b < 90) continue;     // bec et pattes du pingouin
      const t = Math.min(1, Math.max(0, (lum - 0.15) / 0.75));
      for (let k = 0; k < 3; k++) o[p + k] = Math.round(d[k] + (l[k] - d[k]) * t);
      if (o[p + 3] > 60 && y < FLOE_TOP) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    const [, ctx] = canvas(w, h); ctx.putImageData(out, 0, 0);
    if (minY < maxY) {
      // Centre de la tête : moyenne des pixels opaques des premières rangées.
      let sx = 0, n = 0;
      for (let y = minY; y < Math.min(maxY, minY + 18); y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 60) { sx += x; n++; }
      const cx = n ? sx / n : (minX + maxX) / 2, lean = ((cx - (minX + maxX) / 2) / Math.max(10, maxX - minX)) * 0.6;
      const size = skin.hat ? 26 : 31, cy = skin.hat ? minY - 4 : minY + 14;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(lean);
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.fillText(skin.emoji, 0, 0); ctx.restore();
    }
    return ctx.getImageData(0, 0, w, h);
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
      const yeti = skin.emoji && YETI_IDS.has(id) && (code === 35 || (code === 36 && body[2] === 5));
      const peng = tint && PENGUIN_IDS.has(id) && (code === 35 || (code === 36 && body[2] === 5));
      if (yeti || peng) {
        const img = await decode(code, body);
        const nb = await encodeLossless(id, yeti ? yetiFrame(img, skin) : tintPenguin(img, tint));
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
    evaluate(scores) {
      const list = [...scores].sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at) || String(a.id).localeCompare(String(b.id)));
      const best = list.reduce((m, s) => Math.max(m, s.score), 0), unlocked = new Set(['yeti']);
      for (const k of SKINS) {
        if (k.kind === 'record' && best >= k.min) unlocked.add(k.id);
        if ((k.kind === 'defi' || k.kind === 'ultra') && k.test(list)) unlocked.add(k.id);
      }
      const curse = SKINS.find(k => k.kind === 'curse' && k.test(list)) || null;
      const next = SKINS.find(k => k.kind === 'record' && k.min > best) || null;
      return {best, unlocked, curse, next};
    },
    async build(id, tintName) {
      const skin = this.byId(id), tint = PODIUM[tintName] ? tintName : null;
      if (!skin.emoji && !tint) return null; // jeu d'origine
      const key = skin.id + '|' + (tint || '');
      if (!cache.has(key)) cache.set(key, patch(skin, tint).catch(e => { cache.delete(key); throw e; }));
      return cache.get(key);
    },
  });
})();
