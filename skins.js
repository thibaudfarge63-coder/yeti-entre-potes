/* Skins : remplace le yéti du SWF par un emoji et teinte le pingouin, au chargement, dans le navigateur. */
(() => {
  'use strict';

  // Échelle calibrée sur les scores du club (médiane ≈ 230 m, 90 % ≈ 300 m, record ≈ 400 m, 500 m quasi inatteignable).
  const SKINS = [
    {id:'yeti',    min:0,   emoji:null, name:'Le Yéti',              tag:'L’original'},
    {id:'snail',   min:50,  emoji:'🐌', name:'L’escargot',           tag:'Ça avance… à peine'},
    {id:'potato',  min:100, emoji:'🥔', name:'La patate',            tag:'Lancer de tubercule'},
    {id:'poop',    min:150, emoji:'💩', name:'Le caca',              tag:'Fallait bien commencer'},
    {id:'chicken', min:200, emoji:'🐔', name:'Le poulet',            tag:'Cot cot, 200 m'},
    {id:'frog',    min:250, emoji:'🐸', name:'La grenouille',        tag:'Ça saute'},
    {id:'clown',   min:300, emoji:'🤡', name:'Le clown',             tag:'On rigole moins'},
    {id:'gorilla', min:330, emoji:'🦍', name:'Le gorille de salle',  tag:'Jamais skip leg day'},
    {id:'trex',    min:360, emoji:'🦖', name:'Le T-Rex',             tag:'Petits bras, gros lancers'},
    {id:'alien',   min:400, emoji:'👽', name:'L’alien',              tag:'Gros crack confirmé'},
    {id:'robot',   min:450, emoji:'🤖', name:'Le robot',             tag:'Suspicion de triche'},
    {id:'prime',   min:500, emoji:'👑', name:'PRIME',                tag:'Le roi des yétis'},
  ];
  // Couleur du pingouin par palier : [ombres, lumières]. Monte jusqu'à l'or au PRIME.
  const PENGUIN = {
    yeti:null, snail:null, potato:null,
    poop:['#4a2f1a','#e8d3bf'], chicken:['#7a3b10','#f3d1b0'], frog:['#1d5a2a','#cdeccf'],
    clown:['#5a1f6e','#ead2f2'], gorilla:['#5b3a1e','#e6c79f'], trex:['#5d5f66','#e9ebef'],
    alien:['#6a5a22','#f0e3a8'], robot:['#7c6512','#f7e7a0'], prime:['#4a3000','#fff6c2'],
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

  function yetiFrame(img, emoji) {
    const {width: w, height: h, data} = img;
    // Boîte englobante du yéti au-dessus de la banquise, pour suivre sa pose.
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < FLOE_TOP; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 60) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    // On ne garde que la banquise : tout ce qui est en dessous, plus la glace claire des rangées de transition.
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, r = data[p], g = data[p + 1], b = data[p + 2];
      const ice = y >= FLOE_TOP + 8 || (y >= FLOE_TOP - 6 && (r + g + b) / 3 > 185);
      if (ice) { out.data[p] = r; out.data[p + 1] = g; out.data[p + 2] = b; out.data[p + 3] = data[p + 3]; }
    }
    const [c, ctx] = canvas(w, h); ctx.putImageData(out, 0, 0);
    if (minX <= maxX) {
      const bh = Math.max(40, maxY - minY), size = Math.min(92, bh * 1.05), cx = (minX + maxX) / 2;
      const lean = ((cx - w / 2) / (w / 2)) * 0.35;
      ctx.save(); ctx.translate(cx, FLOE_TOP + 4); ctx.rotate(lean);
      ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillText(emoji, 0, 0); ctx.restore();
    }
    return ctx.getImageData(0, 0, w, h);
  }

  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function tintPenguin(img, [dark, light]) {
    const d = hex(dark), l = hex(light), out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    for (let p = 0; p < out.data.length; p += 4) {
      if (!out.data[p + 3]) continue;
      const r = out.data[p], g = out.data[p + 1], b = out.data[p + 2];
      if (r > 150 && g > 110 && b < 90) continue; // garde le bec et les pattes orange
      const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      for (let k = 0; k < 3; k++) out.data[p + k] = Math.round(d[k] + (l[k] - d[k]) * t);
    }
    return out;
  }

  async function patch(skin) {
    if (!original) original = new Uint8Array(await (await fetch('game.swf?v=1', {cache: 'force-cache'})).arrayBuffer());
    const src = original, tint = PENGUIN[skin.id];
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
        const nb = await encodeLossless(id, yeti ? yetiFrame(img, skin.emoji) : tintPenguin(img, tint));
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
    unlocked(best) { return SKINS.filter(s => (best || 0) >= s.min); },
    byId(id) { return SKINS.find(s => s.id === id) || SKINS[0]; },
    async build(id) {
      const skin = this.byId(id);
      if (!skin.emoji) return null; // jeu d'origine
      if (!cache.has(id)) cache.set(id, patch(skin).catch(e => { cache.delete(id); throw e; }));
      return cache.get(id);
    },
  });
})();
