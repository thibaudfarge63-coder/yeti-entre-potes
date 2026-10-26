/* Skull King : illustrations originales des cartes (dessins vectoriels faits maison, aucun visuel du jeu d'origine).
   Un seul jeu de symboles SVG injecté dans la page, réutilisé par <use>. */
(() => {
  'use strict';
  const INK = '#2a1a0c', GOLD = '#e8b53a', GOLD_D = '#9a6b10', SKIN = '#e7b48c';
  const S = {
    // ---- motifs des couleurs (currentColor = couleur de la carte) ----
    'suit-g': `<g fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="32" cy="11" r="5"/><path d="M32 16v38"/><path d="M21 23h22"/><path d="M11 38c2 12 10 17 21 17s19-5 21-17"/></g>
      <path fill="currentColor" d="M5 41l8-9 5 10zM59 41l-8-9-5 10z"/>`,
    'suit-y': `<path fill="currentColor" d="M32 3l5 24 24 5-24 5-5 24-5-24-24-5 24-5z"/>
      <path fill="currentColor" opacity=".55" d="M50 14l-12 16 12 20-18-12-18 12 12-20-12-16 18 12z"/>
      <circle cx="32" cy="32" r="6" fill="#fff8e6" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="32" r="2" fill="currentColor"/>`,
    'suit-p': `<g transform="rotate(-35 32 32)" fill="currentColor"><rect x="5" y="27" width="15" height="10" rx="2"/><rect x="19" y="25" width="15" height="14" rx="1.5"/>
      <rect x="33" y="22" width="22" height="20" rx="2.5"/><rect x="55" y="20" width="4" height="24" rx="1.5"/>
      <rect x="22" y="25" width="2.5" height="14" fill="#fff8e6" opacity=".6"/><rect x="37" y="22" width="3" height="20" fill="#fff8e6" opacity=".6"/></g>`,
    'suit-k': `<g fill="currentColor"><path d="M10 54L45 13c3-4 8-5 9-3s-1 6-5 9L14 58z"/><path d="M54 54L19 13c-3-4-8-5-9-3s1 6 5 9l35 39z"/></g>
      <g fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M8 46c3 1 7 5 8 8M56 46c-3 1-7 5-8 8"/></g>
      <circle cx="11" cy="57" r="3.5" fill="currentColor"/><circle cx="53" cy="57" r="3.5" fill="currentColor"/>`,
    // ---- cartes spéciales ----
    escape: `<rect x="17" y="6" width="3.5" height="54" rx="1.5" fill="#6b4a22"/><circle cx="18.7" cy="6" r="3" fill="${GOLD}"/>
      <path d="M21 10c8-4 14 4 22 0s12-2 14 0v22c-4-3-8-3-14 0s-14-4-22 0z" fill="#fffdf6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M26 16c6-2 10 2 16 0M26 23c6-2 10 2 16 0" stroke="#d8cfbf" stroke-width="2" fill="none"/>`,
    loot: `<path d="M20 22c-6 8-10 18-8 26 2 8 10 11 20 11s18-3 20-11c2-8-2-18-8-26z" fill="#a8743a" stroke="${INK}" stroke-width="2"/>
      <path d="M22 22l-4-10c6 2 10 1 14-2 4 3 8 4 14 2l-4 10z" fill="#c08a4a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M20 22h24" stroke="#5a3a17" stroke-width="3"/>
      <g fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"><ellipse cx="14" cy="55" rx="7" ry="3.5"/><ellipse cx="14" cy="51" rx="7" ry="3.5"/><ellipse cx="51" cy="56" rx="7" ry="3.5"/><circle cx="32" cy="40" r="8"/></g>
      <text x="32" y="44.5" text-anchor="middle" font-size="12" font-weight="900" fill="${GOLD_D}" font-family="Georgia,serif">$</text>`,
    pirate: `<path d="M16 46c0 10 7 14 16 14s16-4 16-14z" fill="#5a3a17"/>
      <circle cx="32" cy="34" r="15" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
      <path d="M15 31c2-12 10-18 17-18s15 6 17 18c-10-4-24-4-34 0z" fill="#c0392b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <g fill="#fff"><circle cx="24" cy="20" r="1.6"/><circle cx="32" cy="18" r="1.6"/><circle cx="40" cy="20" r="1.6"/></g>
      <path d="M48 28l9-5-2 9 4 4-9-1z" fill="#c0392b" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M17 29l30 12" stroke="${INK}" stroke-width="2"/><circle cx="38" cy="35.5" r="4.5" fill="${INK}"/>
      <circle cx="26" cy="35" r="2" fill="${INK}"/><path d="M24 31l5 1" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M22 44c4 6 16 6 20 0-6 2-14 2-20 0z" fill="#3a2410"/><path d="M27 42c3 1 7 1 10 0" stroke="#7a3a2a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="17.5" cy="39" r="2.2" fill="none" stroke="${GOLD}" stroke-width="1.8"/>`,
    mermaid: `<path d="M4 54c6-4 10 4 16 0s10 4 16 0 10 4 16 0 8 2 8 2v8H4z" fill="#1b6f95" opacity=".55"/>
      <path d="M26 30c-4 8-2 16 4 22 2 2 2 5-2 7l-8 3 10 1 6-4 4 6 2-9c-2-4-4-6-4-10 0-6 2-10 2-16z" fill="#2bb3a3" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M28 38c3 1 6 1 8 0M28 44c3 1 6 1 8 0" stroke="#17786d" stroke-width="1.6" fill="none"/>
      <path d="M26 30c2-4 10-4 12 0l-2 4h-8z" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
      <circle cx="32" cy="19" r="8" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
      <path d="M23 18c0-9 18-10 18 0 4 6 6 14 2 22-2-8-4-12-4-16-2 0-4-2-5-5-3 3-7 4-9 4-2 6-4 10-6 16-2-8 0-14 4-21z" fill="#e8743a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="29.5" cy="20" r="1.3" fill="${INK}"/><circle cx="34.5" cy="20" r="1.3" fill="${INK}"/><path d="M30 24c1.3 1 2.7 1 4 0" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="49" cy="14" r="2" fill="#bfe9ff"/><circle cx="53" cy="9" r="1.4" fill="#bfe9ff"/>`,
    king: `<path d="M10 46L14 18l10 13 8-19 8 19 10-13 4 28z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2.2" stroke-linejoin="round"/>
      <rect x="9" y="45" width="46" height="9" rx="2" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2.2"/>
      <g stroke="${GOLD_D}" stroke-width="1.5"><circle cx="14" cy="16" r="3" fill="#fff4c2"/><circle cx="32" cy="10" r="3.5" fill="#fff4c2"/><circle cx="50" cy="16" r="3" fill="#fff4c2"/>
      <circle cx="21" cy="49.5" r="2.6" fill="#d23a3a"/><circle cx="32" cy="49.5" r="3" fill="#2f6db3"/><circle cx="43" cy="49.5" r="2.6" fill="#2fa36a"/>
      <path d="M32 26l4 8-4 6-4-6z" fill="#d23a3a"/></g>
      <path d="M17 41h30" stroke="#fff4c2" stroke-width="1.5" opacity=".7"/>`,
    second: `<path d="M8 36c6-14 16-20 24-20s18 6 24 20c-6 4-14 6-24 6s-18-2-24-6z" fill="#2b2b33" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M8 36c8 5 16 6 24 6s16-1 24-6" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
      <path d="M32 16c-2 6-2 12 0 18 2-6 2-12 0-18z" fill="${GOLD}"/>
      <path d="M40 18c6-10 14-12 18-10-6 2-10 6-12 12z" fill="#e9e3d6" stroke="${INK}" stroke-width="1.5"/>
      <g fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.2"><rect x="16" y="48" width="12" height="6" rx="1.5"/><rect x="36" y="48" width="12" height="6" rx="1.5"/></g>
      <g stroke="${GOLD}" stroke-width="1.6"><path d="M17 54l-1 6M21 54v6M25 54l1 6M37 54l-1 6M41 54v6M45 54l1 6"/></g>`,
    tigress: `<path d="M12 18l6-10 8 8zM52 18l-6-10-8 8z" fill="#e8892a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M15 14l3-4 4 4zM49 14l-3-4-4 4z" fill="#f6d3b0"/>
      <ellipse cx="32" cy="34" rx="20" ry="19" fill="#e8892a" stroke="${INK}" stroke-width="2"/>
      <path d="M32 15v8M24 17l2 7M40 17l-2 7M12 30l7 2M12 37l7 0M52 30l-7 2M52 37l-7 0" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M22 44c2-6 6-8 10-8s8 2 10 8c-2 5-6 8-10 8s-8-3-10-8z" fill="#fff4e4"/>
      <path d="M21 31c2-3 6-3 8 0-2 2-6 2-8 0zM35 31c2-3 6-3 8 0-2 2-6 2-8 0z" fill="#7cc46a" stroke="${INK}" stroke-width="1.4"/>
      <circle cx="25" cy="31" r="1.2" fill="${INK}"/><circle cx="39" cy="31" r="1.2" fill="${INK}"/>
      <path d="M29 40h6l-3 3z" fill="#c2505a"/><path d="M32 43v3M32 46c-2 2-4 2-5 1M32 46c2 2 4 2 5 1" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
    kraken: `<g fill="none" stroke-linecap="round"><g stroke="#7a2f6b" stroke-width="7"><path d="M14 58c-6-10 2-18 8-22"/><path d="M50 58c6-10-2-18-8-22"/><path d="M26 60c-2-8 2-14 4-18"/><path d="M38 60c2-8-2-14-4-18"/></g>
      <g stroke="#b24c9c" stroke-width="3"><path d="M14 58c-6-10 2-18 8-22"/><path d="M50 58c6-10-2-18-8-22"/></g></g>
      <ellipse cx="32" cy="24" rx="16" ry="17" fill="#8e3a7f" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="27" cy="14" rx="4" ry="3" fill="#c46cb4" opacity=".7"/>
      <circle cx="25" cy="27" r="4" fill="#ffd54a" stroke="${INK}" stroke-width="1.5"/><circle cx="39" cy="27" r="4" fill="#ffd54a" stroke="${INK}" stroke-width="1.5"/>
      <rect x="24.2" y="24" width="1.8" height="6" rx=".9" fill="${INK}"/><rect x="38.2" y="24" width="1.8" height="6" rx=".9" fill="${INK}"/>
      <g fill="#f3c8e8"><circle cx="11" cy="50" r="1.5"/><circle cx="13" cy="44" r="1.5"/><circle cx="53" cy="50" r="1.5"/><circle cx="51" cy="44" r="1.5"/></g>`,
    whale: `<path d="M4 52c6-3 10 3 16 0s10 3 16 0 10 3 16 0 8 1 8 1v9H4z" fill="#1b6f95" opacity=".5"/>
      <path d="M6 34c0-10 10-16 24-16 14 0 22 8 24 16l6-6c2 4 1 9-3 12 2 2 2 4 0 5-4 0-6-2-7-4-4 7-12 9-20 9C14 50 6 44 6 34z" fill="#f4f7fb" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M8 38c6 4 16 6 26 4" stroke="#c9d6e2" stroke-width="2" fill="none"/>
      <circle cx="17" cy="32" r="1.8" fill="${INK}"/><path d="M24 44c2 3 5 4 8 4" stroke="#c9d6e2" stroke-width="1.6" fill="none"/>
      <path d="M26 17c-1-5-5-7-8-6M26 17c1-6 4-8 8-7M26 17v-6" stroke="#8fd3ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    ray: `<path d="M32 20c6 0 10 6 16 8 6 2 12 4 14 8-10 3-20 5-30 5S12 39 2 36c2-4 8-6 14-8 6-2 10-8 16-8z" fill="#c78a4e" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M32 41c0 8 2 12 8 19" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <g fill="#fff3d6"><circle cx="20" cy="28" r="2.2"/><circle cx="44" cy="28" r="2.2"/><circle cx="26" cy="22" r="1.6"/><circle cx="38" cy="22" r="1.6"/><circle cx="32" cy="30" r="2"/><circle cx="14" cy="32" r="1.4"/><circle cx="50" cy="32" r="1.4"/></g>
      <circle cx="28" cy="17" r="1.4" fill="${INK}"/><circle cx="36" cy="17" r="1.4" fill="${INK}"/>`,
    davy: `<path d="M10 30h44v24H10z" fill="#6b4a22" stroke="${INK}" stroke-width="2"/>
      <path d="M10 30c0-10 8-16 22-16s22 6 22 16z" fill="#7d5730" stroke="${INK}" stroke-width="2"/>
      <g fill="none" stroke="#8a929c" stroke-width="3"><path d="M4 26c10 12 22 18 28 18s18-6 28-18"/><path d="M6 50c8-6 18-8 26-8s18 2 26 8"/></g>
      <g stroke="#5c636b" stroke-width="1.2" fill="none"><path d="M4 26c10 12 22 18 28 18s18-6 28-18"/></g>
      <rect x="25" y="33" width="14" height="13" rx="2" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.8"/>
      <path d="M27.5 33v-4a4.5 4.5 0 0 1 9 0v4" fill="none" stroke="${GOLD_D}" stroke-width="2.4"/><circle cx="32" cy="39" r="2" fill="${INK}"/><path d="M32 40v3" stroke="${INK}" stroke-width="1.8"/>`,
    salvo: `<path d="M38 22l14-8-4 10 12 2-12 6 6 10-12-6-2 10-4-12z" fill="#ffb12e" stroke="#c0392b" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M6 30l30-6 4 12-30 8c-4 1-6-1-6-4z" fill="#2d2d33" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="34" y="22" width="5" height="15" rx="1.5" transform="rotate(-14 36 30)" fill="#3c3c44"/>
      <circle cx="18" cy="48" r="9" fill="#6b4a22" stroke="${INK}" stroke-width="2"/><circle cx="18" cy="48" r="3" fill="${GOLD}"/>
      <path d="M18 39v18M9 48h18" stroke="#3a250c" stroke-width="1.6"/>
      <circle cx="54" cy="46" r="4" fill="#2d2d33"/><circle cx="58" cy="54" r="2.5" fill="#2d2d33" opacity=".7"/>`,
    plank: `<path d="M4 50c6-4 10 4 16 0s10 4 16 0 10 4 16 0 8 2 8 2v12H4z" fill="#1b6f95"/>
      <path d="M2 30l40 6v5L2 36z" fill="#b8874a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 32l0 5M18 33.5v5M28 35v5" stroke="#7d5730" stroke-width="1.4"/>
      <path d="M2 36v18" stroke="#5a3a17" stroke-width="4"/>
      <g fill="#5a3a17" opacity=".6"><ellipse cx="22" cy="34.6" rx="2.4" ry="1.1"/><ellipse cx="31" cy="36" rx="2.4" ry="1.1"/></g>
      <path d="M50 46c-2-4 0-8 4-8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="46" cy="18" r="6" fill="#ffd54a" opacity=".85"/>
      <g fill="#bfe9ff"><circle cx="40" cy="47" r="1.6"/><circle cx="44" cy="44" r="1.2"/></g>`,
    joker: `<path d="M32 4l7.6 17.4L58 24l-14 12.6L48 56 32 46.4 16 56l4-19.4L6 24l18.4-2.6z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2.2" stroke-linejoin="round"/>
      <text x="32" y="41" text-anchor="middle" font-size="17" font-weight="900" fill="#5a3a00" font-family="Georgia,serif">15</text>`,
    back: `<circle cx="32" cy="32" r="26" fill="none" stroke="${GOLD}" stroke-width="2"/><circle cx="32" cy="32" r="20" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 3"/>
      <path fill="${GOLD}" d="M32 8l4 20 20 4-20 4-4 20-4-20-20-4 20-4z"/><circle cx="32" cy="32" r="4" fill="#0f2231" stroke="${GOLD}" stroke-width="2"/>`,
  };
  function inject() {
    if (document.getElementById('skull-art')) return;
    const div = document.createElement('div');
    div.innerHTML = `<svg id="skull-art" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${
      Object.entries(S).map(([k, v]) => `<symbol id="ska-${k}" viewBox="0 0 64 64">${v}</symbol>`).join('')}</svg>`;
    document.body.prepend(div.firstChild);
  }
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
  const svg = (name, cls = '') => `<svg class="ska ${cls}" viewBox="0 0 64 64" aria-hidden="true"><use href="#ska-${name}"/></svg>`;
  window.SkullArt = Object.freeze({svg, has: n => n in S});
})();
