/* ==========================================================================
   Kalamaki Club — app
   Cart state, grill control (customizer), WhatsApp checkout, scroll scenes,
   cursor, audio.
   ========================================================================== */
(() => {
  'use strict';

  const CFG = window.KC_CONFIG;
  const CATS = window.KC_CATEGORIES;
  const OPTS = window.KC_OPTIONS;
  const MENU = window.KC_MENU;
  const Art = window.Art;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (reduced) root.classList.add('reduced');
  if (!hasGSAP) root.classList.add('no-gsap');
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const eur = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + '€';
  const pad = (n, l = 3) => String(n).padStart(l, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripEmoji = (s) => s.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '').trim();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const icons = () => { if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons, attrs: { 'stroke-width': 2.4 } }); };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  /* ------------------------------------------------------------------ data */
  const CARD_BG = {
    pites: ['#FFC23D', '#FF5A1F', '#7CC8FF', '#5FC46B'],
    kalamakia: ['#FF5A1F', '#FFC23D', '#7CC8FF'],
    merides: ['#7CC8FF', '#FFC23D', '#FF8FA3', '#5FC46B'],
    sides: ['#FFC23D', '#FF8FA3', '#7CC8FF', '#FF5A1F'],
    salads: ['#FFC23D', '#FF8FA3', '#7CC8FF'],
    drinks: ['#7CC8FF', '#FFC23D', '#5FC46B', '#FF8FA3', '#FF5A1F'],
  };
  const catIndex = {};
  const byId = {};
  MENU.forEach((m, i) => {
    const ci = (catIndex[m.cat] = (catIndex[m.cat] ?? -1) + 1);
    const pal = CARD_BG[m.cat] || ['#FFC23D'];
    byId[m.id] = { ...m, no: i + 1, bg: m.bg || pal[ci % pal.length] };
  });
  const products = MENU.map((m) => byId[m.id]);
  const catOf = (id) => CATS.find((c) => c.id === id) || CATS[0];
  const RARITY = { legendary: '★ Legend', rare: '◆ Hot pick', common: '● Classic' };

  const groupOf = (p, gid) => gid === 'remove'
    ? { type: 'remove', title: 'Remove', label: 'Χωρίς', choices: (p.remove || []).map((r) => ({ id: r, label: r })) }
    : OPTS[gid];
  const isVisible = (g, sel) => !g.showIf || g.showIf(sel);

  function defaults(p) {
    const sel = {};
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      if (!g) return;
      sel[gid] = (g.type === 'multi' || g.type === 'remove') ? [] : (g.default ?? g.choices[0].id);
    });
    return sel;
  }
  function cleanSel(p, sel) {
    const out = {};
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      if (g && isVisible(g, sel) && sel[gid] !== undefined) out[gid] = Array.isArray(sel[gid]) ? [...sel[gid]].sort() : sel[gid];
    });
    return out;
  }
  function unitPrice(id, sel) {
    const p = byId[id];
    let total = p.price;
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      if (!g || g.type === 'remove' || !isVisible(g, sel)) return;
      const v = sel[gid];
      const ids = Array.isArray(v) ? v : [v];
      ids.forEach((cid) => { const c = g.choices.find((x) => x.id === cid); if (c && c.price) total += c.price; });
    });
    return Math.round(total * 100) / 100;
  }
  // Human-readable summary of a line's options, driven by each group's `show` style.
  function describe(id, sel) {
    const p = byId[id];
    const out = [];
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      if (!g || !isVisible(g, sel)) return;
      const v = sel[gid];
      const chosen = (Array.isArray(v) ? v : [v]).map((cid) => g.choices.find((c) => c.id === cid)).filter((c) => c && !c.skip);
      if (!chosen.length) return;
      const labels = chosen.map((c) => stripEmoji(c.label));
      if (g.type === 'remove') out.push('Χωρίς ' + labels.join(', '));
      else if (g.show === 'plus') out.push(labels.map((l) => '+ ' + l).join(', '));
      else if (g.show === 'plain') out.push(labels.join(', '));
      else out.push(`${g.label}: ${labels.join(', ')}`);
    });
    return out;
  }
  const lineKey = (id, sel, notes) => `${id}|${JSON.stringify(sel)}|${notes || ''}`;

  /* ------------------------------------------------------------------ sound */
  const Sound = (() => {
    let ctx = null, master = null, on = false, ambient = null;
    function ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur = 0.08, type = 'square', vol = 0.1, when = 0, slideTo = 0) {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function whoosh(dur, from, to, vol) {
      const c = ensure(); if (!c) return;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      const t = c.currentTime;
      f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = c.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(master); src.start();
    }
    const fx = {
      click: () => tone(760, 0.07, 'square', 0.05, 0, 1400),
      tick: () => tone(2400, 0.025, 'square', 0.04),
      orbit: () => { tone(420, 0.25, 'sine', 0.08, 0, 880); tone(1320, 0.12, 'triangle', 0.04, 0.12); },
      add: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.13, 'triangle', 0.09, i * 0.06)),
      open: () => whoosh(0.4, 280, 2800, 0.16),
      close: () => whoosh(0.3, 2400, 260, 0.12),
      error: () => tone(200, 0.2, 'sawtooth', 0.05, 0, 120),
      success: () => [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => tone(f, 0.18, 'sine', 0.08, i * 0.08)),
    };
    function play(name) { if (on && fx[name]) { try { fx[name](); } catch { /* audio blocked */ } } }
    function startAmbient() {
      const c = ensure(); if (!c || ambient) return;
      const t0 = c.currentTime;
      const out = c.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.2, t0 + 2.5);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 5;
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.06; lfoG.gain.value = 380; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
      const oscs = [73.42, 110, 146.83, 220].map((f, i) => {
        const o = c.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f; o.detune.value = (i - 1.5) * 8;
        const g = c.createGain(); g.gain.value = i % 2 ? 0.04 : 0.08;
        o.connect(g).connect(lp); o.start(); return o;
      });
      // grill sizzle: looping band-passed noise with random fat crackles, swelling slowly
      const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.0007 ? 5 : 0.55);
      const nz = c.createBufferSource(); nz.buffer = buf; nz.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3600; nf.Q.value = 0.5;
      const ng = c.createGain(); ng.gain.value = 0.2;
      const swell = c.createOscillator(), swellG = c.createGain();
      swell.frequency.value = 0.13; swellG.gain.value = 0.08; swell.connect(swellG).connect(ng.gain); swell.start();
      nz.connect(nf).connect(ng).connect(out); nz.start();
      lp.connect(out); out.connect(master);
      const notes = [587.33, 622.25, 739.99, 783.99, 880, 932.33, 1174.66]; // D hijaz
      const ping = setInterval(() => tone(notes[Math.floor(Math.random() * notes.length)], 0.6, 'sine', 0.02), 2600);
      ambient = {
        stop() {
          const t = c.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
          out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
          clearInterval(ping);
          setTimeout(() => { [...oscs, lfo, nz, swell].forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }); out.disconnect(); }, 900);
        },
      };
    }
    function set(v) {
      on = v;
      if (on) { startAmbient(); play('success'); }
      else if (ambient) { ambient.stop(); ambient = null; }
    }
    return { play, set, get on() { return on; } };
  })();

  /* ------------------------------------------------------------------ cart */
  const Cart = {
    lines: store.get('kc-cart', []).filter((l) => l && byId[l.id] && l.qty > 0),
    mode: store.get('kc-mode', 'delivery') === 'takeaway' ? 'takeaway' : 'delivery',
    save() {
      store.set('kc-cart', this.lines);
      store.set('kc-mode', this.mode);
      renderBadges();
      if (Drawer.isOpen()) Drawer.render();
    },
    count() { return this.lines.reduce((s, l) => s + l.qty, 0); },
    subtotal() { return Math.round(this.lines.reduce((s, l) => s + unitPrice(l.id, l.sel) * l.qty, 0) * 100) / 100; },
    fee() {
      if (this.mode !== 'delivery' || !this.lines.length) return 0;
      return this.subtotal() >= CFG.freeDeliveryOver ? 0 : CFG.deliveryFee;
    },
    total() { return this.subtotal() + this.fee(); },
    add(id, sel, notes, qty) {
      const key = lineKey(id, sel, notes);
      const ex = this.lines.find((l) => l.key === key);
      if (ex) ex.qty = Math.min(99, ex.qty + qty);
      else this.lines.push({ key, id, sel, notes, qty });
      this.save();
    },
    replace(oldKey, id, sel, notes, qty) {
      const key = lineKey(id, sel, notes);
      const idx = this.lines.findIndex((l) => l.key === oldKey);
      const twin = this.lines.find((l) => l.key === key && l.key !== oldKey);
      if (twin) { twin.qty = Math.min(99, twin.qty + qty); if (idx > -1) this.lines.splice(idx, 1); }
      else if (idx > -1) this.lines[idx] = { key, id, sel, notes, qty };
      else this.lines.push({ key, id, sel, notes, qty });
      this.save();
    },
    setQty(key, q) {
      const l = this.lines.find((x) => x.key === key);
      if (!l) return;
      l.qty = clamp(q, 0, 99);
      if (!l.qty) this.lines = this.lines.filter((x) => x !== l);
      this.save();
    },
    clear() { this.lines = []; this.save(); },
  };

  function renderBadges(bump = false) {
    const n = Cart.count();
    $$('[data-cart-count]').forEach((el) => {
      el.textContent = n;
      el.dataset.n = n;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
    $$('[data-cart-total]').forEach((el) => { el.textContent = eur(Cart.subtotal()); });
  }

  /* ------------------------------------------------------------------ overlays */
  const overlayStack = [];
  let lenis = null;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function lockScroll(lock) {
    if (lock) {
      const sw = window.innerWidth - root.clientWidth;
      document.body.style.paddingRight = sw > 0 ? sw + 'px' : '';
      document.body.classList.add('is-locked');
      lenis && lenis.stop();
    } else {
      document.body.classList.remove('is-locked');
      document.body.style.paddingRight = '';
      lenis && lenis.start();
    }
  }
  function openOverlay(el) {
    if (overlayStack.some((o) => o.el === el)) return;
    overlayStack.push({ el, back: document.activeElement });
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    if (overlayStack.length === 1) lockScroll(true);
    $('#nav').classList.remove('is-hidden');
    Sound.play('open');
    const dlg = el.querySelector('[role="dialog"]');
    setTimeout(() => dlg && dlg.focus({ preventScroll: true }), 60);
  }
  function closeOverlay(el) {
    const i = overlayStack.findIndex((o) => o.el === el);
    if (i < 0) return;
    const [{ back }] = overlayStack.splice(i, 1);
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (!overlayStack.length) lockScroll(false);
    Sound.play('close');
    if (back && document.contains(back)) back.focus({ preventScroll: true });
    else if (overlayStack.length) { const d = overlayStack[overlayStack.length - 1].el.querySelector('[role="dialog"]'); if (d) d.focus({ preventScroll: true }); }
  }
  document.addEventListener('keydown', (e) => {
    const top = overlayStack[overlayStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay(top.el); return; }
    if (e.key === 'Tab') {
      const f = $$(FOCUSABLE, top.el).filter((x) => x.getClientRects().length && !x.closest('[hidden]'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !top.el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ------------------------------------------------------------------ toasts & fly */
  function toast(msg, icon = 'flame') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i><i data-lucide="${icon}"></i></i><span>${msg}</span>`;
    box.appendChild(t);
    icons();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2600);
    while (box.children.length > 3) box.firstElementChild.remove();
  }
  function cartTarget() {
    const cands = [$('.dock .fab'), $('.nav .cart-btn')];
    return cands.find((el) => el && el.getClientRects().length && getComputedStyle(el).display !== 'none') || $('.nav');
  }
  function flyToCart(fromEl, art) {
    $('#nav').classList.remove('is-hidden');
    document.body.classList.remove('nav-hidden');
    const target = cartTarget();
    if (reduced || !fromEl || !target || !fromEl.animate) { renderBadges(true); return; }
    const r1 = fromEl.getBoundingClientRect(), r2 = target.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.innerHTML = Art.render(art);
    const x0 = r1.left + r1.width / 2 - 45, y0 = r1.top + r1.height / 2 - 45;
    fly.style.left = x0 + 'px'; fly.style.top = y0 + 'px';
    document.body.appendChild(fly);
    const dx = r2.left + r2.width / 2 - 45 - x0, dy = r2.top + r2.height / 2 - 45 - y0;
    const lift = Math.min(220, Math.abs(dy) * 0.5 + 80);
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${Math.min(0, dy) * 0.45 - lift}px) scale(1.1) rotate(-18deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(24deg)`, opacity: 0.4 },
    ], { duration: 900, easing: 'cubic-bezier(.45,0,.25,1)' });
    anim.onfinish = () => { fly.remove(); renderBadges(true); };
  }

  /* ------------------------------------------------------------------ menu / catalog */
  const Catalog = { cat: 'all', q: '' };

  function cardHTML(p) {
    const cat = catOf(p.cat);
    const rarity = p.rarity || 'common';
    const lvl = clamp(p.intensity || 3, 1, 5);
    return `<article class="card card--${rarity}" data-id="${p.id}" data-cat="${p.cat}" style="--c:${p.bg};--bd:-${(p.no * 1.37) % 5}s">
      <div class="card-top"><span>No.${pad(p.no)}</span><span class="cat">${cat.emoji} ${esc(cat.label)}</span><span class="rarity rarity--${rarity}">${RARITY[rarity]}</span></div>
      <button class="card-art" type="button" data-customize="${p.id}" aria-label="Επιλογές για ${esc(p.name)}" data-cursor="ΦΤΙΑΞ' ΤΟ">
        ${Art.render(p.art)}
        ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ''}
        <span class="price-tag"><span>${eur(p.price)}</span></span>
      </button>
      <div class="card-body">
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-desc">${esc(p.desc)}</p>
        <ul class="tags">${(p.tags || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="meter"><span>${cat.meter}</span><span class="meter-bar" role="img" aria-label="${cat.meter} ${lvl}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span><b>${lvl}/5</b></div>
        <div class="card-actions">
          <button class="btn btn--blue" type="button" data-customize="${p.id}" data-cursor="ΦΤΙΑΞ' ΤΟ"><i data-lucide="sliders-horizontal"></i><span>Φτιάξ' το<span class="long"> όπως το θες</span></span></button>
          <button class="btn-icon" type="button" data-quick="${p.id}" aria-label="Προσθήκη ${esc(p.name)} στο καλάθι" data-cursor="+1"><i data-lucide="plus"></i></button>
        </div>
      </div>
      <span class="card-glare" aria-hidden="true"></span>
    </article>`;
  }

  function renderFilters() {
    const counts = products.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {});
    const pills = [{ id: 'all', emoji: '✦', label: 'Όλα', color: '#FFC23D', n: products.length }]
      .concat(CATS.map((c) => ({ ...c, n: counts[c.id] || 0 })))
      .concat([{ id: 'legendary', emoji: '★', label: 'Legends', color: '#FF8FA3', n: products.filter((p) => p.rarity === 'legendary').length }]);
    $('#filters').innerHTML = pills.map((c) =>
      `<button type="button" class="filter" style="--c:${c.color}" data-filter="${c.id}" aria-pressed="${c.id === Catalog.cat}"><span class="emoji" aria-hidden="true">${c.emoji}</span>${esc(c.label)}<span class="count">${c.n}</span></button>`
    ).join('');
  }

  function renderGrid() {
    $('#grid').innerHTML = products.map(cardHTML).join('') + `<div class="empty-state" hidden><b>Άδεια σχάρα</b><p>Τίποτα δεν ταιριάζει στην αναζήτηση. Δοκίμασε «γύρος», «κεμπάπ» ή «πατάτες».</p></div>`;
    $$('[data-menu-count]').forEach((el) => { el.textContent = `${products.length} πιάτα`; });
    icons();
  }

  function applyFilter(animate = true) {
    const q = norm(Catalog.q.trim());
    let shown = [];
    $$('#grid .card').forEach((card) => {
      const p = byId[card.dataset.id];
      const okCat = Catalog.cat === 'all' || (Catalog.cat === 'legendary' ? p.rarity === 'legendary' : p.cat === Catalog.cat);
      const hay = norm([p.name, p.desc, ...(p.tags || []), catOf(p.cat).label, catOf(p.cat).gr].join(' '));
      const ok = okCat && (!q || hay.includes(q));
      card.classList.toggle('is-hidden', !ok);
      if (ok) shown.push(card);
    });
    $('#grid .empty-state').hidden = shown.length > 0;
    $('#gridStatus').textContent = `${shown.length} προϊόντα`;
    $$('#filters .filter').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === Catalog.cat)));
    if (animate && hasGSAP && !reduced) {
      gsap.fromTo(shown.slice(0, 12), { y: 30, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.04, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
    }
    if (hasGSAP) ScrollTrigger.refresh();
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    Catalog.cat = b.dataset.filter;
    Sound.play('click');
    applyFilter();
    b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
    const grid = $('#grid');
    const top = grid.getBoundingClientRect().top;
    if (top < 0) scrollToEl(grid, -170);
  });
  let searchT;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { Catalog.q = e.target.value; applyFilter(false); }, 120);
  });

  /* card tilt + glare */
  if (finePointer && !reduced) {
    const grid = $('#grid');
    grid.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.classList.add('is-tilting');
      card.style.setProperty('--ry', ((px - 0.5) * 12).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-(py - 0.5) * 10).toFixed(2) + 'deg');
      card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    });
    grid.addEventListener('pointerout', (e) => {
      const card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  /* ------------------------------------------------------------------ grill control (customizer modal) */
  const modalRoot = $('#engineModal');
  const mForm = $('#mForm');
  const Engine = { p: null, sel: {}, qty: 1, notes: '', editKey: null };

  function dialFace(angles) {
    const pt = (a, r) => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)].map((v) => v.toFixed(2));
    const [x1, y1] = pt(-82, 40), [x2, y2] = pt(82, 40);
    let s = `<svg class="dial-face" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#FFC23D" stroke="#170F0B" stroke-width="2.5"/>
      <path d="M${x1} ${y1} A40 40 0 0 1 ${x2} ${y2}" fill="none" stroke="#170F0B" stroke-width="7.5" stroke-linecap="round"/>
      <path d="M${x1} ${y1} A40 40 0 0 1 ${x2} ${y2}" fill="none" stroke="#FF5A1F" stroke-width="4" stroke-linecap="round"/>`;
    for (let a = -80; a <= 80; a += 10) {
      const [ax, ay] = pt(a, 44.5), [bx, by] = pt(a, 47);
      s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#170F0B" stroke-width="1.3"/>`;
    }
    angles.forEach((a) => {
      const [cx, cy] = pt(a, 40);
      s += `<circle cx="${cx}" cy="${cy}" r="2.6" fill="#F7EDD8" stroke="#170F0B" stroke-width="1.2"/>`;
    });
    return s + '</svg>';
  }

  function groupHTML(p, gid, g, n) {
    const sel = Engine.sel[gid];
    const price = (c) => (c.price ? `<small>+${eur(c.price)}</small>` : '');
    let body = '';
    if (g.type === 'dial') {
      const idx = Math.max(0, g.choices.findIndex((c) => c.id === sel));
      const angles = g.choices.map((_, i) => -70 + i * (140 / (g.choices.length - 1)));
      body = `<div class="dial-wrap">
        <div class="dial" role="slider" tabindex="0" aria-label="${esc(g.label)}" aria-valuemin="0" aria-valuemax="${g.choices.length - 1}" aria-valuenow="${idx}" aria-valuetext="${esc(g.choices[idx].label)}" data-dial="${gid}" data-angles="${angles.join(',')}" data-cursor="TWIST">
          ${dialFace(angles)}<div class="dial-knob" style="--rot:${angles[idx]}deg"><i></i></div>
        </div>
        <div>
          <div class="lcd" aria-hidden="true"><span>HEAT.LVL</span><span data-lcd>${pad(idx, 2)}/${pad(g.choices.length - 1, 2)}</span></div>
          <div class="dial-opts" role="radiogroup" aria-label="${esc(g.label)}">
            ${g.choices.map((c, i) => `<button type="button" class="dial-opt" role="radio" aria-checked="${i === idx}" data-dial-opt="${gid}" data-i="${i}"><span class="led"></span>${esc(c.label)}</button>`).join('')}
          </div>
        </div>
      </div>`;
    } else if (g.type === 'orbit') {
      const idx = Math.max(0, g.choices.findIndex((c) => c.id === sel));
      const step = 360 / g.choices.length;
      body = `<div class="orbit-wrap">
        <div class="orbit" data-orbit="${gid}" style="--sel:${idx * step}deg">
          <div class="orbit-ring"></div>
          <div class="orbit-sat"></div>
          <div class="orbit-core"><div><i data-lucide="flame"></i><span data-orbit-label>${esc(g.choices[idx].label)}</span></div></div>
          ${g.choices.map((c, i) => `<div class="moon" style="--a:${i * step}deg"><label data-cursor="${esc(c.label)}">
            <input type="radio" name="${gid}" value="${c.id}" ${i === idx ? 'checked' : ''}>
            <span class="moon-body ${c.id === 'none' ? 'is-none' : ''}" style="--mc:${c.color}"></span>
            <span class="moon-name">${esc(c.label)}${c.price ? `<br>+${eur(c.price)}` : ''}</span>
          </label></div>`).join('')}
        </div>
        <ul class="moon-list">${g.choices.map((c) => `<li><button type="button" data-moon="${gid}" data-v="${c.id}" aria-pressed="${c.id === sel}">${esc(c.label)}${price(c)}</button></li>`).join('')}</ul>
      </div>`;
    } else if (g.type === 'toggle') {
      const idx = Math.max(0, g.choices.findIndex((c) => c.id === sel));
      body = `<div class="seg" data-seg="${gid}" style="--n:${g.choices.length};--i:${idx}"><span class="seg-thumb"></span>
        ${g.choices.map((c) => `<label><input type="radio" name="${gid}" value="${c.id}" ${c.id === sel ? 'checked' : ''}>${esc(c.label)}${price(c)}</label>`).join('')}
      </div>`;
    } else {
      const multi = g.type === 'multi' || g.type === 'remove';
      const arr = Array.isArray(sel) ? sel : [];
      body = `<div class="chips">${g.choices.map((c) => {
        const checked = multi ? arr.includes(c.id) : c.id === sel;
        return `<label class="chip ${g.type === 'remove' ? 'chip--remove' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="${gid}" value="${esc(c.id)}" ${checked ? 'checked' : ''}><span>${esc(c.label)}${price(c)}</span></label>`;
      }).join('')}</div>`;
    }
    const hint = g.type === 'multi' ? '<span class="opt-hint">πολλαπλή επιλογή</span>' : g.type === 'remove' ? '<span class="opt-hint">πάτα για αφαίρεση</span>' : '';
    return `<fieldset class="opt-group" data-group="${gid}" ${isVisible(g, Engine.sel) ? '' : 'hidden'}>
      <legend class="opt-head"><span class="opt-num">${pad(n, 2)}</span><span class="opt-title">${esc(g.title)}</span><span class="opt-sub">${esc(g.label)}</span>${hint}</legend>
      ${body}
    </fieldset>`;
  }

  function renderEngineForm() {
    const p = Engine.p;
    let n = 0;
    let h = '';
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      if (!g || !g.choices.length) return;
      h += groupHTML(p, gid, g, ++n);
    });
    h += `<div class="opt-group notes">
      <div class="opt-head"><span class="opt-num">${pad(n + 1, 2)}</span><span class="opt-title">Για τον ψήστη</span><span class="opt-sub">Σημείωση για την κουζίνα</span></div>
      <label class="sr-only" for="mNotes">Σημείωση</label>
      <textarea id="mNotes" maxlength="200" placeholder="π.χ. καλοψημένο, χωρίς αλάτι, κόψ' τη στα δύο…">${esc(Engine.notes)}</textarea>
    </div>`;
    mForm.innerHTML = h;
    mForm.scrollTop = 0;
    icons();
  }

  function syncEngine() {
    const p = Engine.p;
    (p.opts || []).forEach((gid) => {
      const g = groupOf(p, gid);
      const fs = mForm.querySelector(`[data-group="${gid}"]`);
      if (!g || !fs) return;
      fs.hidden = !isVisible(g, Engine.sel);
      const v = Engine.sel[gid];
      if (g.type === 'toggle') {
        const seg = fs.querySelector('.seg');
        seg.style.setProperty('--i', Math.max(0, g.choices.findIndex((c) => c.id === v)));
      } else if (g.type === 'orbit') {
        const idx = Math.max(0, g.choices.findIndex((c) => c.id === v));
        fs.querySelector('.orbit').style.setProperty('--sel', `${idx * (360 / g.choices.length)}deg`);
        fs.querySelector('[data-orbit-label]').textContent = g.choices[idx].label;
        $$('[data-moon]', fs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
        const r = fs.querySelector(`input[value="${v}"]`); if (r) r.checked = true;
      } else if (g.type === 'dial') {
        const idx = Math.max(0, g.choices.findIndex((c) => c.id === v));
        const dial = fs.querySelector('.dial');
        const angles = dial.dataset.angles.split(',').map(Number);
        dial.querySelector('.dial-knob').style.setProperty('--rot', angles[idx] + 'deg');
        dial.setAttribute('aria-valuenow', idx);
        dial.setAttribute('aria-valuetext', g.choices[idx].label);
        fs.querySelector('[data-lcd]').textContent = `${pad(idx, 2)}/${pad(g.choices.length - 1, 2)}`;
        $$('.dial-opt', fs).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.i) === idx)));
      }
    });
    const unit = unitPrice(p.id, Engine.sel);
    $('#mTotal').textContent = eur(unit * Engine.qty);
    $('#mQty').textContent = Engine.qty;
  }

  function setDial(gid, idx) {
    const g = OPTS[gid];
    idx = clamp(idx, 0, g.choices.length - 1);
    if (Engine.sel[gid] === g.choices[idx].id) return;
    Engine.sel[gid] = g.choices[idx].id;
    Sound.play('tick');
    syncEngine();
  }

  function openEngine(id, line) {
    const p = byId[id];
    if (!p) return;
    Engine.p = p;
    Engine.sel = line ? JSON.parse(JSON.stringify({ ...defaults(p), ...line.sel })) : defaults(p);
    Engine.qty = line ? line.qty : 1;
    Engine.notes = line ? (line.notes || '') : '';
    Engine.editKey = line ? line.key : null;
    const cat = catOf(p.cat);
    const modal = $('.modal', modalRoot);
    modal.style.setProperty('--c', p.bg);
    $('#mNo').textContent = `No.${pad(p.no)} · ${RARITY[p.rarity || 'common']}`;
    $('#mCat').textContent = `${cat.emoji} ${cat.label}`;
    $('#mTitle').textContent = p.name;
    $('#mDesc').textContent = p.desc;
    $('#mTags').innerHTML = (p.tags || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const stage = $('#mStage');
    stage.querySelector('.art')?.remove();
    stage.insertAdjacentHTML('beforeend', Art.render(p.art));
    $('#mAddLabel').textContent = line ? 'Ενημέρωση' : 'Στο ταψί';
    renderEngineForm();
    syncEngine();
    openOverlay(modalRoot);
  }

  mForm.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.name || !Engine.p) return;
    if (t.type === 'radio') Engine.sel[t.name] = t.value;
    if (t.type === 'checkbox') {
      const set = new Set(Engine.sel[t.name] || []);
      t.checked ? set.add(t.value) : set.delete(t.value);
      Engine.sel[t.name] = [...set];
    }
    Sound.play(OPTS[t.name] && OPTS[t.name].type === 'orbit' ? 'orbit' : 'tick');
    syncEngine();
  });
  mForm.addEventListener('input', (e) => { if (e.target.id === 'mNotes') Engine.notes = e.target.value; });
  mForm.addEventListener('submit', (e) => e.preventDefault());
  mForm.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-dial-opt]');
    if (opt) { setDial(opt.dataset.dialOpt, Number(opt.dataset.i)); return; }
    const moon = e.target.closest('[data-moon]');
    if (moon) {
      Engine.sel[moon.dataset.moon] = moon.dataset.v;
      Sound.play('orbit');
      syncEngine();
    }
  });
  // dial: drag, click to cycle, keyboard
  let dialDrag = null;
  mForm.addEventListener('pointerdown', (e) => {
    const dial = e.target.closest('.dial');
    if (!dial) return;
    e.preventDefault();
    dial.setPointerCapture(e.pointerId);
    dial.focus({ preventScroll: true });
    dialDrag = { dial, x: e.clientX, y: e.clientY, moved: false };
  });
  mForm.addEventListener('pointermove', (e) => {
    if (!dialDrag) return;
    const { dial } = dialDrag;
    if (Math.hypot(e.clientX - dialDrag.x, e.clientY - dialDrag.y) > 6) dialDrag.moved = true;
    if (!dialDrag.moved) return;
    const r = dial.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
    const angles = dial.dataset.angles.split(',').map(Number);
    let best = 0;
    angles.forEach((ang, i) => { if (Math.abs(ang - a) < Math.abs(angles[best] - a)) best = i; });
    setDial(dial.dataset.dial, best);
  });
  const endDial = () => {
    if (!dialDrag) return;
    const { dial, moved } = dialDrag;
    dialDrag = null;
    if (!moved) {
      const g = OPTS[dial.dataset.dial];
      const idx = g.choices.findIndex((c) => c.id === Engine.sel[dial.dataset.dial]);
      setDial(dial.dataset.dial, (idx + 1) % g.choices.length);
    }
  };
  mForm.addEventListener('pointerup', endDial);
  mForm.addEventListener('pointercancel', () => { dialDrag = null; });
  mForm.addEventListener('keydown', (e) => {
    const dial = e.target.closest('.dial');
    if (!dial) return;
    const gid = dial.dataset.dial;
    const g = OPTS[gid];
    const idx = g.choices.findIndex((c) => c.id === Engine.sel[gid]);
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (map[e.key]) { e.preventDefault(); setDial(gid, idx + map[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); setDial(gid, 0); }
    if (e.key === 'End') { e.preventDefault(); setDial(gid, g.choices.length - 1); }
  });

  $('#mMinus').addEventListener('click', () => { Engine.qty = Math.max(1, Engine.qty - 1); Sound.play('tick'); syncEngine(); });
  $('#mPlus').addEventListener('click', () => { Engine.qty = Math.min(99, Engine.qty + 1); Sound.play('tick'); syncEngine(); });
  $('#mAdd').addEventListener('click', () => {
    const p = Engine.p;
    if (!p) return;
    const sel = cleanSel(p, Engine.sel);
    const notes = Engine.notes.trim();
    const from = $('#mStage .art');
    if (Engine.editKey) {
      Cart.replace(Engine.editKey, p.id, sel, notes, Engine.qty);
      toast(`${esc(p.name)} — ενημερώθηκε`, 'check');
    } else {
      Cart.add(p.id, sel, notes, Engine.qty);
      toast(`${esc(p.name)} ×${Engine.qty} · στο ταψί!`);
    }
    Sound.play('add');
    const wasEdit = !!Engine.editKey;
    closeOverlay(modalRoot);
    if (!wasEdit) flyToCart(from, p.art); else renderBadges(true);
  });

  function quickAdd(id, btn) {
    const p = byId[id];
    if (!p) return;
    if (id.startsWith('byo-')) { openEngine(id); return; }
    Cart.add(p.id, cleanSel(p, defaults(p)), '', 1);
    Sound.play('add');
    toast(`${esc(p.name)} · στο ταψί!`);
    const card = btn.closest('.card');
    flyToCart(card ? card.querySelector('.card-art .art') : btn, p.art);
  }

  /* ------------------------------------------------------------------ the tray (cart drawer) */
  const drawerRoot = $('#cartDrawer');
  const dBody = $('#dBody'), dFoot = $('#dFoot');
  const Checkout = Object.assign(
    { name: '', phone: '', street: '', floor: '', bell: '', area: '', payment: 'cash', comments: '', remember: false },
    store.get('kc-details', {}),
  );
  const Drawer = {
    step: 'cart',
    isOpen: () => drawerRoot.classList.contains('is-open'),
    open(step = 'cart') { this.step = step; this.render(); openOverlay(drawerRoot); },
    close() { closeOverlay(drawerRoot); },
    go(step) { this.step = step; this.render(); dBody.scrollTop = 0; },
    render() {
      if (this.step === 'details' && !Cart.lines.length) this.step = 'cart';
      const order = ['cart', 'details', 'done'];
      $$('.drawer-steps span', drawerRoot).forEach((s, i) => s.classList.toggle('is-on', i <= order.indexOf(this.step)));
      if (this.step === 'cart') renderCartStep();
      else if (this.step === 'details') renderDetailsStep();
      else renderDoneStep();
      icons();
    },
  };

  function trackerHTML() {
    if (Cart.mode !== 'delivery') {
      return `<div class="tracker is-free"><p class="tracker-msg"><i data-lucide="store"></i>Παραλαβή από ${esc(CFG.address)} — χωρίς κόστος delivery.</p></div>`;
    }
    const sub = Cart.subtotal();
    const p = clamp(sub / CFG.freeDeliveryOver * 100, 0, 100);
    const left = CFG.freeDeliveryOver - sub;
    const free = left <= 0;
    return `<div class="tracker ${free ? 'is-free' : ''}">
      <p class="tracker-msg"><i data-lucide="${free ? 'party-popper' : 'flame'}"></i>${free ? '<span>Free delivery <b>unlocked</b> — πάμε!</span>' : `<span>Βάλε ακόμα <b>${eur(left)}</b> για <b>ΔΩΡΕΑΝ</b> delivery</span>`}</p>
      <div class="tracker-bar" style="--p:${p}%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" aria-label="Πρόοδος για δωρεάν delivery"><i></i><span class="marker"><i data-lucide="flame"></i></span></div>
    </div>`;
  }

  function totalsHTML() {
    const fee = Cart.fee();
    const feeTxt = Cart.mode !== 'delivery' ? '<span>—</span>' : fee ? `<span>${eur(fee)}</span>` : '<span class="free">ΔΩΡΕΑΝ</span>';
    return `<div class="totals">
      <div><span>Υποσύνολο</span><span>${eur(Cart.subtotal())}</span></div>
      <div><span>${Cart.mode === 'delivery' ? 'Delivery' : 'Παραλαβή'}</span>${feeTxt}</div>
      <div class="grand"><span>Σύνολο</span><span>${eur(Cart.total())}</span></div>
    </div>`;
  }

  const belowMin = () => Cart.mode === 'delivery' && Cart.subtotal() < CFG.minOrder;

  function renderCartStep() {
    if (!Cart.lines.length) {
      dBody.innerHTML = `<div class="cart-empty">
        ${Art.render({ kind: 'pita', meat: 'pork' })}
        <b>Άδειο ταψί</b>
        <p>Τίποτα στη σχάρα ακόμα. Πάμε να το αλλάξουμε αυτό;</p>
      </div>`;
      dFoot.innerHTML = `<a href="#menu" class="btn btn--block" data-drawer-nav><i data-lucide="utensils"></i> Δες το μενού</a>`;
      return;
    }
    const modeIdx = Cart.mode === 'delivery' ? 0 : 1;
    dBody.innerHTML = `
      <div class="seg mode-switch" style="--n:2;--i:${modeIdx}" data-mode-switch>
        <span class="seg-thumb"></span>
        <label><input type="radio" name="mode" value="delivery" ${modeIdx === 0 ? 'checked' : ''}>🛵 Delivery</label>
        <label><input type="radio" name="mode" value="takeaway" ${modeIdx === 1 ? 'checked' : ''}>🏃 Take away</label>
      </div>
      ${trackerHTML()}
      <ul class="lines">${Cart.lines.map((l) => {
        const p = byId[l.id];
        const d = describe(l.id, l.sel);
        return `<li class="cline" style="--c:${p.bg}" data-key="${esc(l.key)}">
          <div class="line-thumb">${Art.render(p.art)}</div>
          <div>
            <p class="line-name">${esc(p.name)}</p>
            ${d.length ? `<p class="line-opts">${esc(d.join(' · '))}</p>` : ''}
            ${l.notes ? `<p class="line-note">“${esc(l.notes)}”</p>` : ''}
            <button type="button" class="line-edit" data-edit>Αλλαγή</button>
          </div>
          <div class="line-side">
            <span class="line-price">${eur(unitPrice(l.id, l.sel) * l.qty)}</span>
            <div class="stepper stepper--sm" role="group" aria-label="Ποσότητα ${esc(p.name)}">
              <button type="button" data-dec aria-label="${l.qty === 1 ? 'Αφαίρεση' : 'Λιγότερα'}"><i data-lucide="${l.qty === 1 ? 'trash-2' : 'minus'}"></i></button>
              <output>${l.qty}</output>
              <button type="button" data-inc aria-label="Περισσότερα"><i data-lucide="plus"></i></button>
            </div>
          </div>
        </li>`;
      }).join('')}</ul>`;
    const warn = belowMin() ? `<p class="warn"><i data-lucide="triangle-alert"></i>Ελάχιστη παραγγελία για delivery: ${eur(CFG.minOrder)}</p>` : '';
    dFoot.innerHTML = `${totalsHTML()}${warn}
      <div class="foot-actions">
        <button type="button" class="btn btn--block" data-go="details" ${belowMin() ? 'disabled' : ''}><i data-lucide="map-pin"></i> Συνέχεια · στοιχεία</button>
        <button type="button" class="btn-icon" data-clear aria-label="Άδειασμα καλαθιού" title="Άδειασμα καλαθιού"><i data-lucide="trash-2"></i></button>
      </div>`;
  }

  function field(name, label, { required = false, type = 'text', auto = '', placeholder = '', err = '', mode = '' } = {}) {
    return `<label class="field" data-f="${name}">
      <span>${label}${required ? ' <b>*</b>' : ''}</span>
      <input name="${name}" type="${type}" value="${esc(Checkout[name])}" ${auto ? `autocomplete="${auto}"` : ''} ${mode ? `inputmode="${mode}"` : ''} ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} ${required ? 'required aria-required="true"' : ''}>
      ${err ? `<em class="err">${err}</em>` : ''}
    </label>`;
  }

  function renderDetailsStep() {
    const delivery = Cart.mode === 'delivery';
    const payIdx = Checkout.payment === 'card' ? 1 : 0;
    dBody.innerHTML = `
      <button type="button" class="back-link" data-go="cart"><i data-lucide="arrow-left"></i> Πίσω στο ταψί</button>
      <form class="form" id="coForm" novalidate>
        <p class="form-section-title">// Στοιχεία</p>
        ${field('name', 'Ονοματεπώνυμο', { required: true, auto: 'name', err: 'Συμπλήρωσε το όνομά σου' })}
        ${field('phone', 'Κινητό', { required: true, type: 'tel', auto: 'tel', mode: 'tel', placeholder: '69x xxx xxxx', err: 'Βάλε ένα έγκυρο τηλέφωνο (10 ψηφία)' })}
        ${delivery ? `
          <p class="form-section-title">// Διεύθυνση</p>
          ${field('street', 'Οδός & αριθμός', { required: true, auto: 'street-address', placeholder: 'π.χ. Καραΐσκου 12', err: 'Χρειαζόμαστε διεύθυνση για το delivery' })}
          <div class="row2">${field('floor', 'Όροφος', { placeholder: 'π.χ. 2ος' })}${field('bell', 'Κουδούνι', { placeholder: 'π.χ. Παπαδόπουλος' })}</div>
          ${field('area', 'Περιοχή', { auto: 'address-level2', placeholder: 'π.χ. Πειραιάς' })}` : ''}
        <p class="form-section-title">// Πληρωμή</p>
        <div class="seg mode-switch" style="--n:2;--i:${payIdx}" data-pay-switch>
          <span class="seg-thumb"></span>
          <label><input type="radio" name="payment" value="cash" ${payIdx === 0 ? 'checked' : ''}>💶 Μετρητά</label>
          <label><input type="radio" name="payment" value="card" ${payIdx === 1 ? 'checked' : ''}>💳 Κάρτα (POS)</label>
        </div>
        <label class="field"><span>Σχόλια παραγγελίας</span><textarea name="comments" maxlength="300" placeholder="π.χ. χτυπήστε δυνατά, έχω ρέστα από 20€…">${esc(Checkout.comments)}</textarea></label>
        <label class="check"><input type="checkbox" name="remember" ${Checkout.remember ? 'checked' : ''}> Θυμήσου τα στοιχεία μου σε αυτή τη συσκευή</label>
        <details class="preview"><summary>Προεπισκόπηση μηνύματος</summary><pre id="msgPreview"></pre></details>
      </form>`;
    dFoot.innerHTML = `${totalsHTML()}
      <div class="foot-actions three">
        <button type="button" class="btn btn--green btn--block btn--lg" data-send><i data-lucide="send"></i> Αποστολή στο WhatsApp</button>
        <div class="row">
          <a class="btn btn--paper btn--sm" href="tel:${CFG.phoneTel}"><i data-lucide="phone"></i> ${CFG.phoneDisplay}</a>
          <button type="button" class="btn btn--paper btn--sm" data-copy><i data-lucide="copy"></i> Αντιγραφή</button>
        </div>
      </div>`;
    updatePreview();
  }

  function renderDoneStep() {
    dBody.innerHTML = `<div class="done">
      <div class="badge-ok"><i data-lucide="check"></i></div>
      <b>Έτοιμο για<br>τη σχάρα!</b>
      <p>Άνοιξε το WhatsApp με την παραγγελία σου έτοιμη — πάτα «Αποστολή» εκεί για να φτάσει στον ψήστη. Αν δεν άνοιξε, κάλεσέ μας στο <a href="tel:${CFG.phoneTel}" style="color:var(--sun);font-weight:800">${CFG.phoneDisplay}</a>.</p>
    </div>`;
    dFoot.innerHTML = `<div class="foot-actions three">
      <button type="button" class="btn btn--block" data-new-order><i data-lucide="sparkles"></i> Στάλθηκε — νέα παραγγελία</button>
      <div class="row">
        <button type="button" class="btn btn--paper btn--sm" data-resend><i data-lucide="send"></i> Ξανά WhatsApp</button>
        <button type="button" class="btn btn--paper btn--sm" data-go="cart"><i data-lucide="arrow-left"></i> Καλάθι</button>
      </div>
    </div>`;
  }

  function buildMessage() {
    const delivery = Cart.mode === 'delivery';
    const L = [];
    const hr = '━━━━━━━━━━━━━━';
    L.push(`🔥 *ΝΕΑ ΠΑΡΑΓΓΕΛΙΑ — ${CFG.name}*`);
    L.push('');
    L.push(`*Τρόπος:* ${delivery ? 'Delivery 🛵' : 'Παραλαβή από το κατάστημα 🏃'}`);
    L.push(`*Όνομα:* ${Checkout.name.trim() || '—'}`);
    L.push(`*Τηλέφωνο:* ${Checkout.phone.trim() || '—'}`);
    if (delivery) {
      L.push(`*Διεύθυνση:* ${[Checkout.street.trim(), Checkout.area.trim()].filter(Boolean).join(', ') || '—'}`);
      const fb = [Checkout.floor.trim() && `Όροφος: ${Checkout.floor.trim()}`, Checkout.bell.trim() && `Κουδούνι: ${Checkout.bell.trim()}`].filter(Boolean);
      if (fb.length) L.push(`*${fb.join(' · ')}*`);
    }
    L.push(hr);
    L.push('*ΠΡΟΪΟΝΤΑ*');
    Cart.lines.forEach((l, i) => {
      const p = byId[l.id];
      L.push(`${i + 1}. ${l.qty}× ${p.name} — ${eur(unitPrice(l.id, l.sel) * l.qty)}`);
      const d = describe(l.id, l.sel);
      if (d.length) L.push(`   ↳ ${d.join(' · ')}`);
      if (l.notes) L.push(`   ✎ ${l.notes}`);
    });
    L.push(hr);
    L.push(`Υποσύνολο: ${eur(Cart.subtotal())}`);
    if (delivery) L.push(`Delivery: ${Cart.fee() ? eur(Cart.fee()) : 'Δωρεάν'}`);
    L.push(`*ΣΥΝΟΛΟ: ${eur(Cart.total())}*`);
    L.push(`*Πληρωμή:* ${Checkout.payment === 'card' ? 'Κάρτα (POS)' : 'Μετρητά'}`);
    if (Checkout.comments.trim()) L.push(`*Σχόλια:* ${Checkout.comments.trim()}`);
    L.push('');
    L.push('Ευχαριστώ! 🙌');
    return L.join('\n');
  }
  function updatePreview() { const pre = $('#msgPreview'); if (pre) pre.textContent = buildMessage(); }

  function validate() {
    const form = $('#coForm');
    if (!form) return false;
    const errs = [];
    const check = (name, ok) => {
      const f = form.querySelector(`[data-f="${name}"]`);
      if (!f) return;
      f.classList.toggle('is-invalid', !ok);
      const input = f.querySelector('input');
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok) errs.push(input);
    };
    check('name', Checkout.name.trim().length >= 2);
    const digits = Checkout.phone.replace(/\D/g, '').replace(/^(00)?30(?=\d{10}$)/, '');
    check('phone', digits.length >= 10);
    if (Cart.mode === 'delivery') check('street', Checkout.street.trim().length >= 3);
    if (errs.length) { errs[0].focus(); Sound.play('error'); return false; }
    return true;
  }

  function persistDetails() {
    if (Checkout.remember) {
      const { comments, ...rest } = Checkout;
      store.set('kc-details', rest);
    } else store.del('kc-details');
  }

  function sendWhatsApp() {
    if (!validate()) return;
    persistDetails();
    const url = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(buildMessage())}`;
    window.open(url, '_blank', 'noopener');
    Sound.play('success');
    Drawer.go('done');
  }

  async function copyOrder() {
    const msg = buildMessage();
    try {
      await navigator.clipboard.writeText(msg);
      toast('Η παραγγελία αντιγράφηκε', 'copy');
    } catch {
      const d = $('.preview'); if (d) d.open = true;
      const pre = $('#msgPreview');
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast('Επίλεξε & αντέγραψε το κείμενο', 'copy');
    }
  }

  drawerRoot.addEventListener('click', (e) => {
    const t = e.target;
    const line = t.closest('.cline');
    if (t.closest('[data-inc]') && line) { const l = Cart.lines.find((x) => x.key === line.dataset.key); if (l) { Cart.setQty(l.key, l.qty + 1); Sound.play('tick'); } return; }
    if (t.closest('[data-dec]') && line) { const l = Cart.lines.find((x) => x.key === line.dataset.key); if (l) { Cart.setQty(l.key, l.qty - 1); Sound.play('tick'); renderBadges(); } return; }
    if (t.closest('[data-edit]') && line) { const l = Cart.lines.find((x) => x.key === line.dataset.key); if (l) openEngine(l.id, l); return; }
    const go = t.closest('[data-go]');
    if (go) { if (go.dataset.go === 'details' && belowMin()) return; Sound.play('click'); Drawer.go(go.dataset.go); return; }
    if (t.closest('[data-clear]')) { if (confirm('Άδειασμα του καλαθιού;')) { Cart.clear(); Sound.play('close'); } return; }
    if (t.closest('[data-send]') || t.closest('[data-resend]')) { if (t.closest('[data-resend]')) { Drawer.go('details'); } sendWhatsApp(); return; }
    if (t.closest('[data-copy]')) { copyOrder(); return; }
    if (t.closest('[data-new-order]')) { Cart.clear(); Drawer.go('cart'); Drawer.close(); toast('Η σχάρα σε περιμένει ξανά', 'sparkles'); return; }
    const nav = t.closest('[data-drawer-nav]');
    if (nav) { e.preventDefault(); Drawer.close(); scrollToEl($(nav.getAttribute('href'))); }
  });
  drawerRoot.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') {
      Cart.mode = t.value;
      const seg = t.closest('.seg'); if (seg) seg.style.setProperty('--i', t.value === 'takeaway' ? 1 : 0);
      Sound.play('orbit');
      setTimeout(() => Cart.save(), 320);
      return;
    }
    if (t.name === 'payment') {
      Checkout.payment = t.value;
      const seg = t.closest('.seg'); if (seg) seg.style.setProperty('--i', t.value === 'card' ? 1 : 0);
      Sound.play('tick');
      updatePreview();
      return;
    }
    if (t.name === 'remember') { Checkout.remember = t.checked; persistDetails(); }
  });
  drawerRoot.addEventListener('input', (e) => {
    const t = e.target;
    if (t.closest('#coForm') && t.name && t.name in Checkout && t.type !== 'checkbox' && t.type !== 'radio') {
      Checkout[t.name] = t.value;
      const f = t.closest('.field'); if (f) f.classList.remove('is-invalid');
      updatePreview();
      if (Checkout.remember) persistDetails();
    }
  });

  /* ------------------------------------------------------------------ global delegation */
  document.addEventListener('click', (e) => {
    const cz = e.target.closest('[data-customize]');
    if (cz) { e.preventDefault(); Sound.play('click'); openEngine(cz.dataset.customize); return; }
    const qa = e.target.closest('[data-quick]');
    if (qa) { e.preventDefault(); quickAdd(qa.dataset.quick, qa); return; }
    const oc = e.target.closest('[data-open-cart]');
    if (oc) { e.preventDefault(); Drawer.open('cart'); return; }
    const cl = e.target.closest('[data-close]');
    if (cl) { const ov = cl.closest('.overlay-root'); if (ov) closeOverlay(ov); return; }
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1 && !a.hasAttribute('data-drawer-nav')) {
      const target = $(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        scrollToEl(target);
        Sound.play('click');
        if (a.classList.contains('skip-link')) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      }
    }
  });

  function scrollToEl(el, offset = 0) {
    if (!el) return;
    if (el.id === 'fire') offset = 0;
    if (lenis) lenis.scrollTo(el, { offset, duration: 1.4 });
    else {
      const y = el.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    }
  }

  /* ------------------------------------------------------------------ static bits */
  function athensNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day, mins: Number(get('hour')) * 60 + Number(get('minute')) };
  }
  const toMins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  function renderStatus() {
    const { day, mins } = athensNow();
    const today = CFG.hours[day];
    let open = false, text = 'Closed';
    if (today) {
      const o = toMins(today[0]), c = toMins(today[1]);
      open = c > o ? mins >= o && mins < c : mins >= o || mins < c;
      if (open) text = `Open now · έως ${today[1]}`;
      else if (mins < o) text = `Closed · ανοίγει ${today[0]}`;
      else { const nxt = CFG.hours[(day + 1) % 7]; text = nxt ? `Closed · αύριο ${nxt[0]}` : 'Closed'; }
    }
    $$('[data-status]').forEach((el) => {
      el.classList.toggle('is-closed', !open);
      const t = el.querySelector('[data-status-text]'); if (t) t.textContent = text;
    });
    const names = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const tb = $('#hours tbody');
    if (tb) tb.innerHTML = order.map((d) => `<tr class="${d === day ? 'is-today' : ''}"><td>${names[d]}</td><td>${CFG.hours[d] ? CFG.hours[d].join(' – ') : 'Κλειστά'}</td></tr>`).join('');
  }

  function hydrateStatic() {
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
    $$('[data-instagram]').forEach((el) => { el.href = `https://www.instagram.com/${CFG.instagram}/`; if (el.textContent.trim().startsWith('@')) el.textContent = '@' + CFG.instagram; });
    $$('[data-efood]').forEach((el) => { el.href = CFG.efoodUrl; });
    $$('[data-maps]').forEach((el) => { el.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(CFG.mapsQuery); });
    $$('[data-tel]').forEach((el) => { el.href = 'tel:' + CFG.phoneTel; if (!el.children.length && /^[\d\s]+$/.test(el.textContent.trim())) el.textContent = CFG.phoneDisplay; });
    $$('[data-phone]').forEach((el) => { el.textContent = CFG.phoneDisplay; });
    $$('[data-address]').forEach((el) => { el.textContent = CFG.address; });
    $$('[data-area]').forEach((el) => { el.textContent = CFG.area; });
    $$('[data-full-address]').forEach((el) => { el.textContent = `${CFG.address}, ${CFG.area}`; });
    $$('[data-radar-label]').forEach((el) => { el.innerHTML = `${esc(CFG.name)}<br>${esc(CFG.address)}`; });
    $$('[data-price-of]').forEach((el) => { const p = byId[el.dataset.priceOf]; if (p) el.textContent = eur(p.price); });
    $$('[data-art]').forEach((el) => { try { el.innerHTML = Art.render(JSON.parse(el.dataset.art)); } catch { /* bad recipe */ } });
    $$('[data-mini]').forEach((el) => { try { el.innerHTML = Art.render(JSON.parse(el.dataset.mini), { face: false }); } catch { /* bad recipe */ } });
    $$('[data-art-of]').forEach((el) => { const p = byId[el.dataset.artOf]; if (p) el.outerHTML = Art.render(p.art); });
    $$('[data-lemon]').forEach((el) => { el.innerHTML = Art.lemonSlice(); });
    $$('[data-badge]').forEach((el) => { el.innerHTML = Art.badgeRing('CHARCOAL GRILLED • PIRAEUS • SOUVLAKI • ', 'badgePath'); });
    $$('[data-flame]').forEach((el) => { el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${Art.FLAME_D}" fill="${el.dataset.flame}" stroke="#170F0B" stroke-width="1.6" stroke-linejoin="round"/></svg>`; });
    $$('[data-sparkle]').forEach((el) => { el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${Art.SPARKLE_D}" fill="${el.dataset.sparkle}" stroke="#170F0B" stroke-width="1.6" stroke-linejoin="round"/></svg>`; });
    $$('svg[data-spark]').forEach((el) => { el.setAttribute('viewBox', '0 0 24 24'); el.innerHTML = `<path d="${Art.FLAME_D}" fill="currentColor"/>`; });
    const rv = $('#rivets');
    if (rv) {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        s += `<circle cx="${(50 + 47.2 * Math.cos(a)).toFixed(2)}" cy="${(50 + 47.2 * Math.sin(a)).toFixed(2)}" r="1.15" fill="#170F0B"/>`;
      }
      rv.innerHTML = s;
    }
    buildBigDial();
    buildRadar();
  }

  function buildBigDial() {
    const svg = $('#bigDial');
    if (!svg) return;
    const C = 200;
    const pt = (a, r) => [C + r * Math.sin(a * Math.PI / 180), C - r * Math.cos(a * Math.PI / 180)].map((v) => v.toFixed(1));
    const arc = (a1, a2, r, color, w) => {
      const [x1, y1] = pt(a1, r), [x2, y2] = pt(a2, r);
      return `<path d="M${x1} ${y1} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke="#170F0B" stroke-width="${w + 6}" stroke-linecap="round"/><path d="M${x1} ${y1} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    let s = `<defs><path id="dialText" d="M${C} ${C} m-183 0 a183 183 0 1 1 366 0 a183 183 0 1 1 -366 0"/></defs>`;
    s += `<circle cx="${C + 10}" cy="${C + 12}" r="196" fill="#170F0B"/>`;
    s += `<circle cx="${C}" cy="${C}" r="196" fill="#170F0B"/>`;
    s += `<text font-family="JetBrains Mono, monospace" font-weight="700" font-size="11" letter-spacing="3.2" fill="#F7EDD8"><textPath href="#dialText">KALAMAKI CLUB • GRILL CONTROL • HEAT UNIT • CHARCOAL ONLY • PIRAEUS • </textPath></text>`;
    s += `<circle cx="${C}" cy="${C}" r="174" fill="#F7EDD8" stroke="#170F0B" stroke-width="5"/>`;
    for (let a = -135; a <= 135; a += 5) {
      const major = a % 45 === 0;
      const [x1, y1] = pt(a, major ? 146 : 154), [x2, y2] = pt(a, 166);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#170F0B" stroke-width="${major ? 4.5 : 2}" stroke-linecap="round"/>`;
    }
    s += arc(-135, -48, 132, '#5FC46B', 12) + arc(-42, 42, 132, '#FFC23D', 12) + arc(48, 135, 132, '#E3261E', 12);
    const labels = [['ΧΩΡΙΣ', -92], ['ΚΑΥΤΕΡΟ', 0], ['ΦΩΤΙΑ', 92]];
    labels.forEach(([t, a]) => {
      const [x, y] = pt(a, 108);
      s += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="'Sofia Sans Extra Condensed', sans-serif" font-weight="900" font-size="22" letter-spacing="1" fill="#170F0B" transform="rotate(${a} ${x} ${y})">${t}</text>`;
    });
    s += `<g class="rotor" id="rotor">
      <circle cx="${C}" cy="${C}" r="86" fill="#170F0B" transform="translate(6 8)"/>
      <circle cx="${C}" cy="${C}" r="86" fill="#33231A" stroke="#170F0B" stroke-width="5"/>`;
    for (let a = 0; a < 360; a += 10) { const [x1, y1] = pt(a, 64), [x2, y2] = pt(a, 80); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4E382B" stroke-width="3" stroke-linecap="round"/>`; }
    s += `<rect x="${C - 7}" y="${C - 84}" width="14" height="52" rx="7" fill="#FFC23D" stroke="#170F0B" stroke-width="3.5"/>
      <circle cx="${C}" cy="${C}" r="34" fill="#FF5A1F" stroke="#170F0B" stroke-width="4.5"/>
      ${Art.face(C, C + 2, 1.05)}
    </g>`;
    s += `<g transform="translate(${C - 14} ${C - 214})"><path d="${Art.FLAME_D}" fill="#FF5A1F" stroke="#170F0B" stroke-width="2"/></g>`;
    svg.innerHTML = s;
  }

  function buildRadar() {
    const svg = $('#radarMap');
    if (!svg) return;
    const M = '#FF5A1F';
    let s = '';
    s += `<g transform="rotate(-24 200 200)">`;
    for (let x = -200; x <= 600; x += 58) s += `<line x1="${x}" y1="-200" x2="${x}" y2="600" stroke="${M}" stroke-opacity=".16" stroke-width="${x % 116 === 0 ? 5 : 2.5}"/>`;
    for (let y = -200; y <= 600; y += 46) s += `<line x1="-200" y1="${y}" x2="600" y2="${y}" stroke="${M}" stroke-opacity=".12" stroke-width="2"/>`;
    [[70, 90], [186, 44], [244, 136], [128, 228], [302, 274], [70, 320], [244, 228]].forEach(([x, y]) => { s += `<rect x="${x + 6}" y="${y + 6}" width="46" height="34" fill="${M}" fill-opacity=".07"/>`; });
    s += `<line x1="-200" y1="200" x2="600" y2="200" stroke="${M}" stroke-opacity=".6" stroke-width="9"/>`;
    s += `<text x="60" y="190" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700" letter-spacing="3" fill="${M}" fill-opacity=".85">ΚΑΡΑΪΣΚΟΥ</text>`;
    s += `</g>`;
    [60, 110, 160, 196].forEach((r) => { s += `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${M}" stroke-opacity=".35" stroke-width="1.5" ${r === 196 ? '' : 'stroke-dasharray="3 6"'}/>`; });
    s += `<line x1="200" y1="0" x2="200" y2="400" stroke="${M}" stroke-opacity=".3"/><line x1="0" y1="200" x2="400" y2="200" stroke="${M}" stroke-opacity=".3"/>`;
    s += `<text x="200" y="22" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" font-weight="800" fill="${M}">N</text>`;
    [[96, 118], [292, 96], [318, 250], [120, 300], [250, 330], [70, 220]].forEach(([x, y], i) => {
      s += `<circle cx="${x}" cy="${y}" r="3.5" fill="${M}"><animate attributeName="opacity" values="0;1;0" dur="4s" begin="${i * 0.6}s" repeatCount="indefinite"/></circle>`;
    });
    svg.innerHTML = s;
  }

  /* marquees: repeat content until wider than viewport, then duplicate for a seamless loop */
  function buildMarquees() {
    $$('[data-marquee]').forEach((track) => {
      const span = track.firstElementChild;
      if (!span || track.dataset.built) return;
      const unit = span.innerHTML;
      let guard = 0;
      while (span.scrollWidth < window.innerWidth * 1.2 && guard++ < 10) span.insertAdjacentHTML('beforeend', unit);
      track.appendChild(span.cloneNode(true));
      track.dataset.built = '1';
    });
  }

  /* ------------------------------------------------------------------ hero */
  function splitHero() {
    const colors = ['#FFC23D', '#2457FF', '#FF5A1F', '#5FC46B', '#FF8FA3'];
    $$('[data-split]').forEach((el) => {
      const text = el.textContent;
      el.innerHTML = [...text].map((ch) => ch === ' '
        ? '<span class="ch sp">&nbsp;</span>'
        : `<span class="ch" style="--r:${(Math.random() * 16 - 8).toFixed(1)}deg">${esc(ch)}</span>`).join('');
    });
    $$('.hero-title .ch').forEach((c) => {
      c.addEventListener('pointerenter', () => {
        c.style.setProperty('--hc', colors[Math.floor(Math.random() * colors.length)]);
        c.style.setProperty('--r', (Math.random() * 24 - 12).toFixed(1) + 'deg');
        Sound.play('tick');
      });
    });
    // neon flicker on the outline line
    if (!reduced) {
      const lit = $$('.hero-title .line-3 .ch');
      setInterval(() => {
        if (document.hidden || window.scrollY > window.innerHeight) return;
        const c = lit[Math.floor(Math.random() * lit.length)];
        if (!c) return;
        c.style.setProperty('--hc', colors[Math.floor(Math.random() * colors.length)]);
        c.classList.add('is-lit');
        setTimeout(() => c.classList.remove('is-lit'), 700);
      }, 1400);
    }
  }

  function embers() {
    const cv = $('#embers');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, parts = [], mx = 0, visible = true, gust = 0;
    const colors = ['#FFC23D', '#FF5A1F', '#FF8A3D', '#FFE08A', '#E3261E'];
    const spawn = (anywhere) => ({
      x: Math.random() * w, y: anywhere ? Math.random() * h : h + 8,
      vy: 0.35 + Math.random() * 1.2, vx: (Math.random() - 0.5) * 0.3,
      r: 0.7 + Math.random() * 2.3, t: Math.random() * 6.28,
      c: colors[Math.floor(Math.random() * colors.length)],
    });
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: Math.round((w * h) / 7000) }, () => spawn(true));
    };
    resize();
    window.addEventListener('resize', resize);
    $('.hero').addEventListener('pointermove', (e) => { mx = e.clientX / w - 0.5; });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(cv);
    const draw = (time) => {
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        if (!reduced && Math.random() < 0.006) gust = 1; // a puff of sparks off the coals
        gust *= 0.97;
        for (const p of parts) {
          if (!reduced) {
            p.y -= p.vy * (1 + gust * 2.5);
            p.x += p.vx + Math.sin(time * 0.0012 + p.t) * 0.4 + mx * 0.6;
            if (p.y < -10 || p.x < -20 || p.x > w + 20) Object.assign(p, spawn(false));
          }
          const fade = Math.min(1, Math.max(0, p.y / h) * 1.6);
          const flick = reduced ? 1 : 0.55 + 0.45 * Math.sin(time * 0.008 * (1 + p.r) + p.t);
          ctx.fillStyle = p.c;
          ctx.globalAlpha = 0.14 * fade * flick;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.283); ctx.fill();
          ctx.globalAlpha = fade * flick;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!reduced) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function heroParallax() {
    if (!finePointer || reduced) return;
    const hero = $('.hero');
    const items = $$('#heroVisual [data-depth]').map((el) => ({
      el, d: Number(el.dataset.depth),
      qx: hasGSAP ? gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }) : null,
      qy: hasGSAP ? gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }) : null,
    }));
    hero.addEventListener('pointermove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
      items.forEach((it) => {
        if (it.qx) { it.qx(nx * it.d); it.qy(ny * it.d); }
        else it.el.style.transform = `translate(${nx * it.d}px, ${ny * it.d}px)`;
      });
    });
  }

  /* ------------------------------------------------------------------ cursor + trail + magnetic */
  function cursor() {
    if (!finePointer || reduced) return;
    root.classList.add('has-cursor');
    const dot = $('#cursorDot'), ring = $('#cursorRing'), label = $('#cursorLabel');
    const cv = $('#trail'), ctx = cv.getContext('2d');
    let x = -100, y = -100, rx = x, ry = y, lx = x, ly = y, dpr = 1;
    const parts = [];
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    const colors = ['#FFC23D', '#2457FF', '#FF5A1F', '#5FC46B', '#FF8FA3'];
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      dot.style.transform = `translate(${x}px, ${y}px)`;
      const dist = Math.hypot(x - lx, y - ly);
      if (dist > 14 && parts.length < 80) {
        parts.push({ x, y, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2 + 0.4, life: 1, s: 3 + Math.random() * 4, c: colors[parts.length % colors.length], r: Math.random() * 6 });
        lx = x; ly = y;
      }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { ring.style.opacity = 0; dot.style.opacity = 0; });
    document.addEventListener('pointerenter', () => { ring.style.opacity = 1; dot.style.opacity = 1; });
    addEventListener('pointerdown', () => ring.classList.add('is-down'));
    addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest('a, button, label, input, textarea, [data-cursor], .card');
      ring.classList.toggle('is-hover', !!el);
      const lab = e.target.closest('[data-cursor]');
      if (lab) { label.textContent = lab.dataset.cursor; label.classList.add('is-on'); }
      else label.classList.remove('is-on');
    });
    const star = (p) => {
      const r = p.s * p.life;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = p.life; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.moveTo(0, -r * 2); ctx.quadraticCurveTo(0, 0, r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, r * 2); ctx.quadraticCurveTo(0, 0, -r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, -r * 2); ctx.fill();
      ctx.restore();
    };
    const loop = () => {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      label.style.transform = `translate(${rx}px, ${ry}px)`;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.022; p.r += 0.05;
        if (p.life <= 0) parts.splice(i, 1); else star(p);
      }
      requestAnimationFrame(loop);
    };
    loop();

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--my', ((e.clientY - (r.top + r.height / 2)) * 0.32).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); });
    });
  }

  /* ------------------------------------------------------------------ nav, rail */
  function navBehaviour() {
    const nav = $('#nav');
    const scenes = $$('[data-scene]');
    const list = $('#railList');
    list.innerHTML = scenes.map((s) => `<li><a href="#${s.id}" data-alt="${s.id}">${s.dataset.scene}</a></li>`).join('');
    const marker = $('#railMarker');
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const down = y > lastY;
      if (Math.abs(y - lastY) > 4) {
        const hide = down && y > 320 && !overlayStack.length;
        nav.classList.toggle('is-hidden', hide);
        document.body.classList.toggle('nav-hidden', hide);
        lastY = y;
      }
      const mid = window.innerHeight * 0.45;
      let active = scenes[0];
      scenes.forEach((s) => { if (s.getBoundingClientRect().top <= mid) active = s; });
      $$('[data-alt]').forEach((a) => a.classList.toggle('is-active', a.dataset.alt === active.id));
      $$('.nav-links a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + active.id));
      const act = $(`[data-alt="${active.id}"]`);
      if (act && marker) marker.style.transform = `translateY(${act.parentElement.offsetTop + act.offsetHeight / 2 - 9}px)`;
    };
    if (lenis) lenis.on('scroll', onScroll); else window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------ scroll scenes */
  const PITA_LAYERS = [
    { kind: 'crown', label: 'Πάπρικα & λεμόνι', side: 'right', c: -104, e: -382, rot: -6 },
    { kind: 'tzatziki', label: 'Τζατζίκι της γιαγιάς', side: 'right', c: -52, e: -262, rot: 4 },
    { kind: 'meat', label: 'Καλαμάκι στα κάρβουνα', side: 'right', c: -14, e: -160, rot: -3 },
    { kind: 'tomato', label: 'Ντομάτα', side: 'left', c: 22, e: -74, rot: 5 },
    { kind: 'onion', label: 'Κρεμμύδι & μαϊντανός', side: 'right', c: 44, e: 8, rot: -4 },
    { kind: 'fries', label: 'Πατάτες στο χέρι', side: 'left', c: 66, e: 90, rot: 3 },
    { kind: 'pitaFace', label: 'Πίτα ψημένη στη σχάρα', side: 'left', c: 102, e: 170, rot: -2 },
    { kind: 'paper', label: 'Το χαρτί του Club', side: 'left', c: 146, e: 260, rot: 0 },
  ];

  function buildPita() {
    const stack = $('#stack');
    if (!stack) return null;
    // bottom layers first so upper layers paint on top
    const els = [...PITA_LAYERS].reverse().map((L) => {
      const el = document.createElement('div');
      el.className = 'layer';
      el.innerHTML = Art.towerLayer(L.kind) + `<span class="layer-label ${L.side}"><span><em>${pad(PITA_LAYERS.indexOf(L) + 1, 2)}</em>${esc(L.label)}</span></span>`;
      stack.appendChild(el);
      return { ...L, el, label: el.querySelector('.layer-label') };
    }).reverse();
    const getK = () => {
      const kw = (stack.clientWidth * 0.9) / 380;
      const kh = stack.clientHeight / 830;
      return clamp(Math.min(kw, kh), 0.42, 1.05);
    };
    const size = () => { const k = getK(); els.forEach((L) => { L.el.style.width = 380 * k + 'px'; }); return k; };
    const k0 = size();
    if (!hasGSAP || reduced) {
      els.forEach((L) => { L.el.style.transform = `translateY(${L.e * k0}px) rotate(${L.rot}deg)`; });
      window.addEventListener('resize', () => { const k = size(); els.forEach((L) => { L.el.style.transform = `translateY(${L.e * k}px) rotate(${L.rot}deg)`; }); });
      $('[data-stack-h]').textContent = '24.0 cm';
      $('[data-stack-n]').textContent = '8/8';
      return null;
    }
    const hH = $('[data-stack-h]'), hN = $('[data-stack-n]'), bar = $('.anatomy-progress');
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: '#pita', start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true,
        onRefresh: size,
        onUpdate: (self) => {
          const p = self.progress;
          bar.style.setProperty('--p', p.toFixed(3));
          const ex = clamp((p - 0.08) / 0.6, 0, 1);
          hH.textContent = (8 + ex * 16).toFixed(1) + ' cm';
          hN.textContent = `${Math.round(clamp((p - 0.3) / 0.55, 0, 1) * 8)}/8`;
        },
      },
    });
    els.forEach((L, i) => {
      tl.fromTo(L.el, { y: () => L.c * getK(), rotate: 0 }, { y: () => L.e * getK(), rotate: L.rot, duration: 1 }, 0.12 + i * 0.03);
      tl.fromTo(L.label, { opacity: 0, x: L.side === 'left' ? 24 : -24 }, { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out' }, 0.62 + i * 0.07);
    });
    tl.fromTo('.anatomy-bg-word', { xPercent: -42 }, { xPercent: -58, duration: 1.7, ease: 'none' }, 0);
    tl.to({}, { duration: 0.25 });
    return tl;
  }

  function scenes() {
    // manifesto words
    const mt = $('[data-words]');
    if (mt) {
      const split = (node) => {
        [...node.childNodes].forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
              else { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s); }
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1) {
            if (n.classList.contains('inline-sticker')) n.classList.add('w');
            else split(n);
          }
        });
      };
      split(mt);
    }

    if (!hasGSAP || reduced) return;

    gsap.to('[data-words] .w', {
      opacity: 1, stagger: 0.06, ease: 'none',
      scrollTrigger: { trigger: '[data-words]', start: 'top 80%', end: 'bottom 50%', scrub: true },
    });
    gsap.fromTo('[data-words] .inline-sticker', { scale: 0, rotate: -40 }, {
      scale: 1, rotate: 0, duration: 0.8, ease: 'back.out(2.2)', stagger: 0.2, clearProps: 'transform',
      scrollTrigger: { trigger: '[data-words]', start: 'top 70%', once: true },
    });

    // hero exit
    gsap.to('.hero-copy', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.disc-rivets', { rotate: 120, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-visual', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

    // big dial rotor
    gsap.fromTo('#rotor', { rotation: -120, svgOrigin: '200 200' }, { rotation: 110, svgOrigin: '200 200', ease: 'none', scrollTrigger: { trigger: '.engine-promo', start: 'top bottom', end: 'bottom top', scrub: 0.6 } });

    // section titles slide
    $$('.section-title').forEach((t) => {
      if (t.closest('.anatomy')) return;
      gsap.from(t, { y: 80, opacity: 0, duration: 1.1, ease: 'power4.out', scrollTrigger: { trigger: t, start: 'top 88%' } });
    });
    gsap.fromTo('.build-card', { y: 60, rotate: (i) => [-6, 4, -3][i] || 0, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'back.out(1.5)', clearProps: 'transform,opacity', scrollTrigger: { trigger: '.build-cards', start: 'top 85%', once: true } });
    gsap.from('.hud', { y: 40, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: '.info-grid', start: 'top 85%' } });
    gsap.from('.radar', { scale: 0.7, rotate: -40, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.radar', start: 'top 85%' } });
  }

  function heroIntro() {
    if (!hasGSAP || reduced) return;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    // explicit end values + clearProps so the resting state never depends on computed styles
    tl.fromTo('.hero-title .ch', { yPercent: 120, rotate: 14, opacity: 0 }, { yPercent: 0, rotate: 0, opacity: 1, duration: 1.1, stagger: 0.035, ease: 'back.out(1.8)', clearProps: 'transform,opacity' })
      .fromTo('.title-sticker', { scale: 0, rotate: -90 }, { scale: 1, rotate: -6, duration: 0.8, ease: 'back.out(2.5)', clearProps: 'transform' }, 0.5)
      .fromTo('[data-hero-in]', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.1, clearProps: 'transform,opacity' }, 0.35)
      .fromTo('.disc', { scale: 0.5, rotate: -40, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 1.4, ease: 'elastic.out(1, 0.7)' }, 0.15)
      .fromTo('.floaty', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'back.out(2)' }, 0.55)
      .fromTo('.tickers .ticker', { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, stagger: 0.1, clearProps: 'transform,opacity' }, 0.6);
  }

  function counters() {
    const els = $$('[data-count]');
    const fmt = (el, v) => {
      const dec = Number(el.dataset.decimals || 0);
      let s = v.toFixed(dec);
      if (el.hasAttribute('data-thousands')) s = Math.round(v).toLocaleString('el-GR');
      el.textContent = s;
    };
    if (reduced) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target, end = Number(el.dataset.count), t0 = performance.now(), dur = 1400;
        const step = (t) => { const k = clamp((t - t0) / dur, 0, 1); fmt(el, end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  function reveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
    $$('[data-reveal]').forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ preloader */
  function preloader(done) {
    const el = $('#preloader');
    if (!el) { done(); return; }
    const count = $('#preCount');
    let seen = false;
    try { seen = sessionStorage.getItem('kc-seen') === '1'; sessionStorage.setItem('kc-seen', '1'); } catch { /* storage unavailable */ }
    const minDur = reduced ? 200 : seen ? 650 : 1500;
    const t0 = performance.now();
    let loaded = document.readyState === 'complete';
    window.addEventListener('load', () => { loaded = true; });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.classList.add('is-done');
      setTimeout(() => { el.remove(); }, 1300);
      done();
    };
    const tick = (t) => {
      const k = clamp((t - t0) / minDur, 0, 1);
      const shown = loaded ? k : Math.min(k, 0.9);
      el.style.setProperty('--p', (shown * 100).toFixed(1) + '%');
      count.textContent = pad(Math.round(shown * 100));
      if (shown >= 1) setTimeout(finish, 160);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 4500); // never block the page
  }

  /* ------------------------------------------------------------------ boot */
  function initLenis() {
    if (!window.Lenis || reduced) return;
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 1 });
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    const ticker = $('.ticker--sun');
    lenis.on('scroll', ({ velocity }) => { if (ticker) ticker.style.setProperty('--skew', clamp(-velocity * 0.35, -9, 9).toFixed(2) + 'deg'); });
  }

  $('#soundBtn').addEventListener('click', (e) => {
    const on = !Sound.on;
    Sound.set(on);
    e.currentTarget.classList.toggle('sound-on', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    toast(on ? 'Grill ambience: ON · τσιτσιρίζει' : 'Sound: OFF', on ? 'volume-2' : 'volume-x');
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn, .filter, .btn-icon, .chip, .cart-btn') && !e.target.closest('[data-customize], [data-quick], [data-open-cart], #mAdd, #soundBtn, .filter')) Sound.play('click');
  });

  initLenis();
  hydrateStatic();
  splitHero();
  renderFilters();
  renderGrid();
  applyFilter(false);
  renderBadges();
  renderStatus();
  setInterval(renderStatus, 60_000);
  icons();
  embers();
  heroParallax();
  cursor();
  scenes();
  buildPita();
  counters();
  reveals();
  navBehaviour();
  preloader(heroIntro);

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    buildMarquees();
    if (hasGSAP) ScrollTrigger.refresh();
  });
  let rT;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (hasGSAP) ScrollTrigger.refresh(); }, 200); });
})();
