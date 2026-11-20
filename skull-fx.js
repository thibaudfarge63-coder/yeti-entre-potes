/* Skull King : motion design des cartes spéciales (faits maison, Web Animations API, sans dépendance).
   SkullFX.play(type, carte, table)  → quand la carte est posée
   SkullFX.win(type, carte, table, pli) → quand la carte gagne le pli (pour le Kraken : quand il engloutit le pli)
   type = escape, loot, pirate, tigress, second, king, mermaid, kraken, whale, ray, davy, salvo, plank */
(() => {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- calque d'effets posé sur la table ----------
  function layer(table) {
    let L = table.querySelector(':scope > .skfx');
    if (!L) {
      L = document.createElement('div'); L.className = 'skfx';
      L.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:40;border-radius:inherit';
      if (getComputedStyle(table).position === 'static') table.style.position = 'relative';
      table.appendChild(L);
    }
    return L;
  }
  function at(el, L) {
    const a = el.getBoundingClientRect(), b = L.getBoundingClientRect();
    return {x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: a.width, h: a.height, W: b.width, H: b.height};
  }
  function spawn(L, html, x, y, frames, opt = {}) {
    const d = document.createElement('div');
    d.className = 'skfx-p';
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);will-change:transform,opacity;${opt.css || ''}`;
    d.innerHTML = html;
    L.appendChild(d);
    const a = d.animate(frames, {duration: opt.dur || 900, delay: opt.delay || 0, easing: opt.ease || 'cubic-bezier(.2,.7,.3,1)', fill: 'both'});
    a.onfinish = () => d.remove();
    return a;
  }
  const T = (x, y, s = 1, r = 0) => `translate(-50%,-50%) translate(${x}px,${y}px) scale(${s}) rotate(${r}deg)`;
  function burst(L, x, y, n, html, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -90) + R(-(o.spread ?? 180), o.spread ?? 180), d = R(o.min ?? 40, o.dist ?? 120), rad = a * Math.PI / 180;
      const dx = Math.cos(rad) * d, dy = Math.sin(rad) * d, g = o.gravity || 0, rot = R(-1, 1) * (o.rot ?? 360);
      const s0 = o.s0 ?? .4, s1 = R(o.smin ?? .7, o.smax ?? 1.2);
      spawn(L, typeof html === 'function' ? html(i) : html, x, y, [
        {transform: T(0, 0, s0, 0), opacity: 1},
        {transform: T(dx * .7, dy * .7 + g * .2, s1, rot * .6), opacity: 1, offset: .6},
        {transform: T(dx, dy + g, s1 * (o.send ?? .8), rot), opacity: 0},
      ], {dur: R(o.dmin ?? 700, o.dmax ?? 1200), delay: R(0, o.stagger ?? 120), ease: 'cubic-bezier(.15,.8,.3,1)'});
    }
  }
  function rain(L, n, html, o = {}) {
    const {W, H} = {W: L.clientWidth, H: L.clientHeight};
    for (let i = 0; i < n; i++) {
      const x = R(0, W), drift = R(-40, 40);
      spawn(L, typeof html === 'function' ? html(i) : html, x, -30, [
        {transform: T(0, 0, R(.7, 1.2), R(-90, 90)), opacity: 1},
        {transform: T(drift, H + 60, R(.7, 1.2), R(-540, 540)), opacity: 1},
      ], {dur: R(o.dmin ?? 1100, o.dmax ?? 2000), delay: R(0, o.spread ?? 900), ease: 'cubic-bezier(.5,0,.8,.6)'});
    }
  }
  function rings(L, x, y, color, n = 3, o = {}) {
    for (let i = 0; i < n; i++) spawn(L, '', x, y, [
      {transform: T(0, 0, .2), opacity: .9}, {transform: T(0, 0, o.scale ?? 4), opacity: 0},
    ], {dur: o.dur ?? 900, delay: i * (o.gap ?? 160), ease: 'cubic-bezier(.2,.6,.3,1)',
      css: `width:${o.size ?? 60}px;height:${o.size ?? 60}px;border-radius:50%;border:${o.bw ?? 3}px solid ${color};box-shadow:0 0 12px ${color}`});
  }
  function flash(L, bg, dur = 500, peak = .8) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;inset:0;background:${bg};pointer-events:none`;
    L.appendChild(d);
    d.animate([{opacity: 0}, {opacity: peak, offset: .15}, {opacity: 0}], {duration: dur, easing: 'ease-out'}).onfinish = () => d.remove();
  }
  function veil(L, bg, dur, hold = .6) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;inset:0;background:${bg};pointer-events:none`;
    L.appendChild(d);
    d.animate([{opacity: 0}, {opacity: 1, offset: .15}, {opacity: 1, offset: hold}, {opacity: 0}], {duration: dur, easing: 'ease-in-out'}).onfinish = () => d.remove();
    return d;
  }
  function banner(L, text, color = '#ffd54a', o = {}) {
    const {W, H} = {W: L.clientWidth, H: L.clientHeight};
    spawn(L, `<b style="display:block;white-space:nowrap;font:900 ${o.size || Math.max(18, Math.min(34, W / 14))}px Georgia,'Times New Roman',serif;color:${color};
      letter-spacing:1px;text-shadow:0 2px 0 #000,0 0 18px ${color}88;-webkit-text-stroke:1px #0008">${text}</b>`, W / 2, o.y ?? H * .2, [
      {transform: T(0, 20, .4, -6), opacity: 0}, {transform: T(0, 0, 1.12, 2), opacity: 1, offset: .18},
      {transform: T(0, 0, 1, 0), opacity: 1, offset: .3}, {transform: T(0, 0, 1, 0), opacity: 1, offset: .8}, {transform: T(0, -14, .95, 0), opacity: 0},
    ], {dur: o.dur || 1900, delay: o.delay || 0, ease: 'ease-out'});
  }
  function shake(el, px = 8, dur = 450) {
    const k = []; for (let i = 0; i < 8; i++) k.push({transform: `translate(${R(-px, px)}px,${R(-px, px)}px) rotate(${R(-px / 6, px / 6)}deg)`});
    k.unshift({transform: 'none'}); k.push({transform: 'none'});
    el.animate(k, {duration: dur, easing: 'linear'});
  }
  const card = (el, frames, dur, o = {}) => el.animate(frames, {duration: dur, easing: o.ease || 'cubic-bezier(.2,.8,.3,1.2)', ...o});
  const glow = (el, color, dur = 1600) => el.animate([{boxShadow: `0 0 0 0 ${color}`, filter: 'brightness(1)'},
    {boxShadow: `0 0 0 6px ${color}, 0 0 34px 10px ${color}`, filter: 'brightness(1.25)', offset: .3}, {boxShadow: `0 0 0 3px ${color}, 0 0 16px ${color}`, filter: 'brightness(1)'}],
  {duration: dur, easing: 'ease-out'});

  // ---------- petits dessins ----------
  const svg = (w, h, body, vb) => `<svg width="${w}" height="${h}" viewBox="${vb || `0 0 ${w} ${h}`}" style="display:block;overflow:visible">${body}</svg>`;
  const COIN = () => svg(18, 18, `<circle cx="9" cy="9" r="8" fill="#ffd23a" stroke="#a86e00" stroke-width="1.6"/><circle cx="9" cy="9" r="4.5" fill="none" stroke="#e5a400" stroke-width="1.2"/><circle cx="6.5" cy="6" r="1.6" fill="#fff8"/>`);
  const BUBBLE = () => { const s = R(6, 16); return svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="#bff3ff22" stroke="#e6fbff" stroke-width="1.2"/><circle cx="${s * .35}" cy="${s * .35}" r="${s * .12}" fill="#fff"/>`); };
  const STAR = (c = '#ffe680') => svg(16, 16, `<path d="M8 0L10 6 16 8 10 10 8 16 6 10 0 8 6 6z" fill="${c}"/>`);
  const DROP = (c = '#9fe3ff') => svg(10, 14, `<path d="M5 0C7 4 10 7 10 9.5A5 5 0 0 1 0 9.5C0 7 3 4 5 0z" fill="${c}" stroke="#fff6" stroke-width=".8"/>`);
  const PUFF = (c = '#ffffffcc') => { const s = R(24, 46); return svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${c}"/>`); };
  const SPARK = (c = '#fff3b0') => svg(4, 22, `<rect width="4" height="22" rx="2" fill="${c}"/>`);
  const NOTE = () => `<b style="font:900 ${Math.round(R(16, 26))}px Georgia,serif;color:${pick(['#ffb3c7', '#9ff3ea', '#fff'])};text-shadow:0 0 8px #0ff8">${pick(['♪', '♫', '♬'])}</b>`;
  const CONF = () => svg(8, 12, `<rect width="8" height="12" rx="1.5" fill="${pick(['#ffcc33', '#ffe680', '#ff3b3b', '#fff', '#e8b53a'])}"/>`);
  const GI = (n, s, fill, extra = '') => `<svg width="${s}" height="${s}" viewBox="0 0 512 512" style="display:block;${extra}"><use href="#skg-${n}" fill="${fill}"/></svg>`;
  const FIN = () => svg(34, 26, `<path d="M2 26C10 18 18 6 30 0 27 10 28 18 32 26z" fill="#3a4652" stroke="#1d242b" stroke-width="1.5"/><path d="M0 26q17-5 34 0" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>`);
  const LINK = () => svg(22, 12, `<rect x="1.5" y="1.5" width="19" height="9" rx="4.5" fill="none" stroke="#8a9a92" stroke-width="3"/>`);
  const MEDAL = c => svg(22, 32, `<path d="M4 0h6l3 12H7zM12 0h6l-3 12H9z" fill="${c}"/><circle cx="11" cy="21" r="9" fill="#ffcc33" stroke="#9a6b10" stroke-width="1.5"/><path d="M11 15l1.8 4 4.2.4-3.2 2.8 1 4.2-3.8-2.2-3.8 2.2 1-4.2-3.2-2.8 4.2-.4z" fill="#9a6b10"/>`);

  // traits de griffe / sabre qui se dessinent
  function strokes(L, x, y, paths, color, w, dur, o = {}) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${o.rot || 0}deg);pointer-events:none`;
    d.innerHTML = svg(o.w || 120, o.h || 120, paths.map(p => `<path d="${p}" pathLength="1" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${color})"/>`).join(''));
    L.appendChild(d);
    d.querySelectorAll('path').forEach((p, i) => {
      p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1';
      p.animate([{strokeDashoffset: 1}, {strokeDashoffset: 0}], {duration: dur * .35, delay: i * (o.gap ?? 70), fill: 'forwards', easing: 'cubic-bezier(.7,0,.3,1)'});
    });
    d.animate([{opacity: 1}, {opacity: 1, offset: .65}, {opacity: 0}], {duration: dur, fill: 'forwards'}).onfinish = () => d.remove();
  }

  // ---------- les animations, carte par carte ----------
  const FX = {
    wind: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'rotate(0)'}, {transform: 'rotate(360deg) scale(1.08)', offset: .7}, {transform: 'rotate(360deg)'}], 1100, {ease: 'ease-in-out'});
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = p.w * 1.1;
          spawn(L, `<i style="display:block;width:${R(24, 44)}px;height:2px;border-radius:2px;background:#fff;opacity:.85"></i>`, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
            [{transform: T(0, 0), opacity: 0}, {transform: T(-Math.sin(a) * 40, Math.cos(a) * 40), opacity: .9, offset: .5}, {transform: T(-Math.sin(a) * 80, Math.cos(a) * 80), opacity: 0}],
            {dur: 900, delay: i * 50, ease: 'ease-in-out'}); }
        banner(L, 'LE VENT TOURNE !', '#bfe6f5', {delay: 150});
      },
    },
    escape: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(-50px) rotate(-14deg) scale(.8)', opacity: 0}, {transform: 'translateY(4px) rotate(7deg) scale(1.03)', opacity: 1, offset: .45},
          {transform: 'rotate(-4deg)', offset: .7}, {transform: 'rotate(2deg)', offset: .85}, {transform: 'none'}], 1000);
        for (let i = 0; i < 6; i++) spawn(L, `<i style="display:block;width:${R(30, 60)}px;height:2px;border-radius:2px;background:#fff;opacity:.85"></i>`,
          p.x - p.w, p.y + R(-p.h / 2, p.h / 2), [{transform: T(-30, 0), opacity: 0}, {transform: T(p.w, 0), opacity: .9, offset: .5}, {transform: T(p.w * 2.4, 0), opacity: 0}],
          {dur: 700, delay: i * 70, ease: 'ease-in-out'});
      },
      async win(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'none'}, {transform: 'skewY(6deg) rotate(-3deg)'}, {transform: 'skewY(-6deg) rotate(3deg)'}, {transform: 'skewY(5deg)'}, {transform: 'skewY(-4deg)'}, {transform: 'none'}],
          1300, {ease: 'ease-in-out'});
        burst(L, p.x, p.y, 10, () => PUFF('#ffffffd0'), {angle: -90, spread: 70, dist: 110, min: 50, dmin: 1100, dmax: 1700, s0: .3, smax: 1.4, rot: 0, send: 1.4});
        spawn(L, `<b style="font:900 20px Georgia,serif;color:#3d9fd4;background:#fff;padding:4px 10px;border-radius:14px;box-shadow:0 3px 0 #0003;white-space:nowrap">Pfiou… filé !</b>`,
          p.x, p.y - p.h * .75, [{transform: T(0, 10, .3), opacity: 0}, {transform: T(0, 0, 1.1), opacity: 1, offset: .2}, {transform: T(0, 0, 1), opacity: 1, offset: .8}, {transform: T(0, -10, 1), opacity: 0}], {dur: 1600});
      },
    },
    loot: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(-40px) scale(.9)', opacity: 0}, {transform: 'translateY(0) scale(1.05)', opacity: 1, offset: .5}, {transform: 'translateY(-8px)', offset: .7}, {transform: 'none'}], 800);
        burst(L, p.x, p.y, 16, COIN, {angle: -90, spread: 80, dist: 110, gravity: 90, dmin: 800, dmax: 1200, rot: 720, smax: 1.1});
      },
      win(el, L) {
        const p = at(el, L);
        glow(el, '#ffd23a', 1800);
        rain(L, 46, COIN, {dmin: 1000, dmax: 1800, spread: 1100});
        burst(L, p.x, p.y, 10, () => STAR('#fff7c2'), {dist: 90, smax: 1.4});
        banner(L, 'JACKPOT !', '#ffd23a');
      },
    },
    pirate: {
      play(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'translateX(-140px) skewX(-18deg) rotate(-8deg)', opacity: 0}, {transform: 'translateX(10px) skewX(8deg)', opacity: 1, offset: .55}, {transform: 'none'}], 600,
          {ease: 'cubic-bezier(.3,1.4,.5,1)'});
        strokes(L, p.x, p.y, ['M10 110L110 10', 'M10 10L110 110'], '#fff', 5, 700, {gap: 140, w: 120, h: 120});
        setTimeout(() => burst(L, p.x, p.y, 10, () => SPARK(), {dist: 70, min: 30, rot: 0, dmin: 350, dmax: 600}), 250);
        setTimeout(() => shake(table, 4, 250), 260);
      },
      win(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'none'}, {transform: 'translateY(-14px) scale(1.25) rotate(-6deg)', offset: .3}, {transform: 'translateY(-14px) scale(1.25) rotate(6deg)', offset: .55}, {transform: 'none'}], 1300);
        strokes(L, p.x, p.y, ['M0 140L140 0', 'M0 0L140 140', 'M20 70H120'], '#ffd9a0', 6, 900, {gap: 110, w: 140, h: 140});
        setTimeout(() => { shake(table, 9, 500); flash(L, 'radial-gradient(circle,#ff5a3666,transparent 70%)', 600); }, 300);
        banner(L, 'À L’ABORDAGE !', '#ff6a3d', {delay: 200});
      },
    },
    tigress: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'scale(.55) translateY(30px)', opacity: 0}, {transform: 'scale(1.18) translateY(-10px)', opacity: 1, offset: .5}, {transform: 'scale(.96)', offset: .75}, {transform: 'none'}], 700);
        setTimeout(() => strokes(L, p.x, p.y, ['M20 15Q55 60 40 115', 'M50 10Q85 60 70 118', 'M80 15Q112 60 98 112'], '#ff7a1a', 6, 900, {gap: 60, rot: -14}), 250);
      },
      win(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'none'}, {transform: 'scale(1.3)', offset: .2}, {transform: 'scale(1.1)', offset: .5}, {transform: 'none'}], 1200);
        rings(L, p.x, p.y, '#ff8a1a', 4, {scale: 6, gap: 120, dur: 1000});
        setTimeout(() => shake(table, 10, 600), 150);
        for (let i = 0; i < 5; i++) spawn(L, `<i style="display:block;width:140%;height:16px;background:#1c0b02;border-radius:8px;opacity:.5"></i>`, L.clientWidth / 2, L.clientHeight * (.15 + i * .18),
          [{transform: T(-L.clientWidth, 0, 1, -12), opacity: 0}, {transform: T(0, 0, 1, -12), opacity: .6, offset: .4}, {transform: T(L.clientWidth, 0, 1, -12), opacity: 0}],
          {dur: 900, delay: 200 + i * 60, ease: 'ease-in-out', css: `width:${L.clientWidth}px`});
        banner(L, 'GRAOOOR !', '#ff8a1a', {delay: 150});
      },
    },
    second: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(40px)', opacity: 0}, {transform: 'translateY(20px)', opacity: 1, offset: .2}, {transform: 'translateY(26px)', offset: .3},
          {transform: 'translateY(8px)', offset: .5}, {transform: 'translateY(14px)', offset: .6}, {transform: 'translateY(-4px)', offset: .8}, {transform: 'none'}], 900, {ease: 'linear'});
        for (let i = 0; i < 3; i++) spawn(L, svg(40, 16, '<path d="M2 2l18 10 18-10" stroke="#ffcc33" stroke-width="5" fill="none" stroke-linejoin="round"/>'), p.x, p.y - p.h / 2 - 8 - i * 12,
          [{transform: T(0, -20, .5), opacity: 0}, {transform: T(0, 0, 1), opacity: 1, offset: .3}, {transform: T(0, 0, 1), opacity: 1, offset: .8}, {transform: T(0, -10, 1), opacity: 0}],
          {dur: 1200, delay: 300 + i * 140});
      },
      win(el, L) {
        const p = at(el, L);
        glow(el, '#ffcc33', 1600);
        card(el, [{transform: 'none'}, {transform: 'translateY(-10px) scale(1.15)', offset: .3}, {transform: 'translateY(-10px) scale(1.15)', offset: .7}, {transform: 'none'}], 1500);
        const cols = ['#c8102e', '#2b6cff', '#1f9a4a', '#ffcc33', '#7a3aff'];
        cols.forEach((c, i) => {
          const a = (-150 + i * 30) * Math.PI / 180, r = p.h * .85;
          spawn(L, MEDAL(c), p.x, p.y, [{transform: T(0, 0, .2, -40), opacity: 0}, {transform: T(Math.cos(a) * r, Math.sin(a) * r, 1.2, 10), opacity: 1, offset: .35},
            {transform: T(Math.cos(a) * r, Math.sin(a) * r, 1, 0), opacity: 1, offset: .8}, {transform: T(Math.cos(a) * r, Math.sin(a) * r + 20, 1, 0), opacity: 0}], {dur: 1700, delay: i * 90});
        });
        burst(L, p.x, p.y, 14, () => STAR('#fff'), {dist: 130, delay: 200});
        banner(L, 'GARDE-À-VOUS !', '#ffcc33', {y: L.clientHeight * .12});
      },
    },
    king: {
      play(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(-260px) scale(1.6) rotate(-10deg)', opacity: 0}, {transform: 'translateY(0) scale(1)', opacity: 1, offset: .55}, {transform: 'scale(1.08,.92)', offset: .65},
          {transform: 'none'}], 900, {ease: 'cubic-bezier(.6,0,.9,.5)'});
        setTimeout(() => {
          shake(table, 12, 500);
          rings(L, p.x, p.y + p.h / 2, '#ffcc33', 2, {scale: 5, size: 40});
          burst(L, p.x, p.y + p.h / 2, 18, () => STAR(), {angle: -90, spread: 90, dist: 90, dmin: 600, dmax: 900});
        }, 480);
      },
      async win(el, L, table) {
        const p = at(el, L);
        veil(L, 'radial-gradient(circle at 50% 50%,#2a020688,#000c)', 2600, .75);
        const rays = spawn(L, '', p.x, p.y, [{transform: T(0, 0, .2, 0), opacity: 0}, {transform: T(0, 0, 1, 60), opacity: .95, offset: .25}, {transform: T(0, 0, 1.1, 200), opacity: .9, offset: .8},
          {transform: T(0, 0, 1.3, 260), opacity: 0}], {dur: 2600, ease: 'linear',
          css: `width:${Math.max(L.clientWidth, L.clientHeight) * 1.5}px;height:${Math.max(L.clientWidth, L.clientHeight) * 1.5}px;border-radius:50%;
            background:repeating-conic-gradient(#ffcc3388 0 6deg,transparent 6deg 18deg);mask:radial-gradient(circle,#000 10%,transparent 60%);-webkit-mask:radial-gradient(circle,#000 10%,transparent 60%)`});
        card(el, [{transform: 'none'}, {transform: 'translateY(-16px) scale(1.4)', offset: .2}, {transform: 'translateY(-16px) scale(1.4)', offset: .8}, {transform: 'none'}], 2600);
        spawn(L, GI('jewel-crown', 70, '#ffcc33', 'filter:drop-shadow(0 0 10px #ffcc33)'), p.x, p.y - p.h * .95,
          [{transform: T(0, -200, 1.6, -30), opacity: 0}, {transform: T(0, 0, 1, 8), opacity: 1, offset: .35}, {transform: T(0, -4, 1, -4), opacity: 1, offset: .5},
            {transform: T(0, 0, 1, 0), opacity: 1, offset: .85}, {transform: T(0, 0, 1, 0), opacity: 0}], {dur: 2600, ease: 'cubic-bezier(.3,1.3,.5,1)'});
        setTimeout(() => { shake(table, 8, 400); burst(L, p.x, p.y, 60, CONF, {dist: 220, gravity: 120, dmin: 1200, dmax: 2000, rot: 720}); }, 800);
        banner(L, 'VIVE LE ROI !', '#ffcc33', {delay: 600, dur: 1900});
        void rays;
      },
    },
    mermaid: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(60px) rotate(8deg)', opacity: 0}, {transform: 'translateY(-6px) rotate(-5deg)', opacity: 1, offset: .5}, {transform: 'rotate(3deg)', offset: .75}, {transform: 'none'}],
          1100, {ease: 'ease-out'});
        for (let i = 0; i < 16; i++) spawn(L, BUBBLE(), p.x + R(-p.w / 2, p.w / 2), p.y + p.h / 2, [{transform: T(0, 0, .5), opacity: 0},
          {transform: T(R(-10, 10), -p.h * .6, 1), opacity: 1, offset: .4}, {transform: T(R(-20, 20), -p.h * 1.6, 1.1), opacity: 0}], {dur: R(1100, 1700), delay: R(0, 600), ease: 'ease-out'});
        rings(L, p.x, p.y + p.h / 2, '#9ff3ea', 3, {scale: 3, size: 40, bw: 2, gap: 220});
      },
      win(el, L) {
        const p = at(el, L);
        veil(L, 'linear-gradient(180deg,#3fd0d644,#063c5288)', 2200, .7);
        card(el, [{transform: 'none'}, {transform: 'translateY(-14px) rotate(-6deg) scale(1.2)', offset: .25}, {transform: 'translateY(-6px) rotate(6deg) scale(1.2)', offset: .5},
          {transform: 'translateY(-14px) rotate(-3deg) scale(1.2)', offset: .75}, {transform: 'none'}], 2000, {ease: 'ease-in-out'});
        glow(el, '#ff9c8a', 2000);
        for (let i = 0; i < 14; i++) spawn(L, NOTE(), p.x + R(-30, 30), p.y, [{transform: T(0, 0, .4, 0), opacity: 0},
          {transform: T(R(-120, 120), R(-80, -160), 1, R(-30, 30)), opacity: 1, offset: .5}, {transform: T(R(-180, 180), R(-160, -240), 1.2, R(-40, 40)), opacity: 0}], {dur: R(1400, 2100), delay: i * 90});
        rings(L, p.x, p.y, '#9ff3ea', 4, {scale: 7, gap: 240, dur: 1500, bw: 2});
        banner(L, '♪ ENVOÛTÉS ♪', '#ffb3c7', {delay: 200});
      },
    },
    kraken: {
      play(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(30px) scale(.8)', opacity: 0, filter: 'brightness(.3)'}, {transform: 'none', opacity: 1, filter: 'brightness(1)'}], 900);
        veil(L, '#1b0a2a88', 1600, .55);
        [[-1, 1], [1, 1]].forEach(([sx], i) => spawn(L, GI('kraken-tentacle', 170, '#a23d8f', `transform:scaleX(${sx});filter:drop-shadow(0 6px 10px #000a)`),
          sx < 0 ? 40 : L.clientWidth - 40, L.clientHeight + 20, [{transform: T(0, 120, 1, sx * 20)}, {transform: T(0, -40, 1, -sx * 8), offset: .45}, {transform: T(0, -30, 1, sx * 6), offset: .65},
            {transform: T(0, 140, 1, sx * 20)}], {dur: 1600, delay: i * 120, ease: 'ease-in-out'}));
        setTimeout(() => shake(table, 6, 500), 500);
      },
      async win(el, L, table, trick = []) {
        const p = at(el, L);
        veil(L, 'radial-gradient(circle,#2a0c3acc,#05020acc)', 2800, .8);
        setTimeout(() => flash(L, '#fff6c8', 260, .9), 150);
        setTimeout(() => flash(L, '#fff6c8', 200, .7), 520);
        const W = L.clientWidth, H = L.clientHeight;
        [[0, H], [W, H], [0, 0], [W, 0]].forEach(([x, y], i) => spawn(L, GI('kraken-tentacle', 200, '#a23d8f', 'filter:drop-shadow(0 6px 12px #000)'), x, y,
          [{transform: T(0, 0, .3, i * 90)}, {transform: T((p.x - x) * .55, (p.y - y) * .55, 1.1, i * 90 + 20), offset: .45}, {transform: T((p.x - x) * .6, (p.y - y) * .6, 1, i * 90 - 10), offset: .65},
            {transform: T(0, 0, .3, i * 90)}], {dur: 2600, delay: i * 90, ease: 'ease-in-out'}));
        shake(table, 10, 900);
        await wait(1000);
        for (const c of trick.length ? trick : [el]) c.animate([{transform: 'none', opacity: 1}, {transform: `translateY(40px) scale(.2) rotate(${R(-200, 200)}deg)`, opacity: 0}],
          {duration: 900, easing: 'cubic-bezier(.6,0,.9,.6)', fill: 'forwards'});
        banner(L, 'ENGLOUTI !', '#d77bff');
        await wait(1500);
        for (const c of trick.length ? trick : [el]) c.getAnimations().forEach(a => a.cancel());
      },
    },
    whale: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(50px) scale(.8)', opacity: 0}, {transform: 'translateY(-10px) scale(1.05)', opacity: 1, offset: .5}, {transform: 'none'}], 800);
        burst(L, p.x, p.y + p.h * .3, 26, () => DROP(), {angle: -90, spread: 70, dist: 150, gravity: 140, dmin: 900, dmax: 1300, rot: 40});
        rings(L, p.x, p.y + p.h / 2, '#bfe9ff', 3, {scale: 4, size: 50, bw: 2});
      },
      win(el, L, table) {
        const p = at(el, L), W = L.clientWidth, H = L.clientHeight;
        veil(L, 'linear-gradient(180deg,#03122899,#0a2a4ab0)', 2800, .8);
        spawn(L, GI('sperm-whale', Math.min(W * .8, 420), '#eaf4ff', 'opacity:.85;filter:drop-shadow(0 10px 20px #000a)'), -W * .4, H * .55,
          [{transform: T(0, 30, 1, -4)}, {transform: T(W * .8, -10, 1, 4), offset: .5}, {transform: T(W * 1.8, 20, 1, -2)}], {dur: 2800, ease: 'ease-in-out'});
        setTimeout(() => {
          for (let i = 0; i < 40; i++) spawn(L, DROP('#e6f7ff'), p.x + R(-8, 8), p.y - p.h / 2, [{transform: T(0, 0, .6)}, {transform: T(R(-50, 50), -R(120, 220), 1)},
            {transform: T(R(-90, 90), R(-40, 40), .8), opacity: 0}], {dur: R(1100, 1600), delay: R(0, 500), ease: 'cubic-bezier(.2,.8,.5,1)'});
          shake(table, 6, 500);
        }, 900);
        card(el, [{transform: 'none'}, {transform: 'translateY(-18px) scale(1.2)', offset: .4}, {transform: 'translateY(-18px) scale(1.2)', offset: .8}, {transform: 'none'}], 2400);
        banner(L, 'LA BALEINE SURGIT !', '#eaf4ff', {delay: 900});
      },
    },
    ray: {
      play(el, L) {
        card(el, [{transform: 'translate(160px,-30px) rotate(25deg)', opacity: 0}, {transform: 'translate(80px,20px) rotate(-12deg)', opacity: 1, offset: .35},
          {transform: 'translate(20px,-10px) rotate(8deg)', offset: .7}, {transform: 'none'}], 1100, {ease: 'ease-in-out'});
        const p = at(el, L);
        for (let i = 0; i < 3; i++) spawn(L, `<i style="display:block;width:${p.w * 1.8}px;height:${p.h * 1.4}px;border-radius:40%;background:radial-gradient(ellipse,#bff6ee55,transparent 60%)"></i>`,
          p.x, p.y, [{transform: T(0, 0, .6), opacity: 0}, {transform: T(0, 0, 1.2), opacity: 1, offset: .5}, {transform: T(0, 0, 1.6), opacity: 0}], {dur: 1200, delay: 300 + i * 200});
      },
      win(el, L) {
        const p = at(el, L), W = L.clientWidth, H = L.clientHeight;
        veil(L, 'linear-gradient(180deg,#8ff2e433,#1495a866)', 2400, .75);
        spawn(L, GI('manta-ray', Math.min(W * .5, 260), '#1e4a66', 'opacity:.8'), W + 150, H * .35,
          [{transform: T(0, 0, 1, -10)}, {transform: T(-W * .6, H * .15, 1, 6), offset: .5}, {transform: T(-W - 300, 0, 1, -8)}], {dur: 2400, ease: 'ease-in-out'});
        for (let i = 0; i < 18; i++) spawn(L, `<i style="display:block;width:10px;height:10px;border-radius:50%;background:#bff6ee;box-shadow:0 0 12px #bff6ee"></i>`,
          p.x + R(-p.w, p.w), p.y + R(-p.h, p.h), [{transform: T(0, 0, 0), opacity: 0}, {transform: T(0, 0, 1.4), opacity: 1, offset: .4}, {transform: T(0, 0, 0), opacity: 0}],
          {dur: 900, delay: R(0, 1200)});
        burst(L, p.x, p.y + p.h / 2, 12, () => PUFF('#f4dca4aa'), {angle: -90, spread: 90, dist: 70, rot: 0, s0: .2, smax: 1});
        card(el, [{transform: 'none'}, {transform: 'translateY(-12px) scale(1.18) rotate(-4deg)', offset: .35}, {transform: 'translateY(-12px) scale(1.18) rotate(4deg)', offset: .7}, {transform: 'none'}],
          2000, {ease: 'ease-in-out'});
        banner(L, 'TOUT EN BAS !', '#bff6ee', {delay: 300});
      },
    },
    davy: {
      play(el, L, table) {
        const p = at(el, L);
        card(el, [{transform: 'scale(1.3)', opacity: 0, filter: 'brightness(2) hue-rotate(60deg)'}, {transform: 'none', opacity: 1, filter: 'none'}], 700);
        [-1, 1].forEach(sx => { for (let i = 0; i < 6; i++) spawn(L, LINK(), p.x + sx * (p.w * 2.4 - i * 16), p.y + R(-4, 4), [{transform: T(sx * 120, 0, 1, sx * 10), opacity: 0},
          {transform: T(0, 0, 1, 0), opacity: 1, offset: .35}, {transform: T(0, 0, 1, 0), opacity: 1, offset: .8}, {transform: T(0, 0, 1, 0), opacity: 0}], {dur: 1300, delay: i * 30, ease: 'cubic-bezier(.3,1.4,.5,1)'}); });
        setTimeout(() => { shake(table, 5, 300); rings(L, p.x, p.y, '#5dffb0', 2, {scale: 3}); }, 420);
      },
      async win(el, L, table, trick = []) {
        const p = at(el, L);
        veil(L, 'radial-gradient(circle,#0e3b2ccc,#020807ee)', 2600, .75);
        for (let i = 0; i < 12; i++) spawn(L, PUFF('#5dffb033'), p.x + R(-150, 150), p.y + R(-60, 80), [{transform: T(0, 0, .5), opacity: 0},
          {transform: T(R(-30, 30), -40, 2.2), opacity: 1, offset: .5}, {transform: T(R(-60, 60), -90, 3), opacity: 0}], {dur: 2200, delay: R(0, 600), ease: 'ease-out'});
        spawn(L, GI('locked-chest', 90, '#a8ffd2', 'filter:drop-shadow(0 0 16px #5dffb0)'), p.x, p.y - p.h,
          [{transform: T(0, -60, .3), opacity: 0}, {transform: T(0, 0, 1.2), opacity: 1, offset: .3}, {transform: T(0, 0, .95), opacity: 1, offset: .45}, {transform: T(0, 0, 1), opacity: 1, offset: .85},
            {transform: T(0, 10, 1), opacity: 0}], {dur: 2400, ease: 'cubic-bezier(.3,1.4,.5,1)'});
        glow(el, '#5dffb0', 2200);
        const lev = trick.filter(c => c !== el && /sp-(kraken|whale|ray)/.test(c.className));
        await wait(700);
        for (const c of lev) c.animate([{transform: 'none', opacity: 1, filter: 'none'}, {transform: 'translateY(60px) scale(.4) rotate(20deg)', opacity: 0, filter: 'hue-rotate(90deg) brightness(.4)'}],
          {duration: 1100, easing: 'ease-in', fill: 'forwards'});
        banner(L, 'AU FOND DU CASIER !', '#7dffb0');
        await wait(1800);
        for (const c of lev) c.getAnimations().forEach(a => a.cancel());
      },
    },
    salvo: {
      play(el, L, table) {
        const p = at(el, L);
        flash(L, 'radial-gradient(circle at 50% 50%,#fff3b0,#ff7a1a88 40%,transparent 70%)', 450, 1);
        card(el, [{transform: 'translateX(-80px) scale(.8)', opacity: 0}, {transform: 'translateX(6px) scale(1.06)', opacity: 1, offset: .3}, {transform: 'translateX(-12px)', offset: .5}, {transform: 'none'}], 700);
        burst(L, p.x - p.w / 2, p.y, 10, () => PUFF('#8a7a72aa'), {angle: 180, spread: 50, dist: 90, rot: 0, s0: .3, smax: 1.4, send: 1.6, dmin: 900, dmax: 1400});
        burst(L, p.x, p.y, 12, () => SPARK('#ffd23a'), {dist: 80, min: 30, rot: 0, dmin: 400, dmax: 700});
        shake(table, 7, 350);
      },
      async win(el, L, table) {
        const W = L.clientWidth, H = L.clientHeight;
        for (let i = 0; i < 6; i++) {
          setTimeout(() => {
            const x = R(W * .1, W * .9), y = R(H * .15, H * .85);
            spawn(L, '', x, y, [{transform: T(0, 0, .1), opacity: 1}, {transform: T(0, 0, 1.4), opacity: .9, offset: .3}, {transform: T(0, 0, 2), opacity: 0}], {dur: 650,
              css: 'width:90px;height:90px;border-radius:50%;background:radial-gradient(circle,#fff6c8,#ffb12e 35%,#ff4a1a 60%,transparent 70%)'});
            burst(L, x, y, 8, () => PUFF('#6a5a52aa'), {dist: 60, rot: 0, s0: .3, smax: 1.3, send: 1.6});
            shake(table, 8, 250);
          }, i * 230);
        }
        card(el, [{transform: 'none'}, {transform: 'scale(1.25) rotate(-5deg)', offset: .2}, {transform: 'scale(1.2) rotate(5deg)', offset: .5}, {transform: 'none'}], 1600);
        banner(L, 'FEU À VOLONTÉ !', '#ffb347', {delay: 300});
      },
    },
    plank: {
      play(el, L) {
        const p = at(el, L);
        card(el, [{transform: 'translateY(-30px)', opacity: 0}, {transform: 'rotate(-16deg)', opacity: 1, offset: .35}, {transform: 'rotate(12deg)', offset: .55}, {transform: 'rotate(-6deg)', offset: .75},
          {transform: 'rotate(3deg)', offset: .88}, {transform: 'none'}], 1200, {ease: 'ease-in-out'});
        setTimeout(() => burst(L, p.x + p.w * .4, p.y + p.h / 2, 10, () => DROP(), {angle: -90, spread: 50, dist: 60, gravity: 60, rot: 30}), 350);
      },
      win(el, L) {
        const p = at(el, L);
        const rx = p.w * 1.6, ry = p.h * .55;
        for (let f = 0; f < 3; f++) {
          const k = [];
          for (let i = 0; i <= 24; i++) { const a = (i / 24 + f / 3) * Math.PI * 2; k.push({transform: T(Math.cos(a) * rx, Math.sin(a) * ry, 1, Math.cos(a) > 0 ? 0 : 0) + ` scaleX(${Math.sin(a) > 0 ? 1 : -1})`}); }
          spawn(L, FIN(), p.x, p.y + p.h * .3, k, {dur: 2200, ease: 'linear'});
        }
        spawn(L, '', p.x, p.y + p.h * .3, [{opacity: 0}, {opacity: .7, offset: .2}, {opacity: .7, offset: .8}, {opacity: 0}],
          {dur: 2200, css: `width:${rx * 2.4}px;height:${ry * 2.6}px;border-radius:50%;background:radial-gradient(ellipse,#1d4e7aaa,transparent 70%)`});
        card(el, [{transform: 'none'}, {transform: 'rotate(-10deg) translateY(-10px)', offset: .3}, {transform: 'rotate(10deg) translateY(-10px)', offset: .6}, {transform: 'none'}], 2000, {ease: 'ease-in-out'});
        setTimeout(() => burst(L, p.x, p.y + p.h * .3, 26, () => DROP(), {angle: -90, spread: 80, dist: 130, gravity: 120}), 1900);
        banner(L, 'À LA FLOTTE !', '#9fd8ff', {delay: 200});
      },
    },
  };

  async function run(kind, type, el, table, trick) {
    const f = FX[type] && FX[type][kind];
    if (!f || !el || !table) return;
    if (reduce()) { glow(el, '#ffd54a', 900); return; }
    // la carte gagnante passe au-dessus du calque d'effets (voiles sombres, rayons…) le temps de l'animation
    const lifted = [];
    // shortcut: on ne remonte que la carte et son support ; un ancêtre qui crée un contexte d'empilement la laisserait sous le voile
    if (kind === 'win') for (const n of [el, el.parentElement]) { if (!n || n === table) break; lifted.push([n, n.style.zIndex]); n.style.zIndex = 60; if (getComputedStyle(n).position === 'static') { lifted.push([n, null, n.style.position]); n.style.position = 'relative'; } }
    try { await f(el, layer(table), table, trick || []); } catch (e) { /* une animation ne doit jamais casser la partie */ }
    if (kind === 'win') setTimeout(() => lifted.forEach(([n, z, pos]) => { if (z === null) n.style.position = pos; else n.style.zIndex = z; }), 2900);
  }
  window.SkullFX = Object.freeze({
    types: Object.keys(FX),
    play: (type, el, table) => run('play', type, el, table),
    win: (type, el, table, trick) => run('win', type, el, table, trick),
  });
})();
