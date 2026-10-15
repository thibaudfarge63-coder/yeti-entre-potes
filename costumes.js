/* Costumes du yéti : garde la fourrure et le visage d'origine, habille le corps (combinaison + motifs) et ajoute des accessoires dessinés.
   Purement visuel : la physique et la façon de jouer ne changent pas. */
(() => {
  'use strict';

  // suit : couleur de la combinaison · pat : motif · hood : capuche (la tête prend la couleur, le visage reste visible)
  // acc : accessoires dessinés sur la tête
  const C = {
    pig:     {suit:'#f4a3b5', hood:true, pat:{type:'belly', color:'#ffd0db'}, acc:['ears-pig','snout']},
    frog:    {suit:'#4caf3e', hood:true, pat:{type:'belly', color:'#b8e986'}, acc:['frog-eyes']},
    panda:   {suit:'#f2f2f2', hood:true, pat:{type:'panda', color:'#1b1b1b'}, acc:['ears-round:#1b1b1b','eye-patches']},
    monkey:  {suit:'#7a4a24', hood:true, pat:{type:'belly', color:'#d9a877'}, acc:['ears-side:#d9a877']},
    bear:    {suit:'#5b3416', hood:true, pat:{type:'belly', color:'#a8713f'}, acc:['ears-round:#5b3416']},
    clown:   {suit:'#8e44ad', pat:{type:'spots', color:'#ffd23f', color2:'#ff4d4d', size:7}, acc:['ruff','clown-hat','red-nose']},
    tiger:   {suit:'#f08a1c', hood:true, pat:{type:'stripes', color:'#1d1206', period:6}, acc:['ears-pointy:#f08a1c']},
    lion:    {suit:'#d9a441', pat:{type:'belly', color:'#f3d48b'}, acc:['mane','ears-round:#c58b2c']},
    fox:     {suit:'#e8681c', hood:true, pat:{type:'belly', color:'#fff3e6'}, acc:['ears-pointy:#e8681c']},
    alien:   {suit:'#3ec46d', hood:true, pat:{type:'belly', color:'#9cf0b8'}, acc:['antennas:#3ec46d']},
    shark:   {suit:'#5b7d99', hood:true, pat:{type:'belly', color:'#f2f6f9'}, acc:['fin']},
    dragon:  {suit:'#2e8b3d', hood:true, pat:{type:'belly', color:'#f2d24b', ribbed:true}, acc:['horns:#f2d24b','spikes:#c0392b']},
    eagle:   {suit:'#5a3a1c', hood:true, hoodColor:'#ffffff', acc:['beak']},
    unicorn: {suit:'#f7f0ff', hood:true, pat:{type:'hstripes', colors:['#ffb3d9','#ffe0a3','#c9f2c7','#b9dcff','#e2c9ff'], period:5, only:'legs'}, acc:['unicorn-horn','mane-rainbow']},
    wizard:  {suit:'#2b3a8c', pat:{type:'stars', color:'#ffd84a', size:8}, acc:['wizard-hat','beard']},
    robot:   {suit:'#9aa6b2', hood:true, metal:true, pat:{type:'panel', color:'#5f6b77'}, acc:['antenna-ball','visor']},
    devil:   {suit:'#c0262d', hood:true, acc:['horns:#2b0a0a','tail']},
    ogre:    {suit:'#6f8f2a', hood:true, pat:{type:'belly', color:'#8a6a3a', rags:true}, acc:['ears-pointy:#6f8f2a']},
    skull:   {suit:'#141414', hood:true, pat:{type:'skeleton', color:'#f2f2f2'}, acc:['skull-face']},
    prime:   {suit:'#f5c518', hood:false, metal:true, gold:true, acc:['cape','crown']},
    sniper:  {suit:'#56653a', pat:{type:'camo', colors:['#3b4728','#7d8a52','#2a2f1c'], size:6}, acc:['headband:#c0392b']},
    fire:    {suit:'#e8361c', pat:{type:'gradient', colors:['#ffe14d','#ff8a1c','#d4161c']}, acc:['flames']},
    yoyo:    {suit:'#ff4d4d', pat:{type:'hstripes', colors:['#ff4d4d','#ff9f1c','#ffe14d','#4cd964','#3fa9f5','#9b59b6'], period:4}, acc:['propeller']},
    jackpot: {suit:'#1f7a3a', pat:{type:'tux', color:'#ffffff', tie:'#f2c230'}, acc:['top-hat','gold-chain']},
    owl:     {suit:'#7a5a3a', hood:true, pat:{type:'belly', color:'#e9d9b8', feathers:true}, acc:['ear-tufts:#7a5a3a','big-glasses']},
    ghost:   {suit:'#f4f7fb', hood:true, face:true, ghost:true, acc:['ghost-face']},
    turtle:  {suit:'#3c8d3c', hood:true, pat:{type:'shell', color:'#245c24', belly:'#e8d27a'}, acc:['bandana:#3498db']},
    fossil:  {suit:'#7aa83a', hood:true, pat:{type:'belly', color:'#d9e88a'}, acc:['spikes:#4a6a1a']},
    boss:    {suit:'#1d1f24', pat:{type:'tux', color:'#ffffff', tie:'#c0392b'}, acc:['shades']},
    meteor:  {suit:'#2a1b14', pat:{type:'cracks', color:'#ff8a1c'}, acc:['flames']},
    ninja:   {suit:'#121212', hood:true, ninja:true, acc:['headband:#c0392b','ninja-tails']},
    vampire: {suit:'#141019', pat:{type:'tux', color:'#f4f4f4', tie:'#8b0000'}, acc:['vampire-collar','slick-hair']},
    genie:   {suit:'#3a8fd9', hood:true, pat:{type:'belt', color:'#f2c230'}, acc:['topknot','gold-earring']},
    cosmic:  {suit:'#1b0f3a', hood:true, pat:{type:'stars', color:'#ffffff', size:6, nebula:'#7b3fd1'}, acc:['halo']},
    poop:    {suit:'#6b4423', hood:true, pat:{type:'belly', color:'#8a5a2e'}, acc:['poop-hat','flies']},
    snail:   {suit:'#c9a66b', pat:{type:'belly', color:'#e8d3a8'}, acc:['eyestalks','shell']},
  };

  const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  function geometry(data, w, h, floeTop) {
    const isBody = (x, y) => {
      const p = (y * w + x) * 4; if (data[p + 3] < 40) return false;
      const r = data[p], g = data[p + 1], b = data[p + 2], lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (y >= floeTop - 6 && lum > 0.72) return false;   // glace
      if (r > 150 && g > 110 && b < 90) return false;      // bec / pattes du pingouin
      if (lum > 0.86) return false;                         // ventre blanc du pingouin
      return true;
    };
    let top = -1;
    for (let y = 0; y < floeTop && top < 0; y++) { let n = 0; for (let x = 0; x < w; x++) if (isBody(x, y)) n++; if (n >= 3) top = y; }
    if (top < 0) return null;
    const H = floeTop - top, s = H / 70;
    let sx = 0, n = 0;
    for (let y = top; y < top + 10 * s; y++) for (let x = 0; x < w; x++) if (isBody(x, y)) { sx += x; n++; }
    const cx = n ? sx / n : w / 2;
    let x0 = w, x1 = 0; const hy = Math.round(top + 9 * s);
    for (let x = 0; x < w; x++) if (isBody(x, hy) && Math.abs(x - cx) < 14 * s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const headW = Math.max(10 * s, x1 - x0 + 1);
    return {isBody, top, H, s, cx, headW, neck: top + 16 * s, eyeY: top + 7.5 * s, hip: top + 0.6 * H, torsoHalf: headW * 0.78, floeTop};
  }

  function patternColor(cos, x, y, g, base) {
    const p = cos.pat; if (!p) return base;
    const by = (y - g.neck) / (g.floeTop - g.neck);
    switch (p.type) {
      case 'belly': {
        const dx = (x - g.cx) / (g.headW * 0.62), dy = (y - (g.neck + 0.2 * g.H)) / (0.2 * g.H);
        if (y > g.neck && dx * dx + dy * dy < 1) {
          if (p.ribbed && Math.floor((y - g.neck) / (3 * g.s)) % 2) return mix(hex(p.color), base, 0.25);
          if (p.feathers && hash(Math.floor(x / 3), Math.floor(y / 3)) > 0.7) return mix(hex(p.color), base, 0.3);
          return hex(p.color);
        }
        if (p.rags && y > g.hip - 2 * g.s && y < g.hip + 6 * g.s && Math.abs(x - g.cx) < g.torsoHalf * 1.15) return hex(p.color);
        return base;
      }
      case 'stripes': { const v = ((x - g.cx) * 0.55 + y) / (p.period * g.s); return v - Math.floor(v) < 0.33 ? hex(p.color) : base; }
      case 'hstripes': {
        if (p.only === 'legs' && y < g.hip) return base;
        const i = Math.floor((y - g.neck) / (p.period * g.s)); return hex(p.colors[((i % p.colors.length) + p.colors.length) % p.colors.length]);
      }
      case 'spots': case 'stars': {
        const size = p.size * g.s, ix = Math.floor(x / size), iy = Math.floor(y / size), ox = hash(ix, iy), oy = hash(iy, ix);
        const dx = x - (ix + 0.25 + ox * 0.5) * size, dy = y - (iy + 0.25 + oy * 0.5) * size, r = size * (p.type === 'stars' ? 0.16 : 0.26);
        let c = base; if (p.nebula) c = mix(base, hex(p.nebula), Math.max(0, Math.sin(x * 0.3) * Math.cos(y * 0.25)) * 0.6);
        if (dx * dx + dy * dy < r * r) return hex(p.color2 && hash(iy, ix + 7) > 0.5 ? p.color2 : p.color);
        return c;
      }
      case 'camo': { const v = hash(Math.floor(x / p.size), Math.floor(y / p.size)); return v < 0.33 ? hex(p.colors[0]) : v < 0.6 ? hex(p.colors[1]) : v < 0.75 ? hex(p.colors[2]) : base; }
      case 'gradient': { const c = p.colors.map(hex), t = 1 - Math.min(1, Math.max(0, by)); return t < 0.5 ? mix(c[0], c[1], t * 2) : mix(c[1], c[2], (t - 0.5) * 2); }
      case 'panda': return (Math.abs(x - g.cx) > g.torsoHalf || y > g.hip) ? hex(p.color) : base;
      case 'tux': {
        const dy = y - g.neck, ax = Math.abs(x - g.cx);
        if (dy > 0 && y < g.top + 0.5 * g.H && ax < dy * 0.42 + 1) {
          if (ax < 1.1 * g.s && dy < 0.32 * g.H) return hex(p.tie);
          return hex(p.color);
        }
        return base;
      }
      case 'skeleton': {
        const ax = Math.abs(x - g.cx);
        if (y > g.neck + 2 * g.s && y < g.top + 0.48 * g.H && ax < g.torsoHalf * 0.85 && (ax < 0.9 * g.s || Math.floor((y - g.neck) / (2.6 * g.s)) % 2 === 0)) return hex(p.color);
        if (y > g.hip + 2 * g.s && Math.abs(ax - g.torsoHalf * 0.45) < 0.9 * g.s) return hex(p.color);
        return base;
      }
      case 'panel': { const v = (y - g.neck) / (5 * g.s); return (v - Math.floor(v) < 0.18 || Math.abs(x - g.cx) < 0.6 * g.s) ? hex(p.color) : base; }
      case 'shell': {
        const ax = Math.abs(x - g.cx); if (y > g.neck && y < g.hip && ax < g.torsoHalf) {
          if (ax < g.torsoHalf * 0.55) return hex(p.belly);
          const v = hash(Math.floor(x / 4), Math.floor(y / 4)); return v > 0.5 ? hex(p.color) : base;
        }
        return base;
      }
      case 'cracks': { const v = Math.abs(Math.sin(x * 0.9 + Math.sin(y * 0.5) * 2) * Math.cos(y * 0.35)); return v < 0.12 ? hex(p.color) : base; }
      case 'belt': return (y > g.hip - 3 * g.s && y < g.hip) ? hex(p.color) : base;
    }
    return base;
  }

  // ---------- accessoires dessinés (repère : centre de la tête, unité u = largeur de tête / 16) ----------
  function drawAcc(ctx, name, g, cos) {
    const [kind, arg] = name.split(':'), u = g.headW / 16, hx = g.cx, ht = g.top;
    const col = arg || cos.suit;
    const fill = (c, f) => { ctx.fillStyle = c; ctx.beginPath(); f(); ctx.fill(); };
    const stroke = (c, wdt, f) => { ctx.strokeStyle = c; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.beginPath(); f(); ctx.stroke(); };
    const shade = (c, k) => { const v = hex(c).map(x => Math.round(Math.min(255, x * k))); return `rgb(${v})`; };
    const circle = (x, y, r) => ctx.arc(x, y, r, 0, Math.PI * 2);
    switch (kind) {
      case 'ears-round': for (const sd of [-1, 1]) { fill(col, () => circle(hx + sd * 6.5 * u, ht + 1.5 * u, 3.3 * u)); fill(shade(col, 1.6), () => circle(hx + sd * 6.5 * u, ht + 1.8 * u, 1.6 * u)); } break;
      case 'ears-side': for (const sd of [-1, 1]) { fill(shade(cos.suit, 1), () => circle(hx + sd * 8.2 * u, ht + 7 * u, 2.8 * u)); fill(col, () => circle(hx + sd * 8.2 * u, ht + 7 * u, 1.6 * u)); } break;
      case 'ears-pointy': case 'ears-pig': case 'ear-tufts': {
        const c = kind === 'ears-pig' ? '#f4a3b5' : col, inner = kind === 'ears-pig' ? '#ff7f9e' : kind === 'ear-tufts' ? shade(col, 0.7) : '#ffe6d6';
        const hgt = kind === 'ear-tufts' ? 5 : kind === 'ears-pig' ? 4 : 6;
        for (const sd of [-1, 1]) {
          fill(c, () => { ctx.moveTo(hx + sd * 3 * u, ht + 2 * u); ctx.lineTo(hx + sd * 7.5 * u, ht - hgt * u); ctx.lineTo(hx + sd * 8 * u, ht + 3.5 * u); ctx.closePath(); });
          fill(inner, () => { ctx.moveTo(hx + sd * 4.6 * u, ht + 1.8 * u); ctx.lineTo(hx + sd * 7.2 * u, ht - (hgt - 2.5) * u); ctx.lineTo(hx + sd * 7.4 * u, ht + 2.4 * u); ctx.closePath(); });
        }
        break;
      }
      case 'snout': fill('#ff8fab', () => ctx.ellipse(hx, ht + 11.5 * u, 3 * u, 2.1 * u, 0, 0, Math.PI * 2)); fill('#b0485f', () => { circle(hx - 1.1 * u, ht + 11.5 * u, 0.6 * u); circle(hx + 1.1 * u, ht + 11.5 * u, 0.6 * u); }); break;
      case 'frog-eyes': for (const sd of [-1, 1]) { fill(cos.suit, () => circle(hx + sd * 4 * u, ht + 0.5 * u, 3.4 * u)); fill('#fff', () => circle(hx + sd * 4 * u, ht + 0.3 * u, 2.4 * u)); fill('#111', () => circle(hx + sd * 4.3 * u, ht + 0.5 * u, 1.2 * u)); } break;
      case 'eye-patches': for (const sd of [-1, 1]) fill('rgba(20,20,20,.9)', () => ctx.ellipse(hx + sd * 2.6 * u, ht + 7.6 * u, 2.4 * u, 1.9 * u, sd * 0.5, 0, Math.PI * 2)); break;
      case 'red-nose': fill('#ff2a2a', () => circle(hx, ht + 10.5 * u, 1.9 * u)); fill('rgba(255,255,255,.8)', () => circle(hx - 0.6 * u, ht + 9.9 * u, 0.6 * u)); break;
      case 'clown-hat': {
        fill('#ffd23f', () => { ctx.moveTo(hx - 5 * u, ht + 1.5 * u); ctx.lineTo(hx + 1 * u, ht - 11 * u); ctx.lineTo(hx + 5 * u, ht + 1.5 * u); ctx.closePath(); });
        stroke('#ff4d4d', 1.4 * u, () => { ctx.moveTo(hx - 3 * u, ht - 3 * u); ctx.lineTo(hx + 3.6 * u, ht - 2 * u); ctx.moveTo(hx - 1.2 * u, ht - 7 * u); ctx.lineTo(hx + 2.3 * u, ht - 6.4 * u); });
        fill('#ff4d4d', () => circle(hx + 1 * u, ht - 11.5 * u, 1.8 * u)); break;
      }
      case 'ruff': for (let i = -4; i <= 4; i++) fill(i % 2 ? '#ffffff' : '#ffd23f', () => circle(hx + i * 1.9 * u, g.neck - 0.5 * u + Math.abs(i) * 0.25 * u, 1.6 * u)); break;
      case 'mane': ctx.save(); ctx.globalCompositeOperation = 'destination-over'; for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; fill(a % 2 ? '#b5651d' : '#e08a2c', () => circle(hx + Math.cos(t) * 7.8 * u, ht + 8 * u + Math.sin(t) * 8.2 * u, 3.4 * u)); } ctx.restore(); break;
      case 'mane-rainbow': ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ['#ff8ac9', '#ffd36e', '#8fe3a0', '#7cc4ff', '#c79bff'].forEach((c, i) => fill(c, () => circle(hx + 6.5 * u, ht + (1 + i * 3) * u, 2.4 * u))); ctx.restore(); break;
      case 'antennas': case 'antenna-ball': {
        const pairs = kind === 'antennas' ? [-1, 1] : [0];
        for (const sd of pairs) { stroke(kind === 'antennas' ? col : '#5f6b77', 0.9 * u, () => { ctx.moveTo(hx + sd * 2.5 * u, ht + 1 * u); ctx.lineTo(hx + sd * 5 * u, ht - 6 * u); }); fill(kind === 'antennas' ? '#d6ff5a' : '#ff3b3b', () => circle(hx + sd * 5 * u, ht - 6.5 * u, 1.5 * u)); }
        break;
      }
      case 'visor': fill('rgba(40,220,255,.85)', () => ctx.roundRect(hx - 5 * u, ht + 6.2 * u, 10 * u, 2.8 * u, 1.2 * u)); break;
      case 'fin': fill(cos.suit, () => { ctx.moveTo(hx - 3 * u, ht + 1 * u); ctx.quadraticCurveTo(hx + 1 * u, ht - 9 * u, hx + 4 * u, ht - 8 * u); ctx.quadraticCurveTo(hx + 2.5 * u, ht - 3 * u, hx + 3.5 * u, ht + 1 * u); ctx.closePath(); }); break;
      case 'horns': for (const sd of [-1, 1]) fill(col, () => { ctx.moveTo(hx + sd * 2.5 * u, ht + 1.5 * u); ctx.quadraticCurveTo(hx + sd * 7 * u, ht - 1 * u, hx + sd * 6.5 * u, ht - 6 * u); ctx.quadraticCurveTo(hx + sd * 5.2 * u, ht - 1.5 * u, hx + sd * 5 * u, ht + 2.5 * u); ctx.closePath(); }); break;
      case 'spikes': for (let i = 0; i < 4; i++) fill(col, () => { const y = ht + i * 2.6 * u - 1 * u, x = hx + (i - 1.5) * 0.6 * u; ctx.moveTo(x - 1.6 * u, y + 2 * u); ctx.lineTo(x, y - 2.6 * u); ctx.lineTo(x + 1.6 * u, y + 2 * u); ctx.closePath(); }); break;
      case 'beak': fill('#f2b705', () => { ctx.moveTo(hx - 2.2 * u, ht + 9.5 * u); ctx.lineTo(hx + 2.2 * u, ht + 9.5 * u); ctx.lineTo(hx, ht + 13.5 * u); ctx.closePath(); }); break;
      case 'unicorn-horn': fill('#f5c518', () => { ctx.moveTo(hx - 1.8 * u, ht + 1.5 * u); ctx.lineTo(hx, ht - 10 * u); ctx.lineTo(hx + 1.8 * u, ht + 1.5 * u); ctx.closePath(); }); stroke('#fff4b0', 0.6 * u, () => { for (let i = 0; i < 3; i++) { ctx.moveTo(hx - 1.4 * u + i * 0.4 * u, ht - i * 3 * u); ctx.lineTo(hx + 1.2 * u - i * 0.4 * u, ht - 1.5 * u - i * 3 * u); } }); break;
      case 'wizard-hat': {
        fill('#2b3a8c', () => ctx.ellipse(hx, ht + 1.5 * u, 8.5 * u, 2 * u, 0, 0, Math.PI * 2));
        fill('#2b3a8c', () => { ctx.moveTo(hx - 5.5 * u, ht + 1.5 * u); ctx.quadraticCurveTo(hx - 1 * u, ht - 8 * u, hx + 5 * u, ht - 14 * u); ctx.quadraticCurveTo(hx + 2 * u, ht - 6 * u, hx + 5.5 * u, ht + 1.5 * u); ctx.closePath(); });
        fill('#ffd84a', () => { circle(hx - 0.5 * u, ht - 3 * u, 0.9 * u); circle(hx + 2 * u, ht - 8 * u, 0.7 * u); circle(hx - 2.5 * u, ht - 0.5 * u, 0.6 * u); }); break;
      }
      case 'beard': fill('#f4f4f4', () => { ctx.moveTo(hx - 4 * u, ht + 11 * u); ctx.quadraticCurveTo(hx, ht + 22 * u, hx + 4 * u, ht + 11 * u); ctx.closePath(); }); break;
      case 'tail': stroke(cos.suit, 1.2 * u, () => { ctx.moveTo(hx + g.torsoHalf * 0.6, g.hip); ctx.quadraticCurveTo(hx + g.torsoHalf * 1.9, g.hip + 8 * u, hx + g.torsoHalf * 1.6, g.hip - 4 * u); }); fill(cos.suit, () => { const x = hx + g.torsoHalf * 1.6, y = g.hip - 4 * u; ctx.moveTo(x - 1.6 * u, y + 1 * u); ctx.lineTo(x, y - 2.5 * u); ctx.lineTo(x + 1.6 * u, y + 1 * u); ctx.closePath(); }); break;
      case 'skull-face': fill('#f2f2f2', () => ctx.ellipse(hx, ht + 8 * u, 5 * u, 5.8 * u, 0, 0, Math.PI * 2)); fill('#111', () => { circle(hx - 2 * u, ht + 7.3 * u, 1.5 * u); circle(hx + 2 * u, ht + 7.3 * u, 1.5 * u); }); fill('#111', () => { ctx.moveTo(hx, ht + 9.3 * u); ctx.lineTo(hx - 0.8 * u, ht + 10.8 * u); ctx.lineTo(hx + 0.8 * u, ht + 10.8 * u); ctx.closePath(); }); stroke('#111', 0.5 * u, () => { for (let i = -2; i <= 2; i++) { ctx.moveTo(hx + i * 1 * u, ht + 11.8 * u); ctx.lineTo(hx + i * 1 * u, ht + 13 * u); } }); break;
      case 'crown': {
        fill('#f5c518', () => { ctx.moveTo(hx - 5.5 * u, ht + 1.5 * u); ctx.lineTo(hx - 6 * u, ht - 5 * u); ctx.lineTo(hx - 3 * u, ht - 1.8 * u); ctx.lineTo(hx, ht - 6.5 * u); ctx.lineTo(hx + 3 * u, ht - 1.8 * u); ctx.lineTo(hx + 6 * u, ht - 5 * u); ctx.lineTo(hx + 5.5 * u, ht + 1.5 * u); ctx.closePath(); });
        fill('#fff6c2', () => ctx.rect(hx - 5.5 * u, ht - 0.2 * u, 11 * u, 0.7 * u));
        fill('#e53935', () => circle(hx, ht - 1 * u, 0.9 * u)); fill('#1e88e5', () => { circle(hx - 3.6 * u, ht - 0.7 * u, 0.7 * u); circle(hx + 3.6 * u, ht - 0.7 * u, 0.7 * u); }); break;
      }
      case 'cape': ctx.save(); ctx.globalCompositeOperation = 'destination-over'; fill('#b3121f', () => { ctx.moveTo(hx - g.torsoHalf * 1.1, g.neck); ctx.lineTo(hx + g.torsoHalf * 1.1, g.neck); ctx.lineTo(hx + g.torsoHalf * 1.6, g.floeTop - 6 * u); ctx.lineTo(hx - g.torsoHalf * 1.6, g.floeTop - 6 * u); ctx.closePath(); }); ctx.restore(); break;
      case 'headband': fill(col, () => ctx.rect(hx - 6.5 * u, ht + 3.4 * u, 13 * u, 1.8 * u)); break;
      case 'ninja-tails': fill('#c0392b', () => { ctx.moveTo(hx + 6 * u, ht + 3.6 * u); ctx.lineTo(hx + 11 * u, ht + 6 * u); ctx.lineTo(hx + 10 * u, ht + 7.2 * u); ctx.lineTo(hx + 6 * u, ht + 5 * u); ctx.closePath(); }); break;
      case 'flames': ['#ffe14d', '#ff8a1c', '#e8361c'].forEach((c, i) => { const k = 1 - i * 0.25; fill(c, () => { ctx.moveTo(hx - 5 * u * k, ht + 2 * u); ctx.quadraticCurveTo(hx - 6 * u * k, ht - 5 * u * k, hx - 2 * u * k, ht - 9 * u * k); ctx.quadraticCurveTo(hx - 1 * u, ht - 4 * u, hx + 1 * u * k, ht - 11 * u * k); ctx.quadraticCurveTo(hx + 3 * u, ht - 5 * u, hx + 5 * u * k, ht - 7 * u * k); ctx.quadraticCurveTo(hx + 6 * u * k, ht - 2 * u, hx + 5 * u * k, ht + 2 * u); ctx.closePath(); }); }); break;
      case 'propeller': fill('#3fa9f5', () => ctx.ellipse(hx, ht + 0.5 * u, 5.5 * u, 2.8 * u, 0, Math.PI, 0)); fill('#ff4d4d', () => ctx.ellipse(hx, ht + 0.5 * u, 2.7 * u, 2.8 * u, 0, Math.PI, 0)); stroke('#333', 0.7 * u, () => { ctx.moveTo(hx, ht - 2 * u); ctx.lineTo(hx, ht - 4 * u); }); fill('#ffe14d', () => { ctx.ellipse(hx - 3 * u, ht - 4.3 * u, 3 * u, 0.8 * u, 0, 0, Math.PI * 2); ctx.ellipse(hx + 3 * u, ht - 4.3 * u, 3 * u, 0.8 * u, 0, 0, Math.PI * 2); }); break;
      case 'top-hat': fill('#111', () => { ctx.rect(hx - 4 * u, ht - 8 * u, 8 * u, 9 * u); ctx.ellipse(hx, ht + 1 * u, 7 * u, 1.6 * u, 0, 0, Math.PI * 2); }); fill('#f2c230', () => ctx.rect(hx - 4 * u, ht - 1.6 * u, 8 * u, 1.4 * u)); break;
      case 'gold-chain': stroke('#f5c518', 0.9 * u, () => { ctx.moveTo(hx - 4.5 * u, g.neck + 1 * u); ctx.quadraticCurveTo(hx, g.neck + 9 * u, hx + 4.5 * u, g.neck + 1 * u); }); fill('#f5c518', () => circle(hx, g.neck + 5.6 * u, 1.6 * u)); break;
      case 'big-glasses': stroke('#2b1a0c', 0.8 * u, () => { circle(hx - 2.6 * u, ht + 7.5 * u, 2.4 * u); ctx.moveTo(hx + 5 * u, ht + 7.5 * u); circle(hx + 2.6 * u, ht + 7.5 * u, 2.4 * u); }); break;
      case 'ghost-face': fill('#111', () => { ctx.ellipse(hx - 2.2 * u, ht + 7.5 * u, 1.3 * u, 1.9 * u, 0, 0, Math.PI * 2); ctx.ellipse(hx + 2.2 * u, ht + 7.5 * u, 1.3 * u, 1.9 * u, 0, 0, Math.PI * 2); }); fill('#111', () => ctx.ellipse(hx, ht + 12 * u, 1.4 * u, 1.8 * u, 0, 0, Math.PI * 2)); break;
      case 'bandana': fill(col, () => ctx.rect(hx - 6.5 * u, ht + 6 * u, 13 * u, 3.2 * u)); fill('#111', () => { circle(hx - 2.3 * u, ht + 7.6 * u, 0.9 * u); circle(hx + 2.3 * u, ht + 7.6 * u, 0.9 * u); }); break;
      case 'shades': fill('#050505', () => { ctx.roundRect(hx - 5.4 * u, ht + 6.4 * u, 4.6 * u, 2.6 * u, 1 * u); ctx.roundRect(hx + 0.8 * u, ht + 6.4 * u, 4.6 * u, 2.6 * u, 1 * u); ctx.rect(hx - 1 * u, ht + 6.9 * u, 2 * u, 0.7 * u); }); fill('rgba(255,255,255,.55)', () => { ctx.rect(hx - 4.6 * u, ht + 6.9 * u, 1.4 * u, 0.6 * u); ctx.rect(hx + 1.6 * u, ht + 6.9 * u, 1.4 * u, 0.6 * u); }); break;
      case 'vampire-collar': for (const sd of [-1, 1]) fill('#8b0000', () => { ctx.moveTo(hx + sd * 2 * u, g.neck + 1 * u); ctx.lineTo(hx + sd * 9 * u, ht + 6 * u); ctx.lineTo(hx + sd * 7 * u, g.neck + 4 * u); ctx.closePath(); }); break;
      case 'slick-hair': fill('#0b0b0b', () => { ctx.moveTo(hx - 6 * u, ht + 5 * u); ctx.quadraticCurveTo(hx - 6 * u, ht - 1.5 * u, hx, ht - 1 * u); ctx.quadraticCurveTo(hx + 6 * u, ht - 1.5 * u, hx + 6 * u, ht + 5 * u); ctx.lineTo(hx, ht + 3 * u); ctx.closePath(); }); break;
      case 'topknot': fill('#0b0b0b', () => { circle(hx, ht - 2 * u, 2.4 * u); }); fill('#f2c230', () => ctx.rect(hx - 1.6 * u, ht + 0 * u, 3.2 * u, 1 * u)); stroke('#0b0b0b', 1.4 * u, () => { ctx.moveTo(hx, ht - 4 * u); ctx.quadraticCurveTo(hx + 4 * u, ht - 6 * u, hx + 5 * u, ht - 2 * u); }); break;
      case 'gold-earring': stroke('#f5c518', 0.6 * u, () => circle(hx + 6.4 * u, ht + 11 * u, 1.1 * u)); break;
      case 'halo': ctx.save(); ctx.shadowColor = '#c9a6ff'; ctx.shadowBlur = 3 * u; stroke('#f3e9ff', 1.1 * u, () => ctx.ellipse(hx, ht - 3.5 * u, 6 * u, 1.8 * u, 0, 0, Math.PI * 2)); ctx.restore(); break;
      case 'poop-hat': [[7, 2.5], [5.4, -1], [3.6, -4], [1.6, -6.4]].forEach(([r, y], i) => fill(i % 2 ? '#7a4a25' : '#6b4423', () => ctx.ellipse(hx, ht + y * u, r * u, 2 * u, 0, 0, Math.PI * 2))); fill('rgba(255,255,255,.35)', () => ctx.ellipse(hx - 2 * u, ht + 1.5 * u, 2 * u, 0.6 * u, 0, 0, Math.PI * 2)); break;
      case 'flies': for (const [x, y] of [[-9, -5], [8, -8], [10, 2]]) { fill('#111', () => circle(hx + x * u, ht + y * u, 0.8 * u)); fill('rgba(255,255,255,.8)', () => { circle(hx + (x - 0.8) * u, ht + (y - 0.8) * u, 0.6 * u); circle(hx + (x + 0.8) * u, ht + (y - 0.8) * u, 0.6 * u); }); } break;
      case 'eyestalks': for (const sd of [-1, 1]) { stroke('#a8844a', 0.9 * u, () => { ctx.moveTo(hx + sd * 2 * u, ht + 1.5 * u); ctx.lineTo(hx + sd * 4.5 * u, ht - 6 * u); }); fill('#fff', () => circle(hx + sd * 4.5 * u, ht - 6.5 * u, 1.5 * u)); fill('#111', () => circle(hx + sd * 4.7 * u, ht - 6.4 * u, 0.7 * u)); } break;
      case 'shell': ctx.save(); ctx.globalCompositeOperation = 'destination-over'; fill('#b5651d', () => circle(hx + g.torsoHalf * 0.2, g.neck + 0.22 * g.H, g.torsoHalf * 1.25)); stroke('#7a3e0e', 1 * u, () => { const x = hx + g.torsoHalf * 0.2, y = g.neck + 0.22 * g.H; for (let a = 0; a < 12; a += 0.25) { const r = a * g.torsoHalf * 0.1; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }); ctx.restore(); break;
    }
  }

  function dress(img, skinId, floeTop) {
    const cos = C[skinId]; if (!cos) return null;
    const {width: w, height: h, data} = img, g = geometry(data, w, h, floeTop);
    if (!g) return null;
    const out = new ImageData(new Uint8ClampedArray(data), w, h), o = out.data, suit = hex(cos.suit), hood = cos.hoodColor ? hex(cos.hoodColor) : suit;
    const faceRx = g.headW * 0.34, faceY = g.top + 9 * g.s, faceRy = 4.6 * g.s;
    for (let y = 0; y < floeTop; y++) for (let x = 0; x < w; x++) {
      if (!g.isBody(x, y)) continue;
      const p = (y * w + x) * 4, inHead = y < g.neck;
      const fx = (x - g.cx) / faceRx, fy = (y - faceY) / faceRy, inFace = fx * fx + fy * fy < 1;
      if (inHead && (!cos.hood || (inFace && !cos.face && !cos.ninja))) continue; // tête/visage d'origine
      if (inHead && cos.ninja && Math.abs(y - g.eyeY) < 1.6 * g.s && Math.abs(x - g.cx) < faceRx) continue; // fente des yeux
      const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
      const t = Math.min(1, Math.max(0, (lum - 0.2) / 0.6));
      const base = inHead ? hood : patternColor(cos, x, y, g, suit);
      let c;
      if (cos.metal) {
        const shine = t * t * 1.1 + 0.15 * Math.exp(-(((x - g.cx) / (g.headW * 0.4)) ** 2));
        c = mix(base.map(v => v * 0.45), mix(base, [255, 255, 255], cos.gold ? 0.55 : 0.4), Math.min(1, shine));
      } else {
        c = base.map(v => v * (0.5 + 0.75 * t));               // volume du costume
        c = mix(c, [255, 255, 255], Math.max(0, t - 0.82) * 1.6); // reflets
        c = mix(c, [data[p], data[p + 1], data[p + 2]], 0.08);   // garde un peu la texture du poil
      }
      o[p] = Math.min(255, c[0]); o[p + 1] = Math.min(255, c[1]); o[p + 2] = Math.min(255, c[2]);
      if (cos.ghost) o[p + 3] = Math.round(data[p + 3] * 0.88);
    }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', {willReadFrequently: true}); ctx.putImageData(out, 0, 0);
    for (const a of cos.acc || []) { ctx.save(); drawAcc(ctx, a, g, cos); ctx.restore(); }
    return ctx.getImageData(0, 0, w, h);
  }

  window.YetiCostumes = Object.freeze({has: id => !!C[id], dress});
})();
