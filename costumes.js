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
    bizut:   {suit:'#ffe14d', hood:true, pat:{type:'belly', color:'#fff6b0'}, acc:['beak','ear-tufts:#ffe14d']},
    ten:     {suit:'#3fa9f5', pat:{type:'belly', color:'#ffffff'}, acc:['cap:#1f6fb2']},
    nice:    {suit:'#ff69b4', pat:{type:'spots', color:'#ffffff', size:7}, acc:['shades','gold-chain']},
    clover:  {suit:'#2e8b3d', pat:{type:'belt', color:'#111111'}, acc:['top-hat-green','beard-orange']},
    pi:      {suit:'#2b3a8c', pat:{type:'stars', color:'#ffffff', size:7}, acc:['big-glasses','mustache']},
    round:   {suit:'#ff8ac9', pat:{type:'spots', color:'#ffd23f', color2:'#3fa9f5', size:6}, acc:['party-hat']},
    tiny:    {suit:'#c9e3ff', pat:{type:'belly', color:'#ffffff'}, acc:['propeller']},
    zero:    {suit:'#8a8a8a', pat:{type:'panel', color:'#5a5a5a'}, acc:['headband:#ff9f1c','mustache']},
    almost:  {suit:'#c8ced6', metal:true, acc:['medal']},
    bipolar: {suit:'#ffffff', pat:{type:'split', color:'#111111'}, acc:['halo','horns:#c0262d']},
    stairs:  {suit:'#3fa9f5', pat:{type:'hstripes', colors:['#1f6fb2','#3fa9f5','#7cc4ff','#b9dcff'], period:4}, acc:['top-hat']},
    crash:   {suit:'#8b1a1a', pat:{type:'gradient', colors:['#2a0a0a','#8b1a1a','#ff5a5a']}, acc:['flies']},
    copycat: {suit:'#6a5acd', pat:{type:'split', color:'#ff9f1c'}, acc:['big-glasses']},
    steady:  {suit:'#444b55', pat:{type:'panel', color:'#2b3038'}, acc:['headband:#4cd964']},
    cold:    {suit:'#bfe6ff', hood:true, pat:{type:'belly', color:'#ffffff'}, acc:['ears-round:#bfe6ff','icicles']},
    centurion:{suit:'#b5121b', pat:{type:'belt', color:'#f2c230'}, acc:['mohawk','cape']},
    lazy:    {suit:'#8a7a5a', hood:true, pat:{type:'belly', color:'#c9b98f'}, acc:['ears-round:#6a5a3a','sleep-cap']},
    early:   {suit:'#ffffff', pat:{type:'hstripes', colors:['#7cc4ff','#ffffff'], period:4}, acc:['sleep-cap']},
    lunch:   {suit:'#f4f4f4', pat:{type:'tux', color:'#ffffff', tie:'#c0392b'}, acc:['chef-hat','mustache']},
    office:  {suit:'#3b4a5c', pat:{type:'tux', color:'#ffffff', tie:'#1f6fb2'}, acc:['big-glasses']},
    sunday:  {suit:'#1aa6a6', pat:{type:'spots', color:'#ff8ac9', color2:'#ffe14d', size:7}, acc:['shades']},
    party:   {suit:'#9b59b6', metal:true, pat:{type:'spots', color:'#ffffff', size:5}, acc:['shades','gold-chain']},
    addict:  {suit:'#e8361c', pat:{type:'hstripes', colors:['#e8361c','#ffffff'], period:5}, acc:['headband:#ffffff']},
    glory:   {suit:'#ff9f1c', metal:true, gold:true, pat:{type:'stars', color:'#fff6c2', size:7}, acc:['halo','cape']},
    untouch: {suit:'#0d3d1f', hood:true, pat:{type:'belly', color:'#f2d24b', ribbed:true}, acc:['horns:#f5c518','cape']},
    phoenix: {suit:'#e8361c', pat:{type:'gradient', colors:['#ffe14d','#ff8a1c','#b3121f']}, acc:['flames','cape']},
    oracle:  {suit:'#1e3a8a', hood:true, pat:{type:'stars', color:'#7cc4ff', size:7}, acc:['third-eye','gold-earring']},
    fish:    {suit:'#8ab4c9', hood:true, pat:{type:'belly', color:'#e6f2f7'}, acc:['fin','flies']},
    frozen:  {suit:'#9fd8ff', hood:true, pat:{type:'belly', color:'#e6f6ff'}, acc:['icicles']},
    imany:   {suit:'#7b3fa0', pat:{type:'jeans', color:'#3d5f94', seam:'#c9a24a'}, photo:'skins/imany.png', acc:['blouse-collar']},
    // ---- saison 2 ----
    wolf:    {suit:'#6b7280', hood:true, pat:{type:'belly', color:'#d1d5db'}, acc:['ears-pointy:#6b7280']},
    gorilla: {suit:'#2a2a2a', hood:true, pat:{type:'belly', color:'#5a5a5a'}, acc:['ears-side:#3a3a3a','gold-chain']},
    mammoth: {suit:'#7a4a24', hood:true, pat:{type:'belly', color:'#9a6a3a', feathers:true}, acc:['tusks','ears-side:#5a3416']},
    whale:   {suit:'#1f4e8c', hood:true, pat:{type:'hstripes', colors:['#1f4e8c','#e8eef5'], period:3}, acc:['fin']},
    ufo:     {suit:'#9aa6b2', metal:true, pat:{type:'panel', color:'#3ec46d'}, acc:['antennas:#3ec46d','halo']},
    rock:    {suit:'#6e6e6e', pat:{type:'cracks', color:'#3a3a3a'}, acc:['headband:#9a9a9a']},
    volcano: {suit:'#3a1a10', pat:{type:'cracks', color:'#ff5a1c'}, acc:['flames']},
    lift:    {suit:'#c8ced6', metal:true, pat:{type:'panel', color:'#6f7a86'}, acc:['cap:#d4161c']},
    zigzag:  {suit:'#ffe14d', pat:{type:'stripes', color:'#111111', period:4}, acc:['mohawk']},
    comeback:{suit:'#2e7d32', pat:{type:'belt', color:'#f2c230'}, acc:['headband:#ffffff','medal']},
    roller:  {suit:'#ff4d4d', pat:{type:'hstripes', colors:['#ff4d4d','#3fa9f5','#ffe14d'], period:3}, acc:['propeller']},
    zen:     {suit:'#f2a33a', pat:{type:'belt', color:'#7a2f00'}, acc:['topknot','halo']},
    regular: {suit:'#1f6fb2', pat:{type:'tux', color:'#ffffff', tie:'#f2c230'}, acc:['big-glasses']},
    clean:   {suit:'#bfe6ff', pat:{type:'spots', color:'#ffffff', size:6}, acc:['chef-hat']},
    palin:   {suit:'#8e44ad', pat:{type:'split', color:'#1aa6a6'}, acc:['big-glasses']},
    sevens:  {suit:'#b5121b', metal:true, pat:{type:'stars', color:'#f5c518', size:7}, acc:['top-hat','gold-chain']},
    robin:   {suit:'#2e6b2a', pat:{type:'belt', color:'#5a3416'}, acc:['robin-hat']},
    cent:    {suit:'#e8eef5', pat:{type:'panel', color:'#3fa9f5'}, acc:['big-glasses','mustache']},
    speed:   {suit:'#ff9f1c', pat:{type:'stripes', color:'#ffffff', period:5}, acc:['headphones','shades']},
    zombie:  {suit:'#6f8f5a', hood:true, pat:{type:'belly', color:'#8a6a3a', rags:true}, acc:['bandage','flies']},
    monday:  {suit:'#4a5568', pat:{type:'tux', color:'#ffffff', tie:'#4a5568'}, acc:['sleep-cap']},
    commute: {suit:'#2b3a8c', pat:{type:'tux', color:'#ffffff', tie:'#d4161c'}, acc:['headphones']},
    insomnia:{suit:'#1b1f4a', pat:{type:'stars', color:'#ffe14d', size:7}, acc:['sleep-cap']},
    snack:   {suit:'#7a4a24', pat:{type:'panel', color:'#5a3416'}, acc:['party-hat']},
    weekend: {suit:'#1aa6a6', pat:{type:'hstripes', colors:['#1aa6a6','#ffe14d'], period:4}, acc:['shades','cap:#ff8ac9']},
    assidu:  {suit:'#3fa9f5', pat:{type:'belly', color:'#ffffff'}, acc:['headband:#d4161c','medal']},
    veteran: {suit:'#56653a', pat:{type:'camo', colors:['#3b4728','#7d8a52','#2a2f1c'], size:5}, acc:['medal','cap:#3b4728']},
    habit:   {suit:'#8a5a2e', pat:{type:'belt', color:'#f2c230'}, acc:['medal']},
    thousand:{suit:'#7c3aed', metal:true, pat:{type:'spots', color:'#ffd23f', color2:'#ff6bf0', size:5}, acc:['party-hat','gold-chain']},
    monument:{suit:'#8a8a7a', pat:{type:'cracks', color:'#5a5a4a'}, acc:['laurel']},
    planet:  {suit:'#d97706', hood:true, pat:{type:'hstripes', colors:['#d97706','#fbbf24','#b45309'], period:4}, acc:['halo']},
    double:  {suit:'#0e7490', hood:true, pat:{type:'belly', color:'#a5f3fc'}, acc:['fin','gold-earring']},
    trident: {suit:'#0b3b5c', pat:{type:'gradient', colors:['#5ec8ff','#1f6fb2','#0b1b3a']}, acc:['crown','beard']},
    ace:     {suit:'#f5c518', metal:true, gold:true, pat:{type:'tux', color:'#ffffff', tie:'#111111'}, acc:['top-hat','gold-chain']},
    mirror:  {suit:'#c8ced6', metal:true, pat:{type:'split', color:'#1b1b1b'}, acc:['shades']},
    starfall:{suit:'#0b1b3a', pat:{type:'stars', color:'#ffe14d', size:6, nebula:'#1f6fb2'}, acc:['wizard-hat']},
    starnight:{suit:'#14063a', hood:true, pat:{type:'stars', color:'#ffffff', size:5, nebula:'#ff5fd2'}, acc:['halo','gold-earring']},
    flawless:{suit:'#7dd3fc', metal:true, pat:{type:'spots', color:'#ffffff', size:5}, acc:['crown']},
    brain:   {suit:'#ff8ac9', hood:true, pat:{type:'cracks', color:'#c2185b'}, acc:['big-glasses','third-eye']},
    pantheon:{suit:'#f4f1e8', metal:true, pat:{type:'hstripes', colors:['#f4f1e8','#d9d2bd'], period:2}, acc:['laurel','cape']},
    skyline: {suit:'#1e3a8a', pat:{type:'gradient', colors:['#ffe14d','#ff8a1c','#1e3a8a']}, acc:['cape','halo']},
    clumsy:  {suit:'#c9b98f', hood:true, pat:{type:'belly', color:'#ffffff'}, acc:['bandage']},
    tilt:    {suit:'#c0262d', hood:true, pat:{type:'belly', color:'#ff7b6b'}, acc:['steam']},
    rain:    {suit:'#5a6472', hood:true, pat:{type:'belly', color:'#8a94a0'}, acc:['cloud']},
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
      case 'jeans': {
        if (y < g.hip - 1 * g.s) return (Math.abs(x - g.cx) < 0.5 * g.s && Math.floor((y - g.neck) / (4 * g.s)) % 2 === 0) ? [235, 225, 245] : base; // boutons du chemisier
        if (Math.abs(x - g.cx) > g.torsoHalf * 1.02) return base; // mains et avant-bras restent dans les manches
        let c = hex(p.color); if (hash(x, y) > 0.6) c = c.map(v => v * 0.9);
        if (y < g.hip + 1.1 * g.s) return hex(p.seam).map((v, i) => (v + c[i]) / 2); // ceinture
        if (Math.abs(x - g.cx) < 0.35 * g.s) return c.map(v => v * 0.78);             // entrejambe
        return c;
      }
      case 'split': return x < g.cx ? hex(p.color) : base;
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
      case 'blouse-collar': for (const sd of [-1, 1]) fill('#9b5cc4', () => { ctx.moveTo(hx, g.neck + 0.5 * u); ctx.lineTo(hx + sd * 5 * u, g.neck - 0.8 * u); ctx.lineTo(hx + sd * 3.6 * u, g.neck + 3.6 * u); ctx.closePath(); }); break;
      case 'cap': fill(col, () => { ctx.ellipse(hx, ht + 2.2 * u, 6.5 * u, 4.5 * u, 0, Math.PI, 0); }); fill(col, () => ctx.ellipse(hx + 5 * u, ht + 2.4 * u, 5 * u, 1.4 * u, 0, 0, Math.PI * 2)); break;
      case 'top-hat-green': fill('#1f6b2a', () => { ctx.rect(hx - 4 * u, ht - 8 * u, 8 * u, 9 * u); ctx.ellipse(hx, ht + 1 * u, 7 * u, 1.6 * u, 0, 0, Math.PI * 2); }); fill('#111', () => ctx.rect(hx - 4 * u, ht - 1.8 * u, 8 * u, 1.5 * u)); fill('#f2c230', () => ctx.rect(hx - 1 * u, ht - 2 * u, 2 * u, 1.9 * u)); break;
      case 'beard-orange': fill('#e8681c', () => { ctx.moveTo(hx - 4.5 * u, ht + 10 * u); ctx.quadraticCurveTo(hx, ht + 19 * u, hx + 4.5 * u, ht + 10 * u); ctx.closePath(); }); break;
      case 'mustache': fill('#2b1a0c', () => { ctx.ellipse(hx - 1.8 * u, ht + 11 * u, 2 * u, 0.9 * u, -0.25, 0, Math.PI * 2); ctx.ellipse(hx + 1.8 * u, ht + 11 * u, 2 * u, 0.9 * u, 0.25, 0, Math.PI * 2); }); break;
      case 'party-hat': fill('#3fa9f5', () => { ctx.moveTo(hx - 4 * u, ht + 1.5 * u); ctx.lineTo(hx, ht - 9 * u); ctx.lineTo(hx + 4 * u, ht + 1.5 * u); ctx.closePath(); }); fill('#ffd23f', () => { circle(hx - 1 * u, ht - 2 * u, 0.8 * u); circle(hx + 1.2 * u, ht - 4.5 * u, 0.7 * u); circle(hx, ht - 9.5 * u, 1.3 * u); }); break;
      case 'medal': stroke('#1f6fb2', 1.2 * u, () => { ctx.moveTo(hx - 3 * u, g.neck); ctx.lineTo(hx, g.neck + 6 * u); ctx.lineTo(hx + 3 * u, g.neck); }); fill('#dfe4ea', () => circle(hx, g.neck + 7.5 * u, 2.4 * u)); fill('#8d96a0', () => circle(hx, g.neck + 7.5 * u, 1.2 * u)); break;
      case 'mohawk': for (let i = -3; i <= 3; i++) fill('#d4161c', () => { const x = hx + i * 1.2 * u; ctx.moveTo(x - 0.9 * u, ht + 2 * u); ctx.lineTo(x, ht - (6 - Math.abs(i)) * u); ctx.lineTo(x + 0.9 * u, ht + 2 * u); ctx.closePath(); }); break;
      case 'sleep-cap': fill('#3f5bd9', () => { ctx.moveTo(hx - 5.5 * u, ht + 2.5 * u); ctx.quadraticCurveTo(hx, ht - 6 * u, hx + 9 * u, ht + 4 * u); ctx.lineTo(hx + 5.5 * u, ht + 2.5 * u); ctx.closePath(); }); fill('#fff', () => circle(hx + 9 * u, ht + 4.5 * u, 1.6 * u)); fill('#fff', () => ctx.rect(hx - 5.5 * u, ht + 1.6 * u, 11 * u, 1.4 * u)); break;
      case 'chef-hat': fill('#ffffff', () => { circle(hx - 3 * u, ht - 3 * u, 3 * u); circle(hx, ht - 4.5 * u, 3.4 * u); circle(hx + 3 * u, ht - 3 * u, 3 * u); ctx.rect(hx - 4.5 * u, ht - 3 * u, 9 * u, 5 * u); }); stroke('#ddd', 0.5 * u, () => { ctx.moveTo(hx - 4.5 * u, ht + 0.5 * u); ctx.lineTo(hx + 4.5 * u, ht + 0.5 * u); }); break;
      case 'third-eye': fill('#fff', () => ctx.ellipse(hx, ht + 3.6 * u, 2.2 * u, 1.3 * u, 0, 0, Math.PI * 2)); fill('#1e88e5', () => circle(hx, ht + 3.6 * u, 1 * u)); fill('#111', () => circle(hx, ht + 3.6 * u, 0.45 * u)); break;
      case 'icicles': for (let i = -3; i <= 3; i++) fill('rgba(220,245,255,.95)', () => { const x = hx + i * 1.7 * u; ctx.moveTo(x - 0.8 * u, ht + 1 * u); ctx.lineTo(x, ht + (3.5 + (i % 2 ? 1.5 : 0)) * u); ctx.lineTo(x + 0.8 * u, ht + 1 * u); ctx.closePath(); }); break;
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
      case 'tusks': for (const sd of [-1, 1]) fill('#fffbe6', () => { ctx.moveTo(hx + sd * 2 * u, ht + 11 * u); ctx.quadraticCurveTo(hx + sd * 7 * u, ht + 18 * u, hx + sd * 3 * u, ht + 19 * u); ctx.quadraticCurveTo(hx + sd * 5 * u, ht + 16 * u, hx + sd * 1 * u, ht + 12.5 * u); ctx.closePath(); }); break;
      case 'robin-hat': fill('#2e6b2a', () => { ctx.moveTo(hx - 7 * u, ht + 2 * u); ctx.quadraticCurveTo(hx - 2 * u, ht - 6 * u, hx + 8 * u, ht - 3 * u); ctx.lineTo(hx + 6 * u, ht + 2 * u); ctx.closePath(); }); stroke('#d4161c', 0.8 * u, () => { ctx.moveTo(hx + 2 * u, ht - 1 * u); ctx.quadraticCurveTo(hx + 7 * u, ht - 9 * u, hx + 11 * u, ht - 10 * u); }); break;
      case 'headphones': stroke('#111', 1.2 * u, () => ctx.arc(hx, ht + 6 * u, 7 * u, Math.PI * 1.05, Math.PI * 1.95)); for (const sd of [-1, 1]) fill('#d4161c', () => ctx.roundRect(hx + sd * 7 * u - 1.6 * u, ht + 5 * u, 3.2 * u, 5 * u, 1.2 * u)); break;
      case 'bandage': fill('#f4f4f4', () => ctx.rect(hx - 6.5 * u, ht + 2.6 * u, 13 * u, 2.2 * u)); fill('#d4161c', () => circle(hx + 3 * u, ht + 3.7 * u, 0.8 * u)); fill('#ffe0b8', () => { ctx.save(); ctx.translate(hx - 3.5 * u, ht + 10 * u); ctx.rotate(-0.6); ctx.rect(-2 * u, -0.7 * u, 4 * u, 1.4 * u); ctx.restore(); }); break;
      case 'steam': for (const sd of [-1, 1]) stroke('rgba(255,255,255,.9)', 1 * u, () => { const x = hx + sd * 8 * u; ctx.moveTo(x, ht + 2 * u); ctx.quadraticCurveTo(x + sd * 2 * u, ht - 1 * u, x, ht - 3 * u); ctx.quadraticCurveTo(x - sd * 2 * u, ht - 5 * u, x + sd * 1 * u, ht - 7 * u); }); fill('#ff2a2a', () => { ctx.moveTo(hx - 4 * u, ht + 5 * u); ctx.lineTo(hx - 1 * u, ht + 6.5 * u); ctx.lineTo(hx - 4 * u, ht + 6.2 * u); ctx.closePath(); ctx.moveTo(hx + 4 * u, ht + 5 * u); ctx.lineTo(hx + 1 * u, ht + 6.5 * u); ctx.lineTo(hx + 4 * u, ht + 6.2 * u); ctx.closePath(); }); break;
      case 'cloud': fill('#4a5260', () => { circle(hx - 4 * u, ht - 7 * u, 3.4 * u); circle(hx, ht - 9 * u, 4.2 * u); circle(hx + 4.5 * u, ht - 7 * u, 3.2 * u); ctx.rect(hx - 4 * u, ht - 7 * u, 8.5 * u, 3.4 * u); }); stroke('#7cc4ff', 0.7 * u, () => { for (const x of [-3, 0, 3]) { ctx.moveTo(hx + x * u, ht - 3 * u); ctx.lineTo(hx + (x - 0.8) * u, ht - 0.5 * u); } }); break;
      case 'laurel': for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) fill('#4c9a2a', () => { const a = Math.PI * (0.95 - i * 0.12), x = hx + sd * Math.cos(a) * -6.5 * u, y = ht + 4 * u - Math.sin(a) * 4.5 * u; ctx.ellipse(x, y, 1.8 * u, 0.9 * u, sd * (0.6 + i * 0.25), 0, Math.PI * 2); }); break;
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
      if (inHead && cos.photo) { o[p + 3] = 0; continue; } // la tête est remplacée par la photo
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
    const ph = cos.photo && photos[cos.photo];
    if (ph && ph.complete && ph.naturalWidth) {
      const hh = 24 * g.s, ww = hh * ph.naturalWidth / ph.naturalHeight, cy = g.top + 8.5 * g.s;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2; ctx.drawImage(ph, g.cx - ww / 2, cy - hh / 2, ww, hh); ctx.restore();
    }
    return ctx.getImageData(0, 0, w, h);
  }

  // ---------- Parois thématiques des ultra rares (image de la paroi de glace, forme et relief conservés) ----------
  const WALLS = {
    meteor: (ctx, w, h) => { // roche volcanique et fissures de lave
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${60 + hash(i, 1) * 50},${30 + hash(i, 2) * 25},${20 + hash(i, 3) * 15},.7)`; ctx.beginPath(); ctx.arc(hash(i, 4) * w, hash(i, 5) * h, 2 + hash(i, 6) * 7, 0, 7); ctx.fill(); }
      ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 6; ctx.lineCap = 'round';
      for (let k = 0; k < 7; k++) { let x = hash(k, 9) * w, y = k * h / 7 + hash(k, 8) * 30; ctx.strokeStyle = k % 2 ? '#ff7a1a' : '#ffd04a'; ctx.lineWidth = 1.6 + hash(k, 7) * 1.4; ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 7; j++) { x += (hash(k, j) - 0.5) * 24; y += 7 + hash(j, k) * 9; ctx.lineTo(Math.max(2, Math.min(w - 2, x)), y); } ctx.stroke(); }
      ctx.restore();
    },
    ninja: (ctx, w, h) => { // bambous
      ctx.fillStyle = '#1f2a14'; ctx.fillRect(0, 0, w, h);
      const cw = 15;
      for (let c = 0; c * cw < w + cw; c++) {
        const x = c * cw - (c % 2) * 3, g = ctx.createLinearGradient(x, 0, x + cw, 0);
        g.addColorStop(0, '#3d6b2a'); g.addColorStop(0.45, '#9fd062'); g.addColorStop(1, '#2f5520');
        ctx.fillStyle = g; ctx.fillRect(x + 1, 0, cw - 2, h);
        for (let y = (c * 17) % 46; y < h; y += 46) { ctx.fillStyle = '#2a4a1a'; ctx.fillRect(x + 1, y, cw - 2, 3); ctx.fillStyle = '#c4e889'; ctx.fillRect(x + 1, y + 3, cw - 2, 1); }
      }
      ctx.fillStyle = '#5aa03a';
      for (let i = 0; i < 9; i++) { const x = hash(i, 11) * w, y = hash(i, 12) * h; ctx.beginPath(); ctx.ellipse(x, y, 11, 3, -0.6 + hash(i, 13), 0, 7); ctx.fill(); }
    },
    vampire: (ctx, w, h) => { // pierres de château gothique
      ctx.fillStyle = '#141018'; ctx.fillRect(0, 0, w, h);
      const bh = 15, bw = 30;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) {
        const x = c * bw + (r % 2) * (bw / 2), y = r * bh, v = 50 + hash(r, c) * 30;
        ctx.fillStyle = `rgb(${v},${v - 6},${v + 6})`; ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
      ctx.fillStyle = '#8b0000';
      for (let i = 0; i < 6; i++) { const x = hash(i, 21) * w, y = hash(i, 22) * h * 0.8, l = 14 + hash(i, 23) * 30; ctx.fillRect(x, y, 2, l); ctx.beginPath(); ctx.arc(x + 1, y + l, 2, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#050307';
      for (let i = 0; i < 4; i++) { const x = 10 + hash(i, 31) * (w - 20), y = 20 + hash(i, 32) * (h - 60); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 6, y - 6, x - 12, y - 1); ctx.quadraticCurveTo(x - 7, y + 1, x - 4, y + 4); ctx.lineTo(x, y + 2); ctx.lineTo(x + 4, y + 4); ctx.quadraticCurveTo(x + 7, y + 1, x + 12, y - 1); ctx.quadraticCurveTo(x + 6, y - 6, x, y); ctx.fill(); }
    },
    genie: (ctx, w, h) => { // palais doré à arabesques
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#8a6114'); g.addColorStop(0.5, '#e9c25a'); g.addColorStop(1, '#9a6e18');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fff1b0'; ctx.lineWidth = 1.2; const sz = 22;
      for (let y = -sz; y < h + sz; y += sz) for (let x = -sz; x < w + sz; x += sz) {
        const ox = (Math.floor(y / sz) % 2) * sz / 2; ctx.beginPath(); ctx.moveTo(x + ox, y - sz / 2); ctx.lineTo(x + ox + sz / 2, y); ctx.lineTo(x + ox, y + sz / 2); ctx.lineTo(x + ox - sz / 2, y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#1aa6a6'; ctx.beginPath(); ctx.arc(x + ox, y, 2.2, 0, 7); ctx.fill();
      }
    },
    glory: (ctx, w, h) => { // coucher de soleil doré
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ff5a1f'); g.addColorStop(0.5, '#ffb43a'); g.addColorStop(1, '#ffe68a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(w / 2, h * 0.35); ctx.lineTo(-40 + i * 25, -10); ctx.lineTo(-28 + i * 25, -10); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(w / 2, h * 0.35, 16, 0, 7); ctx.fill();
    },
    untouch: (ctx, w, h) => { // écailles de dragon
      ctx.fillStyle = '#0b2e17'; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h + 12; y += 10) for (let x = -12; x < w + 12; x += 14) { const ox = (y / 10) % 2 ? 7 : 0, g = ctx.createRadialGradient(x + ox, y, 1, x + ox, y, 9); g.addColorStop(0, '#5fd47a'); g.addColorStop(1, '#0f4a22'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + ox, y, 8, 0, Math.PI); ctx.fill(); }
    },
    phoenix: (ctx, w, h) => { // plumes de feu
      ctx.fillStyle = '#3a0a00'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { const x = hash(i, 61) * w, y = hash(i, 62) * h, g = ctx.createLinearGradient(x, y + 30, x, y - 20); g.addColorStop(0, '#b3121f'); g.addColorStop(0.5, '#ff8a1c'); g.addColorStop(1, '#ffe14d'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 7, 26, (hash(i, 63) - 0.5) * 0.8, 0, 7); ctx.fill(); }
    },
    oracle: (ctx, w, h) => { // mosaïque d'yeux
      ctx.fillStyle = '#10204f'; ctx.fillRect(0, 0, w, h);
      for (let y = 12; y < h; y += 26) for (let x = 12 + ((y / 26) % 2) * 13; x < w; x += 26) { ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 8, 4.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#1e88e5'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
    },
    cosmic: (ctx, w, h) => { // galaxie
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0626'); g.addColorStop(0.5, '#2a1260'); g.addColorStop(1, '#120838');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const [x, y, r, c] of [[20, 70, 50, '#ff5fd2'], [70, 190, 60, '#4aa8ff'], [30, 300, 45, '#a46bff']]) { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c + 'aa'); rg.addColorStop(1, c + '00'); ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h); }
      for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + hash(i, 41) * 0.6})`; ctx.fillRect(hash(i, 42) * w, hash(i, 43) * h, hash(i, 44) > 0.9 ? 2 : 1, hash(i, 44) > 0.9 ? 2 : 1); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const x = hash(i, 51) * w, y = hash(i, 52) * h; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke(); }
    },
    // ---- saison 2 ----
    flawless: (ctx, w, h) => { // aurore boréale
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04122b'); g.addColorStop(1, '#0b2a3d'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const [c, o] of [['#3cffb0', 0], ['#4ad6ff', 40], ['#b06bff', 80]]) { ctx.strokeStyle = c + '88'; ctx.lineWidth = 14; ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.beginPath(); for (let y = 0; y <= h; y += 6) { const x = w / 2 + Math.sin((y + o) / 38) * w * 0.32; if (!y) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.shadowBlur = 0; for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + hash(i, 71) * 0.7})`; ctx.fillRect(hash(i, 72) * w, hash(i, 73) * h, 1, 1); }
    },
    double: (ctx, w, h) => { // grand large
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5ec8ff'); g.addColorStop(1, '#0b3b6b'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
      for (let y = 8; y < h; y += 14) { ctx.beginPath(); for (let x = 0; x <= w; x += 4) { const yy = y + Math.sin((x + y * 3) / 9) * 3; if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
    },
    zigzag: (ctx, w, h) => { // sucre d'orge
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e8213a';
      for (let k = -h; k < w + h; k += 22) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 11, 0); ctx.lineTo(k + 11 - h, h); ctx.lineTo(k - h, h); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#4cd964'; for (let k = -h + 8; k < w + h; k += 44) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 3, 0); ctx.lineTo(k + 3 - h, h); ctx.lineTo(k - h, h); ctx.closePath(); ctx.fill(); }
    },
    cent: (ctx, w, h) => { // pluie de code
      ctx.fillStyle = '#000a02'; ctx.fillRect(0, 0, w, h); ctx.font = 'bold 9px monospace';
      for (let c = 0; c * 8 < w; c++) { const len = 6 + Math.floor(hash(c, 81) * 22), start = hash(c, 82) * h; for (let j = 0; j < len; j++) { ctx.fillStyle = j === len - 1 ? '#d6ffd9' : `rgba(0,255,90,${0.25 + 0.75 * j / len})`; ctx.fillText(String.fromCharCode(48 + Math.floor(hash(c, j) * 42)), c * 8, (start + j * 10) % h); } }
    },
    speed: (ctx, w, h) => { // damier de course
      const sz = 12; for (let y = 0; y * sz < h; y++) for (let x = 0; x * sz < w; x++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(x * sz, y * sz, sz, sz); }
    },
    brain: (ctx, w, h) => { // synthwave
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a0033'); g.addColorStop(0.5, '#5b0a7a'); g.addColorStop(1, '#ff2a8a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.2; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 6;
      for (let y = 10; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let x = 0; x <= w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    },
    ace: (ctx, w, h) => { // lingots d'or
      ctx.fillStyle = '#3d2a00'; ctx.fillRect(0, 0, w, h); const bh = 12, bw = 28;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) { const x = c * bw + (r % 2) * (bw / 2), y = r * bh, g = ctx.createLinearGradient(x, y, x, y + bh); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.4, '#f5c518'); g.addColorStop(1, '#a87400'); ctx.fillStyle = g; ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2); }
    },
    rock: (ctx, w, h) => { // blizzard
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#9fb8cc'); g.addColorStop(1, '#e8f2fa'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(255,255,255,${0.5 + hash(i, 91) * 0.5})`; ctx.beginPath(); ctx.arc(hash(i, 92) * w, hash(i, 93) * h, 0.6 + hash(i, 94) * 2.2, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 30; i++) { const x = hash(i, 95) * w, y = hash(i, 96) * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y + 6); ctx.stroke(); }
    },
    comeback: (ctx, w, h) => { // jungle
      ctx.fillStyle = '#0f3d1a'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = hash(i, 101) * w, y = hash(i, 102) * h, a = hash(i, 103) * 6.28; ctx.fillStyle = ['#1f7a3a', '#2e9b4a', '#4cc46a', '#176b2e'][i % 4]; ctx.beginPath(); ctx.ellipse(x, y, 14, 5, a, 0, 7); ctx.fill(); ctx.strokeStyle = '#0b2a12'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 13, y - Math.sin(a) * 13); ctx.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13); ctx.stroke(); }
    },
    monument: (ctx, w, h) => { // briques et graffitis
      ctx.fillStyle = '#5a2a1a'; ctx.fillRect(0, 0, w, h); const bh = 10, bw = 22;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) { const x = c * bw + (r % 2) * (bw / 2), v = hash(r, c) * 30; ctx.fillStyle = `rgb(${150 + v},${70 + v / 2},${50 + v / 3})`; ctx.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2); }
      ctx.lineCap = 'round'; for (let k = 0; k < 6; k++) { ctx.strokeStyle = ['#ff2a8a', '#00e5ff', '#ffe14d', '#3aff00'][k % 4]; ctx.lineWidth = 3; ctx.beginPath(); let x = hash(k, 111) * w, y = hash(k, 112) * h; ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (hash(k, j + 113) - 0.5) * 30; y += (hash(j, k + 114) - 0.3) * 20; ctx.lineTo(x, y); } ctx.stroke(); }
    },
    zen: (ctx, w, h) => { // ciel et nuages
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4aa8ff'); g.addColorStop(1, '#cdeaff'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; for (let i = 0; i < 9; i++) { const x = hash(i, 121) * w, y = hash(i, 122) * h; for (const [dx, r] of [[-10, 8], [0, 12], [11, 9]]) { ctx.beginPath(); ctx.arc(x + dx, y, r, 0, 7); ctx.fill(); } }
    },
    pantheon: (ctx, w, h) => { // marbre
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = k % 3 ? 'rgba(120,110,95,.35)' : 'rgba(201,162,74,.6)'; ctx.lineWidth = 0.6 + hash(k, 131) * 1.4; ctx.beginPath(); let x = hash(k, 132) * w, y = 0; ctx.moveTo(x, y); while (y < h) { x += (hash(k, y) - 0.5) * 16; y += 8; ctx.lineTo(x, y); } ctx.stroke(); }
    },
    wolf: (ctx, w, h) => { // pleine lune
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#1f2a5a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.shadowColor = '#fffbe0'; ctx.shadowBlur = 18; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(w / 2, h * 0.22, Math.min(w, h) * 0.22, 0, 7); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#0a0f22'; for (let x = -6; x < w + 6; x += 12) { const t = h * (0.7 + hash(x, 141) * 0.15); ctx.beginPath(); ctx.moveTo(x - 8, h); ctx.lineTo(x, t); ctx.lineTo(x + 8, h); ctx.closePath(); ctx.fill(); }
    },
    trident: (ctx, w, h) => { // abysses
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b4a7a'); g.addColorStop(1, '#010814'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * w / 4, 0); ctx.lineTo(i * w / 4 + 10, 0); ctx.lineTo(i * w / 4 - 20, h * 0.6); ctx.lineTo(i * w / 4 - 30, h * 0.6); ctx.fill(); }
      ctx.strokeStyle = 'rgba(180,230,255,.7)'; ctx.lineWidth = 1; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(hash(i, 151) * w, hash(i, 152) * h, 1 + hash(i, 153) * 3, 0, 7); ctx.stroke(); }
    },
    starfall: (ctx, w, h) => { // étoiles filantes
      ctx.fillStyle = '#070b24'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + hash(i, 161) * 0.7})`; ctx.fillRect(hash(i, 162) * w, hash(i, 163) * h, 1, 1); }
      ctx.lineCap = 'round'; for (let i = 0; i < 7; i++) { const x = hash(i, 164) * w, y = hash(i, 165) * h, g = ctx.createLinearGradient(x - 30, y - 18, x, y); g.addColorStop(0, 'rgba(255,225,77,0)'); g.addColorStop(1, '#fff6c2'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 30, y - 18); ctx.lineTo(x, y); ctx.stroke(); }
    },
  };
  const WALL_NAMES = {meteor:'Lave', ninja:'Bambous', vampire:'Château hanté', genie:'Palais doré', glory:'Coucher de soleil', untouch:'Écailles de dragon', phoenix:'Plumes de feu', oracle:'Mille yeux', cosmic:'Galaxie',
    flawless:'Aurore boréale', double:'Grand large', zigzag:'Sucre d’orge', cent:'Matrix', speed:'Damier', brain:'Synthwave', ace:'Lingots', rock:'Blizzard', comeback:'Jungle', monument:'Graffiti', zen:'Ciel', pantheon:'Marbre', wolf:'Pleine lune', trident:'Abysses', starfall:'Étoiles filantes'};
  // Aperçu de la paroi pour le sélecteur (petit carré, mis en cache).
  const previews = {};
  function wallPreview(id) {
    if (!WALLS[id]) return '';
    if (!previews[id]) { const cv = document.createElement('canvas'); cv.width = 84; cv.height = 52; const ctx = cv.getContext('2d'); try { WALLS[id](ctx, 84, 52); previews[id] = cv.toDataURL(); } catch (_) { previews[id] = ''; } }
    return previews[id];
  }
  function wall(img, skinId) {
    const paint = WALLS[skinId]; if (!paint) return null;
    const {width: w, height: h, data} = img, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', {willReadFrequently: true}); paint(ctx, w, h);
    const tex = ctx.getImageData(0, 0, w, h), o = tex.data;
    for (let p = 0; p < o.length; p += 4) {
      const a = data[p + 3]; if (!a) { o[p + 3] = 0; continue; }
      const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255, k = 0.55 + 0.7 * lum; // garde le relief de la glace
      o[p] = Math.min(255, o[p] * k); o[p + 1] = Math.min(255, o[p + 1] * k); o[p + 2] = Math.min(255, o[p + 2] * k); o[p + 3] = a;
    }
    return tex;
  }
  const photos = {};
  const ready = Promise.all(Object.values(C).filter(c => c.photo).map(c => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = () => res(); im.src = c.photo + '?v=1'; photos[c.photo] = im;
  })));
  window.YetiCostumes = Object.freeze({has: id => !!C[id], dress, ready, wall, hasWall: id => !!WALLS[id], walls: () => Object.keys(WALLS), wallName: id => WALL_NAMES[id] || '', wallPreview});
})();
