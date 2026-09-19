/* ==========================================================================
   Kalamaki Club — sticker illustration engine
   Every product visual is a small inline SVG built from a recipe in
   menu-data.js (art: { kind, ...options }). Flat fills + thick ink outline.
   ========================================================================== */
(function () {
  const INK = '#170F0B';
  const PAPER = '#F7EDD8';
  const PITA = '#E9B66C';
  const PITA_HI = '#F4CE8E';
  const PITA_MARK = '#A8621F';
  const BLUE = '#2457FF';
  let uidCounter = 0;
  const uid = (p) => `${p}-${(++uidCounter).toString(36)}`;

  const isDark = (hex) => {
    if (!hex || hex[0] !== '#') return false;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 110;
  };

  const MEAT = {
    pork:     { fill: '#C97A4E', hi: '#E9A676', char: '#6A3217' },
    chicken:  { fill: '#E2A64E', hi: '#F7CF86', char: '#8A5220' },
    gyros:    { fill: '#A55E35', hi: '#CF8753', char: '#5A2C14' },
    kebab:    { fill: '#94432A', hi: '#C0694A', char: '#4F1F10' },
    bifteki:  { fill: '#7C4A31', hi: '#A8704F', char: '#3F2215' },
    sausage:  { fill: '#B0482F', hi: '#D9765A', char: '#5A2012' },
    halloumi: { fill: '#F3E0AE', hi: '#FFF6DA', char: '#B98945' },
    pepper:   { fill: '#E8392B', hi: '#FF7A66', char: '#8E1A10' },
    onion:    { fill: '#E9D3EF', hi: '#FFF6FF', char: '#9C5BB0' },
  };
  const meat = (k) => MEAT[k] || MEAT.pork;

  /* ------------------------------------------------------------ primitives */
  function face(x, y, s = 1, dark = false) {
    const c = dark ? PAPER : INK;
    return `<g class="face" transform="translate(${x} ${y}) scale(${s})">
      <g class="eyes">
        <ellipse cx="-11" cy="0" rx="3.8" ry="5.2" fill="${c}"/>
        <ellipse cx="11" cy="0" rx="3.8" ry="5.2" fill="${c}"/>
        <circle cx="-10" cy="-2" r="1.4" fill="${dark ? INK : '#fff'}"/>
        <circle cx="12" cy="-2" r="1.4" fill="${dark ? INK : '#fff'}"/>
      </g>
      <ellipse cx="-20" cy="8" rx="5" ry="3" fill="#FF7F8E" opacity=".75"/>
      <ellipse cx="20" cy="8" rx="5" ry="3" fill="#FF7F8E" opacity=".75"/>
      <path d="M-6 6 Q0 13 6 6" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    </g>`;
  }

  const SPARKLE_D = 'M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0Z';
  const FLAME_D = 'M12 1 C13.5 6 19 8.5 19 14.5 C19 19.5 15.8 23 12 23 C8.2 23 5 19.8 5 15.5 C5 11.5 7.6 9.6 8.6 6 C10 8.6 11 9.6 12.4 9.8 C12.8 7 12.6 4 12 1Z';
  function sparkle(x, y, s = 1, fill = '#fff') {
    return `<path d="${SPARKLE_D}" transform="translate(${x} ${y}) scale(${s}) translate(-12 -12)" fill="${fill}" stroke="${INK}" stroke-width="${2.4 / s}" stroke-linejoin="round"/>`;
  }
  function flame(x, y, s = 1, fill = '#FF5A1F') {
    return `<path d="${FLAME_D}" transform="translate(${x} ${y}) scale(${s}) translate(-12 -12)" fill="${fill}" stroke="${INK}" stroke-width="${2.2 / s}" stroke-linejoin="round"/>`;
  }

  // Band that sits on top of something and drips down. drips: [[x, len], ...] sorted high→low x
  function dripPath(xL, xR, y, drips, lift = 14) {
    let d = `M${xL} ${y} C${xL} ${y - lift} ${xR} ${y - lift} ${xR} ${y} L${xR} ${y + 6}`;
    drips.forEach(([x, len]) => {
      d += ` L${x + 5} ${y + 6} L${x + 5} ${y + 6 + len} a5 5 0 0 1 -10 0 L${x - 5} ${y + 6}`;
    });
    return d + ` L${xL} ${y + 6} Z`;
  }

  // Greek key border: hooks rising from a baseline
  function meander(x0, x1, y, u = 2, color = INK, w = 1.6) {
    let d = `M${x0} ${y} H${x1}`;
    for (let x = x0 + u; x + 6 * u <= x1; x += 8 * u) d += ` M${x} ${y} v${-6 * u} h${6 * u} v${4 * u} h${-3 * u} v${-2 * u}`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="square"/>`;
  }

  function cube(x, y, s, rot, m) {
    const h = s / 2;
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <rect x="${-h}" y="${-h}" width="${s}" height="${s}" rx="${s * 0.28}" fill="${m.fill}" stroke="${INK}" stroke-width="3.2"/>
      <path d="M${-h * 0.55} ${-h * 0.5} q${h * 0.55} ${-h * 0.22} ${h * 1.1} 0" fill="none" stroke="${m.hi}" stroke-width="${s * 0.1}" stroke-linecap="round"/>
      <path d="M${-h * 0.62} ${h * 0.25} L${h * 0.2} ${-h * 0.45} M${-h * 0.3} ${h * 0.62} L${h * 0.58} ${-h * 0.1}" stroke="${m.char}" stroke-width="${s * 0.085}" stroke-linecap="round" opacity=".8"/>
    </g>`;
  }

  function log(x, y, len, th, rot, m) {
    let ridges = '';
    for (let i = -len / 2 + th * 0.7; i < len / 2 - th * 0.5; i += th * 0.62) ridges += `M${i.toFixed(1)} ${(-th * 0.34).toFixed(1)} q${(th * 0.14).toFixed(1)} ${(th * 0.34).toFixed(1)} 0 ${(th * 0.68).toFixed(1)} `;
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <rect x="${-len / 2}" y="${-th / 2}" width="${len}" height="${th}" rx="${th / 2}" fill="${m.fill}" stroke="${INK}" stroke-width="3.2"/>
      <path d="${ridges}" fill="none" stroke="${m.char}" stroke-width="${Math.max(2, th * 0.09).toFixed(1)}" stroke-linecap="round" opacity=".75"/>
      <path d="M${-len / 2 + th * 0.5} ${-th * 0.24} H${len / 2 - th * 0.5}" stroke="${m.hi}" stroke-width="${th * 0.13}" stroke-linecap="round" opacity=".85"/>
    </g>`;
  }

  function strip(x, y, w, rot, m) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <path d="M${-w / 2} 0 q${w * 0.25} ${-w * 0.22} ${w * 0.5} ${-w * 0.08} t${w * 0.5} ${-w * 0.04} l${-w * 0.08} ${w * 0.28} q${-w * 0.22} ${w * 0.12} ${-w * 0.44} ${w * 0.02} t${-w * 0.48} ${w * 0.1} Z" fill="${m.fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M${-w * 0.36} ${w * 0.03} q${w * 0.2} ${-w * 0.14} ${w * 0.42} ${-w * 0.06} t${w * 0.36} ${-w * 0.02}" fill="none" stroke="${m.char}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
      <path d="M${-w * 0.3} ${-w * 0.07} q${w * 0.2} ${-w * 0.1} ${w * 0.4} ${-w * 0.06}" fill="none" stroke="${m.hi}" stroke-width="2.4" stroke-linecap="round"/>
    </g>`;
  }

  function fry(x, y, len, rot, c = '#FFCF4A') {
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <rect x="-5.5" y="${-len / 2}" width="11" height="${len}" rx="2.5" fill="${c}" stroke="${INK}" stroke-width="3"/>
      <path d="M-1.5 ${-len / 2 + 5} V${len / 2 - 6}" stroke="#FFEAA0" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M-5.5 ${-len / 2 + 3} h11" stroke="#D9922B" stroke-width="3" opacity=".7"/>
    </g>`;
  }

  function tomato(x, y, r = 16) {
    const seeds = [0, 120, 240].map((a) => {
      const rad = (a - 90) * Math.PI / 180;
      return `<ellipse cx="${(Math.cos(rad) * r * 0.42).toFixed(1)}" cy="${(Math.sin(rad) * r * 0.42).toFixed(1)}" rx="${(r * 0.2).toFixed(1)}" ry="${(r * 0.13).toFixed(1)}" transform="rotate(${a} ${(Math.cos(rad) * r * 0.42).toFixed(1)} ${(Math.sin(rad) * r * 0.42).toFixed(1)})" fill="#FFC9A0"/>`;
    }).join('');
    return `<g transform="translate(${x} ${y})">
      <circle r="${r}" fill="#E8392B" stroke="${INK}" stroke-width="3"/>
      <circle r="${r * 0.74}" fill="#FF6B4F"/>
      ${seeds}<circle r="${r * 0.16}" fill="#E8392B"/>
    </g>`;
  }

  function wedge(x, y, r, rot) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <path d="M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 Z" fill="#E8392B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M${-r * 0.66} -2 A${r * 0.66} ${r * 0.66} 0 0 1 ${r * 0.66} -2 Z" fill="#FF6B4F"/>
      <g fill="#FFC9A0"><ellipse cx="${-r * 0.3}" cy="${-r * 0.3}" rx="2.4" ry="1.6"/><ellipse cx="${r * 0.3}" cy="${-r * 0.3}" rx="2.4" ry="1.6"/></g>
    </g>`;
  }

  function ring(x, y, rx, ry, rot = 0) {
    const e = `cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none"`;
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <ellipse ${e} stroke="${INK}" stroke-width="9"/>
      <ellipse ${e} stroke="#F4E6F6" stroke-width="4.6"/>
      <ellipse ${e} stroke="#B574C8" stroke-width="1.6"/>
    </g>`;
  }

  function lemon(x, y, s = 1, rot = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
      <path d="M-24 0 A24 24 0 0 0 24 0 Z" fill="#FFD93D" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M-18 1.5 A18 18 0 0 0 18 1.5 Z" fill="#FFF3A6"/>
      <path d="M0 2 V17 M0 2 L-12 12 M0 2 L12 12" stroke="#F2C230" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M-24 0 H24" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  }

  const bits = (pts, color, r = 2.4) => `<g fill="${color}">${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  const herbs = (pts) => `<g fill="#3E9B45" stroke="${INK}" stroke-width="1.2">${pts.map(([x, y, r]) => `<rect x="${x - 3.5}" y="${y - 2}" width="7" height="4" rx="2" transform="rotate(${r || 0} ${x} ${y})"/>`).join('')}</g>`;

  function leaf(x, y, rot, color) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <path d="M0 0 C-15 -10 -13 -36 0 -44 C13 -36 15 -10 0 0Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M0 -4 V-34" stroke="${INK}" stroke-width="2" opacity=".35"/>
    </g>`;
  }

  function dollop(x, y, w, color = '#FBF6EA', fleck = '#6FAE45') {
    const h = w * 0.5;
    return `<g transform="translate(${x} ${y})">
      <path d="M${-w / 2} ${h * 0.2} C${-w / 2} ${-h * 0.7} ${-w * 0.2} ${-h} 0 ${-h * 0.8} C${w * 0.22} ${-h * 1.05} ${w / 2} ${-h * 0.6} ${w / 2} ${h * 0.2} C${w / 2} ${h * 0.5} ${-w / 2} ${h * 0.5} ${-w / 2} ${h * 0.2}Z" fill="${color}" stroke="${INK}" stroke-width="3"/>
      <path d="M${-w * 0.24} ${-h * 0.3} q${w * 0.12} ${-h * 0.3} ${w * 0.3} ${-h * 0.2}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      ${fleck ? bits([[-w * 0.18, h * 0.06], [w * 0.14, -h * 0.18], [w * 0.26, h * 0.12], [-w * 0.02, h * 0.22]], fleck, 1.8) : ''}
    </g>`;
  }

  const steam = (xs, y) => xs.map((x, i) =>
    `<path class="steam" style="--d:${i * 0.45}s" d="M${x} ${y} q-8 -9 0 -18 q8 -9 0 -18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>`
  ).join('');

  function meatTop(kind, m, cx, cy, scale = 1) {
    const k = scale;
    if (kind === 'gyros') return strip(cx - 32 * k, cy + 6 * k, 44 * k, -12, m) + strip(cx + 32 * k, cy + 8 * k, 40 * k, 14, m) + strip(cx, cy, 46 * k, 4, m);
    if (kind === 'kebab' || kind === 'bifteki' || kind === 'sausage') return log(cx - 14 * k, cy + 2 * k, 70 * k, 24 * k, -10, m) + log(cx + 24 * k, cy + 10 * k, 58 * k, 22 * k, 12, m);
    return cube(cx - 32 * k, cy + 8 * k, 30 * k, -14, m) + cube(cx + 34 * k, cy + 10 * k, 30 * k, 16, m) + cube(cx, cy, 32 * k, 6, m);
  }

  /* ------------------------------------------------------------ recipes */
  const R = {};

  // The wrapped souvlaki pita
  R.pita = (a, withFace) => {
    const m = meat(a.meat);
    const paper = a.paper || PAPER;
    const band = a.band || BLUE;
    const sauce = a.sauce || '#FBF6EA';
    const id = uid('pt');
    const cone = 'M34 106 Q100 128 166 106 L126 186 Q100 200 74 186 Z';
    let s = `<g transform="rotate(-6 100 120)">`;
    s += `<path d="M38 108 C32 64 64 50 100 50 C136 50 168 64 162 108 Z" fill="${PITA}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M58 70 l12 -9 M80 62 l12 -9 M110 61 l12 -9 M134 68 l12 -9" stroke="${PITA_MARK}" stroke-width="4" stroke-linecap="round" opacity=".75"/>`;
    if (a.fries !== false) s += fry(70, 60, 46, -18) + fry(132, 56, 48, 16) + fry(102, 46, 46, -4);
    s += meatTop(a.meat, m, 100, 84);
    if (a.special === 'club') {
      s += `<path d="${dripPath(64, 138, 84, [[128, 12], [104, 18], [76, 9]], 8)}" fill="#FFB21E" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
      s += `<path d="M58 74 q8 -8 16 0 t16 0 t16 0 v8 q-8 -8 -16 0 t-16 0 t-16 0Z" fill="#D9534F" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
    }
    s += wedge(52, 100, 15, -24) + wedge(148, 100, 14, 26);
    if (a.onion !== false) s += ring(122, 96, 12, 5.5, -12) + ring(80, 98, 11, 5, 10);
    s += `<path d="M78 88 C72 76 84 66 96 71 C103 62 121 64 123 75 C133 76 132 89 124 91 L124 99 a4 4 0 0 1 -8 0 L116 92 L98 93 L98 102 a4 4 0 0 1 -8 0 L90 93 C82 95 78 93 78 88Z" fill="${sauce}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    s += bits([[92, 78], [106, 74], [114, 84], [98, 86]], a.sauceFleck || '#6FAE45', 1.9);
    s += bits([[62, 90], [140, 88], [100, 70], [120, 70], [84, 76]], '#C8281A', 1.8);
    // the bread cone, then the paper wrapped diagonally around its lower half
    s += `<defs><clipPath id="${id}"><path d="${cone}"/></clipPath></defs>`;
    s += `<path d="${cone}" fill="${PITA}"/>`;
    s += `<g clip-path="url(#${id})">
      <path d="M40 120 l16 -12 M60 128 l18 -14 M150 112 l14 -10" stroke="${PITA_MARK}" stroke-width="4" stroke-linecap="round" opacity=".7"/>
      <path d="M16 146 Q100 128 184 106 V210 H16 Z" fill="${paper}"/>
      <g transform="translate(100 163) rotate(-12)">
        <rect x="-100" y="0" width="200" height="13" fill="${band}"/>
        ${meander(-100, 100, 10.5, 1.2, paper, 1.4)}
      </g>
      <path d="M16 146 Q100 128 184 106" fill="none" stroke="${INK}" stroke-width="3.5"/>
      <rect x="128" y="96" width="44" height="110" fill="${INK}" opacity=".13"/>
    </g>`;
    s += `<path d="M62 150 L76 182" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>`;
    s += `<path d="${cone}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M34 106 Q100 128 166 106" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    if (withFace) s += face(98, 143, 0.88, isDark(paper));
    return s + '</g>';
  };

  // Kalamaki skewer
  R.skewer = (a, withFace) => {
    const m = meat(a.meat);
    const ang = -46.6;
    const P = (t) => [34 + 138 * t, 176 - 146 * t];
    let s = `<line x1="30" y1="180" x2="176" y2="26" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>`;
    s += `<line x1="30" y1="180" x2="176" y2="26" stroke="#E2AE63" stroke-width="6" stroke-linecap="round"/>`;
    s += `<line x1="30" y1="180" x2="176" y2="26" stroke="#F6D39A" stroke-width="2" stroke-linecap="round" stroke-dasharray="10 12"/>`;
    let fx = 0, fy = 0;
    if (a.meat === 'kebab' || a.meat === 'sausage' || a.meat === 'bifteki') {
      const [x, y] = P(0.53);
      s += log(x, y, 118, a.meat === 'sausage' ? 34 : 38, ang, m);
      [fx, fy] = [x + 2, y + 2];
    } else {
      const seq = a.meat === 'halloumi' ? [MEAT.halloumi, MEAT.pepper, MEAT.halloumi, MEAT.onion] : a.veg ? [m, MEAT.pepper, m, MEAT.onion] : [m, m, m, m];
      [0.26, 0.44, 0.62, 0.8].forEach((t, i) => {
        const [x, y] = P(t);
        s += cube(x, y, i === 2 ? 40 : 36, ang + [8, -6, 4, -10][i], seq[i]);
      });
      [fx, fy] = P(0.62);
    }
    s += lemon(150, 160, 1.05, -14);
    s += herbs([[56, 112, 20], [66, 102, -30], [172, 98, 40], [120, 170, 10]]);
    s += sparkle(40, 46, 0.6, '#FFC23D');
    if (withFace) s += face(fx, fy + 2, 0.62, isDark(a.meat === 'halloumi' ? MEAT.halloumi.fill : m.fill));
    return s;
  };

  // Plate (μερίδα)
  R.plate = (a, withFace) => {
    const rim = a.rim || BLUE;
    let s = `<ellipse cx="100" cy="146" rx="92" ry="40" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`;
    s += `<ellipse cx="100" cy="144" rx="78" ry="31" fill="none" stroke="${rim}" stroke-width="4" stroke-dasharray="9 5"/>`;
    // pita triangles at the back
    s += `<g transform="translate(142 104) rotate(-18)"><path d="M-26 14 L0 -26 L26 14 Q0 22 -26 14Z" fill="${PITA}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M-10 4 l8 -8 M4 6 l8 -8" stroke="${PITA_MARK}" stroke-width="3" stroke-linecap="round"/></g>`;
    s += `<g transform="translate(118 98) rotate(12)"><path d="M-24 14 L0 -24 L24 14 Q0 20 -24 14Z" fill="${PITA_HI}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M-8 4 l8 -8 M6 6 l8 -8" stroke="${PITA_MARK}" stroke-width="3" stroke-linecap="round"/></g>`;
    // fries pile
    [[44, 128, 38, 64], [58, 118, 40, 78], [50, 138, 36, 96], [70, 130, 38, 58], [62, 142, 34, 110]].forEach(([x, y, l, r]) => { s += fry(x, y, l, r); });
    const main = a.main || 'skewers';
    const stick = (x1, y1, x2, y2, m, n) => {
      let g = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E2AE63" stroke-width="4" stroke-linecap="round"/>`;
      const rot = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      for (let i = 0; i < n; i++) { const t = 0.2 + i * (0.62 / (n - 1)); g += cube(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 25, rot + (i % 2 ? 6 : -6), m); }
      return g;
    };
    if (main === 'skewers') s += stick(62, 104, 170, 136, MEAT.pork, 4) + stick(50, 124, 162, 154, MEAT.pork, 4);
    else if (main === 'chicken') s += stick(62, 104, 170, 136, MEAT.chicken, 4) + stick(50, 124, 162, 154, MEAT.chicken, 4);
    else if (main === 'gyros') s += strip(100, 122, 50, -8, MEAT.gyros) + strip(128, 132, 46, 12, MEAT.gyros) + strip(92, 138, 44, 6, MEAT.gyros) + strip(120, 114, 40, -14, MEAT.gyros);
    else if (main === 'kebab') s += log(110, 118, 92, 26, 14, MEAT.kebab) + log(104, 142, 88, 25, 8, MEAT.kebab);
    else if (main === 'bifteki') s += `<g>${[[96, 124], [132, 132]].map(([x, y]) => `<g transform="translate(${x} ${y})"><ellipse rx="26" ry="15" fill="${MEAT.bifteki.fill}" stroke="${INK}" stroke-width="3.2"/><path d="M-16 -3 l10 -6 M-4 3 l12 -8 M8 7 l10 -6" stroke="${MEAT.bifteki.char}" stroke-width="3" stroke-linecap="round"/><path d="M-14 -8 q12 -6 26 -2" fill="none" stroke="${MEAT.bifteki.hi}" stroke-width="3" stroke-linecap="round"/></g>`).join('')}</g>`;
    else { // mix grill
      s += strip(92, 136, 44, 6, MEAT.gyros) + log(126, 136, 70, 22, 16, MEAT.kebab);
      s += stick(58, 110, 168, 126, MEAT.pork, 4);
      s += cube(84, 118, 24, 10, MEAT.chicken);
    }
    s += tomato(150, 152, 12) + tomato(134, 162, 10);
    s += ring(160, 138, 10, 5, 20);
    s += dollop(66, 160, 36);
    s += bits([[62, 150], [72, 154]], '#C8281A', 1.6);
    if (withFace) s += face(104, 172, 0.66);
    return s;
  };

  // Kalamaki box (takeaway)
  R.box = (a, withFace) => {
    const kraft = a.color || '#D29B5B';
    const m = meat(a.meat);
    let s = `<path d="M42 98 L20 72 L52 58 L60 72 Z" fill="#E6B475" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;
    s += `<path d="M158 98 L180 72 L148 58 L140 72 Z" fill="#E6B475" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;
    s += `<path d="M42 98 L60 72 H140 L158 98 Z" fill="#9C6A34" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;
    const sk = (x1, y1, x2, y2, meatA) => {
      const rot = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      let g = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E2AE63" stroke-width="4" stroke-linecap="round"/>`;
      [0.45, 0.68].forEach((t, i) => { g += cube(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 26, rot + (i ? 8 : -8), meatA); });
      return g;
    };
    s += sk(86, 96, 58, 18, m) + sk(104, 96, 114, 12, a.mix ? MEAT.chicken : m) + sk(118, 96, 152, 24, m);
    s += fry(74, 70, 40, -10) + fry(134, 70, 40, 12) + fry(96, 66, 40, 4);
    s += `<path d="M42 98 H158 L148 182 Q147 190 139 190 H61 Q53 190 52 182 Z" fill="${kraft}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M42 98 H158" stroke="${INK}" stroke-width="4"/>`;
    s += `<rect x="130" y="102" width="26" height="86" fill="${INK}" opacity=".1"/>`;
    s += `<rect x="47" y="104" width="106" height="12" fill="#FF5A1F"/>${meander(47, 153, 114, 1.3, INK, 1.4)}`;
    s += `<path d="M47 104 H153 M47 116 H152" stroke="${INK}" stroke-width="2.5"/>`;
    s += flame(128, 166, 0.8, '#FFC23D');
    if (withFace) s += face(96, 148, 1);
    return s;
  };

  // Fries in a striped paper holder
  R.fries = (a, withFace) => {
    const id = uid('fr');
    const box = a.box || '#E3261E';
    const body = 'M50 94 H150 L138 186 Q137 192 130 192 H70 Q63 192 62 186 Z';
    let s = '';
    [[62, 58, 60, -16], [80, 48, 64, -8], [96, 42, 64, -2], [112, 46, 62, 6], [128, 52, 60, 12], [142, 62, 56, 20], [72, 68, 50, -24], [120, 62, 58, -6], [104, 58, 56, 14]].forEach(([x, y, l, r]) => { s += fry(x, y, l, r); });
    if (a.topping === 'feta') {
      [[70, 44, 12], [98, 30, -8], [124, 38, 20], [110, 56, 0], [84, 58, 30]].forEach(([x, y, r]) => { s += `<rect x="${x - 7}" y="${y - 6}" width="14" height="12" rx="3" transform="rotate(${r} ${x} ${y})" fill="#FFFDF4" stroke="${INK}" stroke-width="2.6"/>`; });
      s += herbs([[80, 40, 30], [112, 30, -20], [132, 50, 10], [94, 50, 60]]);
    } else if (a.topping === 'cheddar') {
      s += `<path d="${dripPath(56, 144, 60, [[132, 14], [108, 22], [84, 12], [64, 18]], 16)}" fill="#FFB21E" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    } else {
      s += bits([[76, 36], [100, 24], [124, 34], [90, 46], [116, 50]], '#3E9B45', 2);
    }
    s += `<defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>`;
    s += `<path d="${body}" fill="${box}"/>`;
    s += `<g clip-path="url(#${id})"><path d="M58 90 L70 196 M84 90 L90 196 M110 90 L110 196 M136 90 L130 196" stroke="${PAPER}" stroke-width="9"/><rect x="128" y="90" width="30" height="110" fill="${INK}" opacity=".12"/></g>`;
    s += `<path d="${body}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M46 94 Q62 110 76 96 Q88 110 100 96 Q112 110 124 96 Q138 110 154 94 L150 88 H50 Z" fill="${box}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    if (withFace) s += face(100, 146, 1, isDark(box));
    return s;
  };

  // Dips: tzatziki, tirokafteri, yogurt & honey
  R.dip = (a, withFace) => {
    const bowl = a.bowl || BLUE;
    const t = a.topping || 'tzatziki';
    const fill = t === 'tirokafteri' ? '#F39A74' : t === 'yogurt' ? '#FFF8EC' : '#FBF6EA';
    let s = `<path d="M40 112 C40 72 70 56 100 58 C130 56 160 72 160 112 Z" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M58 96 C66 78 84 72 96 76 C110 70 132 78 140 96" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity=".25"/>`;
    s += `<path d="M62 78 q12 -12 28 -10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
    if (t === 'tzatziki') {
      s += `<path d="M66 98 C76 86 92 94 100 86 C110 78 124 90 134 84" fill="none" stroke="#CDB12A" stroke-width="4" stroke-linecap="round" opacity=".85"/>`;
      s += bits([[74, 90], [88, 80], [118, 76], [128, 96], [104, 100], [84, 102]], '#5E9E3C', 2.2);
      s += `<ellipse cx="102" cy="62" rx="9" ry="7" fill="#3B2438" stroke="${INK}" stroke-width="2.6"/><ellipse cx="99" cy="59" rx="2.5" ry="1.8" fill="#fff" opacity=".6"/>`;
      s += `<g transform="translate(118 58) rotate(30)"><path d="M0 0 C-6 -4 -6 -14 0 -18 C6 -14 6 -4 0 0Z" fill="#3E9B45" stroke="${INK}" stroke-width="2"/></g>`;
    } else if (t === 'tirokafteri') {
      s += bits([[70, 92], [84, 80], [98, 70], [114, 78], [128, 92], [100, 96], [86, 100], [118, 102], [140, 100], [62, 102]], '#C8281A', 2.2);
      s += `<g transform="translate(106 58) rotate(-24)"><path d="M-22 0 C-22 -8 14 -10 22 -2 C18 6 -12 8 -22 0Z" fill="#E8392B" stroke="${INK}" stroke-width="2.6"/><path d="M22 -2 q6 -2 8 -8" stroke="#3E9B45" stroke-width="3.5" stroke-linecap="round" fill="none"/></g>`;
    } else {
      s += `<path d="M58 94 L72 72 L86 94 L100 66 L114 94 L128 72 L142 94" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<path d="M58 94 L72 72 L86 94 L100 66 L114 94 L128 72 L142 94" fill="none" stroke="#F0A91F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      [[80, 66, 10], [118, 62, -14], [100, 80, 30]].forEach(([x, y, r]) => { s += `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-8 0 C-8 -6 -2 -8 0 -4 C2 -8 8 -6 8 0 C8 6 2 8 0 4 C-2 8 -8 6 -8 0Z" fill="#9A6234" stroke="${INK}" stroke-width="2.2"/></g>`; });
    }
    s += `<path d="M26 112 H174 Q170 178 100 182 Q30 178 26 112Z" fill="${bowl}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M150 122 Q146 164 110 174" stroke="${INK}" stroke-width="10" fill="none" opacity=".12" stroke-linecap="round"/>`;
    s += meander(44, 156, 170, 1.2, isDark(bowl) ? PAPER : INK, 1.4);
    s += `<rect x="20" y="104" width="160" height="14" rx="7" fill="${bowl}" stroke="${INK}" stroke-width="4"/>`;
    if (withFace) s += face(100, 140, 1, isDark(bowl));
    return s;
  };

  // Salads: horiatiki, cabbage, chicken, souvlaki bowl
  R.salad = (a, withFace) => {
    const t = a.topping || 'horiatiki';
    let s = '';
    const greens = ['#7BC043', '#5FC46B', '#A7D129', '#58B947'];
    if (t === 'chicken' || t === 'bowl') {
      [[34, 112, -62], [52, 110, -40], [72, 108, -18], [92, 110, -4], [112, 108, 14], [134, 110, 34], [154, 112, 56], [166, 114, 72]].forEach(([x, y, r], i) => { s += leaf(x, y, r, greens[i % greens.length]); });
    }
    const y0 = 92;
    if (t === 'horiatiki') {
      s += wedge(52, 104, 20, -12) + wedge(146, 104, 20, 14) + wedge(98, 96, 20, 4);
      [[74, 98, 14], [124, 100, 14]].forEach(([x, y, r]) => { s += `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#5B9E36" stroke="${INK}" stroke-width="3"/><circle r="${r * 0.72}" fill="#DDEFB5"/><g fill="#B8D67E"><circle cx="-3" cy="-2" r="1.6"/><circle cx="3" cy="2" r="1.6"/><circle cx="2" cy="-4" r="1.4"/></g></g>`; });
      s += ring(62, 86, 14, 7, -14) + ring(140, 86, 13, 6, 16);
      s += `<g transform="translate(100 66) rotate(-4)"><rect x="-34" y="-14" width="68" height="28" rx="5" fill="#FFFDF4" stroke="${INK}" stroke-width="3.5"/><path d="M-26 -6 H10 M-20 4 H24" stroke="#E6DDC6" stroke-width="3" stroke-linecap="round"/></g>`;
      s += herbs([[80, 58, 20], [96, 54, -30], [114, 58, 40], [122, 66, 0], [88, 68, -50]]);
      s += `<g fill="#3B2438" stroke="${INK}" stroke-width="2.2"><ellipse cx="44" cy="92" rx="7" ry="5.5"/><ellipse cx="156" cy="94" rx="7" ry="5.5"/><ellipse cx="110" cy="84" rx="6.5" ry="5"/></g>`;
      s += bits([[70, 76], [132, 74], [100, 86]], '#C8281A', 1.4);
    } else if (t === 'cabbage') {
      let shreds = '';
      for (let i = 0; i < 14; i++) {
        const x = 34 + (i * 11) % 132, y = 70 + (i * 17) % 38, r = (i * 47) % 70 - 35;
        shreds += `<path transform="translate(${x} ${y}) rotate(${r})" d="M-14 0 q14 -8 28 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path transform="translate(${x} ${y}) rotate(${r})" d="M-14 0 q14 -8 28 0" fill="none" stroke="${i % 3 ? '#E9F2C9' : '#B574C8'}" stroke-width="3.6" stroke-linecap="round"/>`;
      }
      s += `<path d="M26 112 C28 70 60 58 100 58 C140 58 172 70 174 112Z" fill="#EDF5D5" stroke="${INK}" stroke-width="3.5"/>` + shreds;
      s += `<g stroke="#FF8A1F" stroke-width="3" stroke-linecap="round"><path d="M60 80 l12 6 M112 70 l14 4 M132 92 l10 8 M84 96 l12 -4"/></g>`;
    } else if (t === 'chicken') {
      s += strip(78, y0, 42, -8, MEAT.chicken) + strip(120, y0 - 2, 44, 10, MEAT.chicken) + strip(100, y0 - 14, 40, -2, MEAT.chicken);
      s += tomato(56, y0 + 6, 10) + tomato(144, y0 + 6, 10);
      s += `<g fill="#FFFDF4" stroke="${INK}" stroke-width="2"><path d="M96 ${y0 + 10} l10 -6 l2 10 Z"/><path d="M66 ${y0 + 12} l10 -4 l0 9 Z"/></g>`;
    } else { // bowl
      s += `<path d="M34 112 C38 80 70 70 100 70 C130 70 162 80 166 112Z" fill="#FFF8E6" stroke="${INK}" stroke-width="3.2"/>`;
      s += bits([[54, 100], [66, 90], [80, 96], [120, 94], [140, 100], [150, 106], [96, 84], [132, 86], [72, 106], [110, 104]], '#E6D8B8', 2);
      s += cube(84, 84, 26, -10, MEAT.pork) + cube(112, 80, 26, 12, MEAT.pork) + cube(98, 70, 24, 4, MEAT.pork);
      s += tomato(140, 88, 10) + dollop(58, 90, 30);
    }
    const bowl = a.bowl || BLUE;
    s += `<path d="M20 112 H180 Q176 182 100 186 Q24 182 20 112Z" fill="${bowl}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M150 122 Q146 164 110 176" stroke="${INK}" stroke-width="10" fill="none" opacity=".1" stroke-linecap="round"/>`;
    s += `<g fill="#fff" opacity=".45"><circle cx="40" cy="132" r="3"/><circle cx="160" cy="132" r="3"/><circle cx="52" cy="156" r="2.5"/><circle cx="148" cy="156" r="2.5"/></g>`;
    s += `<rect x="14" y="104" width="172" height="14" rx="7" fill="${bowl}" stroke="${INK}" stroke-width="4"/>`;
    if (withFace) s += face(100, 146, 1, isDark(bowl));
    return s;
  };

  // Soda can
  R.can = (a, withFace) => {
    const id = uid('can');
    const c = a.color || '#E3261E';
    const band = a.band || '#F7EDD8';
    let s = `<defs><clipPath id="${id}"><rect x="58" y="46" width="84" height="140" rx="12"/></clipPath></defs>`;
    s += `<rect x="58" y="46" width="84" height="140" rx="12" fill="${c}"/>`;
    s += `<g clip-path="url(#${id})">
      <path d="M50 118 C80 100 110 138 150 112 V142 C112 164 82 128 50 148 Z" fill="${band}" stroke="${INK}" stroke-width="3"/>
      <rect x="116" y="40" width="30" height="150" fill="${INK}" opacity=".13"/>
    </g>`;
    s += `<rect x="58" y="46" width="84" height="140" rx="12" fill="none" stroke="${INK}" stroke-width="4"/>`;
    s += `<path d="M70 58 V174" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".5"/>`;
    s += `<rect x="62" y="34" width="76" height="16" rx="7" fill="#D8D2C8" stroke="${INK}" stroke-width="3.5"/>`;
    s += `<rect x="90" y="30" width="20" height="8" rx="4" fill="#BDB5A8" stroke="${INK}" stroke-width="2.5"/>`;
    s += `<rect x="62" y="180" width="76" height="12" rx="6" fill="#D8D2C8" stroke="${INK}" stroke-width="3.5"/>`;
    s += `<g fill="#fff" opacity=".8"><ellipse cx="128" cy="70" rx="2.6" ry="3.6"/><ellipse cx="80" cy="160" rx="2.2" ry="3"/><ellipse cx="124" cy="164" rx="2.8" ry="3.8"/></g>`;
    if (withFace) s += face(100, 88, 0.95, isDark(c));
    return s;
  };

  // Beer mug
  R.beer = (a, withFace) => {
    const id = uid('br');
    const liquid = a.liquid || '#F2A516';
    const glass = 'M52 74 H150 L144 182 Q143 190 135 190 H67 Q59 190 58 182 Z';
    let s = `<path d="M148 96 C184 96 184 156 144 156" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>`;
    s += `<path d="M148 96 C184 96 184 156 144 156" fill="none" stroke="#FFF7E6" stroke-width="8" stroke-linecap="round"/>`;
    s += `<defs><clipPath id="${id}"><path d="${glass}"/></clipPath></defs>`;
    s += `<path d="${glass}" fill="#fff" fill-opacity=".35"/>`;
    s += `<g clip-path="url(#${id})"><rect x="40" y="86" width="120" height="120" fill="${liquid}"/>
      <g fill="#fff" opacity=".55"><circle cx="78" cy="120" r="3"/><circle cx="112" cy="140" r="2.5"/><circle cx="92" cy="160" r="3.5"/><circle cx="126" cy="110" r="2.2"/><circle cx="80" cy="176" r="2.4"/></g>
      <rect x="126" y="70" width="40" height="130" fill="${INK}" opacity=".13"/></g>`;
    s += `<path d="M66 94 L72 178" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>`;
    s += `<path d="${glass}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M46 84 C38 64 60 52 72 60 C78 44 104 42 112 54 C122 40 150 46 148 64 C164 64 164 86 152 88 L152 96 a5 5 0 0 1 -10 0 L142 92 L78 92 L78 108 a5 5 0 0 1 -10 0 L68 92 C56 94 48 92 46 84Z" fill="#FFF9EC" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M66 70 C74 76 88 76 96 70 M110 58 C116 64 128 64 134 58" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>`;
    if (withFace) s += face(100, 138, 1, isDark(liquid));
    return s;
  };

  // Tumbler glass (ayran, water)
  R.glass = (a, withFace) => {
    const id = uid('gl');
    const cup = 'M50 64 H150 L138 184 Q137 192 129 192 H71 Q63 192 62 184 Z';
    const liquid = a.liquid || '#FFFDF6';
    let s = `<defs><clipPath id="${id}"><path d="${cup}"/></clipPath></defs>`;
    s += `<path d="${cup}" fill="#fff" fill-opacity=".35"/>`;
    s += `<g clip-path="url(#${id})"><path d="M40 84 q15 -6 30 0 t30 0 t30 0 t30 0 V200 H40Z" fill="${liquid}"/>
      <g fill="#fff" opacity=".7"><circle cx="80" cy="110" r="3"/><circle cx="118" cy="126" r="2.4"/><circle cx="96" cy="150" r="2.8"/></g>
      <rect x="124" y="60" width="40" height="140" fill="${INK}" opacity=".12"/></g>`;
    s += `<path d="M64 82 L71 172" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6"/>`;
    s += `<path d="${cup}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<rect x="44" y="56" width="112" height="14" rx="7" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`;
    s += `<g transform="translate(138 52) rotate(24)">${leaf(0, 0, -20, '#5FC46B')}${leaf(4, 0, 26, '#3E9B45')}</g>`;
    if (withFace) s += face(100, 140, 1, isDark(liquid));
    return s;
  };

  // Loukoumades with honey
  R.loukoumades = (a, withFace) => {
    const bowl = a.bowl || '#F7EDD8';
    let s = '';
    const ball = (x, y, r = 17) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#E3A23A" stroke="${INK}" stroke-width="3.2"/><path d="M${-r * 0.5} ${-r * 0.3} a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.6} ${-r * 0.4}" fill="none" stroke="#FFD27A" stroke-width="3.5" stroke-linecap="round"/><circle cx="${r * 0.3}" cy="${r * 0.3}" r="${r * 0.35}" fill="#C9822A" opacity=".45"/></g>`;
    if (a.topping === 'icecream') {
      s += `<path d="M76 58 C70 36 92 24 102 30 C116 20 136 36 126 56 Z" fill="#FFF6DC" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><g fill="#2B1A12"><circle cx="96" cy="42" r="1.6"/><circle cx="110" cy="36" r="1.6"/><circle cx="116" cy="48" r="1.4"/></g>`;
    }
    [[100, 66], [74, 84], [126, 84], [58, 104], [88, 102], [116, 104], [144, 104]].forEach(([x, y]) => { s += ball(x, y); });
    s += `<path d="M52 92 L68 76 L84 96 L100 62 L114 94 L130 76 L150 96" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<path d="M52 92 L68 76 L84 96 L100 62 L114 94 L130 76 L150 96" fill="none" stroke="#F0A91F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += bits([[66, 92], [96, 84], [122, 96], [140, 88], [80, 108], [108, 110]], '#7A3E1A', 1.6);
    [[84, 70, 20], [132, 92, -20]].forEach(([x, y, r]) => { s += `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-7 0 C-7 -5 -2 -7 0 -3 C2 -7 7 -5 7 0 C7 5 2 7 0 3 C-2 7 -7 5 -7 0Z" fill="#9A6234" stroke="${INK}" stroke-width="2"/></g>`; });
    s += `<path d="M24 114 H176 Q172 176 100 180 Q28 176 24 114Z" fill="${bowl}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += meander(40, 160, 132, 1.3, BLUE, 1.6);
    s += `<rect x="18" y="106" width="164" height="14" rx="7" fill="${bowl}" stroke="${INK}" stroke-width="4"/>`;
    s += `<path d="M150 124 Q146 164 110 174" stroke="${INK}" stroke-width="10" fill="none" opacity=".1" stroke-linecap="round"/>`;
    if (withFace) s += face(100, 154, 0.95, isDark(bowl));
    return s;
  };

  // Grilled pita triangles
  R.flatbread = (a, withFace) => {
    let s = `<ellipse cx="100" cy="164" rx="86" ry="22" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`;
    s += meander(40, 160, 172, 1.2, BLUE, 1.4);
    const tri = (x, y, r, c) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-36 30 Q-38 36 -30 36 H30 Q38 36 36 30 L4 -40 Q0 -46 -4 -40 Z" fill="${c}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M-18 18 l14 -12 M0 22 l14 -12 M-8 0 l10 -9" stroke="${PITA_MARK}" stroke-width="3.5" stroke-linecap="round"/></g>`;
    s += tri(60, 118, -24, PITA) + tri(140, 118, 24, PITA) + tri(100, 108, 0, PITA_HI);
    s += herbs([[92, 96, 20], [110, 110, -30], [100, 128, 60], [56, 120, 0], [146, 118, 30]]);
    s += `<path d="M84 136 q16 6 32 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
    if (withFace) s += face(100, 118, 0.72);
    return s;
  };

  function render(art, opts = {}) {
    const withFace = opts.face !== false;
    const recipe = R[art && art.kind] || R.pita;
    return `<svg class="art ${opts.cls || ''}" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${recipe(art || {}, withFace)}</svg>`;
  }

  /* ------------------------------------------------------------ scene pieces */
  function lemonSlice() {
    let seg = '';
    for (let i = 0; i < 8; i++) {
      const a1 = (i / 8) * Math.PI * 2 + 0.06, a2 = ((i + 1) / 8) * Math.PI * 2 - 0.06;
      const r = 52;
      seg += `<path d="M${(100 + Math.cos(a1) * 9).toFixed(1)} ${(100 + Math.sin(a1) * 9).toFixed(1)} L${(100 + Math.cos(a1) * r).toFixed(1)} ${(100 + Math.sin(a1) * r).toFixed(1)} A${r} ${r} 0 0 1 ${(100 + Math.cos(a2) * r).toFixed(1)} ${(100 + Math.sin(a2) * r).toFixed(1)} Z" fill="#FFE45C"/>`;
    }
    return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="70" fill="#FFD93D" stroke="${INK}" stroke-width="4"/>
      <circle cx="100" cy="100" r="60" fill="#FFF6C9"/>
      ${seg}
      <circle cx="100" cy="100" r="70" fill="none" stroke="${INK}" stroke-width="4"/>
      <path d="M52 70 A56 56 0 0 1 84 46" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".7"/>
      ${face(100, 104, 1)}
    </svg>`;
  }

  function badgeRing(text, id) {
    return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs><path id="${id}" d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0"/></defs>
      <circle cx="100" cy="100" r="96" fill="#FFC23D" stroke="${INK}" stroke-width="4"/>
      <circle cx="100" cy="100" r="56" fill="${INK}"/>
      <text font-family="'JetBrains Mono', monospace" font-weight="700" font-size="15" letter-spacing="2.3" fill="${INK}">
        <textPath href="#${id}" startOffset="0">${text}</textPath>
      </text>
    </svg>`;
  }

  /* Pita layers for the "Anatomy of a pita" scene (viewBox 320×110) */
  function towerLayer(kind) {
    const wrap = (inner, vb = '0 0 320 110') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
    switch (kind) {
      case 'crown': {
        let s = lemon(92, 72, 1.8, -18);
        s += `<g transform="translate(222 86) rotate(-28)"><path d="M-44 0 C-44 -14 30 -18 44 -4 C36 10 -26 14 -44 0Z" fill="#E8392B" stroke="${INK}" stroke-width="4"/><path d="M-30 -6 q30 -8 62 0" fill="none" stroke="#FF8A7A" stroke-width="4" stroke-linecap="round"/><path d="M44 -4 q12 -4 16 -18" stroke="#3E9B45" stroke-width="6" stroke-linecap="round" fill="none"/></g>`;
        s += leaf(160, 118, -30, '#5FC46B') + leaf(170, 118, 20, '#3E9B45') + leaf(150, 118, -70, '#7BC043');
        s += bits([[128, 56], [140, 44], [156, 38], [172, 44], [186, 56], [150, 60], [166, 62], [134, 70], [196, 70], [120, 76]], '#C8281A', 3.2);
        s += flame(58, 36, 1.3, '#FFC23D') + sparkle(274, 34, 0.8, '#fff') + flame(250, 118, 0.9, '#FF5A1F');
        return wrap(s, '0 0 320 132');
      }
      case 'tzatziki': {
        let s = `<path d="${dripPath(24, 296, 48, [[268, 26], [224, 16], [178, 34], [128, 20], [84, 30], [44, 12]], 26)}" fill="#FBF6EA" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
        s += `<path d="M70 38 Q160 20 250 36" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>`;
        s += `<path d="M96 46 C120 36 150 50 170 40 C190 32 210 44 228 40" fill="none" stroke="#CDB12A" stroke-width="4" stroke-linecap="round"/>`;
        s += bits([[70, 46], [110, 40], [142, 48], [190, 44], [236, 48], [260, 44], [160, 36], [88, 52]], '#5E9E3C', 3);
        return wrap(s);
      }
      case 'meat': {
        let s = `<line x1="10" y1="60" x2="310" y2="52" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><line x1="10" y1="60" x2="310" y2="52" stroke="#E2AE63" stroke-width="6" stroke-linecap="round"/>`;
        [60, 106, 152, 198, 244].forEach((x, i) => { s += cube(x, 58 - i * 1.4, 46, [-8, 6, -4, 10, -6][i], MEAT.pork); });
        s += face(152, 60, 0.7);
        return wrap(s);
      }
      case 'tomato': {
        let s = '';
        [[60, 58], [110, 52], [160, 60], [210, 52], [260, 58]].forEach(([x, y], i) => {
          s += `<g transform="translate(${x} ${y}) rotate(${i % 2 ? 6 : -6})"><ellipse rx="34" ry="17" fill="#E8392B" stroke="${INK}" stroke-width="4"/><ellipse rx="25" ry="11" fill="#FF6B4F"/><g fill="#FFC9A0"><ellipse cx="-10" cy="-2" rx="5" ry="3"/><ellipse cx="10" cy="-2" rx="5" ry="3"/><ellipse cx="0" cy="5" rx="5" ry="2.6"/></g></g>`;
        });
        return wrap(s);
      }
      case 'onion': {
        let s = '';
        [[62, 56, 26, 11, -6], [108, 50, 24, 10, 8], [156, 58, 28, 12, -4], [204, 50, 24, 10, 10], [254, 56, 26, 11, -8], [132, 62, 20, 8, 14], [230, 62, 20, 8, -12]].forEach(([x, y, rx, ry, r]) => { s += ring(x, y, rx, ry, r); });
        s += herbs([[86, 46, 20], [140, 42, -30], [180, 48, 40], [220, 40, 0], [276, 48, -40], [40, 50, 60], [118, 70, 10], [196, 70, -20]]);
        return wrap(s);
      }
      case 'fries': {
        let s = '';
        [[80, 56, 110, 84], [150, 50, 120, 96], [220, 58, 110, 78], [118, 64, 100, 102], [190, 66, 104, 88], [256, 52, 90, 100], [60, 62, 80, 94]].forEach(([x, y, l, r]) => { s += fry(x, y, l, r); });
        return wrap(s);
      }
      case 'pitaFace':
      case 'pita': {
        const id = uid('pl');
        let s = `<path d="M18 54 Q18 32 160 32 Q302 32 302 54 V62 Q302 84 160 84 Q18 84 18 62 Z" fill="${PITA}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>`;
        s += `<defs><clipPath id="${id}"><ellipse cx="160" cy="54" rx="142" ry="22"/></clipPath></defs>`;
        s += `<ellipse cx="160" cy="54" rx="142" ry="22" fill="${PITA_HI}"/>`;
        s += `<g clip-path="url(#${id})"><path d="M60 80 L110 28 M110 80 L160 28 M160 80 L210 28 M210 80 L260 28 M260 80 L300 38" stroke="${PITA_MARK}" stroke-width="7" stroke-linecap="round" opacity=".7"/></g>`;
        s += `<ellipse cx="160" cy="54" rx="142" ry="22" fill="none" stroke="${INK}" stroke-width="4"/>`;
        s += `<g fill="#D08E45" opacity=".8"><ellipse cx="84" cy="50" rx="10" ry="4"/><ellipse cx="236" cy="58" rx="12" ry="4.5"/><ellipse cx="190" cy="44" rx="7" ry="3"/></g>`;
        if (kind === 'pitaFace') s += face(160, 72, 0.72);
        return wrap(s);
      }
      case 'paper':
        return wrap(`<ellipse cx="160" cy="62" rx="154" ry="34" fill="${INK}" opacity=".25"/>
          <ellipse cx="160" cy="54" rx="150" ry="32" fill="${PAPER}" stroke="${INK}" stroke-width="4.5"/>
          <ellipse cx="160" cy="52" rx="124" ry="21" fill="none" stroke="${BLUE}" stroke-width="7" stroke-dasharray="12 6"/>
          <ellipse cx="160" cy="52" rx="100" ry="15" fill="none" stroke="${INK}" stroke-width="2.5" opacity=".2"/>
          <path d="M40 46 Q60 30 100 26" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>`);
      default:
        return wrap('');
    }
  }

  window.Art = { render, face, sparkle, flame, lemonSlice, badgeRing, towerLayer, SPARKLE_D, FLAME_D, isDark };
})();
