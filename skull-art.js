/* Skull King : visuels des cartes (style « Grimoire », liseré + pastilles).
   - Couleurs : silhouettes de game-icons.net (CC BY 3.0, voir skull-icons.js).
   - Cartes spéciales : décors plein cadre faits maison (dégradés, vagues, rayons…) + silhouette game-icons.
   Aucun visuel du jeu d'origine ni de BGA. Un sprite SVG injecté une fois, réutilisé par <use>. */
(() => {
  'use strict';
  const GI = window.SKULL_ICONS || {};
  const GOLD = '#e8b53a', GOLD_D = '#9a6b10';
  // symboles « maison » (repère 64)
  const OWN = {
    joker: `<path d="M32 4l7.6 17.4L58 24l-14 12.6L48 56 32 46.4 16 56l4-19.4L6 24l18.4-2.6z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2.2" stroke-linejoin="round"/>
      <text x="32" y="41" text-anchor="middle" font-size="17" font-weight="900" fill="#5a3a00" font-family="Georgia,serif">15</text>`,
    back: `<circle cx="32" cy="32" r="26" fill="none" stroke="${GOLD}" stroke-width="2"/><circle cx="32" cy="32" r="20" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 3"/>
      <path fill="${GOLD}" d="M32 8l4 20 20 4-20 4-4 20-4-20-20-4 20-4z"/><circle cx="32" cy="32" r="4" fill="#0f2231" stroke="${GOLD}" stroke-width="2"/>`,
  };
  // couleurs → silhouette game-icons (repère 512)
  const SUIT_ICON = {'suit-g': 'parrot-head', 'suit-y': 'open-treasure-chest', 'suit-p': 'treasure-map', 'suit-k': 'pirate-flag'};
  const giPaths = n => (GI[n] || []).map(d => `<path d="${d}"/>`).join('');

  function inject() {
    if (document.getElementById('skull-art')) return;
    const syms = [
      ...Object.entries(OWN).map(([k, v]) => `<symbol id="ska-${k}" viewBox="0 0 64 64">${v}</symbol>`),
      ...Object.entries(SUIT_ICON).map(([k, n]) => `<symbol id="ska-${k}" viewBox="0 0 512 512">${giPaths(n)}</symbol>`),
      ...Object.keys(GI).map(n => `<symbol id="skg-${n}" viewBox="0 0 512 512">${giPaths(n)}</symbol>`),
    ];
    const div = document.createElement('div');
    div.innerHTML = `<svg id="skull-art" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${syms.join('')}</svg>`;
    document.body.prepend(div.firstChild);
  }
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);

  const has = n => n in OWN || n in SUIT_ICON;
  const svg = (name, cls = '') => `<svg class="ska ${cls}" viewBox="0 0 ${name in OWN ? 64 : 512} ${name in OWN ? 64 : 512}" aria-hidden="true"><use href="#ska-${name}"/></svg>`;

  /* ---------- décors des cartes spéciales (repère 100 x 148) ---------- */
  const lin = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const rad = (id, a, b, cx = .5, cy = .45, r = .7) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
  const waves = (y, fill, amp = 5) => `<path d="M-5 ${y} q8.75 -${amp} 17.5 0 t17.5 0 t17.5 0 t17.5 0 t17.5 0 t17.5 0 V160 H-5z" fill="${fill}"/>`;
  const rays = (cx, cy, n, fill, op) => `<g fill="${fill}" opacity="${op}">${Array.from({length: n}, (_, i) => {
    const a = i / n * Math.PI * 2, b = a + .09, p = t => `${(cx + Math.cos(t) * 200).toFixed(1)} ${(cy + Math.sin(t) * 200).toFixed(1)}`;
    return `<path d="M${cx} ${cy}L${p(a)}L${p(b)}z"/>`;
  }).join('')}</g>`;
  const star = (x, y, r, fill) => `<path d="M${x} ${y - r}L${x + r * .28} ${y - r * .28}L${x + r} ${y}L${x + r * .28} ${y + r * .28}L${x} ${y + r}L${x - r * .28} ${y + r * .28}L${x - r} ${y}L${x - r * .28} ${y - r * .28}z" fill="${fill}"/>`;
  const dots = (pts, r, fill, op = 1) => `<g fill="${fill}" opacity="${op}">${pts.map(([x, y, s = 1]) => `<circle cx="${x}" cy="${y}" r="${r * s}"/>`).join('')}</g>`;
  const bubbles = pts => `<g fill="none" stroke="#fff" stroke-width=".8" opacity=".6">${pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  const icon = (n, x, y, s, fill, shadow = '#0006', rot = 0) => `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})">` +
    (shadow ? `<use href="#skg-${n}" x="${x + 1.6}" y="${y + 2}" width="${s}" height="${s}" fill="${shadow}"/>` : '') +
    `<use href="#skg-${n}" x="${x}" y="${y}" width="${s}" height="${s}" fill="${fill}"/></g>`;
  const SKY = [[12, 14], [30, 8], [52, 20], [78, 10], [90, 28], [20, 34], [66, 36], [44, 6], [86, 50], [8, 52]];

  const SCENES = {
    escape: {k: '#3d9fd4', f: u => `<defs>${lin('a' + u, '#8fd6ff', '#e6f7ff')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <circle cx="80" cy="22" r="12" fill="#fff" opacity=".9"/><circle cx="80" cy="22" r="20" fill="#fff" opacity=".25"/>
      <g fill="#fff" opacity=".9"><ellipse cx="22" cy="30" rx="16" ry="6"/><ellipse cx="32" cy="26" rx="10" ry="6"/><ellipse cx="70" cy="58" rx="14" ry="5"/><ellipse cx="62" cy="55" rx="8" ry="5"/></g>
      ${icon('flying-flag', 8, 26, 86, '#ffffff', '#1d6f9e88', -6)}${waves(112, '#7cc8ee')}${waves(120, '#4aa8d8')}${waves(130, '#2a86bd')}
      <g stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"><path d="M10 50q6-3 10 0M74 80q5-3 9 0M16 90q5-3 9 0"/></g>`},
    loot: {k: '#9a6400', f: u => `<defs>${rad('a' + u, '#ffe27a', '#3a1d04', .5, .55, .75)}</defs><rect width="100" height="148" fill="url(#a${u})"/>${rays(50, 82, 22, '#fff2a8', .25)}
      ${icon('coins-pile', 6, 40, 88, '#ffd23a', '#5a3200')}
      ${star(18, 30, 6, '#fff')}${star(82, 36, 4.5, '#fff7c2')}${star(74, 18, 3, '#fff')}${star(26, 112, 4, '#fff7c2')}${star(84, 104, 5, '#fff')}
      ${dots([[12, 128], [30, 132], [70, 130], [88, 126], [50, 136]], 3.2, '#e8a800')}`},
    pirate: {k: '#a3301a', f: u => `<defs>${lin('a' + u, '#ff5a36', '#ffd27a')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <circle cx="50" cy="70" r="36" fill="#fff0b0" opacity=".85"/><circle cx="50" cy="70" r="46" fill="#fff0b0" opacity=".25"/>
      ${icon('pirate-captain', 4, 18, 92, '#2b0f14', '')}${waves(116, '#5a1f2a')}${waves(126, '#3a1220')}
      <g stroke="#2b0f14" fill="none"><path d="M8 40l4-1 1 3 2-5 2 4 3-1"/><path d="M82 30l3-1 1 2 2-4 2 3 3-1"/></g>`},
    tigress: {k: '#c4560e', f: u => `<defs>${rad('a' + u, '#ffc15a', '#c4500a', .5, .45, .8)}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <g fill="#3a1500" opacity=".28"><path d="M-4 20q30 6 40-6-8 14-40 18z"/><path d="M104 40q-30 2-38-12 4 16 38 22z"/><path d="M-4 96q26-4 34 8-12-4-34 2z"/><path d="M104 118q-24-8-36 2 14-2 36 8z"/><path d="M-4 140q20-8 30-2-10 0-30 8z"/></g>
      <g fill="#1f6b2a"><path d="M-6 0q22 10 26 34-14-10-26-12z"/><path d="M106 0q-20 12-22 34 12-12 22-12z"/><path d="M-6 148q14-26 34-24-16 6-22 24z" fill="#2d8a3a"/><path d="M106 148q-14-26-34-24 16 6 22 24z" fill="#2d8a3a"/></g>
      ${icon('tiger-head', 6, 28, 88, '#1c0b02', '#fff5')}`},
    second: {k: '#1b2a5a', f: u => `<defs>${rad('a' + u, '#3a58b8', '#0c1430', .5, .45, .8)}</defs><rect width="100" height="148" fill="url(#a${u})"/>${rays(50, 64, 28, '#ffd75a', .18)}
      <text x="50" y="104" text-anchor="middle" font-family="Georgia,serif" font-size="96" font-weight="900" fill="#ffd75a" opacity=".13">II</text>
      ${icon('captain-hat-profile', 10, 26, 80, '#ffcc33', '#000a', -8)}
      <g fill="none" stroke="#ffcc33" stroke-width="4" stroke-linejoin="round"><path d="M32 106l18 8 18-8"/><path d="M32 116l18 8 18-8"/></g>
      <path d="M12 14l5 10 5-10z" fill="#c8102e"/><circle cx="17" cy="27" r="5" fill="#ffcc33" stroke="#9a6b10"/>${star(17, 27, 3, '#9a6b10')}
      <path d="M78 14l5 10 5-10z" fill="#2b6cff"/><circle cx="83" cy="27" r="5" fill="#ffcc33" stroke="#9a6b10"/>${star(83, 27, 3, '#9a6b10')}
      ${star(20, 80, 3, '#fff')}${star(82, 86, 2.5, '#fff')}${star(70, 16, 2, '#fff')}`},
    king: {k: '#8c0b18', f: u => `<defs>${rad('a' + u, '#e2202f', '#2a0206', .5, .5, .75)}</defs><rect width="100" height="148" fill="url(#a${u})"/>${rays(50, 74, 36, '#ffcc33', .3)}
      <circle cx="50" cy="76" r="34" fill="none" stroke="#ffcc33" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>
      ${icon('pirate-skull', 14, 44, 72, '#f6ecd2', '#000b')}${icon('jewel-crown', 22, 8, 56, '#ffcc33', '#5a0008', 10)}
      ${star(12, 20, 4, '#ffe680')}${star(88, 30, 5, '#ffe680')}${star(14, 104, 3.5, '#ffe680')}${star(86, 112, 4, '#ffe680')}${star(50, 130, 3, '#ffe680')}
      ${dots([[20, 124], [80, 128], [10, 70, .8], [90, 66, .8]], 3, '#ffcc33')}`},
    mermaid: {k: '#0e7c86', f: u => `<defs>${lin('a' + u, '#3fd0d6', '#063c52')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <g fill="#fff" opacity=".13"><path d="M20 0l14 0-24 148-14 0z"/><path d="M58 0l10 0 6 148-14 0z"/><path d="M86 0l8 0 20 148-12 0z"/></g>
      ${icon('mermaid', 6, 18, 90, '#ff9c8a', '#063c5299')}
      <g fill="#1e8a4a"><path d="M8 148q-6-20 2-34 2 14-2 34z"/><path d="M14 148q4-26 -2-40 10 14 6 40z" fill="#26a85a"/><path d="M90 148q6-22-2-36-2 14 2 36z"/></g>
      <path d="M-5 140q30-8 55-2t55 0V160H-5z" fill="#e8d29a"/>${bubbles([[18, 40, 3], [22, 30, 2], [80, 70, 2.5], [84, 60, 1.6], [70, 110, 2], [30, 100, 1.8]])}`},
    kraken: {k: '#4a2060', f: u => `<defs>${lin('a' + u, '#0f1220', '#4a5878')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <path d="M72 0l-10 26 8 0-12 30 22-36-9 0 8-20z" fill="#ffe94d"/>
      <g stroke="#cfd8ea" stroke-width=".6" opacity=".35"><path d="M10 10l-4 12M24 6l-4 12M40 14l-4 12M90 40l-4 12M14 50l-4 12M32 40l-4 12"/></g>
      ${waves(104, '#16324a', 7)}${icon('kraken-tentacle', 0, 22, 100, '#a23d8f', '#000a')}${waves(122, '#0b2233', 6)}${waves(134, '#061724', 5)}`},
    whale: {k: '#123a66', f: u => `<defs>${lin('a' + u, '#030b1c', '#1a4c80')}</defs><rect width="100" height="148" fill="url(#a${u})"/>${dots(SKY, .8, '#fff', .8)}
      <circle cx="74" cy="26" r="13" fill="#fff4cf"/><circle cx="70" cy="23" r="2.4" fill="#e8dcb0"/><circle cx="78" cy="30" r="1.6" fill="#e8dcb0"/><circle cx="74" cy="26" r="22" fill="#fff4cf" opacity=".12"/>
      ${waves(98, '#0d2f52', 5)}${icon('sperm-whale', 0, 36, 100, '#f2f8ff', '#0009')}${waves(118, '#0a2747', 5)}${waves(130, '#06192f', 4)}
      <g fill="#fff4cf" opacity=".5"><rect x="66" y="124" width="16" height="1.4" rx=".7"/><rect x="70" y="132" width="9" height="1.2" rx=".6"/></g>`},
    ray: {k: '#127c8a', f: u => `<defs>${lin('a' + u, '#8ff2e4', '#1495a8')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <g fill="none" stroke="#fff" stroke-width=".9" opacity=".3"><path d="M0 20q10-6 20 0t20 0 20 0 20 0 20 0"/><path d="M0 44q10-6 20 0t20 0 20 0 20 0 20 0"/><path d="M0 96q10-6 20 0t20 0 20 0 20 0 20 0"/></g>
      <path d="M-5 128q30-10 55-4t55-2V160H-5z" fill="#f4dca4"/>${dots([[10, 138], [24, 134], [40, 140], [62, 136], [80, 140], [92, 132]], 1, '#c9a868')}
      <ellipse cx="50" cy="128" rx="34" ry="5" fill="#0005"/>${icon('manta-ray', 4, 30, 92, '#1e4a66', '')}
      ${dots([[36, 68], [44, 76], [58, 70], [64, 80], [50, 62], [30, 78], [70, 70]], 1.6, '#bff6ee', .9)}${bubbles([[16, 30, 2], [84, 40, 2.4], [80, 30, 1.4]])}`},
    davy: {k: '#0b4a36', f: u => `<defs>${lin('a' + u, '#020807', '#0b3a2c')}${rad('b' + u, '#5dffb0', '#5dffb000', .5, .5, .5)}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <circle cx="50" cy="80" r="46" fill="url(#b${u})" opacity=".55"/>
      <g fill="none" stroke="#6a7a72" stroke-width="3" stroke-dasharray="5 2" opacity=".85"><path d="M0 20L50 60"/><path d="M100 26L52 62"/><path d="M0 120L44 96"/><path d="M100 128L56 98"/></g>
      ${icon('locked-chest', 12, 42, 76, '#a8ffd2', '#000c')}${bubbles([[20, 50, 2], [26, 40, 1.4], [80, 90, 2.4], [76, 78, 1.4], [50, 24, 2], [54, 16, 1.2]])}`},
    salvo: {k: '#b83a08', f: u => `<defs>${lin('a' + u, '#2a0c04', '#ff7a1a')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <path d="M64 46l6-16 2 14 12-10-6 14 16-2-14 8 14 8-16-2 6 14-12-10-2 14-6-16z" fill="#ffd23a" opacity=".9"/>
      <g fill="#8a7a72" opacity=".55"><circle cx="22" cy="108" r="14"/><circle cx="36" cy="118" r="12"/><circle cx="12" cy="124" r="10"/><circle cx="78" cy="122" r="12"/><circle cx="90" cy="112" r="9"/></g>
      ${icon('cannon-shot', 4, 26, 92, '#160904', '#ffb34766')}${dots([[86, 20], [16, 30], [40, 14], [92, 70], [10, 70]], 1.3, '#ffe27a')}`},
    plank: {k: '#6e3f1a', f: u => `<defs>${lin('a' + u, '#ff8fa3', '#ffd6a0')}</defs><rect width="100" height="148" fill="url(#a${u})"/>
      <circle cx="50" cy="96" r="22" fill="#fff1c9" opacity=".8"/>${waves(96, '#2a6496')}${waves(108, '#1d4e7a')}
      <g fill="#36404a"><path d="M22 116q6-12 12 0z"/><path d="M60 126q7-14 14 0z"/><path d="M84 112q4-8 8 0z"/></g>${waves(132, '#123659')}
      ${icon('planks', 4, 14, 92, '#7a4a20', '#0005', -14)}
      <g stroke="#2b2b2b" fill="none" stroke-width="1.1"><path d="M10 30q4-3 8 0q4-3 8 0"/><path d="M72 24q3-2 6 0q3-2 6 0"/></g>`},
  };
  let U = 0;
  // Décor d'une carte spéciale : {k: couleur du liseré, svg} ou null
  const scene = t => {
    const S = SCENES[t];
    if (!S || !GI['flying-flag']) return null;
    const u = 'sks' + (++U);
    return {k: S.k, svg: `<svg class="skc-scene" viewBox="0 0 100 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${S.f(u)}</svg>`};
  };
  window.SkullArt = Object.freeze({svg, has, scene});
})();
