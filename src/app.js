(function () {
  'use strict';
  const KEY = 'semana-medida-v1';
  const qs = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (n, d) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const money = n => '$' + fmtN(Math.round(n));
  const dec = x => String(x).replace('.', ',');
  (function injectImages() {
    try { const st = document.createElement('style'); st.textContent = Object.keys(IMGS).map(k => '.im-' + k + '{background-image:url("' + IMGS[k] + '")}').join('\n'); document.head.appendChild(st); } catch (e) { /* sin imágenes: queda el color de fondo */ }
  })();
  const IMG_P = { pollo: 'carne', res_molida: 'carne', bistec: 'carne', cerdo: 'carne', tilapia: 'pescado', salmon: 'pescado', atun: 'pescado', frijol: 'legumbres', lenteja: 'legumbres', garbanzo: 'legumbres', tofu: 'legumbres' };
  function dishImg(d) {
    if (!d) return 'com';
    const ids = d.ing.map(i => i.f), has = f => ids.indexOf(f) >= 0;
    if (d.slot === 'des') return has('huevo') ? 'des' : has('avena') ? 'avena' : has('yogur') ? 'fruta' : has('pan') ? 'pan' : 'des';
    if (d.slot === 'sna') return has('yogur') || has('platano') || has('manzana') || has('papaya') || has('leche') ? 'fruta' : 'sna';
    const p = d.ing.find(i => i.r === 'P' && IMG_P[i.f]);
    if (p) return IMG_P[p.f];
    if (d.ing.some(i => i.f === 'lechuga')) return 'ensalada';
    return d.slot === 'cen' ? 'cen' : 'com';
  }
  const thumb = (k, extra) => '<span class="thumb im-' + k + (extra ? ' ' + extra : '') + '" aria-hidden="true"></span>';
  function ringPct(pct, size) {
    const C = 2 * Math.PI * 34, f = Math.max(0, Math.min(pct, 100)) / 100;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 88 88" role="img" aria-label="' + pct + ' %"><g transform="rotate(-90 44 44)"><circle cx="44" cy="44" r="34" fill="none" stroke="var(--surface2)" stroke-width="9"/>' +
      (f > 0 ? '<circle cx="44" cy="44" r="34" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (f * C).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</g><text x="44" y="50" text-anchor="middle" class="rt">' + pct + '%</text></svg>';
  }
  const pad = n => String(n).padStart(2, '0');

  let S = null, view = 'semana', sel = 0, open = new Set(), editPrice = null, calMsg = '', sheetFocus = null, buildErr = '', recSlot = 'all', recQ = '', recMsg = '', crDraft = null, crDelAsk = false, bkPending = null, flash = '', calcLines = [], tkDraft = null, tkBusy = false, tkMsg = '', tkText = '', wMsg = '';

  /* ---------- estado ---------- */
  function isoToday() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateOf(iso, add) { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] + add, 12); }
  function dayIndexToday(start) { const a = dateOf(start, 0), b = dateOf(isoToday(), 0); return Math.round((b - a) / 86400000); }
  function defaultCfg() { return { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 }; }
  function sigOf(c) { return JSON.stringify([c.dieta, (c.excl || []).slice().sort(), !!c.snack, c.repeat]); }
  function blankWeek() {
    return { seed: 0, start: isoToday(), sig: sigOf((S && S.cfg) || defaultCfg()), warns: [], days: Array.from({ length: 7 }, () => ({ dishes: {}, outs: {}, rep: null, ate: {}, subs: {} })) };
  }
  function weekHasDishes() { return S.week.days.some(d => Object.keys(d.dishes).length || Object.keys(d.outs || {}).length); }
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  function makeWeek(cfg, seed, have) {
    const r = planWeek(cfg, targets(cfg), seed, have);
    if (r.error) return r;
    return { seed: seed, start: isoToday(), sig: sigOf(cfg), warns: r.warns, days: r.days.map(d => ({ dishes: d.dishes, outs: {}, rep: d.repeatOf, ate: {}, subs: {} })) };
  }
  const FOOD_TAGS = [['pollo', 'Pollo'], ['res', 'Res'], ['cerdo', 'Cerdo'], ['pescado', 'Pescado o mariscos'], ['huevo', 'Huevo'], ['lacteo', 'Lácteos'], ['nuez', 'Cacahuate o nueces'], ['gluten', 'Gluten (trigo, avena, cebada)']];
  const numIn = (v, lo, hi) => { const x = Number(v); return isFinite(x) && x >= lo && x <= hi; };
  function validFood(f) {
    return f && typeof f === 'object' && typeof f.id === 'string' && /^f_[a-z0-9]+$/.test(f.id) && typeof f.n === 'string' && f.n.trim().length >= 1 &&
      numIn(f.k, 0, 900) && numIn(f.p, 0, 100) && numIn(f.c === undefined ? 0 : f.c, 0, 100) && numIn(f.fat === undefined ? 0 : f.fat, 0, 100) && numIn(f.pack, 20, 5000) && numIn(f.price, 0, 3000) && [0, 1, 2, 3, 4].indexOf(Number(f.aisle)) >= 0 &&
      (f.unitG === undefined || f.unitG === null || numIn(f.unitG, 5, 2000));
  }
  function cleanFood(f) {
    const r1 = x => Math.round(Number(x) * 10) / 10, o = { id: f.id, n: String(f.n).trim().slice(0, 40), k: r1(f.k), p: r1(f.p), c: r1(f.c || 0), fat: r1(f.fat || 0), pack: Math.round(f.pack), price: Math.round(f.price), aisle: Number(f.aisle), tags: (Array.isArray(f.tags) ? f.tags : []).filter(t => FOOD_TAGS.some(x => x[0] === t)), mine: true };
    if (f.unitG) { o.unitG = Math.round(f.unitG); o.unit = ['pieza', 'piezas']; }
    return o;
  }
  const aliasFromName = n => nrm(n).split(' ').map(sing).filter(w => w.length >= 4).slice(0, 3);
  function registerFood(f) { FOODS[f.id] = f; TK_ALIAS[f.id] = aliasFromName(f.n); }
  function unregisterFood(id) { delete FOODS[id]; delete TK_ALIAS[id]; }
  function validCustom(c, cf) {
    return c && typeof c.id === 'string' && /^c_[a-z0-9]+$/.test(c.id) && SLOTS_ALL.indexOf(c.slot) >= 0 && typeof c.name === 'string' && c.name.trim().length >= 1 &&
      Array.isArray(c.ing) && c.ing.length >= 1 && c.ing.every(i => i && (FOODS[i.f] || (cf || []).some(x => x.id === i.f)) && isFinite(i.g) && i.g > 0 && i.g <= 2000 && ['P', 'B', 'V'].indexOf(i.r) >= 0);
  }
  const clampServ = v => { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(1, Math.min(12, n)) : 1; };
  /* S.custom guarda la receta completa (gramos totales y para cuántas personas); el menú usa la porción de UNA persona */
  function perPerson(c) { const n = clampServ(c.serv); return Object.assign({}, c, { serv: n, ing: c.ing.map(i => ({ f: i.f, g: n > 1 ? Math.round(i.g / n * 10) / 10 : i.g, r: i.r })) }); }
  function registerCustom(c) { const d = perPerson(c), i = DISHES.findIndex(x => x.id === c.id); if (i >= 0) DISHES[i] = d; else DISHES.push(d); DISH[c.id] = d; }
  function unregisterCustom(id) { const i = DISHES.findIndex(d => d.id === id); if (i >= 0) DISHES.splice(i, 1); delete DISH[id]; }
  function cleanCfg(c) {
    if (!c || typeof c !== 'object') return null;
    const num = (v, lo, hi, d) => { const x = Number(v); return isFinite(x) && x >= lo && x <= hi ? x : d; };
    const base = defaultCfg();
    return Object.assign(base, {
      meta: ['bajar', 'mantener', 'subir'].indexOf(c.meta) >= 0 ? c.meta : 'mantener',
      sexo: c.sexo === 'm' ? 'm' : 'h', edad: num(c.edad, 18, 90, 32), peso: num(c.peso, 30, 250, 65), talla: num(c.talla, 120, 230, 165),
      act: [1.2, 1.375, 1.55, 1.725].indexOf(Number(c.act)) >= 0 ? Number(c.act) : 1.375,
      kOv: c.kOv ? num(c.kOv, 1200, 4500, null) : null, pOv: c.pOv ? num(c.pOv, 40, 300, null) : null
    });
  }
  function cleanPartner(p) {
    if (!p || typeof p !== 'object') return null;
    const cfg = cleanCfg(p.cfg); if (!cfg) return null;
    return { name: String(p.name || 'Mi pareja').trim().slice(0, 30) || 'Mi pareja', cfg: cfg };
  }
  let migNote = [], migRec = [];
  function normalize(s, apply) {
    if (!s || typeof s !== 'object' || !s.cfg || !s.week || !Array.isArray(s.week.days) || s.week.days.length !== 7) return null;
    s.foods = (Array.isArray(s.foods) ? s.foods : []).filter(validFood).slice(0, 80).map(cleanFood);
    if (apply) {
      /* un ingrediente propio que ya entró al catálogo común se sustituye por el del catálogo */
      const map = {}, sig = x => nrm(x);
      s.foods = s.foods.filter(f => {
        const hit = Object.keys(FOODS).find(id => !FOODS[id].mine && (sig(FOODS[id].n) === sig(f.n) || (FOODS[id].ap || []).some(x => sig(x) === sig(f.n))));
        if (!hit) return true;
        map[f.id] = hit; migNote.push(f.n + ' (ahora «' + FOODS[hit].n + '»)'); return false;
      });
      if (Object.keys(map).length) {
        (Array.isArray(s.custom) ? s.custom : []).forEach(c => { if (c && Array.isArray(c.ing)) c.ing.forEach(i => { if (i && map[i.f]) i.f = map[i.f]; }); });
        ['stock', 'staples', 'bought'].forEach(k => { if (s[k] && typeof s[k] === 'object') Object.keys(map).forEach(o => { if (o in s[k]) { if (!(map[o] in s[k])) s[k][map[o]] = s[k][o]; delete s[k][o]; } }); });
        if (s.prices && typeof s.prices === 'object') Object.keys(s.prices).forEach(sid => { const p = s.prices[sid]; if (p && typeof p === 'object') Object.keys(map).forEach(o => { if (o in p) { if (!(map[o] in p)) p[map[o]] = p[o]; delete p[o]; } }); });
        (s.week && s.week.days || []).forEach(dd => { for (const sl in (dd && dd.subs) || {}) { const sub = dd.subs[sl], ns = {}; Object.keys(sub || {}).forEach(k => { ns[map[k] || k] = map[sub[k]] || sub[k]; }); dd.subs[sl] = ns; } });
      }
      s.foods.forEach(registerFood);
      /* lo mismo con las recetas propias que ya entraron al menú común */
      const rmap = {};
      if (Array.isArray(s.custom)) s.custom = s.custom.filter(c => {
        if (!c || typeof c.name !== 'string') return true;
        const hit = DISHES.find(x => !x.mine && (nrm(x.name) === nrm(c.name) || (x.ap || []).some(y => nrm(y) === nrm(c.name))));
        if (!hit) return true;
        rmap[c.id] = hit.id; migRec.push(c.name + ' (ahora «' + hit.name + '»)'); return false;
      });
      if (Object.keys(rmap).length) {
        const fixWeek = w => (w && Array.isArray(w.days) ? w.days : []).forEach(dd => { if (dd && dd.dishes) for (const k in dd.dishes) if (rmap[dd.dishes[k]]) dd.dishes[k] = rmap[dd.dishes[k]]; });
        fixWeek(s.week); fixWeek(s.prevWeek); fixWeek(s.undo && s.undo.week);
        if (s.fav && typeof s.fav === 'object') Object.keys(rmap).forEach(o => { if (o in s.fav) { s.fav[rmap[o]] = s.fav[o]; delete s.fav[o]; } });
      }
    }
    s.custom = (Array.isArray(s.custom) ? s.custom : []).filter(c => validCustom(c, s.foods)).map(c => ({ id: c.id, slot: c.slot, name: String(c.name).trim().slice(0, 50), min: Math.max(1, Math.min(240, Math.round(Number(c.min) || 20))), how: String(c.how || '').slice(0, 600), mine: true, serv: clampServ(c.serv), ing: c.ing.map(i => ({ f: i.f, g: Math.round(i.g), r: i.r })) }));
    const known = id => DISH[id] || s.custom.some(c => c.id === id);
    if (apply) s.custom.forEach(registerCustom);
    for (const d of s.week.days) {
      if (!d || typeof d !== 'object') return null;
      d.dishes = d.dishes || {}; d.outs = d.outs || {}; d.ate = d.ate || {}; d.subs = d.subs || {};
      for (const k in d.dishes) if (!known(d.dishes[k])) { delete d.dishes[k]; delete d.subs[k]; }
    }
    if (!s.staples) s.staples = s.pantry && typeof s.pantry === 'object' ? s.pantry : {};
    delete s.pantry;
    ['stock', 'aisleStore', 'factors', 'prices', 'bought', 'fav', 'staples'].forEach(k => { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; });
    s.weights = (Array.isArray(s.weights) ? s.weights : []).filter(w => w && /^\d{4}-\d{2}-\d{2}$/.test(w.d) && isFinite(w.kg) && w.kg >= 30 && w.kg <= 250);
    if (!isFinite(s.budget)) s.budget = 1500;
    if (typeof s.store !== 'string' || !STORES.some(x => x.id === s.store)) s.store = 'walmart';
    s.undo = s.undo || null; s.prevWeek = s.prevWeek || null;
    s.partner = cleanPartner(s.partner); s.myName = String(s.myName || '').trim().slice(0, 30);
    return s;
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? normalize(JSON.parse(raw), true) : null; } catch (e) { return null; }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento: la página sigue funcionando */ } }

  S = load();
  if (S && (migNote.length || migRec.length)) persist();
  if (!S) {
    const cfg = defaultCfg();
    S = { cfg: cfg, store: 'walmart', budget: 1500, factors: {}, aisleStore: {}, prices: {}, staples: {}, stock: {}, undo: null, prevWeek: null, bought: {}, fav: {}, custom: [], foods: [], weights: [], partner: null, myName: '', example: true, week: blankWeek() };
  }
  { const i = dayIndexToday(S.week.start); sel = i >= 0 && i <= 6 ? i : 0; }

  function storeName(id) { return (STORES.find(s => s.id === id) || {}).n || id; }
  function haveNow() { return haveSet(S.stock, S.staples); }
  function partnerEv(dd) {
    const pt = targets(S.partner.cfg), dishes = {};
    for (const k in dd.dishes) if (!(dd.outs && dd.outs[k])) dishes[k] = dd.dishes[k];
    return evalDayAny(defsOf({ dishes: dishes, subs: dd.subs, outs: {} }), pt.k, pt.p, expectedSlots(S.cfg));
  }
  function computeDays(tg) {
    return S.week.days.map((dd, i) => ({ dd: dd, ev: evalDayAny(defsOf(dd), tg.k, tg.p, expectedSlots(S.cfg)), pev: S.partner ? partnerEv(dd) : null, date: dateOf(S.week.start, i), i: i }));
  }
  function moreFor(days) { return S.partner ? [{ evs: days.map(d => d.pev), people: 1 }] : []; }
  function currentShop(days, tg) {
    const ds = days || computeDays(tg || targets(S.cfg));
    return shopRows(ds.map(d => d.ev), S.cfg.gente, S.store, S.factors, S.prices, S.staples, S.stock, S.aisleStore, moreFor(ds));
  }

  /* ---------- piezas de interfaz ---------- */
  function dayStatus(ev, tg) {
    if (ev.empty) return { cls: 'part', txt: 'Sin platillos todavía' };
    const t = ev.partial ? { k: ev.fK, p: ev.fP } : tg;
    const miss = ev.missing && ev.missing.length ? 'Faltan: ' + ev.missing.map(x => SLOT_NAME[x].toLowerCase()).join(', ') : '';
    if (ev.ok) return { cls: miss ? 'part' : '', txt: miss || 'Dentro de banda' };
    const why = [];
    if (ev.partial) {
      if (!ev.scaleOK) why.push('hay porciones poco realistas');
      if (!ev.kOK) why.push(ev.tot.k > ev.fK ? 'llevas ' + fmtN(ev.tot.k - ev.fK) + ' kcal más de lo que toca a esas comidas' : 'llevas ' + fmtN(ev.fK - ev.tot.k) + ' kcal menos de lo que toca a esas comidas');
    } else {
      if (!ev.kOK) why.push((ev.tot.k > t.k ? '+' : '') + fmtN(ev.tot.k - t.k) + ' kcal');
      if (ev.tot.p < 0.95 * t.p) why.push('faltan ' + fmtN(0.95 * t.p - ev.tot.p) + ' g de proteína');
      else if (ev.tot.p > 1.3 * t.p) why.push(fmtN(ev.tot.p - 1.3 * t.p) + ' g de proteína de más');
      if (!ev.scaleOK) why.push('porciones poco realistas');
      if (!ev.rangeOK && !why.length) why.push('una comida queda muy desbalanceada');
    }
    return { cls: 'off', txt: 'Fuera de banda: ' + why.join(', ') + (miss ? ' · ' + miss.toLowerCase() : '') };
  }
  function meter(kind, val, tg, partial) {
    const isK = kind === 'k';
    const target = isK ? tg.k : tg.p, max = isK ? 1.25 : 1.4, lo = 0.95, hi = isK ? 1.05 : 1.3;
    const inBand = val >= target * lo && val <= target * hi;
    const C = 2 * Math.PI * 34, f = Math.min(val / (target * max), 1), col = partial ? 'var(--muted)' : inBand ? 'var(--good)' : 'var(--warn)';
    const aria = (isK ? 'Calorías' : 'Proteína') + ': ' + fmtN(val) + ' de ' + fmtN(target) + (partial ? ', día incompleto' : inBand ? ', dentro de la banda' : ', fuera de la banda');
    const svg = '<svg class="ring" width="84" height="84" viewBox="0 0 88 88" role="img" aria-label="' + aria + '"><g transform="rotate(-90 44 44)">' +
      '<circle cx="44" cy="44" r="34" fill="none" stroke="var(--surface)" stroke-width="10"/>' +
      '<circle cx="44" cy="44" r="34" fill="none" stroke="var(--good-bg)" stroke-width="10" stroke-dasharray="' + ((hi - lo) / max * C).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-lo / max * C).toFixed(1) + '"/>' +
      (f > 0.01 ? '<circle cx="44" cy="44" r="34" fill="none" stroke="' + col + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (f * C).toFixed(1) + ' ' + C.toFixed(1) + '" opacity="' + (partial ? 0.6 : 1) + '"/>' : '') +
      '<line x1="71" y1="44" x2="85" y2="44" stroke="var(--ink)" stroke-width="2" opacity="0.65" transform="rotate(' + (360 / max).toFixed(1) + ' 44 44)"/></g>' +
      '<text x="44" y="50" text-anchor="middle" class="rt">' + Math.round(val / target * 100) + '%</text></svg>';
    return '<div class="rmeter">' + svg + '<div class="mtxt"><span>' + (isK ? 'Calorías' : 'Proteína') + '</span><b>' + fmtN(val) + (isK ? ' kcal' : ' g') + '</b><small>' + (isK ? 'meta ' + fmtN(target) + ' kcal' : 'mínimo ' + fmtN(target * lo) + ' g') + '</small></div></div>';
  }
  function qtyText(it) {
    const fd = FOODS[it.f];
    if (fd.unitG) { const n = it.g / fd.unitG; return n + ' ' + fd.unit[n === 1 ? 0 : 1] + ' · ' + it.g + ' g'; }
    return it.g + ' g';
  }
  function origOf(subs, f) { for (const o in subs) if (subs[o] === f) return o; return f; }
  function mealHTML(d, m) {
    const key = d.i + '-' + m.slot, isOpen = open.has(key), dd = d.dd, subs = (dd.subs && dd.subs[m.slot]) || {}, ate = !!(dd.ate && dd.ate[m.slot]);
    let name, body;
    if (m.out) {
      name = 'Comí fuera' + (m.out.label ? ': ' + esc(m.out.label) : '');
      body = '<p class="how">Estimado que capturaste: ' + fmtN(m.out.k) + ' kcal y ' + fmtN(m.out.p) + ' g de proteína. El resto del día se ajustó para compensar.</p>' +
        '<div class="actions"><button class="btn ghost small" data-act="out" data-d="' + d.i + '" data-s="' + m.slot + '">Editar</button>' +
        '<button class="btn ghost small" data-act="out-clear" data-d="' + d.i + '" data-s="' + m.slot + '">Volver al plan</button></div>';
    } else {
      const dish = DISH[m.dish];
      name = esc(dish.name) + (S.fav[dish.id] ? ' ★' : '') + (dishAllowed(dish, excludedTags(S.cfg)) ? '' : ' <span class="pill off">no encaja con tu dieta</span>');
      const rows = m.items.map(it => {
        const fd = FOODS[it.f], subbed = Object.keys(subs).some(o => subs[o] === it.f);
        return '<li><div class="irow"><span class="iname">' + esc(fd.n) + (subbed ? ' <span class="tag">sustituido</span>' : '') + '</span><span class="iqty">' + qtyText(it) + '</span>' +
          '<span class="imath">' + it.g + ' g × ' + fd.k + ' kcal/100 g = ' + fmtN(it.k) + ' kcal · ' + it.g + ' g × ' + dec(fd.p) + ' g/100 g = ' + fmtN(it.p, 1) + ' g</span></div>' +
          '<div class="isub"><button class="link" data-act="sub" data-d="' + d.i + '" data-s="' + m.slot + '" data-f="' + it.f + '">Cambiar este ingrediente</button></div></li>';
      }).join('');
      body = '<ul class="ing">' + rows + '</ul>' +
        '<div class="msum"><span>Suma de la comida</span><span>' + fmtN(m.k) + ' kcal · ' + fmtN(m.p, 1) + ' g prot.</span></div>' +
        '<p class="how">' + esc(dish.how) + '</p>' +
        '<div class="actions"><button class="btn ghost small" data-act="swap" data-d="' + d.i + '" data-s="' + m.slot + '">Cambiar platillo</button>' +
        '<button class="btn ghost small" data-act="place" data-id="' + dish.id + '">Copiar a otro día</button>' +
        '<button class="btn ghost small" data-act="fav" data-id="' + dish.id + '">' + (S.fav[dish.id] ? 'Quitar de favoritas' : 'Marcar favorita') + '</button>' +
        '<button class="btn ghost small" data-act="out" data-d="' + d.i + '" data-s="' + m.slot + '">Comí fuera</button>' +
        (Object.keys(subs).length ? '<button class="btn ghost small" data-act="sub-clear" data-d="' + d.i + '" data-s="' + m.slot + '">Quitar sustituciones</button>' : '') +
        '<button class="btn ghost small" data-act="slot-clear" data-d="' + d.i + '" data-s="' + m.slot + '">Quitar</button></div>';
    }
    if (d.pev && !m.out) {
      const pm = d.pev.meals.find(x => x.slot === m.slot);
      if (pm && pm.items && pm.items.length) body += '<p class="how" style="margin-top:6px"><b>Para ' + esc(S.partner.name) + ':</b> ' + pm.items.map(it => esc(FOODS[it.f].n.replace(/ \(.*\)/, '').toLowerCase()) + ' ' + it.g + ' g').join(', ') + ' (' + fmtN(pm.k) + ' kcal · ' + fmtN(pm.p) + ' g de proteína)</p>';
    }
    body += '<div class="actions" style="margin-top:8px"><button class="btn ' + (ate ? '' : 'ghost ') + 'small' + '" data-act="ate" data-d="' + d.i + '" data-s="' + m.slot + '" aria-pressed="' + ate + '">' + (ate ? 'Ya la comí ✓' : 'Marcar como comida') + '</button></div>';
    return '<li class="meal"><button class="mhd" data-act="toggle" data-key="' + key + '" aria-expanded="' + isOpen + '">' +
      thumb(m.dish ? dishImg(DISH[m.dish]) : m.slot, m.out ? 'dim' : '') + '<span class="slot">' + SLOT_NAME[m.slot] + (m.dish ? ' · ' + DISH[m.dish].min + ' min' : '') + '</span>' +
      '<span class="mname">' + (ate ? '✓ ' : '') + name + '</span><span class="mnum">' + fmtN(m.k) + ' kcal · ' + fmtN(m.p) + ' g</span></button>' +
      '<div class="mbody"' + (isOpen ? '' : ' hidden') + '>' + body + '</div></li>';
  }

  function emptyMeal(d, slot) {
    return '<li class="meal empty"><span class="slot">' + SLOT_NAME[slot] + '</span><div class="actions"><button class="btn small" data-act="swap" data-d="' + d.i + '" data-s="' + slot + '">Elegir platillo</button>' +
      '<button class="btn ghost small" data-act="out" data-d="' + d.i + '" data-s="' + slot + '">Comí fuera</button></div></li>';
  }

  /* ---------- vistas ---------- */
  function viewSemana() {
    const tg = targets(S.cfg), days = computeDays(tg), ex = expectedSlots(S.cfg), has = weekHasDishes();
    if (sel < 0 || sel > 6) sel = 0;
    const d = days[sel], st = dayStatus(d.ev, tg), exc = excludedTags(S.cfg);
    let nBad = 0;
    S.week.days.forEach(dd => Object.keys(dd.dishes).forEach(k => { if (DISH[dd.dishes[k]] && !dishAllowed(DISH[dd.dishes[k]], exc)) nBad++; }));
    const total = SLOTS_ALL.reduce((n, k) => n + poolsFor(S.cfg)[k].length, 0);
    let h = '';
    if (S.example) h += '<div class="banner"><p><b>Datos de muestra.</b> Tus metas son de ejemplo. Pon tus datos en Ajustes.</p><a class="btn small" href="#ajustes" style="text-decoration:none">Ir a Ajustes</a></div>';
    if (S.prevWeek) h += '<div class="banner"><p>Reemplacé la semana que tenías. Si no era lo que querías, puedes volver a ella.</p><button class="btn small" data-act="undo-week">Deshacer</button><button class="btn ghost small" data-act="dismiss-prev">Dejarlo así</button></div>';
    if (nBad) h += '<div class="banner"><p>' + nBad + (nBad === 1 ? ' platillo de tu semana ya no encaja' : ' platillos de tu semana ya no encajan') + ' con tu dieta. Están marcados abajo: cámbialos o quítalos.</p></div>';
    if (has && dayIndexToday(S.week.start) > 6) h += '<div class="banner"><p>Esta semana ya terminó. En Compras puedes cerrarla para guardar lo que te sobró, o vaciarla y elegir de nuevo.</p><a class="btn small" href="#compras" style="text-decoration:none">Ir a Compras</a><button class="btn ghost small" data-act="clear-week">Vaciar semana</button></div>';
    if (flash) { h += '<div class="banner" role="status"><p>' + esc(flash) + '</p></div>'; flash = ''; }
    if (buildErr) h += '<div class="banner"><p>' + esc(buildErr) + '</p></div>';
    if (S.week.warns && S.week.warns.length) h += '<div class="banner"><p>' + S.week.warns.map(esc).join(' ') + '</p></div>';
    if (!has) h += '<section class="card hero"><div class="hero-t"><h2>Arma tu semana a tu manera</h2><p class="hint" style="margin:6px 0 14px">Hay ' + total + ' recetas para elegir. Escoge cada comida de cada día, o explora las recetas y ponlas donde quieras. Las porciones se ajustan solas a tu meta. Si prefieres partir de una propuesta, puedo sugerirte una semana y la cambias a tu gusto.</p><div class="actions"><a class="btn" href="#recetas" style="text-decoration:none">Ver las recetas</a><button class="btn ghost" data-act="rebuild">Sugerirme una semana</button></div></div></section>';
    h += '<div class="semana-grid"><div class="side">';
    if (has) { const sh = shopTotals(currentShop(days, tg)), nh = Object.keys(S.stock).filter(k => S.stock[k] > 0).length + Object.keys(S.staples).filter(k => S.staples[k]).length;
      h += '<a class="spend" href="#compras"><span>Esta semana pagas en caja</span><b>' + money(sh.paid) + '</b><small>' + (nh ? 'Ya descontado lo que tienes en casa (' + nh + (nh === 1 ? ' producto' : ' productos') + ')' : 'Aún no registras nada en casa: toca para anotarlo') + '</small></a>'; }
    h += '<div class="days" role="tablist" aria-label="Días de la semana">' + days.map(x => {
      const wd = x.date.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
      const dc = x.ev.empty || (x.ev.missing && x.ev.missing.length) ? ' part' : x.ev.ok ? '' : ' off';
      return '<button class="daypill" role="tab" data-act="day" data-i="' + x.i + '" aria-selected="' + (x.i === sel) + '"><span class="dw">' + esc(wd) + '</span><span class="dn">' + x.date.getDate() + '</span><span class="dk">' + (x.ev.empty ? 'sin platillos' : fmtN(x.ev.tot.k) + ' kcal') + '</span><i class="dot' + dc + '"></i></button>';
    }).join('') + '</div></div><div class="mainc">';
    const rep = d.dd.rep != null && d.dd.rep !== undefined ? '<span class="tag">Repite la comida y la cena del ' + dateOf(S.week.start, d.dd.rep).toLocaleDateString('es-MX', { weekday: 'long' }) + '</span>' : '';
    const longDate = d.date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const partial = !!d.ev.partial;
    h += '<section class="card"><div class="dayhead"><h2>' + esc(cap(longDate)) + '</h2><span class="pill ' + st.cls + '">' + esc(st.txt) + '</span></div>' +
      (rep ? '<p style="margin:-6px 0 12px">' + rep + '</p>' : '') +
      '<div class="meters">' + meter('k', d.ev.tot.k, tg, partial) + meter('p', d.ev.tot.p, tg, partial) + '</div>' +
      '<p class="legend">' + (partial
        ? 'Día a medias: cada platillo se dimensiona a su parte de tu meta (desayuno 25 %, comida 35 %, cena 30 %, colación 10 %). Al completar el día se reparten las porciones para llegar también a tu proteína.'
        : 'La zona verde es la banda: calorías a ±5 % de la meta, proteína entre 95 % y 130 %. Cada número sale de multiplicar gramos por el valor del alimento. Toca una comida para ver las cuentas.') + '</p>' +
      '<ul class="meals">' + SLOTS_ALL.filter(k => ex.indexOf(k) >= 0 || d.ev.meals.some(m => m.slot === k)).map(k => { const m = d.ev.meals.find(x => x.slot === k); return m ? mealHTML(d, m) : emptyMeal(d, k); }).join('') + '</ul></section>';
    h += '<div class="actions" style="margin-top:14px"><a class="btn ghost small" href="#recetas" style="text-decoration:none">Ver recetas</a><button class="btn ghost small" data-act="rebuild">Sugerirme una semana</button>' + (has ? '<button class="btn ghost small" data-act="clear-week">Vaciar la semana</button>' : '') + '</div></div></div>';
    return h;
  }

  /* ---------- recetas ---------- */
  function dishBase(d) { return sumItems(d.ing.map(i => itemFor(i.f, i.g))); }
  function recListHTML() {
    const pools = poolsFor(S.cfg), have = haveNow(), q = recQ.trim();
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let list = [];
    SLOTS_ALL.forEach(k => { if (recSlot === 'all' || recSlot === 'fav' || recSlot === 'mine' || recSlot === k) list = list.concat(pools[k]); });
    if (recSlot === 'fav') list = list.filter(d => S.fav[d.id]);
    if (recSlot === 'mine') list = list.filter(d => d.mine);
    if (q) list = list.filter(d => norm(d.name + ' ' + d.ing.map(i => FOODS[i.f].n).join(' ')).indexOf(norm(q)) >= 0);
    list = list.filter(d => S.fav[d.id]).concat(list.filter(d => !S.fav[d.id]));
    if (!list.length) return (recSlot === 'mine' ? recBundleBar() : '') + '<p class="hint" style="margin-top:12px">' + (recSlot === 'fav' && !q ? 'Aún no tienes favoritas. Abre una receta y toca «Marcar favorita».' : recSlot === 'mine' && !q ? 'Aún no creaste recetas. Toca «Crear mi receta».' : 'No hay recetas con ese filtro y tu dieta.') + '</p>';
    return (recSlot === 'mine' ? recBundleBar() : '') + '<ul class="meals" style="margin-top:6px">' + list.map(d => {
      const key = 'r-' + d.id, isOpen = open.has(key), b = dishBase(d), fav = !!S.fav[d.id];
      const ids = Array.from(new Set(d.ing.map(i => i.f))), n = ids.filter(f => have.has(f)).length;
      return '<li class="meal"><button class="mhd" data-act="toggle" data-key="' + key + '" aria-expanded="' + isOpen + '">' + thumb(dishImg(d)) + '<span class="slot">' + SLOT_NAME[d.slot] + ' · ' + d.min + ' min' + (d.mine ? ' · mía' : '') + '</span>' +
        '<span class="mname">' + (fav ? '★ ' : '') + esc(d.name) + '</span><span class="mnum">≈ ' + fmtN(b.k) + ' kcal · ' + fmtN(b.p) + ' g</span></button>' +
        '<div class="mbody"' + (isOpen ? '' : ' hidden') + '><ul class="ing">' + d.ing.map(i => '<li><div class="irow"><span class="iname">' + esc(FOODS[i.f].n) + '</span><span class="iqty">' + qtyText({ f: i.f, g: i.g }) + '</span></div></li>').join('') + '</ul>' +
        (d.how ? '<p class="how">' + esc(d.how) + '</p>' : '') + (n ? '<p class="after" style="margin:0 0 10px">Ya tienes ' + n + ' de ' + ids.length + ' ingredientes en casa.</p>' : '') +
        '<div class="actions"><button class="btn small" data-act="place" data-id="' + d.id + '">Ponerla en un día</button>' +
        '<button class="btn ghost small" data-act="fav" data-id="' + d.id + '">' + (fav ? 'Quitar de favoritas' : 'Marcar favorita') + '</button>' +
        (d.mine && recSlot === 'mine' ? '<button class="btn ghost small" data-act="cr-edit" data-id="' + d.id + '">Editar</button><button class="btn ghost small" data-act="rec-prop" data-id="' + d.id + '">Proponer al menú común</button>' + (recIsSentId(d.id) ? '<span class="pill">enviada</span>' : '') : '') + '</div>' + (d.mine && d.serv > 1 ? '<p class="hint" style="margin-top:6px">Receta para ' + d.serv + ' personas. Aquí ves la porción de una.</p>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }
  function viewRecetas() {
    const pools = poolsFor(S.cfg), total = SLOTS_ALL.reduce((n, k) => n + pools[k].length, 0);
    const chips = [['all', 'Todas'], ['fav', '★ Favoritas']].concat(S.custom.length ? [['mine', 'Mías']] : []).concat(SLOTS_ALL.map(k => [k, SLOT_NAME[k]]));
    let h = '';
    if (recMsg) h += '<div class="banner"><p>' + esc(recMsg) + '</p><a class="btn small" href="#semana" style="text-decoration:none">Ver mi semana</a></div>';
    h += '<p class="hint" style="margin-bottom:10px">' + total + ' recetas con tu dieta. Las cantidades son de partida: al ponerlas en un día se ajustan a tu meta.</p>' +
      '<div class="actions" style="margin-bottom:10px"><button class="btn small" data-act="cr-new">Crear mi receta</button><button class="btn ghost small" data-act="fd-list">Mis ingredientes' + (S.foods.length ? ' (' + S.foods.length + ')' : '') + '</button></div>' +
      '<div class="chips" role="group" aria-label="Filtrar recetas">' + chips.map(c => '<button class="chip" data-act="rec-slot" data-s="' + c[0] + '" aria-pressed="' + (recSlot === c[0]) + '">' + c[1] + '</button>').join('') + '</div>' +
      '<div class="fld" style="margin:10px 0 4px"><label class="sr-only" for="rec-q">Buscar receta</label><input id="rec-q" type="search" placeholder="Buscar por nombre o ingrediente" value="' + esc(recQ) + '" data-act="rec-q"></div>' +
      '<div id="rec-list">' + recListHTML() + '</div>';
    return h;
  }

  function packLabel(fd) { return fd.packLabel || (fd.pack >= 1000 ? dec(fd.pack / 1000) + ' kg' : fd.pack + ' g'); }
  function viewCompras() {
    const tg = targets(S.cfg), days = computeDays(tg), rows = currentShop(days, tg), tot = shopTotals(rows);
    const st = STORES.find(s => s.id === S.store) || STORES[2], fac = storeFactor(S.factors, S.store), cal = typeof S.factors[S.store] === 'number';
    const over = tot.paid > S.budget, mx = Math.max(S.budget, tot.paid) * 1.1 || 1;
    let h = '<section class="shophead"><span class="thumb big im-compras" aria-hidden="true"></span><div><h2>Tu compra de la semana</h2><p class="hint">Para ' + (S.cfg.gente + (S.partner ? 1 : 0)) + ((S.cfg.gente + (S.partner ? 1 : 0)) === 1 ? ' persona' : ' personas') + ' · ' + esc(storeName(S.store)) + '</p></div></section>' +
      '<div class="form" style="margin-bottom:14px"><div class="fields">' +
      '<div class="fld"><label for="store-sel">Dónde compras</label><select id="store-sel" data-act="store">' + STORES.map(s => '<option value="' + s.id + '"' + (s.id === S.store ? ' selected' : '') + '>' + esc(s.n) + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label for="aisle-sel">Fruta y verdura la compro en</label><select id="aisle-sel" data-act="aisle-store"><option value="">La misma tienda</option>' + STORES.filter(s => s.id !== S.store).map(s => '<option value="' + s.id + '"' + (S.aisleStore[2] === s.id ? ' selected' : '') + '>' + esc(s.n) + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label for="budget">Presupuesto de la semana (MXN)</label><input id="budget" type="number" inputmode="numeric" min="0" step="50" value="' + S.budget + '" data-act="budget"></div></div></div>';
    h += '<div class="totbox"><div class="tot"><span>Lo que comes esta semana</span><b>' + money(tot.eaten) + '</b><small>Solo la parte de cada paquete que usas</small></div>' +
      '<div class="tot"><span>Lo que pagas en caja</span><b>' + money(tot.paid) + '</b><small>Paquetes completos, descontando lo que ya tienes en casa</small></div></div>';
    h += '<div class="meter"><div class="mhead"><span>Caja contra presupuesto</span><b>' + money(tot.paid) + '</b><small>presupuesto ' + money(S.budget) + '</small></div>' +
      '<div class="track" role="img" aria-label="' + (over ? 'Te pasas del presupuesto' : 'Dentro del presupuesto') + '"><span class="fill' + (over ? ' off' : '') + '" style="width:' + (tot.paid / mx * 100) + '%"></span><span class="tick" style="left:' + (S.budget / mx * 100) + '%"></span></div></div>' +
      '<p class="hint" style="margin-top:8px">' + (over ? 'Te pasas por ' + money(tot.paid - S.budget) + '. Anota lo que tengas en casa, rehaz la semana o cambia de tienda.' : 'Te sobran ' + money(S.budget - tot.paid) + '.') + '</p>';
    h += '<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-act="share">Copiar lista de compras</button>' + (rows.length ? '<button class="btn ghost small" data-act="compare">Comparar tiendas</button>' : '') + (over && rows.length ? '<button class="btn small" data-act="saver">Bajar el gasto</button>' : '') + '</div>';
    const usedStores = []; [S.store].concat(rows.map(r => r.sid)).forEach(id => { if (usedStores.indexOf(id) < 0) usedStores.push(id); });
    h += usedStores.map(id => { const f = storeFactor(S.factors, id), c = typeof S.factors[id] === 'number';
      return '<p class="hint" style="margin-top:10px">Precios de ' + esc(storeName(id)) + ': factor ×' + f.toFixed(2) + ' sobre mis precios base. ' + (c ? 'Calibrado con tu ticket. <button class="link" data-act="reset-factor" data-sid="' + id + '">Volver al supuesto</button>' : 'Es un supuesto inicial, no un precio medido.') + '</p>'; }).join('') +
      '<p class="hint" style="margin-top:6px">Edita un precio o calibra con un ticket abajo. En verdulería pagas por kilo; mis paquetes de fruta y verdura son equivalentes aproximados.</p>';
    if (!rows.length) h += '<p class="hint" style="margin:14px 0">Aún no hay platillos en tu semana. Elígelos en Semana o en Recetas y aquí aparece la lista de compras.</p>';
    AISLES.forEach((name, ai) => {
      const rs = rows.filter(r => r.fd.aisle === ai).sort((a, b) => (a.fd.buy || a.fd.n).localeCompare(b.fd.buy || b.fd.n, 'es'));
      if (!rs.length) return;
      h += '<h2 class="sec">' + esc(name) + '</h2><ul class="slist">' + rs.map(r => {
        const fd = r.fd, bought = !!S.bought[r.id], covered = !r.staple && r.packs === 0;
        let need = fmtN(r.buyG) + ' g' + (fd.dry ? ' secos (≈ ' + fmtN(r.need) + ' g cocidos)' : '');
        if (fd.unitG) need = '≈ ' + Math.round(r.need / fd.unitG) + ' ' + fd.unit[1] + ' · ' + need;
        const editing = editPrice === r.id;
        const info = r.staple ? '<small>Siempre lo tienes: no se compra</small>'
          : '<small>' + need + (r.have > 0 ? ' · en casa ' + fmtN(r.have) + ' g' : '') + '</small>' +
            '<small>' + (covered ? 'Cubierto con lo que tienes' : r.packs + ' × ' + esc(packLabel(fd)) + ' · ' + money(r.unit) + ' c/u' + (r.over ? ' (tu precio)' : r.com ? ' (precio de la comunidad)' : '')) + '</small>';
        return '<li class="srow' + (r.staple || covered ? ' is-pantry' : '') + (bought ? ' is-bought' : '') + '">' +
          (r.packs > 0 ? '<label class="chk"><input type="checkbox" id="b-' + r.id + '" data-act="bought" data-f="' + r.id + '"' + (bought ? ' checked' : '') + '><span class="sr-only">Comprado: ' + esc(fd.buy || fd.n) + '</span></label>' : '<span class="chk-sp"></span>') +
          '<div class="sinfo"><span class="sname">' + esc(fd.buy || fd.n) + '</span>' + info + '</div>' +
          '<div class="sprice"><b>' + money(r.paid) + '</b></div>' +
          '<div class="sub-row">' + (editing
            ? '<div class="priceedit"><label class="sr-only" for="pe-' + r.id + '">Precio del paquete en ' + esc(storeName(r.sid)) + '</label><input id="pe-' + r.id + '" type="number" inputmode="decimal" min="0" step="1" value="' + r.unit + '" style="width:96px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 8px"><button class="btn small" data-act="save-price" data-sid="' + r.sid + '" data-f="' + r.id + '">Guardar</button><button class="btn ghost small" data-act="cancel-price">Cancelar</button>' + (r.over ? '<button class="link" data-act="clear-price" data-sid="' + r.sid + '" data-f="' + r.id + '">Quitar mi precio</button>' : '') + '</div>'
            : (r.staple ? '' : '<label class="stk" for="s-' + r.id + '">En casa <input id="s-' + r.id + '" type="number" inputmode="numeric" min="0" step="50" placeholder="0" value="' + (r.have > 0 ? Math.round(r.have) : '') + '" data-act="stock" data-f="' + r.id + '"> g</label>') +
              '<label class="pant"><input type="checkbox" id="p-' + r.id + '" data-act="staple" data-f="' + r.id + '"' + (r.staple ? ' checked' : '') + '> siempre tengo</label>' + (r.staple ? '' : '<button class="link" data-act="edit-price" data-f="' + r.id + '">Editar precio</button>')) +
          '</div></li>';
      }).join('') + '</ul>';
    });
    h += pantryHTML(rows);
    h += ticketHTML();
    h += '<section class="card" style="margin-top:22px"><h2 style="font-size:18px">Calibra con tu ticket</h2><p class="hint" style="margin:6px 0 10px">Haz la compra y escribe cuánto pagaste en caja, sin contar lo que ya tenías. Elige de qué tienda es el ticket. Ajusto el factor de esa tienda para que sus productos sumen lo que pagaste. El total queda igual al tuyo, pero el precio de cada producto es un estimado: reparto el total en proporción a mis precios base, así que corrígelo con «Editar precio» donde lo conozcas. Los precios que tú editaste no cambian.</p>' +
      '<div class="priceedit"><label class="sr-only" for="cal-store">Tienda del ticket</label><select id="cal-store" style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 10px">' + usedStores.map(id => '<option value="' + id + '">' + esc(storeName(id)) + '</option>').join('') + '</select><label class="sr-only" for="ticket">Total del ticket</label><input id="ticket" type="number" inputmode="decimal" min="0" placeholder="Total del ticket" style="width:150px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 10px"><button class="btn" data-act="calibrate">Ajustar factor</button></div>' +
      '<p class="hint" id="cal-msg" style="margin-top:8px">' + esc(calMsg) + '</p></section>';
    h += '<p class="hint" style="margin-top:14px">Para ' + (S.cfg.gente + (S.partner ? 1 : 0)) + ((S.cfg.gente + (S.partner ? 1 : 0)) === 1 ? ' persona' : ' personas') + (S.partner ? ' (tus porciones y las de ' + esc(S.partner.name) + ')' : '') + '. Los frijoles y las lentejas se compran secos; el plan usa su peso cocido.</p>';
    return h;
  }

  const WEEK_SEEDS = [11, 23, 37, 41, 59, 73, 89, 97, 101, 113, 127, 131, 149, 157, 163, 173];
  function pantryHTML(rows) {
    const tg = targets(S.cfg), inList = {};
    rows.forEach(r => { inList[r.id] = true; });
    const extra = Object.keys(S.stock).filter(k => FOODS[k] && S.stock[k] > 0 && !inList[k]);
    const extraStaples = Object.keys(S.staples).filter(k => FOODS[k] && S.staples[k] && !inList[k]);
    const next = nextStock(rows, S.stock);
    const keep = Object.keys(next).filter(k => FOODS[k] && !S.staples[k]).sort((a, b) => FOODS[a].n.localeCompare(FOODS[b].n, 'es'));
    const est = estimateNextWeek(S.cfg, tg, S.store, S.factors, S.prices, S.staples, next, WEEK_SEEDS, S.aisleStore, S.partner ? targets(S.partner.cfg) : null);
    let h = '<section class="card" style="margin-top:22px"><h2 style="font-size:18px">Lo que hay en casa</h2>' +
      '<p class="hint" style="margin:6px 0 10px">Anota en cada producto cuántos gramos tienes, o marca «siempre tengo» si nunca lo compras (aceite, sal). La compra baja solo por los paquetes que de verdad te faltan. Para huevo, ' + esc(FOODS.huevo.packLabel) + ' pesa ' + FOODS.huevo.pack + ' g. Frijol, lenteja y garbanzo van en gramos secos.</p>';
    if (extra.length || extraStaples.length) {
      h += '<ul class="slist">' + extra.map(k => '<li class="srow"><span class="chk-sp"></span><div class="sinfo"><span class="sname">' + esc(FOODS[k].buy || FOODS[k].n) + '</span><small>No entra en esta semana</small></div><div class="sprice"></div><div class="sub-row"><label class="stk" for="s-' + k + '">En casa <input id="s-' + k + '" type="number" inputmode="numeric" min="0" step="50" value="' + Math.round(S.stock[k]) + '" data-act="stock" data-f="' + k + '"> g</label></div></li>').join('') +
        extraStaples.map(k => '<li class="srow"><span class="chk-sp"></span><div class="sinfo"><span class="sname">' + esc(FOODS[k].buy || FOODS[k].n) + '</span><small>Siempre lo tienes</small></div><div class="sprice"></div><div class="sub-row"><label class="pant"><input type="checkbox" id="p-' + k + '" data-act="staple" data-f="' + k + '" checked> siempre tengo</label></div></li>').join('') + '</ul>';
    }
    if (!FOODS[addPick]) addPick = '';
    h += '<div class="priceedit" style="margin-top:6px"><input type="hidden" id="add-f" value="' + esc(addPick) + '"><button type="button" class="pickbtn" data-act="pick-add" aria-label="Elegir producto">' + esc(addPick ? foodName(addPick, true) : 'Buscar producto…') + '</button>' +
      '<label class="sr-only" for="add-g">Gramos en casa</label><input id="add-g" type="number" inputmode="numeric" min="0" step="50" value="' + esc(addG) + '" placeholder="gramos" style="width:100px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 10px"><button class="btn small" data-act="add-stock">Agregar</button></div>' +
      '<p class="hint" style="margin-top:6px">Si dejas los gramos vacíos, se agrega como algo que siempre tienes.</p>' +
      '<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-act="rebuild">Sugerirme una semana con lo que tengo</button></div></section>';
    h += '<section class="card" style="margin-top:14px"><h2 style="font-size:18px">Cerrar la semana</h2>';
    if (S.undo) {
      h += '<p class="hint" style="margin:6px 0 10px">Ya cerraste la semana anterior: lo que sobró quedó en «Lo que hay en casa» y la semana nueva empieza vacía para que elijas.</p><div class="actions"><button class="btn ghost small" data-act="undo-close">Deshacer el cierre</button></div>';
    } else {
      h += '<p class="hint" style="margin:6px 0 10px">Supone que compraste y comiste todo lo del plan. De cada paquete guardo lo que sobra solo si dura (arroz, pasta, avena, legumbres, huevo, papa, cebolla, aceite, nueces, atún, manzana); la hoja verde, la carne, los lácteos y el pan se dan por consumidos o tirados.</p>' +
        (keep.length ? '<p class="after" style="margin:0 0 6px">Te quedarían en casa: ' + keep.map(k => esc(FOODS[k].buy || FOODS[k].n) + ' ' + fmtN(next[k]) + ' g').join(', ') + '.</p>' : '<p class="after" style="margin:0 0 6px">No te quedaría casi nada para la siguiente.</p>') +
        (est ? '<p class="after" style="margin:0 0 10px">Con eso, una semana sugerida típica costaría entre <b>' + money(est.min) + '</b> y <b>' + money(est.max) + '</b> en caja, según cuál combinación salga (probé ' + WEEK_SEEDS.length + ').</p>' : '') +
        '<div class="actions"><button class="btn" data-act="close-week">Cerrar semana y empezar la siguiente</button></div>';
    }
    return h + '</section>';
  }

  const NUMS = { edad: [18, 90], peso: [30, 250], talla: [120, 230], act: null, repeat: null, gente: [1, 8], kOv: [1200, 4500], pOv: [40, 300] };
  function opt(v, label, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>'; }
  function targetsHTML() {
    const t = targets(S.cfg), c = S.cfg;
    const goal = { bajar: 'déficit de 18 %', mantener: 'sin ajuste', subir: 'superávit de 10 %' }[c.meta];
    const floor = t.tdee * (1 + { bajar: -0.18, mantener: 0, subir: 0.1 }[c.meta]) < 1400 ? ' Se aplicó un mínimo de 1,400 kcal.' : '';
    return '<small>Tu meta diaria</small><b>' + fmtN(t.k) + ' kcal · ' + fmtN(t.p) + ' g de proteína</b><small>Gasto estimado: ' + fmtN(t.tdee) + ' kcal al día (Mifflin-St Jeor por tu nivel de actividad). ' +
      (c.kOv || c.pOv ? 'Usas metas propias donde escribiste un número.' : 'Ajuste por objetivo: ' + goal + '.' + floor) + '</small>';
  }
  const GKEY = 'bys-glass';
  function glassGet() { try { const v = parseFloat(localStorage.getItem(GKEY)); return isFinite(v) && v >= 0 && v <= 100 ? v : 50; } catch (e) { return 50; } }
  function glassApply(v) { document.documentElement.style.setProperty('--glass-o', (0.30 + v / 100 * 0.66).toFixed(2)); }
  glassApply(glassGet());
  function appearanceHTML() {
    return '<section class="fgroup" style="margin-top:18px"><h2>Apariencia</h2><div class="fld" style="margin-top:8px"><label for="glass">Transparencia del vidrio (barra inferior y hojas)</label>' +
      '<input type="range" id="glass" min="0" max="100" step="1" value="' + glassGet() + '" data-act="glass" aria-valuetext="Más translúcido a más opaco"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>Translúcido</span><span>Casi opaco</span></div></div>' +
      '<p class="hint">Solo cambia en este dispositivo. Si tu sistema pide «reducir transparencia», el vidrio se muestra casi opaco.</p></section>';
  }
  function partnerHTML() {
    const p = S.partner;
    let h = '<section class="fgroup" style="margin-top:18px"><h2>En pareja</h2>' +
      '<div class="fields"><div class="fld"><label for="my-name">Tu nombre</label><input id="my-name" type="text" maxlength="30" value="' + esc(S.myName) + '" placeholder="Para firmar el plan que envías" data-pc="myName"></div></div>';
    if (!p) {
      h += '<p class="hint" style="margin-top:10px">Agrega las metas de tu pareja y la lista de compras suma las porciones de los dos. Cada comida muestra cuánto le toca a cada quien: comen los mismos platillos y cambia solo la cantidad.</p>' +
        '<div class="actions"><button type="button" class="btn small" data-act="pt-add">Agregar a mi pareja</button></div>';
    } else {
      const c = p.cfg, t = targets(c);
      h += '<div class="fields" style="margin-top:12px">' +
        '<div class="fld"><label for="p-name">Su nombre</label><input id="p-name" type="text" maxlength="30" value="' + esc(p.name) + '" data-pc="name"></div>' +
        '<div class="fld"><label for="p-meta">Su objetivo</label><select id="p-meta" data-pc="meta">' + opt('bajar', 'Bajar de peso', c.meta) + opt('mantener', 'Mantener', c.meta) + opt('subir', 'Subir masa', c.meta) + '</select></div>' +
        '<div class="fld"><label for="p-sexo">Sexo (para la fórmula)</label><select id="p-sexo" data-pc="sexo">' + opt('h', 'Hombre', c.sexo) + opt('m', 'Mujer', c.sexo) + '</select></div>' +
        '<div class="fld"><label for="p-edad">Edad (años)</label><input id="p-edad" type="number" inputmode="numeric" min="18" max="90" value="' + c.edad + '" data-pc="edad"></div>' +
        '<div class="fld"><label for="p-peso">Peso (kg)</label><input id="p-peso" type="number" inputmode="decimal" min="30" max="250" value="' + c.peso + '" data-pc="peso"></div>' +
        '<div class="fld"><label for="p-talla">Estatura (cm)</label><input id="p-talla" type="number" inputmode="numeric" min="120" max="230" value="' + c.talla + '" data-pc="talla"></div>' +
        '<div class="fld"><label for="p-act">Actividad</label><select id="p-act" data-pc="act">' + opt(1.2, 'Casi nada de ejercicio', c.act) + opt(1.375, 'Ligera: 1 a 3 días', c.act) + opt(1.55, 'Moderada: 3 a 5 días', c.act) + opt(1.725, 'Alta: 6 a 7 días', c.act) + '</select></div></div>' +
        '<div class="target" style="margin-top:12px"><small>Meta diaria de ' + esc(p.name) + '</small><b>' + fmtN(t.k) + ' kcal · ' + fmtN(t.p) + ' g de proteína</b><small>Mismo cálculo que el tuyo (Mifflin-St Jeor). Su dieta y lo que no come siguen tu configuración: si algo no le va, cámbialo en el platillo.</small></div>' +
        (S.cfg.gente > 1 ? '<p class="hint" style="margin-top:8px">Ella ya se suma por separado. «Personas en la mesa» (arriba, ahora ' + S.cfg.gente + ') debería contar solo a otras personas además de ustedes dos; si somos solo ustedes, déjalo en 1.</p>' : '') +
        '<div class="actions" style="margin-top:10px"><button type="button" class="btn ghost small" data-act="pt-del">Quitar a ' + esc(p.name) + '</button></div>';
    }
    h += '<h3 style="margin:16px 0 4px;font-size:15px">Pasar el plan entre los dos</h3><p class="hint">Cada quien tiene su propia copia en su navegador. Con estos botones el plan (semana, tiendas, precios, lo que hay en casa y recetas propias) viaja como un texto que se pega por WhatsApp. Sus metas y su registro de peso nunca se sobrescriben.</p>' +
      '<div class="actions"><button type="button" class="btn small" data-act="plan-send">Enviar mi plan</button><button type="button" class="btn ghost small" data-act="plan-recv">Recibir un plan</button></div></section>';
    return h;
  }
  function viewAjustes() {
    const c = S.cfg;
    return '<form class="form" id="settings">' +
      '<section class="fgroup"><h2>Tu cuerpo y tu objetivo</h2><div class="fields">' +
      '<div class="fld"><label for="c-meta">Objetivo</label><select id="c-meta" data-cfg="meta">' + opt('bajar', 'Bajar de peso', c.meta) + opt('mantener', 'Mantener', c.meta) + opt('subir', 'Subir masa', c.meta) + '</select></div>' +
      '<div class="fld"><label for="c-sexo">Sexo (para la fórmula)</label><select id="c-sexo" data-cfg="sexo">' + opt('h', 'Hombre', c.sexo) + opt('m', 'Mujer', c.sexo) + '</select></div>' +
      '<div class="fld"><label for="c-edad">Edad (años, adultos)</label><input id="c-edad" type="number" inputmode="numeric" min="18" max="90" value="' + c.edad + '" data-cfg="edad"></div>' +
      '<div class="fld"><label for="c-peso">Peso (kg)</label><input id="c-peso" type="number" inputmode="decimal" min="30" max="250" value="' + c.peso + '" data-cfg="peso"></div>' +
      '<div class="fld"><label for="c-talla">Estatura (cm)</label><input id="c-talla" type="number" inputmode="numeric" min="120" max="230" value="' + c.talla + '" data-cfg="talla"></div>' +
      '<div class="fld"><label for="c-act">Actividad</label><select id="c-act" data-cfg="act">' + opt(1.2, 'Casi nada de ejercicio', c.act) + opt(1.375, 'Ligera: 1 a 3 días', c.act) + opt(1.55, 'Moderada: 3 a 5 días', c.act) + opt(1.725, 'Alta: 6 a 7 días', c.act) + '</select></div>' +
      '</div></section>' +
      '<div class="target" id="targets">' + targetsHTML() + '</div>' +
      '<section class="fgroup"><h2>Tus propias metas</h2><p class="hint">Déjalas vacías para usar el cálculo. Si las llenas, mandan sobre el cálculo.</p><div class="fields">' +
      '<div class="fld"><label for="c-kov">Calorías al día</label><input id="c-kov" type="number" inputmode="numeric" min="1200" max="4500" placeholder="' + targets(c).kAuto + '" value="' + (c.kOv || '') + '" data-cfg="kOv"></div>' +
      '<div class="fld"><label for="c-pov">Proteína al día (g)</label><input id="c-pov" type="number" inputmode="numeric" min="40" max="300" placeholder="' + targets(c).pAuto + '" value="' + (c.pOv || '') + '" data-cfg="pOv"></div></div></section>' +
      '<section class="fgroup"><h2>Qué comes</h2><div class="fields">' +
      '<div class="fld"><label for="c-dieta">Dieta</label><select id="c-dieta" data-cfg="dieta">' + opt('todo', 'Como de todo', c.dieta) + opt('sincerdo', 'Sin cerdo', c.dieta) + opt('sinroja', 'Sin res ni cerdo', c.dieta) + opt('vegetariano', 'Vegetariano (con huevo y lácteos)', c.dieta) + '</select></div>' +
      '<div class="fld"><label for="c-repeat">Al sugerirte una semana, cuántas veces repites</label><select id="c-repeat" data-cfg="repeat">' + opt(1, 'Cada día distinto', c.repeat) + opt(2, 'Cocino una vez, como 2 días', c.repeat) + opt(3, 'Cocino una vez, como 3 días', c.repeat) + opt(4, 'Cocino una vez, como 4 días', c.repeat) + '</select></div>' +
      '<div class="fld"><label for="c-gente">Personas en la mesa</label><input id="c-gente" type="number" inputmode="numeric" min="1" max="8" value="' + c.gente + '" data-cfg="gente"></div></div>' +
      '<div class="checks"><span class="lbl">Dejar fuera</span>' +
      [['lacteo', 'Lácteos'], ['huevo', 'Huevo'], ['pescado', 'Pescado y atún'], ['nuez', 'Cacahuate y almendra'], ['gluten', 'Gluten (avena, pan y pasta)']].map(x => '<label for="x-' + x[0] + '"><input type="checkbox" id="x-' + x[0] + '" data-cfg="excl" value="' + x[0] + '"' + (c.excl.indexOf(x[0]) >= 0 ? ' checked' : '') + '> ' + x[1] + '</label>').join('') +
      '<label for="c-snack"><input type="checkbox" id="c-snack" data-cfg="snack"' + (c.snack ? ' checked' : '') + '> Incluir una colación al día</label></div></section>' +
      '<div class="actions"><button type="button" class="btn" data-act="build">Sugerirme una semana con esto</button></div>' +
      '<p class="hint">Cambiar peso, estatura o metas reajusta las porciones al instante. La dieta y las colaciones cambian qué recetas ves. «Sugerirme una semana» arma una propuesta desde cero y reemplaza lo que ya elegiste; puedes deshacerlo.</p>' +
      '</form>' + partnerHTML() + appearanceHTML() +
      '<section class="fgroup" style="margin-top:18px"><h2>Tus datos</h2><p class="hint">Todo se guarda solo en este navegador. Guarda un respaldo para no perderlo y para pasarlo a otro dispositivo.</p><div class="actions"><button type="button" class="btn small" id="bk-dl" data-act="bk-download" hidden>Descargar respaldo</button><button type="button" class="btn ghost small" data-act="bk-copy">Copiar respaldo como texto</button><button type="button" class="btn ghost small" data-act="bk-restore">Restaurar un respaldo</button></div><p class="hint" id="bk-msg"></p></section>' +
      '<div class="foot"><p>Esto es una herramienta de planeación, no consejo médico ni nutricional. Si tienes una condición de salud o un embarazo, consulta a tu médico o nutriólogo.</p>' +
      '<p>Los valores por 100 g son de referencia tipo USDA FoodData Central, redondeados y escritos a mano. Verifícalos antes de usarlos con fines médicos.</p>' +
      '<p>Los precios son suposiciones para México, no precios medidos. Edítalos o calibra con tu ticket.</p>' +
      '<p>Tus datos se guardan solo en este navegador.</p></div>';
  }

  /* ---------- render ---------- */
  function render() {
    const act = document.activeElement, aid = act && act.id;
    const mig = (migNote.length ? '<div class="banner"><p>' + (migNote.length === 1 ? 'Un ingrediente que propusiste ya está en el catálogo común: ' : migNote.length + ' ingredientes que propusiste ya están en el catálogo común: ') + esc(migNote.join(', ')) + '. Lo cambié en tus recetas y tu despensa, y ya no aparece en «Mis ingredientes».</p></div>' : '') +
      (migRec.length ? '<div class="banner"><p>' + (migRec.length === 1 ? 'Una receta que propusiste ya está en el menú de todos: ' : migRec.length + ' recetas que propusiste ya están en el menú de todos: ') + esc(migRec.join(', ')) + '. Quedó en tu semana y favoritas, y ya no aparece en «Mías».</p></div>' : ''); migNote = []; migRec = [];
    qs('#view').innerHTML = mig + (view === 'compras' ? viewCompras() : view === 'ajustes' ? viewAjustes() : view === 'recetas' ? viewRecetas() : view === 'progreso' ? viewProgreso() : viewSemana());
    qs('#view').className = 'v-' + view;
    qsa('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.v === view ? 'page' : 'false'));
    const tg = targets(S.cfg), a = dateOf(S.week.start, 0), b = dateOf(S.week.start, 6);
    const o = { day: 'numeric', month: 'short' };
    qs('#sub').innerHTML = esc(a.toLocaleDateString('es-MX', o)) + ' al ' + esc(b.toLocaleDateString('es-MX', o)) + ' · meta <b class="num">' + fmtN(tg.k) + ' kcal</b> · <b class="num">' + fmtN(tg.p) + ' g</b> de proteína' + (S.cfg.gente > 1 ? ' · ' + S.cfg.gente + ' personas' : '') + (S.partner ? ' · con ' + esc(S.partner.name) : '');
    if (aid) { const el = document.getElementById(aid); if (el && el.focus) el.focus(); }
    if (view === 'compras') wireTicket();
    if (view === 'ajustes') getDownloads().then(dl => { const b = qs('#bk-dl'); if (dl && b) b.hidden = false; });
  }
  function route() {
    const h = (location.hash || '').replace('#', '');
    view = h === 'compras' || h === 'ajustes' || h === 'recetas' || h === 'progreso' ? h : 'semana';
    if (view !== 'progreso') wMsg = '';
    if (view !== 'recetas') recMsg = '';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- hojas: cambiar platillo, comí fuera ---------- */
  function openSheet(html) {
    sheetFocus = document.activeElement;
    qs('#sheet-card').innerHTML = html;
    qs('#sheet').hidden = false;
    const f = qs('#sheet-card input, #sheet-card button');
    if (f) f.focus();
  }
  function closeSheet() {
    qs('#sheet').hidden = true;
    qs('#sheet-card').innerHTML = '';
    if (sheetFocus && document.contains(sheetFocus) && sheetFocus.focus) sheetFocus.focus();
  }
  function afterText(ev, tg) {
    if (ev.partial) return 'El día llevaría ' + fmtN(ev.tot.k) + ' de ' + fmtN(tg.k) + ' kcal · ' + fmtN(ev.tot.p) + ' de ' + fmtN(tg.p) + ' g' + (ev.ok ? '' : ' <span class="pill off">' + (!ev.scaleOK ? 'porción poco realista' : ev.tot.k > ev.fK ? 'más de lo que toca' : 'menos de lo que toca') + '</span>');
    const st = dayStatus(ev, tg); return 'El día queda en ' + fmtN(ev.tot.k) + ' kcal · ' + fmtN(ev.tot.p) + ' g <span class="pill ' + st.cls + '">' + (ev.ok ? 'Dentro' : 'Fuera') + '</span>';
  }
  function swapSheet(di, slot) {
    const tg = targets(S.cfg), dd = S.week.days[di], ex = expectedSlots(S.cfg), cur = computeDays(tg)[di].ev, filled = !!dd.dishes[slot];
    const list = poolsFor(S.cfg)[slot].filter(d => d.id !== dd.dishes[slot]).map(d => {
      const ev = evalDayAny(defsOf({ dishes: Object.assign({}, dd.dishes, { [slot]: d.id }), outs: Object.assign({}, dd.outs, { [slot]: null }) }), tg.k, tg.p, ex);
      return { d: d, ev: ev };
    }).sort((a, b) => (b.ev.ok ? 1 : 0) - (a.ev.ok ? 1 : 0) || (S.fav[b.d.id] ? 1 : 0) - (S.fav[a.d.id] ? 1 : 0) || a.d.name.localeCompare(b.d.name, 'es'));
    const dayName = dateOf(S.week.start, di).toLocaleDateString('es-MX', { weekday: 'long' });
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    const now = cur.empty ? 'El día está vacío.' : cur.partial ? 'Hoy el día lleva ' + fmtN(cur.tot.k) + ' kcal · ' + fmtN(cur.tot.p) + ' g.' : 'Hoy el día está en ' + fmtN(cur.tot.k) + ' kcal · ' + fmtN(cur.tot.p) + ' g.';
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">' + (filled ? 'Cambiar ' : 'Elegir ') + SLOT_NAME[slot].toLowerCase() + ' del ' + esc(dayName) + '</h2><p class="hint">' + now + ' Ves la porción y cómo queda el día antes de elegir.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      (list.length ? '<ul class="cands">' + list.map(x => {
        const prot = x.d.ing.filter(i => i.r === 'P').map(i => FOODS[i.f].n.replace(/ \(.*\)/, '')).join(' + ');
        const m = x.ev.meals.find(y => y.slot === slot);
        return '<li class="cand"><div><b>' + (S.fav[x.d.id] ? '★ ' : '') + esc(x.d.name) + '</b><small>' + x.d.min + ' min' + (prot ? ' · ' + esc(prot) : '') + (m ? ' · porción ' + fmtN(m.k) + ' kcal · ' + fmtN(m.p) + ' g' : '') + '</small><div class="after">' + afterText(x.ev, tg) + '</div></div><button class="btn small" data-act="swap-apply" data-d="' + di + '" data-s="' + slot + '" data-id="' + x.d.id + '">Elegir</button></li>';
      }).join('') + '</ul>' : '<p class="hint" style="margin-top:12px">No hay otro platillo disponible con tus restricciones.</p>'));
  }
  function placeSheet(id) {
    const tg = targets(S.cfg), dish = DISH[id], ex = expectedSlots(S.cfg), slot = dish.slot;
    const rows = S.week.days.map((dd, i) => {
      const ev = evalDayAny(defsOf({ dishes: Object.assign({}, dd.dishes, { [slot]: id }), outs: Object.assign({}, dd.outs, { [slot]: null }) }), tg.k, tg.p, ex);
      const m = ev.meals.find(x => x.slot === slot), curName = dd.dishes[slot] ? DISH[dd.dishes[slot]].name : '';
      const label = dateOf(S.week.start, i).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
      return '<li class="cand"><div><b>' + esc(cap(label)) + '</b><small>' + (curName ? 'Reemplaza: ' + esc(curName) : 'Hueco libre') + (m ? ' · porción ' + fmtN(m.k) + ' kcal · ' + fmtN(m.p) + ' g' : '') + '</small><div class="after">' + afterText(ev, tg) + '</div></div><button class="btn small" data-act="place-apply" data-d="' + i + '" data-id="' + id + '">Elegir</button></li>';
    });
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">¿En qué día? ' + esc(dish.name) + '</h2><p class="hint">Es una receta de ' + SLOT_NAME[dish.slot].toLowerCase() + '. Ves la porción y cómo queda el día antes de elegir.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div><ul class="cands">' + rows.join('') + '</ul>');
  }
  function subSheet(di, slot, f) {
    const tg = targets(S.cfg), dd = S.week.days[di], ex = expectedSlots(S.cfg), exc = excludedTags(S.cfg);
    const subs = Object.assign({}, (dd.subs && dd.subs[slot]) || {}), orig = origOf(subs, f), cls = foodClass(orig);
    const inDish = new Set(effIng(dd.dishes[slot], subs).map(i => i.f));
    const label = { P: 'proteína', B: 'base', V: 'verdura o fruta' }[cls];
    const cands = Object.keys(FOODS).filter(id => id !== f && foodClass(id) === cls && (cls === 'P' || FOODS[id].aisle === FOODS[orig].aisle) && !FOODS[id].tags.some(t => exc.has(t)) && (id === orig || (!inDish.has(id) && !FOODS[id].nosub))).map(id => {
      const ns = Object.assign({}, subs); if (id === orig) delete ns[orig]; else ns[orig] = id;
      const ev = evalDayAny(defsOf({ dishes: dd.dishes, outs: dd.outs, subs: Object.assign({}, dd.subs, { [slot]: ns }) }), tg.k, tg.p, ex);
      const m = ev.meals.find(x => x.slot === slot), it = m && m.items.find(x => x.f === id);
      return { id: id, ev: ev, g: it ? it.g : null };
    }).sort((a, b) => (b.ev.ok ? 1 : 0) - (a.ev.ok ? 1 : 0) || FOODS[a.id].n.localeCompare(FOODS[b.id].n, 'es'));
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Cambiar: ' + esc(FOODS[f].n) + '</h2><p class="hint">Opciones de ' + label + ' para ' + esc(DISH[dd.dishes[slot]].name.toLowerCase()) + '. La cantidad se ajusta a la meta del día.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      (cands.length ? (cands.length > 6 ? '<div class="fld" style="margin-top:10px"><label for="sub-q">Buscar en estas opciones</label><input id="sub-q" type="search" data-act="sub-q" autocomplete="off" placeholder="Ej.: pavo, pescado, mango…"></div><p class="hint" id="sub-empty" hidden style="margin-top:8px">Ninguna opción encaja con esa palabra.</p>' : '') + '<ul class="cands">' + cands.map(x => '<li class="cand" data-s="' + esc(nrm(FOODS[x.id].n + ' ' + (FOODS[x.id].kw || ''))) + '"><div><b>' + esc(FOODS[x.id].n) + (x.id === orig ? ' (original)' : '') + '</b><small>' + (x.g ? '≈ ' + qtyText({ f: x.id, g: x.g }) : '') + '</small><div class="after">' + afterText(x.ev, tg) + '</div></div><button class="btn small" data-act="sub-apply" data-d="' + di + '" data-s="' + slot + '" data-o="' + orig + '" data-id="' + x.id + '">Elegir</button></li>').join('') + '</ul>' : '<p class="hint" style="margin-top:12px">No hay otro alimento parecido que encaje con tu dieta.</p>'));
  }


  /* ---------- buscador de ingredientes ---------- */
  let pk = null, addPick = '', addG = '';
  const foodName = (id, buy) => { const f = FOODS[id]; return f ? ((buy && f.buy) || f.n) : ''; };
  function foodSearch(q, buy) {
    const toks = nrm(q).split(' ').filter(Boolean), out = [];
    for (const id in FOODS) {
      const f = FOODS[id], nm = nrm(foodName(id, buy) + ' ' + f.n), hay = nm + ' ' + nrm(f.kw || '');
      let score = 0, ok = true;
      for (const t of toks) {
        const vs = [t, sing(t), t.replace(/es$/, '')].filter(x => x.length >= 2);
        let best = 9;
        for (const v of vs) {
          if (nm.split(' ').some(w => w.indexOf(v) === 0)) best = Math.min(best, nm.indexOf(v) === 0 ? 0 : 1);
          else if (nm.indexOf(v) >= 0) best = Math.min(best, 2);
          else if (hay.split(' ').some(w => w.indexOf(v) === 0)) best = Math.min(best, 3);
          else if (t.length >= 4 && hay.indexOf(v) >= 0) best = Math.min(best, 4);
        }
        if (best === 9) { ok = false; break; }
        score += best;
      }
      if (ok) out.push({ id: id, score: score, name: foodName(id, buy) });
    }
    return out.sort((x, y) => x.score - y.score || x.name.localeCompare(y.name, 'es'));
  }
  function pkListHTML() {
    if (!pk) return '';
    const buy = pk.ctx === 'add', res = foodSearch(pk.q, buy);
    const row = x => { const f = FOODS[x.id]; return '<li><button class="pkrow" data-act="pk-pick" data-id="' + x.id + '"><b>' + esc(x.name) + (f.mine ? ' <span class="pill">mío</span>' : '') + '</b><small>' + esc(AISLES[f.aisle]) + ' · ' + fmtN(f.k) + ' kcal · ' + dec(f.p) + ' g de proteína por 100 g' + (f.dry && !buy ? ' (cocido)' : '') + '</small></button></li>'; };
    if (!res.length) return '<li class="pkempty">No encuentro «' + esc(pk.q.trim()) + '». Prueba con otra palabra o crea el ingrediente con sus datos.</li>';
    if (nrm(pk.q)) return res.map(row).join('');
    return AISLES.map((al, i) => { const g = res.filter(x => FOODS[x.id].aisle === i); return g.length ? '<li class="pkhead" aria-hidden="true">' + esc(al) + ' · ' + g.length + '</li>' + g.map(row).join('') : ''; }).join('');
  }
  function pickerSheet() {
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Elegir ingrediente</h2><p class="hint">Escribe una parte del nombre. Entiende sinónimos (tomate, palta, camarón…) y no importan los acentos.</p></div><button class="btn ghost small" data-act="pk-back">Volver</button></div>' +
      '<div class="fld" style="margin-top:10px"><label for="pk-q">Buscar</label><input id="pk-q" type="search" data-act="pk-q" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ej.: pollo, queso, fresa, tortilla…" value="' + esc(pk.q) + '"></div>' +
      '<p class="hint" id="pk-count" aria-live="polite" style="margin-top:6px"></p><ul class="pklist" id="pk-list">' + pkListHTML() + '</ul>' +
      '<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-act="fd-new" data-from="pk">¿No está? Crear ingrediente nuevo</button></div>');
    pkCount(); const q = qs('#pk-q'); if (q) q.focus();
  }
  function pkCount() { const c = qs('#pk-count'); if (!c || !pk) return; const n = foodSearch(pk.q, pk.ctx === 'add').length; c.textContent = nrm(pk.q) ? (n + (n === 1 ? ' resultado' : ' resultados')) : (Object.keys(FOODS).length + ' ingredientes'); }
  function pkBack() {
    const p = pk; pk = null;
    if (p && p.ctx === 'cr' && crDraft) { if (p.isNew) crDraft.ing.splice(p.i, 1); crSheet(); } else { closeSheet(); }
  }
  function pkPick(id) {
    if (!pk || !FOODS[id]) return;
    const p = pk; pk = null;
    if (p.ctx === 'cr' && crDraft) { if (crDraft.ing[p.i]) crDraft.ing[p.i].f = id; crSheet(); }
    else { addPick = id; closeSheet(); render(); }
  }
  function subFilter(q) {
    const toks = nrm(q).split(' ').filter(Boolean); let n = 0;
    qsa('#sheet-card li.cand').forEach(li => { const s = li.dataset.s || '', ok = toks.every(t => s.indexOf(t) >= 0 || s.indexOf(sing(t)) >= 0); li.hidden = !ok; if (ok) n++; });
    const m = qs('#sub-empty'); if (m) m.hidden = n > 0;
  }

  function crAuto(f) { return foodClass(f); }
  function crRead() {
    if (!crDraft) return;
    const v = id => { const e = qs('#' + id); return e ? e.value : ''; };
    crDraft.name = v('cr-name'); crDraft.slot = v('cr-slot') || crDraft.slot; crDraft.min = v('cr-min'); crDraft.how = v('cr-how'); crDraft.serv = v('cr-serv') || crDraft.serv;
    crDraft.ing = crDraft.ing.map((i, n) => ({ f: v('cr-f-' + n) || i.f, g: v('cr-g-' + n), r: v('cr-r-' + n) }));
  }
  function crSumUpdate() {
    const box = qs('#cr-sum'); if (!box) return;
    crRead();
    const items = crDraft.ing.filter(i => FOODS[i.f] && isFinite(parseFloat(i.g)) && parseFloat(i.g) > 0).map(i => itemFor(i.f, parseFloat(i.g)));
    const t = sumItems(items);
    const n = clampServ(crDraft.serv);
    box.textContent = n > 1 ? 'Receta completa: ' + fmtN(t.k) + ' kcal · ' + fmtN(t.p, 1) + ' g de proteína. Por persona (entre ' + n + '): ≈ ' + fmtN(t.k / n) + ' kcal · ' + fmtN(t.p / n, 1) + ' g de proteína.' : 'Receta de partida: ' + fmtN(t.k) + ' kcal · ' + fmtN(t.p, 1) + ' g de proteína';
  }
  function crSheet() {
    const d = crDraft;
    const ROLES = [['', 'Automático'], ['P', 'Proteína (se ajusta)'], ['B', 'Base (se ajusta)'], ['V', 'Fija (no se ajusta)']];
    const rows = d.ing.map((i, n) => '<li class="crrow"><input type="hidden" id="cr-f-' + n + '" value="' + esc(i.f) + '"><button type="button" class="pickbtn" data-act="pick-food" data-i="' + n + '" aria-label="Cambiar alimento: ' + esc(foodName(i.f)) + '">' + esc(foodName(i.f) || 'Elegir…') + '</button>' +
      '<input id="cr-g-' + n + '" type="number" inputmode="numeric" min="1" max="2000" value="' + esc(i.g) + '" aria-label="Gramos" data-act="cr-sum"><span class="u">g</span>' +
      '<select id="cr-r-' + n + '" aria-label="Cómo se ajusta">' + ROLES.map(o => '<option value="' + o[0] + '"' + (o[0] === (i.r || '') ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<button class="link" data-act="cr-rm" data-i="' + n + '">Quitar</button></li>').join('');
    const unitHint = Array.from(new Set(d.ing.map(i => i.f))).filter(f => FOODS[f] && FOODS[f].unitG).map(f => FOODS[f].unitG + ' g = 1 ' + FOODS[f].unit[0]).join(' · ');
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">' + (d.id ? 'Editar mi receta' : 'Crear mi receta') + '</h2><p class="hint">Eliges los ingredientes y los gramos. Al ponerla en un día, la proteína y la base se ajustan a tu meta; lo fijo se queda igual.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      '<div class="fields" style="margin-top:12px"><div class="fld"><label for="cr-name">Nombre</label><input id="cr-name" type="text" maxlength="50" value="' + esc(d.name) + '"></div>' +
      '<div class="fld"><label for="cr-slot">Tipo de comida</label><select id="cr-slot">' + SLOTS_ALL.map(k => '<option value="' + k + '"' + (k === d.slot ? ' selected' : '') + '>' + SLOT_NAME[k] + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label for="cr-min">Minutos</label><input id="cr-min" type="number" inputmode="numeric" min="1" max="240" value="' + esc(d.min) + '"></div>' +
      '<div class="fld"><label for="cr-serv">¿Para cuántas personas es?</label><input id="cr-serv" type="number" inputmode="numeric" min="1" max="12" value="' + esc(d.serv || 1) + '" data-act="cr-sum"></div></div>' +
      '<p class="hint" style="margin-top:6px">Pon los gramos de toda la receta. La app divide entre las personas y te cuenta solo tu porción.</p>' +
      '<h3 class="sec" style="margin-top:14px">Ingredientes</h3><ul class="crlist">' + rows + '</ul>' +
      '<div class="actions" style="margin-top:8px"><button class="btn ghost small" data-act="cr-add">Agregar ingrediente</button><button class="btn ghost small" data-act="fd-new" data-from="cr">Crear ingrediente nuevo</button></div>' +
      '<p class="hint" style="margin-top:6px">' + esc(unitHint) + '</p>' +
      '<div class="fld" style="margin-top:12px"><label for="cr-how">Preparación (opcional)</label><textarea id="cr-how" rows="3" maxlength="600">' + esc(d.how) + '</textarea></div>' +
      '<p class="after" id="cr-sum" style="margin:12px 0"></p><p class="hint" id="cr-msg"></p>' +
      '<div class="actions"><button class="btn" data-act="cr-save">Guardar receta</button><button class="btn ghost" data-act="close">Cancelar</button>' + (d.id ? (crDelAsk ? '<button class="btn ghost" data-act="cr-del2">Sí, borrarla</button>' : '<button class="btn ghost" data-act="cr-del">Borrar receta</button>') : '') + '</div>');
    crSumUpdate();
  }

  /* ---------- proponer un ingrediente al catálogo común ---------- */
  const CATALOG_REPO = 'miguelsanchezzam-hub/balanza-y-sazon';
  /* Telegram de quien administra la app (sin @). Si está vacío, Telegram deja elegir a quién mandarlo. */
  const TELEGRAM_USER = 'mickeysanchez98';
  function tgLink(text, act, id) {
    const url = TELEGRAM_USER ? 'https://t.me/' + TELEGRAM_USER : 'https://t.me/share/url?url=' + encodeURIComponent('https://github.com/' + CATALOG_REPO) + '&text=' + encodeURIComponent(text.slice(0, 3500));
    return '<a class="btn ghost small" href="' + esc(url) + '" target="_blank" rel="noopener"' + (TELEGRAM_USER ? ' data-tgcopy="1"' : '') + (act ? ' data-act="' + act + '"' + (id ? ' data-id="' + esc(id) + '"' : '') : '') + '>Compartir por Telegram</a>';
  }
  const TG_HINT = TELEGRAM_USER ? 'Sin GitHub: toca «Compartir por Telegram»; copio el texto y abro el chat, solo pégalo y envíalo (si no se copió, toca «Copiar» primero).' : 'Sin GitHub: toca «Compartir por Telegram» y elige el chat de quien administra la app (o copia el texto y mándalo por donde quieras).';
  function foodProblems(f) {
    const out = [], est = 4 * f.p + 4 * (f.c || 0) + 9 * (f.fat || 0);
    if (!(f.k >= 0 && f.k <= 900)) out.push('las calorías deben estar entre 0 y 900 por 100 g');
    if (f.p + (f.c || 0) + (f.fat || 0) > 101) out.push('proteína + carbohidratos + grasa suman más de 100 g por cada 100 g');
    if (f.p * 4 > f.k * 1.1 + 5) out.push('la proteína aporta más calorías de las que declaras');
    if ((f.c || f.fat) && Math.abs(est - f.k) > Math.max(40, 0.35 * f.k)) out.push('las calorías (' + fmtN(f.k) + ') no coinciden con lo que suman los macros (≈ ' + fmtN(est) + ')');
    if (!(f.c || f.fat) && f.k > 40 + 4 * f.p) out.push('faltan carbohidratos o grasa: con solo la proteína no se llega a esas calorías');
    return out;
  }
  function proposalSheet(id) {
    const f = FOODS[id]; if (!f || !f.mine) return;
    const bad = foodProblems(f);
    if (bad.length) { textSheet('Revisa las cifras primero', 'Antes de proponerlo al catálogo común hay que corregir esto en «Editar»: ' + bad.join('; ') + '.', '', ''); qs('#sheet-card .fld').hidden = true; qs('#sheet-card [data-act=copy-text]').hidden = true; return; }
    const o = { n: f.n, k: f.k, p: f.p, c: f.c || 0, fat: f.fat || 0, pack: f.pack, price: f.price, aisle: f.aisle, tags: f.tags || [] };
    if (f.unitG) o.unitG = f.unitG;
    const text = 'Propuesta de ingrediente para el catálogo común (valores por 100 g)\n\n' + f.n + ': ' + fmtN(f.k) + ' kcal · ' + dec(f.p) + ' g proteína · ' + dec(f.c || 0) + ' g carbohidratos · ' + dec(f.fat || 0) + ' g grasa\nPaquete: ' + packLabel(f) + ' a ' + money(f.price) + ' · Pasillo: ' + AISLES[f.aisle] + (o.tags.length ? ' · Etiquetas: ' + o.tags.join(', ') : '') + '\n\n```json\n' + JSON.stringify(o) + '\n```\n';
    const url = 'https://github.com/' + CATALOG_REPO + '/issues/new?labels=propuesta-ingrediente&title=' + encodeURIComponent('Propuesta de ingrediente: ' + f.n) + '&body=' + encodeURIComponent(text);
    textSheet('Proponer al catálogo común', 'Se revisa cada semana: confirmo que las cifras sean coherentes, que no esté repetido y que las etiquetas de dieta sean correctas. Si pasa, queda en la lista de todos en la siguiente versión.', text,
      '<div class="actions" style="margin-top:12px"><a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener" data-act="prop-sent" data-id="' + esc(id) + '">Abrir la propuesta en GitHub</a> ' + tgLink(text, 'prop-sent', id) + '</div><p class=\"hint\" style="margin-top:8px">' + esc(TG_HINT) + '</p>');
  }

  /* ---------- compartir precios de tickets con la comunidad ---------- */
  const SENT_KEY = 'bys-price-sent-v1';
  const sentMap = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch (e) { return {}; } };
  let priceOut = null;
  function priceReport() {
    const sent = sentMap(), prices = [], factors = [], skipped = [];
    Object.keys(S.prices).forEach(sid => {
      if (!STORES.some(s => s.id === sid)) return;
      Object.keys(S.prices[sid] || {}).forEach(id => {
        const v = S.prices[sid][id], fd = FOODS[id];
        if (!fd || fd.mine || typeof v !== 'number' || sent[sid + '|' + id] === v) return;
        const base = fd.price * (STORES.find(s => s.id === sid).f);
        if (v < base * 0.4 || v > base * 2.5) skipped.push(fd.n + ' (' + storeName(sid) + ', ' + money(v) + ')'); else prices.push([sid, id, v, fd.pack]);
      });
    });
    Object.keys(S.factors || {}).forEach(sid => {
      const f = S.factors[sid];
      if (STORES.some(s => s.id === sid) && typeof f === 'number' && f >= 0.7 && f <= 1.5 && sent['f|' + sid] !== f) factors.push([sid, Math.round(f * 100) / 100]);
    });
    return { prices: prices.slice(0, 80), more: Math.max(0, prices.length - 80), factors: factors, skipped: skipped };
  }
  function pricesShareSheet() {
    const r = priceReport(), month = new Date().toISOString().slice(0, 7);
    if (!r.prices.length && !r.factors.length) {
      textSheet('Compartir mis precios', 'No tienes precios nuevos para compartir. Guarda precios de un ticket (o calibra una tienda) y vuelve aquí. Los que ya compartiste no se repiten.', '', ''); qs('#sheet-card .fld').hidden = true; qs('#sheet-card [data-act=copy-text]').hidden = true;
      if (r.skipped.length) qs('#copy-msg').textContent = 'No se incluyeron por verse muy raros: ' + r.skipped.join('; ') + '.';
      return;
    }
    priceOut = r;
    const json = JSON.stringify({ m: month, prices: r.prices, factors: r.factors });
    const lines = r.prices.map(x => storeName(x[0]) + ' · ' + FOODS[x[1]].n + ' · ' + money(x[2]) + ' por ' + packLabel(FOODS[x[1]])).concat(r.factors.map(x => storeName(x[0]) + ' · factor de tienda ' + x[1]));
    const title = 'Propuesta de precios: ' + r.prices.length + ' productos (' + month + ')';
    const body = 'Precios medidos con tickets (mes ' + month + ', pesos por paquete de la app).\n\n```json\n' + json + '\n```\n';
    const text = 'Se enviarán solo estos datos: tienda, producto, precio por paquete, mes. Sin fotos, sin nombre, sin total del ticket.\n\n' + lines.join('\n') + (r.more ? '\n(y ' + r.more + ' más en la siguiente tanda)' : '') + '\n\n' + body;
    const url = 'https://github.com/' + CATALOG_REPO + '/issues/new?labels=propuesta-precios&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    textSheet('Compartir mis precios', 'Cada semana se juntan los precios de todos: se descartan los raros y se usa la mediana, y llegan a todos en la siguiente versión como «precio de la comunidad».', text,
      '<div class="actions" style="margin-top:12px"><a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener" data-act="prices-sent">Abrir en GitHub y enviar</a> ' + tgLink(text, 'prices-sent') + '</div><p class=\"hint\" style="margin-top:8px">' + esc(TG_HINT) + ' Al abrir cualquiera de los dos enlaces marco estos precios como enviados para no repetirlos.' + (r.skipped.length ? ' No se incluyeron por verse muy raros: ' + esc(r.skipped.join('; ')) + '.' : '') + '</p>');
  }
  function pricesMarkSent() {
    if (!priceOut) return; const m = sentMap();
    priceOut.prices.forEach(x => { m[x[0] + '|' + x[1]] = x[2]; }); priceOut.factors.forEach(x => { m['f|' + x[0]] = x[1]; });
    try { localStorage.setItem(SENT_KEY, JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ }
    priceOut = null;
  }

  /* ---------- enviar todas las propuestas de ingredientes juntas ---------- */
  const FSENT_KEY = 'bys-food-sent-v1';
  const foodSent = () => { try { return JSON.parse(localStorage.getItem(FSENT_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const foodPayload = f => { const o = { n: f.n, k: f.k, p: f.p, c: f.c || 0, fat: f.fat || 0, pack: f.pack, price: f.price, aisle: f.aisle, tags: f.tags || [] }; if (f.unitG) o.unitG = f.unitG; return o; };
  const foodIsSent = f => foodSent()[f.id] === JSON.stringify(foodPayload(f));
  function foodMark(ids) {
    const m = foodSent(); ids.forEach(id => { if (FOODS[id]) m[id] = JSON.stringify(foodPayload(FOODS[id])); });
    try { localStorage.setItem(FSENT_KEY, JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ }
  }
  let bundleOut = [];
  function bundleSheet() {
    const todo = [], bad = [];
    S.foods.forEach(f => { if (foodIsSent(f)) return; const pr = foodProblems(f); if (pr.length) bad.push('«' + f.n + '»: ' + pr.join('; ')); else todo.push(f); });
    const sendNow = todo.slice(0, 15), warn = bad.length ? ' Hay que corregir antes de enviar: ' + bad.join(' · ') + '.' : '';
    if (!sendNow.length) {
      textSheet('Enviar propuestas', S.foods.length ? 'No hay propuestas nuevas por enviar: todos tus ingredientes ya se enviaron o hay que corregirlos.' + warn : 'Todavía no agregas ingredientes propios.', '', ''); qs('#sheet-card .fld').hidden = true; qs('#sheet-card [data-act=copy-text]').hidden = true; return;
    }
    bundleOut = sendNow.map(f => f.id);
    const json = JSON.stringify({ foods: sendNow.map(foodPayload) });
    const title = 'Propuesta de ingrediente: ' + sendNow.length + (sendNow.length === 1 ? ' ingrediente' : ' ingredientes') + ' (lote)';
    const body = 'Propuesta de ingredientes para el catálogo común (valores por 100 g):\n' + sendNow.map(f => '- ' + f.n).join('\n') + '\n\n```json\n' + json + '\n```\n';
    const url = 'https://github.com/' + CATALOG_REPO + '/issues/new?labels=propuesta-ingrediente&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    const text = sendNow.map(f => f.n + ': ' + fmtN(f.k) + ' kcal · ' + dec(f.p) + ' g proteína · ' + dec(f.c || 0) + ' g carbohidratos · ' + dec(f.fat || 0) + ' g grasa · paquete ' + packLabel(f) + ' a ' + money(f.price)).join('\n') + '\n\n' + body;
    textSheet('Enviar ' + sendNow.length + (sendNow.length === 1 ? ' propuesta' : ' propuestas') + ' juntas', 'Se revisan cada semana. Cuando uno se aprueba y entra al catálogo común, desaparece de «Mis ingredientes» y tus recetas y despensa pasan a usar el del catálogo.', text,
      '<div class="actions" style="margin-top:12px"><a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener" data-act="bundle-sent">Abrir todas en GitHub y enviar</a> ' + tgLink(text, 'bundle-sent') + '</div><p class=\"hint\" style="margin-top:8px">' + esc(TG_HINT) + ' Al abrir cualquiera de los dos enlaces las marco como enviadas.' + (todo.length > 15 ? ' Son más de 15: el resto va en el siguiente envío.' : '') + esc(warn) + '</p>');
  }

  /* ---------- mis recetas creadas y proponerlas al menú común ---------- */
  const RSENT_KEY = 'bys-rec-sent-v1';
  const recSent = () => { try { return JSON.parse(localStorage.getItem(RSENT_KEY) || '{}') || {}; } catch (e) { return {}; } };
  function recPayload(c) {
    const foods = [];
    const ing = c.ing.map(i => { const f = FOODS[i.f]; if (f && f.mine) { if (!foods.some(x => x.n === f.n)) foods.push(foodPayload(f)); return { n: f.n, g: i.g, r: i.r }; } return { f: i.f, g: i.g, r: i.r }; });
    const o = { name: c.name, slot: c.slot, min: c.min, how: String(c.how || '').slice(0, 400), ing: ing };
    if (clampServ(c.serv) > 1) o.serv = clampServ(c.serv);
    if (foods.length) o.foods = foods; return o;
  }
  const recIsSent = c => recSent()[c.id] === JSON.stringify(recPayload(c));
  function recProblems(c) {
    const out = [], b = dishBase(perPerson(c));
    if (c.name.trim().length < 3) out.push('ponle un nombre más claro');
    if (c.ing.length < 2) out.push('agrega al menos dos ingredientes');
    if (b.k < (c.slot === 'sna' ? 40 : 100) || b.k > 1500) out.push('las calorías de partida por persona (' + fmtN(b.k) + ') no parecen de una comida');
    if (c.ing.some(i => FOODS[i.f] && FOODS[i.f].mine && foodProblems(FOODS[i.f]).length)) out.push('revisa las cifras de tus ingredientes propios');
    return out;
  }
  function recText(c) { return c.name + ' (' + SLOT_NAME[c.slot] + ', ' + c.min + ' min' + (clampServ(c.serv) > 1 ? ', receta para ' + clampServ(c.serv) + ' personas' : '') + ')\n' + c.ing.map(i => '- ' + FOODS[i.f].n + ': ' + i.g + ' g').join('\n') + (c.how ? '\n' + String(c.how).slice(0, 400) : ''); }
  const recIsSentId = id => { const c = S.custom.find(x => x.id === id); return !!c && recIsSent(c); };
  function recBundleBar() {
    const todo = S.custom.filter(c => !recIsSent(c)).length;
    return '<div class="actions" style="margin:10px 0 4px"><button class="btn small" data-act="rec-bundle">Enviar todas las recetas' + (todo ? ' (' + todo + ')' : '') + '</button></div><p class="hint" style="margin-bottom:4px">Abre una receta para editarla o proponerla sola. Las que se aprueben entran al menú de todos.</p>';
  }
  let recOut = [];
  function recShareSheet(list, warn) {
    const send = list.slice(0, 3);
    if (!send.length) { textSheet('Enviar recetas', 'No hay recetas nuevas por enviar: ya se enviaron todas' + (warn ? ' o hay que corregir algo.' : '.') + (warn || ''), '', ''); qs('#sheet-card .fld').hidden = true; qs('#sheet-card [data-act=copy-text]').hidden = true; return; }
    recOut = send.map(c => c.id);
    const json = JSON.stringify({ recipes: send.map(recPayload) });
    const title = 'Propuesta de receta: ' + (send.length === 1 ? send[0].name : send.length + ' recetas (lote)');
    const human = send.map(recText).join('\n\n');
    const body = 'Propuesta de recetas para el menú común:\n\n' + human + '\n\n```json\n' + json + '\n```\n';
    const url = 'https://github.com/' + CATALOG_REPO + '/issues/new?labels=propuesta-receta&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    textSheet(send.length === 1 ? 'Proponer receta al menú común' : 'Enviar ' + send.length + ' recetas juntas', 'Se revisan cada semana: ingredientes, cantidades y calorías. Cuando se aprueba y entra al menú de todos, deja de aparecer en «Mías» y queda en tu semana y tus favoritas.', body,
      '<div class="actions" style="margin-top:12px"><a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener" data-act="rec-sent">Abrir en GitHub y enviar</a> ' + tgLink('Receta para el menú común:\n\n' + human, 'rec-sent') + '</div><p class=\"hint\" style="margin-top:8px">' + esc(TG_HINT) + ' Al abrir cualquiera de los dos enlaces las marco como enviadas.' + (list.length > 3 ? ' Se envían de 3 en 3: el resto va en el siguiente envío.' : '') + esc(warn || '') + '</p>');
  }
  function recProposeOne(id) {
    const c = S.custom.find(x => x.id === id); if (!c) return;
    const bad = recProblems(c);
    if (bad.length) { textSheet('Revisa la receta primero', 'Antes de proponerla hay que corregir esto en «Editar»: ' + bad.join('; ') + '.', '', ''); qs('#sheet-card .fld').hidden = true; qs('#sheet-card [data-act=copy-text]').hidden = true; return; }
    recShareSheet([c], '');
  }
  function recBundle() {
    const todo = [], bad = [];
    S.custom.forEach(c => { if (recIsSent(c)) return; const p = recProblems(c); if (p.length) bad.push('«' + c.name + '»: ' + p.join('; ')); else todo.push(c); });
    recShareSheet(todo, bad.length ? ' Hay que corregir antes de enviar: ' + bad.join(' · ') + '.' : '');
  }
  function recMark() {
    const m = recSent(); recOut.forEach(id => { const c = S.custom.find(x => x.id === id); if (c) m[id] = JSON.stringify(recPayload(c)); });
    try { localStorage.setItem(RSENT_KEY, JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ } recOut = [];
    const box = qs('#rec-list'); if (box) box.innerHTML = recListHTML();
  }
  /* ---------- ingredientes propios ---------- */
  let fdDraft = null, fdDelAsk = false, fdWarned = false;
  const fdBlank = from => ({ id: null, n: '', base: '100', k: '', p: '', c: '', fat: '', pieceG: '', pack: '500', price: '', aisle: 4, tags: [], from: from || 'list' });
  const fdFrom = (f, from) => ({ id: f.id, n: f.n, base: '100', k: String(f.k), p: String(f.p), c: f.c ? String(f.c) : '', fat: f.fat ? String(f.fat) : '', pieceG: f.unitG ? String(f.unitG) : '', pack: String(f.pack), price: String(f.price), aisle: f.aisle, tags: (f.tags || []).slice(), from: from || 'list' });
  function fdRead() {
    if (!fdDraft) return;
    const v = id => { const e = qs('#fd-' + id); return e ? e.value : ''; };
    ['n', 'base', 'k', 'p', 'c', 'fat', 'pieceG', 'pack', 'price'].forEach(k => { fdDraft[k] = v(k); });
    fdDraft.aisle = Number(v('aisle'));
    fdDraft.tags = qsa('.fd-tag').filter(e => e.checked).map(e => e.value);
  }
  function fdSheet() {
    const d = fdDraft, num = (id, label, val, ph, hint) => '<div class="fld"><label for="fd-' + id + '">' + label + '</label><input id="fd-' + id + '" type="text" inputmode="decimal" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"' + (hint ? ' aria-describedby="fd-' + id + '-h"' : '') + '></div>';
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">' + (d.id ? 'Editar ingrediente' : 'Crear ingrediente nuevo') + '</h2><p class="hint">Copia los valores de la etiqueta nutrimental del producto, tal como lo vas a pesar (crudo o cocido). Si la etiqueta es por porción, escribe el tamaño de la porción en «Los valores son por».</p></div><button class="btn ghost small" data-act="fd-cancel">Volver</button></div>' +
      '<div class="fields" style="margin-top:12px"><div class="fld"><label for="fd-n">Nombre</label><input id="fd-n" type="text" maxlength="40" value="' + esc(d.n) + '" placeholder="Ej.: Jamón de pavo"></div>' +
      num('base', 'Los valores son por (g)', d.base, '100') + num('k', 'Calorías (kcal)', d.k, 'Ej.: 110') + num('p', 'Proteína (g)', d.p, 'Ej.: 16') +
      num('c', 'Carbohidratos (g, opcional)', d.c, '') + num('fat', 'Grasa (g, opcional)', d.fat, '') + num('pieceG', 'Peso de una pieza (g, opcional)', d.pieceG, 'Ej.: 25 por rebanada') + '</div>' +
      '<h3 class="sec" style="margin-top:14px">Para la lista de compras</h3><div class="fields" style="margin-top:8px">' + num('pack', 'Tamaño del paquete (g)', d.pack, '500') + num('price', 'Precio del paquete ($)', d.price, 'Ej.: 45') +
      '<div class="fld"><label for="fd-aisle">Pasillo</label><select id="fd-aisle">' + AISLES.map((a, i) => '<option value="' + i + '"' + (i === d.aisle ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select></div></div>' +
      '<div class="checks" style="margin-top:12px"><span class="lbl">Contiene (para tu dieta)</span>' + FOOD_TAGS.map(t => '<label for="fd-t-' + t[0] + '"><input type="checkbox" class="fd-tag" id="fd-t-' + t[0] + '" value="' + t[0] + '"' + (d.tags.indexOf(t[0]) >= 0 ? ' checked' : '') + '> ' + t[1] + '</label>').join('') + '</div>' +
      '<p class="hint" style="margin-top:8px">Con esto, las dietas y lo que dejas fuera (lácteos, gluten…) también aplican a este ingrediente.</p><p class="hint" id="fd-msg" style="margin-top:8px"></p>' +
      '<div class="actions" style="margin-top:8px"><button class="btn" data-act="fd-save">Guardar ingrediente</button><button class="btn ghost" data-act="fd-cancel">Cancelar</button>' + (d.id ? (fdDelAsk ? '<button class="btn ghost" data-act="fd-del2">Sí, borrarlo</button>' : '<button class="btn ghost" data-act="fd-del">Borrar</button>') : '') + '</div>');
  }
  function fdBack() {
    const fdDraft0 = fdDraft, from = fdDraft && fdDraft.from; fdDraft = null; fdDelAsk = false; fdWarned = false;
    const tgt = fdDraft0 && fdDraft0.tgt, tn = fdDraft0 && fdDraft0.tgtNew;
    if (from === 'cr' && crDraft) { if (tn && tgt !== undefined) crDraft.ing.splice(tgt, 1); crSheet(); } else if (from === 'list') fdListSheet(); else closeSheet();
  }
  function fdListSheet() {
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Mis ingredientes</h2><p class="hint">Alimentos que agregaste además de la lista de la app. Los puedes usar en tus recetas, en la despensa y en las compras.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      (S.foods.length ? '<ul class="cands" style="margin-top:10px">' + S.foods.map(f => '<li class="cand"><div><b>' + esc(f.n) + (foodIsSent(f) ? ' <span class="pill">enviada</span>' : '') + '</b><small>' + fmtN(f.k) + ' kcal y ' + dec(f.p) + ' g de proteína por 100 g · paquete de ' + esc(packLabel(f)) + ' a ' + money(f.price) + '</small></div><button class="btn ghost small" data-act="fd-edit" data-id="' + f.id + '" data-from="list">Editar</button><button class="btn ghost small" data-act="fd-prop" data-id="' + f.id + '">Proponer al catálogo común</button></li>').join('') + '</ul>' : '<p class="hint" style="margin-top:12px">Todavía no agregas ingredientes.</p>') +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="fd-new" data-from="list">Crear ingrediente nuevo</button>' + (S.foods.length ? '<button class="btn ghost" data-act="fd-bundle">Enviar todas las propuestas' + (S.foods.filter(f => !foodIsSent(f)).length ? ' (' + S.foods.filter(f => !foodIsSent(f)).length + ')' : '') + '</button>' : '') + '</div>');
  }
  function fdSave() {
    fdRead();
    const d = fdDraft, msg = qs('#fd-msg'), pf = x => { const t = String(x).trim().replace(',', '.'); return t === '' ? null : parseFloat(t); };
    const name = d.n.trim(), base = pf(d.base) === null ? 100 : pf(d.base);
    if (name.length < 2) { msg.textContent = 'Ponle un nombre al ingrediente.'; return; }
    if (FOODS[d.id || ''] === undefined && Object.keys(FOODS).some(k => FOODS[k].n.toLowerCase() === name.toLowerCase())) { msg.textContent = 'Ya existe un ingrediente con ese nombre. Búscalo con el buscador de ingredientes.'; return; }
    if (!isFinite(base) || base < 1 || base > 2000) { msg.textContent = '«Los valores son por» debe estar entre 1 y 2,000 g.'; return; }
    const sc = x => { const v = pf(x); return v === null ? 0 : v * 100 / base; };
    const k = pf(d.k), p = pf(d.p);
    if (k === null || p === null || !isFinite(k) || !isFinite(p)) { msg.textContent = 'Escribe las calorías y la proteína (pon 0 si no tiene).'; return; }
    const f = { id: d.id || 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), n: name, k: k * 100 / base, p: p * 100 / base, c: sc(d.c), fat: sc(d.fat), pack: pf(d.pack) || 500, price: pf(d.price) === null ? 40 : pf(d.price), aisle: d.aisle, tags: d.tags, unitG: pf(d.pieceG) || undefined };
    if (!validFood(f)) { msg.textContent = 'Revisa los números: por 100 g las calorías van de 0 a 900, y proteína, carbohidratos y grasa de 0 a 100 g; el paquete de 20 a 5,000 g.'; return; }
    const est = 4 * f.p + 4 * f.c + 9 * f.fat;
    if ((f.c || f.fat) && Math.abs(est - f.k) > Math.max(40, 0.35 * f.k) && !fdWarned) { fdWarned = true; msg.textContent = 'Las calorías (' + fmtN(f.k) + ') no coinciden con lo que suman proteína, carbohidratos y grasa (≈ ' + fmtN(est) + ' kcal por 100 g). Revisa los datos o toca «Guardar ingrediente» otra vez para dejarlo así.'; return; }
    const o = cleanFood(f);
    if (d.id) { const i = S.foods.findIndex(x => x.id === d.id); if (i >= 0) S.foods[i] = o; } else S.foods.push(o);
    registerFood(o); S.example = false; persist();
    const from = d.from; fdDraft = null; fdDelAsk = false; fdWarned = false;
    if (from === 'cr' && crDraft) { if (!d.id) { if (d.tgt !== undefined && crDraft.ing[d.tgt]) crDraft.ing[d.tgt].f = o.id; else crDraft.ing.push({ f: o.id, g: 100, r: '' }); } crSheet(); }
    else if (from === 'list') fdListSheet(); else { if (!d.id) addPick = o.id; closeSheet(); render(); }
  }
  function fdDelete() {
    const id = fdDraft && fdDraft.id; if (!id) return;
    const users = S.custom.filter(c => c.ing.some(i => i.f === id));
    if (users.length) { fdDelAsk = false; fdSheet(); qs('#fd-msg').textContent = 'No se puede borrar: lo usan tus recetas ' + users.map(c => '«' + c.name + '»').join(', ') + '. Quítalo de ahí primero.'; return; }
    S.foods = S.foods.filter(f => f.id !== id); unregisterFood(id);
    delete S.stock[id]; delete S.staples[id]; delete S.bought[id]; Object.keys(S.prices).forEach(sid => { if (S.prices[sid]) delete S.prices[sid][id]; });
    S.week.days.forEach(dd => { for (const sl in (dd.subs || {})) { for (const o in dd.subs[sl]) if (o === id || dd.subs[sl][o] === id) delete dd.subs[sl][o]; if (!Object.keys(dd.subs[sl]).length) delete dd.subs[sl]; } });
    persist(); fdDraft = null; fdDelAsk = false; fdListSheet(); render();
  }
  function crSave() {
    crRead();
    const d = crDraft, msg = qs('#cr-msg');
    const name = d.name.trim(), min = Math.round(parseFloat(d.min));
    if (name.length < 2) { msg.textContent = 'Ponle un nombre a la receta.'; return; }
    if (!d.ing.length) { msg.textContent = 'Agrega al menos un ingrediente.'; return; }
    const seen = new Set(), ing = [];
    for (const i of d.ing) {
      const g = parseFloat(i.g);
      if (!isFinite(g) || g < 1 || g > 2000) { msg.textContent = 'Revisa los gramos: entre 1 y 2,000 por ingrediente.'; return; }
      if (seen.has(i.f)) { msg.textContent = 'Agregaste dos veces ' + FOODS[i.f].n.toLowerCase() + '. Junta los gramos en una sola fila.'; return; }
      seen.add(i.f); ing.push({ f: i.f, g: Math.round(g), r: i.r || crAuto(i.f) });
    }
    const sv = Math.round(parseFloat(d.serv));
    if (!isFinite(sv) || sv < 1 || sv > 12) { msg.textContent = 'Personas: un número entre 1 y 12.'; return; }
    const t = sumItems(ing.map(i => itemFor(i.f, i.g))), tp = t.k / sv;
    if (tp < 80 || tp > 2500) { msg.textContent = (sv > 1 ? 'Tu porción (' + fmtN(tp) + ' kcal, de ' + fmtN(t.k) + ' entre ' + sv + ')' : 'La receta suma ' + fmtN(t.k) + ' kcal') + ' debe quedar entre 80 y 2,500; revisa los gramos' + (sv > 1 ? ' o las personas' : '') + '.'; return; }
    if (!ing.some(i => i.r !== 'V')) { msg.textContent = 'Al menos un ingrediente debe ajustarse (proteína o base); si no, la porción no puede cambiar.'; return; }
    const obj = d.id ? S.custom.find(c => c.id === d.id) : { id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), mine: true };
    Object.assign(obj, { slot: d.slot, name: name.slice(0, 50), min: isFinite(min) ? Math.max(1, Math.min(240, min)) : 20, how: d.how.trim().slice(0, 600), serv: sv, ing: ing });
    if (!d.id) S.custom.push(obj);
    registerCustom(obj);
    persist(); crDraft = null; crDelAsk = false; closeSheet();
    recMsg = 'Receta guardada: ' + obj.name + '.'; view = 'recetas'; if (location.hash !== '#recetas') location.hash = '#recetas'; else render();
  }
  function crDelete() {
    const id = crDraft && crDraft.id; if (!id) return;
    S.week.days.forEach(dd => { for (const k of Object.keys(dd.dishes)) if (dd.dishes[k] === id) { delete dd.dishes[k]; if (dd.subs) delete dd.subs[k]; if (dd.ate) delete dd.ate[k]; } });
    S.custom = S.custom.filter(c => c.id !== id); delete S.fav[id]; unregisterCustom(id); if (!S.custom.length && recSlot === 'mine') recSlot = 'all';
    persist(); crDraft = null; crDelAsk = false; closeSheet(); recMsg = 'Receta borrada.'; render();
  }

  function listText(rows) {
    const need = rows.filter(r => r.packs > 0 && !S.bought[r.id]);
    const a = dateOf(S.week.start, 0), b = dateOf(S.week.start, 6), o = { day: 'numeric', month: 'short' };
    let t = 'Lista de compras · ' + a.toLocaleDateString('es-MX', o) + ' al ' + b.toLocaleDateString('es-MX', o) + '\nTienda: ' + storeName(S.store) + (S.aisleStore[2] ? ' (fruta y verdura: ' + storeName(S.aisleStore[2]) + ')' : '') + '\n';
    if (!need.length) return t + '\nNo falta nada por comprar.';
    AISLES.forEach((name, ai) => {
      const rs = need.filter(r => r.fd.aisle === ai).sort((x, y) => (x.fd.buy || x.fd.n).localeCompare(y.fd.buy || y.fd.n, 'es'));
      if (!rs.length) return;
      t += '\n' + name.toUpperCase() + '\n' + rs.map(r => '- ' + (r.fd.buy || r.fd.n) + ': ' + r.packs + ' × ' + packLabel(r.fd) + ' (' + money(r.paid) + ')').join('\n') + '\n';
    });
    return t + '\nTotal estimado en caja: ' + money(need.reduce((x, r) => x + r.paid, 0));
  }
  function textSheet(title, hint, text, extra) {
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">' + esc(title) + '</h2><p class="hint">' + esc(hint) + '</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      '<div class="fld" style="margin-top:12px"><label class="sr-only" for="share-text">Texto</label><textarea id="share-text" rows="10" readonly style="font-family:var(--f-code);font-size:12px"></textarea></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="copy-text">Copiar</button></div><p class="hint" id="copy-msg" style="margin-top:8px"></p>' + (extra || ''));
    qs('#share-text').value = text;
  }

  /* ---------- pasar el plan entre dos personas ---------- */
  function b64e(str) { const by = new TextEncoder().encode(str); let bin = ''; by.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin); }
  function b64d(str) { const bin = atob(str), by = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i); return new TextDecoder().decode(by); }
  function planObj(withCfg) {
    const week = JSON.parse(JSON.stringify(S.week));
    week.days.forEach(d => { d.ate = {}; });
    const o = { app: 'balanza-y-sazon', v: 1, from: S.myName || '', week: week, store: S.store, aisleStore: S.aisleStore, factors: S.factors, prices: S.prices, staples: S.staples, stock: S.stock, budget: S.budget, custom: S.custom, foods: S.foods };
    if (withCfg) o.cfg = { meta: S.cfg.meta, sexo: S.cfg.sexo, edad: S.cfg.edad, peso: S.cfg.peso, talla: S.cfg.talla, act: S.cfg.act, kOv: S.cfg.kOv, pOv: S.cfg.pOv };
    return o;
  }
  function planCode(withCfg) {
    return 'Plan de Balanza y Sazón' + (S.myName ? ' de ' + S.myName : '') + '. Para usarlo: Ajustes → «Recibir un plan» y pega todo este mensaje.\n' + 'BYS1:' + b64e(JSON.stringify(planObj(withCfg)));
  }
  function planSendSheet() {
    textSheet('Enviar mi plan', 'Copia el texto y mándalo por WhatsApp. Quien lo reciba lo pega en «Recibir un plan».', planCode(true),
      '<label class="chk" for="sh-cfg" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" id="sh-cfg" data-act="sh-cfg" checked> <span>Incluir mis metas (edad, peso, estatura, actividad) para que mi pareja me agregue con mis porciones. Desmárcalo si prefieres no mandar esos datos.</span></label>');
  }
  function parsePlan(text) {
    const m = /BYS1:([A-Za-z0-9+\/=]+)/.exec(String(text || '').replace(/\s+/g, ''));
    if (!m) return { error: 'No encontré un plan en ese texto. Pega el mensaje completo que te mandaron, incluida la parte que empieza con BYS1:.' };
    let o; try { o = JSON.parse(b64d(m[1])); } catch (e) { return { error: 'El texto del plan está cortado o dañado. Pídelo de nuevo y pégalo completo.' }; }
    if (!o || o.app !== 'balanza-y-sazon' || o.v !== 1 || !o.week) return { error: 'Ese texto no es un plan de Balanza y Sazón.' };
    const n = normalize(planCandidate(o), false);
    if (!n) return { error: 'El plan no tiene una semana válida.' };
    const dishes = n.week.days.reduce((x, d) => x + Object.keys(d.dishes).length, 0), extra = n.custom.filter(c => !S.custom.some(x => x.id === c.id)).length;
    return { plan: o, summary: 'Plan' + (o.from ? ' de ' + o.from : '') + ': semana con ' + dishes + ' platillos, ' + extra + ' recetas propias nuevas, compra en ' + storeName(n.store) + ' y ' + (Object.keys(n.stock).length + Object.keys(n.staples).length) + ' productos en casa.' };
  }
  function planCandidate(o) {
    const c = JSON.parse(JSON.stringify(S)); delete c.undo; delete c.prevWeek;
    c.week = JSON.parse(JSON.stringify(o.week));
    if (c.week && Array.isArray(c.week.days)) c.week.days.forEach(d => { if (d && typeof d === 'object') d.ate = {}; });
    ['store', 'aisleStore', 'factors', 'prices', 'staples', 'stock', 'budget'].forEach(k => { if (o[k] !== undefined) c[k] = JSON.parse(JSON.stringify(o[k])); });
    const mine = c.custom || [], theirs = Array.isArray(o.custom) ? o.custom : [];
    c.custom = mine.concat(theirs.filter(x => x && !mine.some(y => y.id === x.id)));
    const fm = c.foods || [], ft = Array.isArray(o.foods) ? o.foods : [];
    c.foods = fm.concat(ft.filter(x => x && !fm.some(y => y.id === x.id)));
    c.bought = {}; c.example = false;
    return c;
  }
  let rvPending = null;
  function planRecvSheet() {
    rvPending = null;
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Recibir un plan</h2><p class="hint">Pega el mensaje que te mandaron. Antes de adoptarlo te muestro qué trae. Tus metas, tu registro de peso y tus favoritas no se tocan.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      '<div class="fld" style="margin-top:12px"><label for="rv-text">Mensaje con el plan</label><textarea id="rv-text" rows="6" style="font-family:var(--f-code);font-size:12px"></textarea></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="rv-check">Revisar plan</button></div><p class="after" id="rv-res" style="margin:10px 0"></p>' +
      '<label class="chk" id="rv-lab" for="rv-partner" style="display:none;gap:8px;align-items:flex-start;margin-bottom:10px"><input type="checkbox" id="rv-partner" checked> <span id="rv-partner-t"></span></label>' +
      '<div class="actions"><button class="btn" id="rv-apply" data-act="rv-apply" hidden>Adoptar este plan</button></div>');
  }

  function backupObj() { const c = JSON.parse(JSON.stringify(S)); delete c.undo; delete c.prevWeek; return { app: 'semana-medida', v: 1, exportedAt: new Date().toISOString(), data: c }; }
  function backupText() { return JSON.stringify(backupObj(), null, 1); }
  function parseBackup(text) {
    let o; try { o = JSON.parse(text); } catch (e) { return { error: 'No pude leer ese texto como un respaldo.' }; }
    const data = o && o.app === 'semana-medida' && o.data ? o.data : o;
    const n = normalize(JSON.parse(JSON.stringify(data || null)), false);
    if (!n) return { error: 'Ese archivo no tiene el formato de un respaldo de Balanza y Sazón.' };
    const dishes = n.week.days.reduce((x, d) => x + Object.keys(d.dishes).length, 0);
    return { data: data, summary: 'Contiene una semana con ' + dishes + ' platillos, ' + n.custom.length + ' recetas propias, ' + n.foods.length + ' ingredientes propios, ' + Object.keys(n.fav).length + ' favoritas, ' + n.weights.length + ' registros de peso y ' + (Object.keys(n.stock).length + Object.keys(n.staples).length) + ' productos en casa.' };
  }
  function restoreSheet() {
    bkPending = null;
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Restaurar un respaldo</h2><p class="hint">Elige el archivo de respaldo o pega su texto. Antes de reemplazar tus datos te muestro qué contiene.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      '<div class="fld" style="margin-top:12px"><label for="bk-file">Archivo de respaldo (.json)</label><input id="bk-file" type="file" accept=".json,application/json,text/plain"></div>' +
      '<div class="fld" style="margin-top:10px"><label for="bk-text">O pega el texto del respaldo</label><textarea id="bk-text" rows="6" style="font-family:var(--f-code);font-size:12px"></textarea></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="bk-check">Revisar respaldo</button></div><p class="after" id="bk-res" style="margin:10px 0"></p>' +
      '<div class="actions"><button class="btn" id="bk-apply" data-act="bk-apply" hidden>Reemplazar mis datos</button></div>');
  }
  let dlPromise = null;
  function getDownloads() {
    if (!dlPromise) dlPromise = (async () => {
      let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
      if (dl || !STANDALONE) return dl;
      return { save: async o => { const a = document.createElement('a'), u = URL.createObjectURL(new Blob([o.data], { type: 'application/json' })); a.href = u; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return true; } };
    })();
    return dlPromise;
  }


  /* ---------- comparar tiendas y bajar el gasto ---------- */
  function paidIn(dds, storeId, aisle) {
    const tg = targets(S.cfg), ex = expectedSlots(S.cfg);
    const evs = dds.map(dd => evalDayAny(defsOf(dd), tg.k, tg.p, ex));
    const more = S.partner ? [{ evs: dds.map(partnerEv), people: 1 }] : [];
    return shopTotals(shopRows(evs, S.cfg.gente, storeId, S.factors, S.prices, S.staples, S.stock, aisle || {}, more)).paid;
  }
  function compareSheet() {
    const evs = S.week.days;
    const cur = paidIn(evs, S.store, S.aisleStore);
    const list = STORES.filter(s => s.id !== 'verduleria').map(s => ({ s: s, paid: paidIn(evs, s.id, {}), cal: typeof S.factors[s.id] === 'number' })).sort((a, b) => a.paid - b.paid);
    const best = list[0], mix = paidIn(evs, best.s.id, { 2: 'verduleria' });
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Comparar tiendas</h2><p class="hint">Lo que pagarías en caja por la lista de esta semana en cada tienda, con lo que ya tienes en casa y tus precios corregidos.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      '<p class="after" style="margin:12px 0">Con tu configuración actual (' + esc(storeName(S.store)) + (S.aisleStore[2] ? ', fruta y verdura en ' + esc(storeName(S.aisleStore[2])) : '') + '): <b>' + money(cur) + '</b>.</p>' +
      '<ul class="cands">' + list.map(x => '<li class="cand"><div><b>' + esc(x.s.n) + (x.s.id === S.store ? ' (la tuya)' : '') + '</b><small>' + (x.cal ? 'Factor calibrado con tu ticket' : 'Factor supuesto ×' + x.s.f.toFixed(2)) + (x.paid === cur ? '' : ' · ' + (x.paid < cur ? 'ahorras ' + money(cur - x.paid) : 'pagas ' + money(x.paid - cur) + ' más') + ' frente a tu configuración') + '</small></div><b class="num">' + money(x.paid) + '</b></li>').join('') + '</ul>' +
      '<p class="after" style="margin:12px 0 0">Mezclando: todo en ' + esc(best.s.n) + ' y la fruta y verdura en verdulería, serían <b>' + money(mix) + '</b>.</p>' +
      '<p class="hint" style="margin-top:10px">Solo las tiendas donde calibraste con un ticket tienen un factor medido; las demás son supuestos míos, así que la comparación es orientativa. La verdulería no está en la tabla porque solo vende fruta y verdura. Costco vende en empaques más grandes: aquí solo ajusto el precio, no el tamaño del paquete.</p>');
  }
  function savingsList() {
    const tg = targets(S.cfg), ex = expectedSlots(S.cfg), evs = S.week.days, pools = poolsFor(S.cfg);
    const base = paidIn(evs, S.store, S.aisleStore), out = [];
    S.week.days.forEach((dd, i) => SLOTS_ALL.forEach(slot => {
      if (!dd.dishes[slot] || (dd.outs && dd.outs[slot]) || (dd.ate && dd.ate[slot])) return;
      let best = null;
      pools[slot].forEach(d => {
        if (d.id === dd.dishes[slot]) return;
        const ev = evalDayAny(defsOf({ dishes: Object.assign({}, dd.dishes, { [slot]: d.id }), outs: dd.outs, subs: Object.assign({}, dd.subs, { [slot]: undefined }) }), tg.k, tg.p, ex);
        if (!ev.ok) return;
        const e2 = evs.slice(); e2[i] = { dishes: Object.assign({}, dd.dishes, { [slot]: d.id }), outs: dd.outs, subs: Object.assign({}, dd.subs, { [slot]: undefined }) };
        const save = base - paidIn(e2, S.store, S.aisleStore);
        if (save >= 8 && (!best || save > best.save)) best = { i: i, slot: slot, d: d, save: save, ev: ev };
      });
      if (best) out.push(best);
    }));
    return { base: base, list: out.sort((a, b) => b.save - a.save).slice(0, 6) };
  }
  function saverSheet() {
    const tg = targets(S.cfg), r = savingsList();
    qs('#sheet-card').setAttribute('aria-labelledby', 'sheet-title');
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Bajar el gasto</h2><p class="hint">Cambios de un platillo por otro que cumplen tu meta del día y bajan lo que pagas en caja. Hoy pagas ' + money(r.base) + ' y tu presupuesto es ' + money(S.budget) + '.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      (r.list.length ? '<ul class="cands">' + r.list.map(x => {
        const dd = S.week.days[x.i], day = cap(dateOf(S.week.start, x.i).toLocaleDateString('es-MX', { weekday: 'long' }));
        return '<li class="cand"><div><b>' + esc(day) + ' · ' + esc(SLOT_NAME[x.slot].toLowerCase()) + ': ' + esc(DISH[dd.dishes[x.slot]].name) + ' → ' + esc(x.d.name) + '</b><small>Baja ≈ ' + money(x.save) + ' en la compra</small><div class="after">' + afterText(x.ev, tg) + '</div></div><button class="btn small" data-act="swap-apply" data-d="' + x.i + '" data-s="' + x.slot + '" data-id="' + x.d.id + '">Aplicar</button></li>';
      }).join('') + '</ul><p class="hint" style="margin-top:10px">Cada ahorro se calcula solo, cambiando ese platillo y dejando lo demás igual. Si aplicas varios, el total no es la suma exacta: la lista se recalcula.</p>' : '<p class="hint" style="margin-top:12px">No encontré cambios de un solo platillo que bajen la compra sin salirse de tu meta. Prueba anotar lo que ya tienes en casa o cambiar de tienda.</p>'));
  }

  /* ---------- progreso: peso, tendencia y adherencia ---------- */
  const dayN = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  const sgn = (x, d) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmtN(Math.abs(x), d == null ? 1 : d);
  function trendOf() {
    const ws = S.weights.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    if (!ws.length) return null;
    const last = ws[ws.length - 1], w = ws.filter(x => dayN(x.d) >= dayN(last.d) - 28), span = dayN(w[w.length - 1].d) - dayN(w[0].d);
    if (w.length < 4 || span < 10) return { ws: ws, last: last, ok: false, n: w.length, span: span };
    const xs = w.map(x => dayN(x.d) - dayN(w[0].d)), ys = w.map(x => x.kg), n = w.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    return { ws: ws, last: last, ok: true, n: n, span: span, perWeek: den ? num / den * 7 : 0 };
  }
  function adviceFor(tr, tg) {
    if (!tr || !tr.ok) return null;
    const s = tr.perWeek, w = tr.last.kg, meta = S.cfg.meta, pct = s / w * 100, rate = sgn(s, 2) + ' kg por semana';
    let delta = 0, why = '';
    if (meta === 'bajar') { if (s > -0.1) { delta = -150; why = 'Tu peso no está bajando (tendencia ' + rate + ').'; } else if (-pct > 1) { delta = 150; why = 'Estás bajando más rápido que 1 % de tu peso por semana (tendencia ' + rate + ').'; } }
    else if (meta === 'mantener') { if (Math.abs(s) > 0.25) { delta = s > 0 ? -150 : 150; why = 'Tu peso se mueve más de lo que buscas al mantener (tendencia ' + rate + ').'; } }
    else { if (s < 0.1) { delta = 150; why = 'Tu peso no está subiendo (tendencia ' + rate + ').'; } else if (s > 0.5) { delta = -150; why = 'Estás subiendo más rápido de lo planeado (tendencia ' + rate + ').'; } }
    if (!delta) return { good: true, txt: 'Tu tendencia (' + rate + ') va en línea con tu objetivo. No cambiaría nada.' };
    const nk = tg.k + delta;
    if (nk < 1400) return { txt: why + ' Tu meta ya está cerca del mínimo de 1,400 kcal, así que no te propongo bajarla más. Revisa tu actividad o consulta a un profesional de la salud.' };
    return { txt: why, delta: delta, nk: nk };
  }
  function weightChart(ws) {
    const w = ws.slice(-30);
    if (w.length < 2) return '';
    const W = 320, H = 140, pl = 34, pr = 8, pt = 10, pb = 22, d0 = dayN(w[0].d), d1 = dayN(w[w.length - 1].d) || d0 + 1;
    const lo = Math.min.apply(null, w.map(x => x.kg)) - 0.5, hi = Math.max.apply(null, w.map(x => x.kg)) + 0.5;
    const X = d => pl + (d1 === d0 ? 0.5 : (dayN(d) - d0) / (d1 - d0)) * (W - pl - pr), Y = k => pt + (hi - k) / (hi - lo) * (H - pt - pb);
    const pts = w.map(x => X(x.d).toFixed(1) + ',' + Y(x.kg).toFixed(1)).join(' ');
    const fmtD = iso => new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfica de tu peso del ' + fmtD(w[0].d) + ' al ' + fmtD(w[w.length - 1].d) + ': de ' + fmtN(w[0].kg, 1) + ' a ' + fmtN(w[w.length - 1].kg, 1) + ' kg" style="width:100%;height:auto;display:block;margin:10px 0">' +
      '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(hi).toFixed(1) + '" y2="' + Y(hi).toFixed(1) + '" stroke="var(--line)"/><line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(lo).toFixed(1) + '" y2="' + Y(lo).toFixed(1) + '" stroke="var(--line)"/>' +
      '<text x="' + (pl - 4) + '" y="' + (Y(hi) + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + fmtN(hi, 1) + '</text><text x="' + (pl - 4) + '" y="' + (Y(lo) + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + fmtN(lo, 1) + '</text>' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>' +
      w.map(x => '<circle cx="' + X(x.d).toFixed(1) + '" cy="' + Y(x.kg).toFixed(1) + '" r="3" fill="var(--accent)"/>').join('') +
      '<text x="' + pl + '" y="' + (H - 6) + '" font-size="10" fill="var(--muted)">' + fmtD(w[0].d) + '</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + fmtD(w[w.length - 1].d) + '</text></svg>';
  }
  function adherenceHTML() {
    const tg = targets(S.cfg), days = computeDays(tg), ti = dayIndexToday(S.week.start), upto = Math.min(6, ti);
    if (!weekHasDishes()) return '<p class="hint">Cuando tengas platillos en la semana, aquí ves cuántos marcaste como comidos.</p>';
    if (upto < 0) return '<p class="hint">La semana empieza el ' + esc(dateOf(S.week.start, 0).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })) + '. Aquí verás tu avance día a día.</p>';
    let planned = 0, ate = 0;
    const rows = days.filter(d => d.i <= upto && d.ev.meals.length).map(d => {
      const pl = d.ev.meals.length, done = d.ev.meals.filter(m => d.dd.ate && d.dd.ate[m.slot]).length, k = d.ev.meals.filter(m => d.dd.ate && d.dd.ate[m.slot]).reduce((x, m) => x + m.k, 0);
      planned += pl; ate += done;
      const label = cap(d.date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' }));
      return '<li><span>' + esc(label) + '</span><span class="num">' + done + ' de ' + pl + ' comidas' + (done ? ' · ' + fmtN(k) + ' kcal' : '') + '</span></li>';
    });
    if (!rows.length) return '<p class="hint">Aún no hay comidas planeadas en los días que van.</p>';
    return '<div class="adh">' + ringPct(Math.round(ate / planned * 100), 84) + '<p class="after" style="margin:0"><b>' + ate + ' de ' + planned + '</b> comidas planeadas marcadas como comidas (' + Math.round(ate / planned * 100) + ' %). Solo cuenta lo que marcas: en Semana, abre una comida y toca «Marcar como comida».</p></div><ul class="wl">' + rows.join('') + '</ul><p class="hint" style="margin-top:6px">Las comidas que registras en «Comí fuera» cuentan solas como comidas.</p>';
  }
  function viewProgreso() {
    const tg = targets(S.cfg), tr = trendOf(), adv = adviceFor(tr, tg);
    let h = '<section class="card"><div class="shophead" style="margin-bottom:10px"><span class="thumb big im-progreso" aria-hidden="true"></span><div><h2>Tu peso</h2><p class="hint" style="margin-top:4px">Anota tu peso cuando te pesas (mejor en las mismas condiciones, por ejemplo en ayunas). Se queda solo en este navegador.</p></div></div>' +
      '<div class="fields"><div class="fld"><label for="w-d">Fecha</label><input id="w-d" type="date" value="' + isoToday() + '" max="' + isoToday() + '"></div>' +
      '<div class="fld"><label for="w-kg">Peso (kg)</label><input id="w-kg" type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="Ej.: 74.6"></div></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="w-add">Guardar peso</button></div><p class="hint" id="w-msg" style="margin-top:8px">' + esc(wMsg) + '</p>';
    if (tr) {
      h += weightChart(tr.ws) + '<p class="after" style="margin:0 0 8px">Último registro: <b>' + fmtN(tr.last.kg, 1) + ' kg</b>' + (tr.ok ? ' · tendencia de las últimas 4 semanas: <b>' + sgn(tr.perWeek, 2) + ' kg por semana</b>' : '') + '.</p>';
      if (!tr.ok) h += '<p class="hint">Con 4 pesos repartidos en al menos 10 días calculo tu tendencia. Llevas ' + tr.n + ' en ' + tr.span + ' días.</p>';
      h += '<ul class="wl">' + tr.ws.slice(-8).reverse().map(x => '<li><span>' + esc(new Date(x.d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })) + '</span><span><b class="num">' + fmtN(x.kg, 1) + ' kg</b> <button class="link" data-act="w-del" data-d="' + x.d + '" aria-label="Quitar el registro del ' + x.d + '">Quitar</button></span></li>').join('') + '</ul>';
      if (Math.abs(tr.last.kg - S.cfg.peso) >= 1) h += '<div class="actions" style="margin-top:8px"><button class="btn ghost small" data-act="w-use">Usar ' + fmtN(tr.last.kg, 1) + ' kg en mis metas</button></div><p class="hint" style="margin-top:4px">En Ajustes tienes ' + fmtN(S.cfg.peso, 1) + ' kg y de ahí sale tu gasto estimado.</p>';
    }
    h += '</section>';
    if (adv) h += '<section class="card" style="margin-top:14px"><h2 style="font-size:18px">¿Ajusto tu meta?</h2><p class="after" style="margin:8px 0">' + esc(adv.txt) + '</p>' +
      (adv.delta ? '<p class="hint">Te propongo ' + (adv.delta < 0 ? 'bajar' : 'subir') + ' tu meta diaria 150 kcal: de ' + fmtN(tg.k) + ' a <b>' + fmtN(adv.nk) + '</b>. Queda como meta propia en Ajustes y puedes borrarla cuando quieras.</p><div class="actions" style="margin-top:8px"><button class="btn small" data-act="w-adj" data-k="' + Math.round(adv.nk) + '">Aplicar ' + fmtN(adv.nk) + ' kcal</button></div>' : '') +
      '<p class="hint" style="margin-top:8px">Es una sugerencia automática basada en una recta ajustada a tus pesos; el agua y la sal mueven el peso varios días. No sustituye a un profesional de la salud.</p></section>';
    h += '<section class="card" style="margin-top:14px"><h2 style="font-size:18px">Cómo vas esta semana</h2><div style="margin-top:8px">' + adherenceHTML() + '</div></section>';
    return h;
  }

  /* ---------- Comí fuera: calculadora local ---------- */
  function calcTotals() { return calcLines.reduce((t, l) => ({ k: t.k + l.k, p: t.p + l.p }), { k: 0, p: 0 }); }
  function calcRender() {
    const box = qs('#calc-list'), tot = qs('#calc-tot'), use = qs('#calc-use'); if (!box) return;
    const t = calcTotals();
    box.innerHTML = calcLines.map((l, i) => '<li><span>' + esc(l.label) + '</span><span><b class="num">' + fmtN(l.k) + ' kcal · ' + fmtN(l.p, 1) + ' g</b> <button class="link" data-act="calc-rm" data-i="' + i + '">Quitar</button></span></li>').join('');
    tot.textContent = calcLines.length ? 'Suma: ' + fmtN(t.k) + ' kcal · ' + fmtN(t.p, 1) + ' g de proteína' : 'Agrega lo que comiste y te sumo los números.';
    use.disabled = !calcLines.length;
  }
  function calcHTML() {
    return '<details class="calc" style="margin-top:12px"><summary>Calculadora: arma tu comida por piezas</summary>' +
      '<div class="fields" style="margin-top:10px"><div class="fld"><label for="calc-item">Qué comiste</label><select id="calc-item">' + OUT_ITEMS.map((x, i) => '<option value="' + i + '">' + esc(x[0]) + ' (' + esc(x[1]) + ')</option>').join('') + '</select></div>' +
      '<div class="fld"><label for="calc-qty">Cantidad</label><input id="calc-qty" type="number" inputmode="decimal" min="0.5" max="20" step="0.5" value="1"></div>' +
      '<div class="fld"><label for="calc-size">Tamaño</label><select id="calc-size">' + Object.keys(OUT_SIZE).map(k => '<option value="' + k + '"' + (k === 'n' ? ' selected' : '') + '>' + OUT_SIZE[k][0] + '</option>').join('') + '</select></div></div>' +
      '<div class="actions" style="margin-top:8px"><button class="btn ghost small" data-act="calc-add">Agregar</button></div><ul class="wl" id="calc-list"></ul><p class="after" id="calc-tot" style="margin:8px 0"></p>' +
      '<div class="actions"><button class="btn small" id="calc-use" data-act="calc-use" disabled>Usar esta suma</button></div>' +
      '<p class="hint" style="margin-top:8px">Son valores aproximados de referencia para porciones típicas, no medidos: cambian mucho entre lugares y cocineros. Úsalos como punto de partida y corrige abajo si sabes algo más.</p></details>';
  }

  /* ---------- leer un ticket ---------- */
  function tkPer(l) { const fd = FOODS[l.id]; return fd ? (l.g ? l.price / l.g * fd.pack : l.price) : null; }
  function ticketHTML() {
    let h = '<section class="card" style="margin-top:22px" id="tk-card"><h2 style="font-size:18px">Leer mi ticket (precios reales)</h2>' +
      '<p class="hint" style="margin:6px 0 10px">Sube la foto del ticket o pega su texto. Leo cada renglón, lo asocio con un producto de tu lista y calculo el precio por paquete. La foto se lee en tu dispositivo y no se envía a ningún lado. Tú revisas y corriges antes de guardar, y solo cambia los precios de la tienda que elijas.</p>' +
      '<p class="hint" id="tk-off" hidden></p>' +
      '<div id="tk-box" hidden><div class="fld" id="tk-file-wrap" hidden><label for="tk-file">Foto del ticket</label><input id="tk-file" type="file" accept="image/*" multiple></div>' +
      '<div class="fld" style="margin-top:10px"><label for="tk-text">Pega el texto del ticket (opcional si subes foto)</label><textarea id="tk-text" rows="4" maxlength="6000" data-act="tk-text">' + esc(tkText) + '</textarea></div>' +
      '<div class="fld" style="margin-top:10px"><label for="tk-store">Tienda del ticket</label><select id="tk-store">' + STORES.map(s => '<option value="' + s.id + '"' + (s.id === (tkDraft ? tkDraft.store : S.store) ? ' selected' : '') + '>' + esc(s.n) + '</option>').join('') + '</select></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn small" id="tk-read" data-act="tk-read">Leer ticket</button></div></div><p class="hint" id="tk-msg" style="margin-top:8px">' + esc(tkMsg) + '</p>' +
      '<div class="actions" style="margin-top:6px"><button class="btn ghost small" data-act="prices-share">Compartir mis precios con la comunidad</button></div>';
    if (tkDraft) {
      const ids = Object.keys(FOODS).sort((a, b) => (FOODS[a].buy || FOODS[a].n).localeCompare(FOODS[b].buy || FOODS[b].n, 'es'));
      h += '<h3 class="sec" style="margin-top:14px">Revisa lo que leí</h3><p class="hint">Corrige el producto o el precio por paquete, y desmarca lo que no quieras guardar.' + (tkDraft.total ? ' Total del ticket: ' + money(tkDraft.total) + '.' : '') + '</p><ul class="slist">' +
        tkDraft.lines.map((l, i) => {
          const fd = FOODS[l.id];
          return '<li class="srow"><label class="chk"><input type="checkbox" id="tk-u-' + i + '" data-act="tk-edit" data-i="' + i + '" data-k="use"' + (l.use ? ' checked' : '') + (fd ? '' : ' disabled') + '><span class="sr-only">Guardar este precio</span></label>' +
            '<div class="sinfo"><span class="sname">' + esc(l.t) + '</span><small>Pagaste ' + money(l.price) + (l.g ? ' por ' + fmtN(l.g) + ' g' : ' (el ticket no da peso: supongo un paquete)') + '</small></div><div class="sprice"></div>' +
            '<div class="sub-row"><label class="sr-only" for="tk-p-' + i + '">Producto</label><select id="tk-p-' + i + '" data-act="tk-edit" data-i="' + i + '" data-k="id" style="max-width:100%;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 8px"><option value="">No es de mi lista</option>' + ids.map(k => '<option value="' + k + '"' + (k === l.id ? ' selected' : '') + '>' + esc(FOODS[k].buy || FOODS[k].n) + '</option>').join('') + '</select>' +
            (fd ? '<label class="stk" for="tk-v-' + i + '">Por ' + esc(packLabel(fd)) + ' $ <input id="tk-v-' + i + '" type="number" inputmode="decimal" min="1" step="1" value="' + Math.round(l.per) + '" data-act="tk-edit" data-i="' + i + '" data-k="per"></label>' : '') + '</div></li>';
        }).join('') + '</ul><div class="actions" style="margin-top:10px"><button class="btn" data-act="tk-apply">Guardar precios en ' + esc(storeName(tkDraft.store)) + '</button><button class="btn ghost" data-act="tk-discard">Descartar</button></div>';
    }
    return h + '</section>';
  }
  function wireTicket() {
    getSample().then(async sm => {
      const box = qs('#tk-box'), off = qs('#tk-off'); if (!box) return;
      box.hidden = false; off.hidden = true;
      const w = qs('#tk-file-wrap'), f = qs('#tk-file');
      if (STANDALONE) { if (w) w.hidden = false; return; }
      let lim = null; if (sm) { try { lim = await sm.limits(); } catch (e) { lim = null; } }
      if (w && f && lim && lim.images) { w.hidden = false; if (lim.images.mediaTypes && lim.images.mediaTypes.length) f.accept = lim.images.mediaTypes.join(','); }
    });
  }
  async function readTicket() {
    if (tkBusy) return;
    const msg = qs('#tk-msg'), fi = qs('#tk-file'), files = fi && fi.files ? Array.from(fi.files) : [], sid = qs('#tk-store').value;
    let text = (qs('#tk-text').value || '').trim().slice(0, 6000);
    tkText = text;
    if (!text && !files.length) { tkMsg = 'Sube una foto o pega el texto del ticket.'; msg.textContent = tkMsg; return; }
    if (files.length && !STANDALONE) { return readTicketAI(files, text, sid); }
    tkBusy = true; qs('#tk-read').disabled = true;
    let fromPhoto = false;
    try {
      if (files.length) {
        msg.textContent = 'Preparando el lector (la primera vez baja unos MB)…';
        const got = await ocrImages(files, m => { if (m.status === 'recognizing text') msg.textContent = 'Leyendo la foto… ' + Math.round((m.progress || 0) * 100) + ' %'; }).catch(() => null);
        if (got === null) { tkMsg = 'No pude abrir el lector de fotos. Pega el texto del ticket.'; tkBusy = false; render(); return; }
        fromPhoto = true; text = ((text ? text + '\n' : '') + got).slice(0, 6000); tkText = text;
      }
      const r = parseTicketText(text);
      if (!r.lines.length) {
        if (!STANDALONE) { tkBusy = false; return readTicketAI([], text, sid); }
        tkMsg = fromPhoto ? 'Leí la foto pero no encontré renglones con precio. Mira el texto de arriba, corrígelo si hace falta y toca «Leer ticket» otra vez.' : 'No encontré renglones con precio en ese texto.';
        tkBusy = false; render(); return;
      }
      r.lines.forEach(l => { l.per = l.id ? tkPer(l) : 0; l.use = !!l.id && isFinite(l.per) && l.per > 0; });
      tkDraft = { store: sid, total: r.total, lines: r.lines };
      tkMsg = 'Leí ' + r.lines.length + ' renglones, ' + r.lines.filter(l => l.id).length + ' asociados a tu lista. Revisa antes de guardar.' + (fromPhoto ? ' El texto de la foto quedó arriba por si quieres corregirlo.' : '');
    } catch (e) { tkMsg = 'No pude leer el ticket. Pega el texto o prueba con otra foto.'; }
    tkBusy = false; render();
  }
  async function readTicketAI(files, text, sid) {
    if (tkBusy) return;
    const sm = await getSample(); const msg = qs('#tk-msg');
    if (!sm) { tkMsg = 'No encontré renglones con precio. Revisa que el texto incluya los precios, uno por renglón.'; render(); return; }
    tkText = text;
    if (!text && !files.length) { tkMsg = 'Sube una foto o pega el texto del ticket.'; msg.textContent = tkMsg; return; }
    let lim = null; try { lim = await sm.limits(); } catch (e) { lim = null; }
    if (files.length) {
      if (!lim || !lim.images) { msg.textContent = 'Aquí no se pueden enviar fotos. Pega el texto del ticket.'; return; }
      if (files.length > lim.images.maxCount) { msg.textContent = 'Máximo ' + lim.images.maxCount + ' fotos por vez.'; return; }
      const bad = files.find(f => f.size > lim.images.maxInputBytes || (lim.images.mediaTypes && lim.images.mediaTypes.indexOf(f.type) < 0));
      if (bad) { msg.textContent = 'Una foto es muy pesada o de un tipo que no acepto (' + (bad.type || 'desconocido') + ').'; return; }
    }
    tkBusy = true; qs('#tk-read').disabled = true; msg.textContent = 'Leyendo el ticket…';
    const catalog = Object.keys(FOODS).map(id => id + ' = ' + FOODS[id].n + ' (paquete de ' + FOODS[id].pack + ' g' + (FOODS[id].dry ? ', en gramos secos' : '') + ')').join('\n');
    const prompt = 'Lees tickets de supermercado, verdulería o abarrotes de México. ' + (files.length ? 'Las imágenes adjuntas son fotos del ticket. ' : '') + (text ? 'Texto del ticket:\n"""\n' + text + '\n"""\n' : '') +
      '\nExtrae solo los renglones que SÍ aparecen en el ticket; no inventes ninguno. Para cada renglón de comida intenta asociarlo con UN producto del catálogo usando su id exacto, o null si no corresponde claramente.\n\nCatálogo:\n' + catalog +
      '\n\nResponde SOLO con un objeto JSON sin texto adicional: {"total": número o null (el total del ticket), "lineas": [{"texto": "renglón tal como se lee, máximo 60 caracteres", "producto_id": "id del catálogo o null", "precio": importe en pesos de ese renglón, "gramos": gramos o mililitros totales comprados en ese renglón si el ticket los da o se deducen del empaque, si no null}]}';
    try {
      const r = await sm.json(prompt, Object.assign({ modelTier: 'default' }, files.length ? { images: files } : {}));
      const lines = (r && Array.isArray(r.lineas) ? r.lineas : []).slice(0, 60).map(x => {
        const id = x && FOODS[x.producto_id] ? x.producto_id : '', price = Number(x && x.precio), g = Number(x && x.gramos);
        return { t: String((x && x.texto) || '').slice(0, 60) || 'Renglón', id: id, price: price, g: isFinite(g) && g >= 5 && g <= 20000 ? Math.round(g) : null };
      }).filter(l => isFinite(l.price) && l.price > 0 && l.price < 5000);
      if (!lines.length) { tkMsg = 'No pude sacar renglones del ticket. Prueba con una foto más clara o pega el texto.'; tkBusy = false; render(); return; }
      lines.forEach(l => { l.per = l.id ? tkPer(l) : 0; l.use = !!l.id && isFinite(l.per) && l.per > 0; });
      const tot = Number(r && r.total);
      tkDraft = { store: sid, total: isFinite(tot) && tot > 0 && tot < 50000 ? Math.round(tot) : null, lines: lines };
      tkMsg = 'Leí ' + lines.length + ' renglones, ' + lines.filter(l => l.id).length + ' asociados a tu lista. Revisa antes de guardar.';
    } catch (e) {
      if (e && e.code === 'not_granted') tkMsg = 'No diste permiso para leer el ticket.';
      else if (e && e.code === 'rate_limited') tkMsg = 'Llegaste al límite de uso de Claude por ahora. Intenta más tarde.';
      else if (e && e.code === 'image_rejected') tkMsg = 'No pude abrir esa foto. Prueba con otra o pega el texto.';
      else if (e && e.code === 'invalid_json') tkMsg = 'No pude leer la respuesta. Intenta de nuevo o pega el texto del ticket.';
      else tkMsg = 'No pude leer el ticket ahora. Intenta de nuevo más tarde.';
    }
    tkBusy = false; render();
  }

  let samplePromise = null, estimating = false;
  function getSample() {
    if (!samplePromise) samplePromise = (async () => { try { return window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { return null; } })();
    return samplePromise;
  }
  const qtxt = q => String(Math.round(q * 10) / 10).replace(/\.0$/, '');
  function estimateOut(di, slot) {
    const msg = qs('#out-ai-msg'), descEl = qs('#out-desc'), desc = descEl ? descEl.value.trim() : '';
    if (estimating || !msg) return Promise.resolve();
    if (desc.length < 3) { msg.textContent = 'Escribe qué comiste y, si puedes, cuánto.'; return Promise.resolve(); }
    const loc = estimateLocal(desc);
    if (!loc.items.length) return estimateOutAI(di, slot, desc);
    if (loc.k < 50) { msg.textContent = 'Eso suma menos de 50 kcal: no hace falta registrarlo.'; return Promise.resolve(); }
    qs('#out-k').value = Math.min(3000, loc.k); qs('#out-p').value = Math.min(200, loc.p);
    const nm = loc.items.slice(0, 2).map(x => x.name.replace(/ \(.*\)/, '')).join(' y ').slice(0, 40);
    if (nm && !qs('#out-l').value.trim()) qs('#out-l').value = nm;
    msg.innerHTML = '<b>Estimado con la tabla de comidas comunes:</b> ' + fmtN(loc.k) + ' kcal (entre ' + fmtN(loc.lo) + ' y ' + fmtN(loc.hi) + ') y ' + fmtN(loc.p) + ' g de proteína. Conté: ' +
      loc.items.map(x => qtxt(x.qty * x.size) + ' × ' + esc(x.name.toLowerCase())).join(', ') + '.' +
      (loc.unknown.length ? ' <b>No reconocí:</b> ' + esc(loc.unknown.join(', ')) + ' (no lo sumé).' : '') + ' Son cifras aproximadas de porciones típicas: ajusta los números si sabes algo más.';
    outPreview(di, slot);
    return Promise.resolve();
  }
  async function estimateOutAI(di, slot, desc) {
    const msg = qs('#out-ai-msg');
    const sm = await getSample();
    if (!sm) { msg.textContent = 'No reconocí esa comida en mi tabla. Prueba con otras palabras (por ejemplo «3 tacos de pastor y un refresco»), usa la calculadora de abajo o escribe el estimado a mano.'; return; }
    estimating = true; qs('#out-est').disabled = true; msg.textContent = 'Estimando…';
    const prompt = 'Eres un asistente de nutrición. Estima las calorías y la proteína de esta comida tal como la describe la persona. ' +
      'Cuando falten cantidades usa porciones típicas de México (por ejemplo, un taco con tortilla chica de maíz y relleno ≈ 150 a 200 kcal; un refresco de 600 ml ≈ 250 kcal) y suma todo lo que se mencione: bebidas, salsas, tortillas, aceite de fritura. ' +
      'Si algo es ambiguo, elige el supuesto más común y dilo.\n\nComida descrita:\n"""\n' + desc.slice(0, 400) + '\n"""\n\n' +
      'Responde SOLO con un objeto JSON, sin texto adicional, con exactamente estas claves: ' +
      '{"nombre": "nombre corto, máximo 40 caracteres", "kcal": entero, "proteina_g": entero, "kcal_min": entero, "kcal_max": entero, "supuestos": "una frase corta con las porciones que asumiste"}';
    try {
      const r = await sm.json(prompt, { modelTier: 'default' });
      const k = Math.round(Number(r && r.kcal)), p = Math.round(Number(r && r.proteina_g));
      const m2 = qs('#out-ai-msg');
      if (!m2 || !qs('#out-k')) return;
      if (!isFinite(k) || !isFinite(p) || k < 50 || k > 3000 || p < 0 || p > 200) { m2.textContent = 'No obtuve un estimado usable. Escríbelo a mano.'; return; }
      qs('#out-k').value = k; qs('#out-p').value = p;
      const nm = String((r && r.nombre) || '').trim().slice(0, 40);
      if (nm && !qs('#out-l').value.trim()) qs('#out-l').value = nm;
      const lo = Math.round(Number(r.kcal_min)), hi = Math.round(Number(r.kcal_max));
      m2.innerHTML = '<b>Estimado de Claude:</b> ' + fmtN(k) + ' kcal' + (isFinite(lo) && isFinite(hi) && lo > 0 && hi >= lo ? ' (entre ' + fmtN(lo) + ' y ' + fmtN(hi) + ')' : '') + ' y ' + fmtN(p) + ' g de proteína.' +
        (r.supuestos ? ' Supuse: ' + esc(String(r.supuestos).slice(0, 200)) : '') + ' Es una estimación: ajusta los números si sabes algo más.';
      outPreview(di, slot);
    } catch (e) {
      const m3 = qs('#out-ai-msg'); if (!m3) return;
      if (e && e.code === 'not_granted') { const f = qs('#out-ai-form'); if (f) f.hidden = true; m3.textContent = 'No diste permiso para estimar. Escribe el estimado a mano.'; }
      else if (e && e.code === 'rate_limited') m3.textContent = 'Llegaste al límite de uso de Claude por ahora. Escribe el estimado a mano.';
      else m3.textContent = 'No pude estimar ahora. Escribe el estimado a mano.';
    } finally { estimating = false; const b = qs('#out-est'); if (b) b.disabled = false; }
  }
  function outSheet(di, slot) {
    const dd = S.week.days[di], cur = dd.outs[slot] || {};
    const dayName = dateOf(S.week.start, di).toLocaleDateString('es-MX', { weekday: 'long' });
    openSheet('<div class="sheet-head"><div><h2 id="sheet-title">Comí fuera: ' + SLOT_NAME[slot].toLowerCase() + ' del ' + esc(dayName) + '</h2><p class="hint">Escribe tu mejor estimado. El resto del día se reajusta para compensar, y ves el resultado antes de aplicar.</p></div><button class="btn ghost small" data-act="close">Cerrar</button></div>' +
      calcHTML() +
      '<div id="out-ai"><div id="out-ai-form"><div class="fld" style="margin-top:12px"><label for="out-desc">¿No sabes cuántas calorías? Descríbeme qué comiste y cuánto</label><textarea id="out-desc" rows="3" maxlength="400" placeholder="Ej.: 3 tacos al pastor con piña y un refresco de 600 ml"></textarea></div>' +
      '<div class="actions" style="margin-top:8px"><button class="btn small" id="out-est" data-act="out-estimate" data-d="' + di + '" data-s="' + slot + '">Estimar</button></div>' +
      '<p class="hint" style="margin-top:6px">Calcula con una tabla de comidas comunes de México (cifras aproximadas). El resultado se llena abajo y lo puedes corregir.</p></div><p class="hint" id="out-ai-msg" style="margin-top:8px"></p></div>' +
      '<div class="fields" style="margin-top:12px"><div class="fld"><label for="out-k">Calorías estimadas</label><input id="out-k" type="number" inputmode="numeric" min="50" max="3000" value="' + (cur.k || '') + '" data-act="out-prev" data-d="' + di + '" data-s="' + slot + '"></div>' +
      '<div class="fld"><label for="out-p">Proteína estimada (g)</label><input id="out-p" type="number" inputmode="numeric" min="0" max="200" value="' + (cur.p === 0 || cur.p ? cur.p : '') + '" data-act="out-prev" data-d="' + di + '" data-s="' + slot + '"></div>' +
      '<div class="fld"><label for="out-l">Qué comiste (opcional)</label><input id="out-l" type="text" maxlength="40" value="' + esc(cur.label || '') + '"></div></div>' +
      '<p class="after" id="out-res" style="margin:12px 0">Escribe calorías y proteína para ver cómo queda el día.</p>' +
      '<div class="actions"><button class="btn" id="out-apply" data-act="out-apply" data-d="' + di + '" data-s="' + slot + '" disabled>Aplicar</button><button class="btn ghost" data-act="close">Cancelar</button></div>');
    calcLines = []; calcRender();
    if (cur.k) outPreview(di, slot);
  }
  function outPreview(di, slot) {
    const k = parseFloat(qs('#out-k').value), p = parseFloat(qs('#out-p').value), res = qs('#out-res'), btn = qs('#out-apply');
    if (!isFinite(k) || !isFinite(p) || k < 50 || k > 3000 || p < 0 || p > 200) { res.textContent = 'Escribe calorías entre 50 y 3,000 y proteína entre 0 y 200 g.'; btn.disabled = true; return; }
    const tg = targets(S.cfg), dd = S.week.days[di];
    const ev = evalDayAny(defsOf({ dishes: dd.dishes, outs: Object.assign({}, dd.outs, { [slot]: { k: k, p: p } }) }), tg.k, tg.p, expectedSlots(S.cfg));
    res.innerHTML = afterText(ev, tg) + (ev.ok ? '' : '<br>' + esc(dayStatus(ev, tg).txt));
    btn.disabled = false;
  }

  /* ---------- acciones ---------- */
  function rebuild(markReal) {
    const seed = Math.floor(Math.random() * 1e9) + 1, w = makeWeek(S.cfg, seed, haveNow());
    if (w.error) { buildErr = w.error; render(); return false; }
    buildErr = ''; S.week = w; open = new Set(); sel = 0; S.bought = {};
    if (markReal) S.example = false;
    persist();
    return true;
  }
  function act(a, el) {
    switch (a) {
      case 'day': sel = +el.dataset.i; render(); break;
      case 'toggle': {
        const key = el.dataset.key, isOpen = el.getAttribute('aria-expanded') === 'true';
        if (isOpen) open.delete(key); else open.add(key);
        el.setAttribute('aria-expanded', String(!isOpen));
        el.nextElementSibling.hidden = isOpen;
        break;
      }
      case 'swap': swapSheet(+el.dataset.d, el.dataset.s); break;
      case 'swap-apply': {
        const dd = S.week.days[+el.dataset.d];
        dd.dishes[el.dataset.s] = el.dataset.id; delete dd.outs[el.dataset.s]; dd.rep = null; if (dd.subs) delete dd.subs[el.dataset.s]; if (dd.ate) delete dd.ate[el.dataset.s]; S.prevWeek = null; S.example = false;
        persist(); closeSheet(); render(); break;
      }
      case 'out': outSheet(+el.dataset.d, el.dataset.s); break;
      case 'out-apply': {
        const k = parseFloat(qs('#out-k').value), p = parseFloat(qs('#out-p').value);
        if (!isFinite(k) || !isFinite(p)) break;
        { const dd = S.week.days[+el.dataset.d]; dd.outs[el.dataset.s] = { k: Math.round(k), p: Math.round(p), label: qs('#out-l').value.trim().slice(0, 40) }; (dd.ate = dd.ate || {})[el.dataset.s] = true; if (dd.subs) delete dd.subs[el.dataset.s]; }
        persist(); closeSheet(); render(); break;
      }
      case 'out-estimate': estimateOut(+el.dataset.d, el.dataset.s); break;
      case 'out-clear': { const dd = S.week.days[+el.dataset.d]; delete dd.outs[el.dataset.s]; if (dd.ate) delete dd.ate[el.dataset.s]; persist(); render(); break; }
      case 'close': closeSheet(); break;
      case 'rebuild': { const snap = weekHasDishes() ? { week: S.week, bought: S.bought } : null; S.undo = null; if (rebuild(false)) { S.prevWeek = snap; persist(); location.hash = '#semana'; render(); } break; }
      case 'build': { const snap = weekHasDishes() ? { week: S.week, bought: S.bought } : null; S.undo = null; if (rebuild(true)) { S.prevWeek = snap; persist(); location.hash = '#semana'; if (view === 'semana') render(); } break; }
      case 'clear-week': { const snap = weekHasDishes() ? { week: S.week, bought: S.bought } : null; S.week = blankWeek(); S.bought = {}; S.prevWeek = snap; open = new Set(); sel = 0; persist(); render(); break; }
      case 'undo-week': if (S.prevWeek) { S.week = S.prevWeek.week; S.bought = S.prevWeek.bought || {}; if (S.prevWeek.shared) Object.assign(S, S.prevWeek.shared); S.prevWeek = null; open = new Set(); sel = 0; persist(); render(); } break;
      case 'dismiss-prev': S.prevWeek = null; persist(); render(); break;
      case 'slot-clear': { const dd = S.week.days[+el.dataset.d]; delete dd.dishes[el.dataset.s]; delete dd.outs[el.dataset.s]; dd.rep = null; if (dd.subs) delete dd.subs[el.dataset.s]; if (dd.ate) delete dd.ate[el.dataset.s]; S.prevWeek = null; persist(); render(); break; }
      case 'place': placeSheet(el.dataset.id); break;
      case 'place-apply': {
        const di = +el.dataset.d, dd = S.week.days[di], dish = DISH[el.dataset.id];
        dd.dishes[dish.slot] = dish.id; delete dd.outs[dish.slot]; dd.rep = null; if (dd.subs) delete dd.subs[dish.slot]; if (dd.ate) delete dd.ate[dish.slot]; S.prevWeek = null; S.example = false; sel = di;
        recMsg = SLOT_NAME[dish.slot] + ' del ' + dateOf(S.week.start, di).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' }) + ': ' + dish.name + '.';
        if (view === 'semana') flash = recMsg;
        persist(); closeSheet(); render(); break;
      }
      case 'rec-slot': recSlot = el.dataset.s; render(); break;
      case 'compare': compareSheet(); break;
      case 'saver': saverSheet(); break;
      case 'w-add': {
        const d = qs('#w-d').value, kg = parseFloat(String(qs('#w-kg').value).replace(',', '.'));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > isoToday()) { wMsg = 'Elige una fecha válida, de hoy o anterior.'; qs('#w-msg').textContent = wMsg; break; }
        if (!isFinite(kg) || kg < 30 || kg > 250) { wMsg = 'Escribe un peso entre 30 y 250 kg.'; qs('#w-msg').textContent = wMsg; break; }
        S.weights = S.weights.filter(w => w.d !== d); S.weights.push({ d: d, kg: Math.round(kg * 10) / 10 });
        S.weights.sort((a, b) => a.d < b.d ? -1 : 1); if (S.weights.length > 400) S.weights = S.weights.slice(-400);
        wMsg = 'Guardado: ' + fmtN(Math.round(kg * 10) / 10, 1) + ' kg.'; persist(); render(); break;
      }
      case 'w-del': S.weights = S.weights.filter(w => w.d !== el.dataset.d); wMsg = 'Registro quitado.'; persist(); render(); break;
      case 'w-use': { const tr = trendOf(); if (tr) { S.cfg.peso = tr.last.kg; S.example = false; wMsg = 'Actualicé tu peso en las metas.'; persist(); render(); } break; }
      case 'w-adj': { const k = parseInt(el.dataset.k, 10); if (isFinite(k) && k >= 1400 && k <= 4500) { S.cfg.kOv = k; S.example = false; wMsg = 'Tu meta diaria quedó en ' + fmtN(k) + ' kcal (meta propia en Ajustes).'; persist(); render(); } break; }
      case 'calc-add': {
        const it = OUT_ITEMS[+qs('#calc-item').value], q = parseFloat(qs('#calc-qty').value), sz = OUT_SIZE[qs('#calc-size').value];
        if (!it || !isFinite(q) || q < 0.5 || q > 20 || !sz) break;
        const m = q * sz[1];
        calcLines.push({ label: fmtN(q, q % 1 ? 1 : 0) + ' × ' + it[0].toLowerCase() + (sz[1] !== 1 ? ' (' + sz[0].toLowerCase() + ')' : ''), k: it[2] * m, p: it[3] * m });
        calcRender(); break;
      }
      case 'calc-rm': calcLines.splice(+el.dataset.i, 1); calcRender(); break;
      case 'calc-use': {
        const t = calcTotals(); if (!calcLines.length) break;
        qs('#out-k').value = Math.min(3000, Math.max(50, Math.round(t.k))); qs('#out-p').value = Math.min(200, Math.round(t.p));
        if (!qs('#out-l').value.trim()) qs('#out-l').value = calcLines.map(l => l.label).join(', ').slice(0, 40);
        const d = qs('#out-k'); outPreview(+d.dataset.d, d.dataset.s); break;
      }
      case 'tk-read': readTicket(); break;
      case 'tk-discard': tkDraft = null; tkMsg = ''; render(); break;
      case 'tk-apply': {
        if (!tkDraft) break;
        const by = {};
        tkDraft.lines.forEach(l => { if (l.use && FOODS[l.id] && isFinite(l.per) && l.per > 0 && l.per <= 5000) (by[l.id] = by[l.id] || []).push(l.per); });
        const ids = Object.keys(by); if (!ids.length) { tkMsg = 'No hay renglones marcados con producto y precio válido.'; render(); break; }
        const sid = tkDraft.store; S.prices[sid] = S.prices[sid] || {};
        ids.forEach(id => { S.prices[sid][id] = Math.round(by[id].reduce((a, b) => a + b, 0) / by[id].length); });
        tkMsg = 'Guardé ' + ids.length + (ids.length === 1 ? ' precio' : ' precios') + ' de ' + storeName(sid) + '. Ya se usan en tu lista (verás «tu precio» en cada producto).';
        tkDraft = null; S.example = false; persist(); render(); break;
      }
      case 'fav': { const id = el.dataset.id; if (S.fav[id]) delete S.fav[id]; else S.fav[id] = true; persist(); render(); break; }
      case 'ate': { const dd = S.week.days[+el.dataset.d]; dd.ate = dd.ate || {}; if (dd.ate[el.dataset.s]) delete dd.ate[el.dataset.s]; else dd.ate[el.dataset.s] = true; persist(); render(); break; }
      case 'sub': subSheet(+el.dataset.d, el.dataset.s, el.dataset.f); break;
      case 'sub-apply': {
        const dd = S.week.days[+el.dataset.d], slot = el.dataset.s, o = el.dataset.o, id = el.dataset.id;
        dd.subs = dd.subs || {}; const cur = Object.assign({}, dd.subs[slot] || {});
        if (id === o) delete cur[o]; else cur[o] = id;
        if (Object.keys(cur).length) dd.subs[slot] = cur; else delete dd.subs[slot];
        S.prevWeek = null; persist(); closeSheet(); render(); break;
      }
      case 'sub-clear': { const dd = S.week.days[+el.dataset.d]; if (dd.subs) delete dd.subs[el.dataset.s]; persist(); render(); break; }
      case 'cr-new': crDraft = { id: null, name: '', slot: recSlot !== 'all' && SLOTS_ALL.indexOf(recSlot) >= 0 ? recSlot : 'com', min: 20, serv: 1, how: '', ing: [{ f: 'pollo', g: 150, r: '' }, { f: 'arroz', g: 80, r: '' }] }; crDelAsk = false; crSheet(); break;
      case 'cr-edit': { const d = S.custom.find(c => c.id === el.dataset.id); if (!d) break; crDraft = { id: d.id, name: d.name, slot: d.slot, min: d.min, serv: d.serv || 1, how: d.how || '', ing: d.ing.map(i => ({ f: i.f, g: i.g, r: i.r })) }; crDelAsk = false; crSheet(); break; }
      case 'cr-add': { crRead(); const used = new Set(crDraft.ing.map(i => i.f)); const nf = ['jitomate', 'cebolla', 'zanahoria', 'lechuga', 'aguacate'].concat(Object.keys(FOODS)).find(f => FOODS[f] && !used.has(f)) || 'jitomate'; crDraft.ing.push({ f: nf, g: 100, r: '' }); pk = { ctx: 'cr', i: crDraft.ing.length - 1, q: '', isNew: true }; pickerSheet(); break; }
      case 'pick-food': crRead(); pk = { ctx: 'cr', i: +el.dataset.i, q: '', isNew: false }; pickerSheet(); break;
      case 'pick-add': { const g = qs('#add-g'); if (g) addG = g.value; pk = { ctx: 'add', q: '', isNew: false }; pickerSheet(); break; }
      case 'pk-pick': pkPick(el.dataset.id); break;
      case 'pk-back': pkBack(); break;
      case 'fd-new': {
        let from = el.dataset.from, tgt = null;
        if (from === 'pk' && pk) { tgt = pk; from = pk.ctx === 'cr' ? 'cr' : 'add'; pk = null; }
        else if (from === 'cr') crRead();
        fdDraft = fdBlank(from); if (tgt && tgt.ctx === 'cr') { fdDraft.tgt = tgt.i; fdDraft.tgtNew = !!tgt.isNew; }
        fdSheet(); break;
      }
      case 'fd-list': fdListSheet(); break;
      case 'fd-prop': proposalSheet(el.dataset.id); break;
      case 'prices-share': pricesShareSheet(); break;
      case 'fd-bundle': bundleSheet(); break;
      case 'rec-prop': recProposeOne(el.dataset.id); break;
      case 'rec-bundle': recBundle(); break;
      case 'rec-sent': recMark(); break;
      case 'bundle-sent': foodMark(bundleOut); bundleOut = []; break;
      case 'prop-sent': foodMark([el.dataset.id]); break;
      case 'prices-sent': pricesMarkSent(); break;
      case 'fd-edit': { const f = FOODS[el.dataset.id]; if (!f || !f.mine) break; fdDraft = fdFrom(f, el.dataset.from); fdSheet(); break; }
      case 'fd-save': fdSave(); break;
      case 'fd-cancel': fdBack(); break;
      case 'fd-del': fdRead(); fdDelAsk = true; fdSheet(); break;
      case 'fd-del2': fdDelete(); break;
      case 'cr-rm': crRead(); crDraft.ing.splice(+el.dataset.i, 1); crSheet(); break;
      case 'cr-save': crSave(); break;
      case 'cr-del': crRead(); crDelAsk = true; crSheet(); break;
      case 'cr-del2': crDelete(); break;
      case 'share': textSheet('Lista de compras', 'Copia el texto y pégalo donde quieras, por ejemplo en WhatsApp.', listText(currentShop())); break;
      case 'pt-add': S.partner = cleanPartner({ name: 'Mi pareja', cfg: Object.assign(defaultCfg(), { sexo: 'm', edad: 32, peso: 65, talla: 162, meta: 'mantener' }) }); persist(); render(); break;
      case 'pt-del': S.partner = null; persist(); render(); break;
      case 'plan-send': planSendSheet(); break;
      case 'plan-recv': planRecvSheet(); break;
      case 'rv-check': {
        const res = qs('#rv-res'), ap = qs('#rv-apply'), lab = qs('#rv-lab');
        ap.hidden = true; lab.style.display = 'none'; rvPending = null;
        const r = parsePlan(qs('#rv-text').value);
        if (r.error) { res.textContent = r.error; break; }
        rvPending = r.plan; res.textContent = r.summary + ' Si lo adoptas, reemplaza tu semana, tu tienda, tus precios y lo que tienes en casa (puedes deshacerlo desde Semana).';
        if (r.plan.cfg && cleanCfg(r.plan.cfg)) {
          const nm = (r.plan.from || '').trim() || 'mi pareja';
          qs('#rv-partner-t').textContent = (S.partner ? 'Actualizar las metas de ' + S.partner.name + ' con las de ' + nm : 'Guardar a ' + nm + ' como mi pareja, con sus metas') + '.';
          qs('#rv-partner').checked = true; lab.style.display = 'flex';
        }
        ap.hidden = false; break;
      }
      case 'rv-apply': {
        if (!rvPending) break;
        const plan = rvPending, wantP = qs('#rv-partner') && qs('#rv-partner').checked && qs('#rv-lab').style.display !== 'none';
        const cand = planCandidate(plan);
        if (!normalize(JSON.parse(JSON.stringify(cand)), false)) break;
        const snap = weekHasDishes() ? { week: S.week, bought: S.bought, shared: { store: S.store, aisleStore: S.aisleStore, factors: S.factors, prices: S.prices, staples: S.staples, stock: S.stock, budget: S.budget } } : null;
        S.custom.forEach(c => unregisterCustom(c.id)); S.foods.forEach(f => unregisterFood(f.id));
        const n = normalize(cand, true);
        n.prevWeek = snap; n.undo = null;
        if (wantP) n.partner = cleanPartner({ name: (plan.from || '').trim() || 'Mi pareja', cfg: plan.cfg });
        rvPending = null; S = n; open = new Set(); sel = Math.max(0, Math.min(6, dayIndexToday(S.week.start)));
        persist(); closeSheet(); location.hash = '#semana'; render(); break;
      }
      case 'bk-copy': textSheet('Respaldo', 'Copia este texto y guárdalo en un lugar seguro. Para restaurar, pégalo en «Restaurar un respaldo».', backupText()); break;
      case 'copy-text': {
        const ta = qs('#share-text'), msg = qs('#copy-msg');
        ta.focus(); ta.select();
        const done = ok => { if (msg) msg.textContent = ok ? 'Copiado.' : 'Selecciona el texto y cópialo con tu teclado o con el menú del navegador.'; };
        try { navigator.clipboard.writeText(ta.value).then(() => done(true), () => done(false)); } catch (e) { done(false); }
        break;
      }
      case 'bk-download': {
        const msg = qs('#bk-msg');
        getDownloads().then(dl => dl ? dl.save({ filename: 'semana-medida-respaldo-' + isoToday() + '.json', data: backupText() }) : null)
          .then(r => { if (msg && r !== null) msg.textContent = 'Listo: revisa tu carpeta de descargas.'; })
          .catch(() => { const m2 = qs('#bk-msg'); if (m2) m2.textContent = 'No se pudo descargar. Usa «Copiar respaldo como texto».'; });
        break;
      }
      case 'bk-restore': restoreSheet(); break;
      case 'bk-check': {
        const txt = (qs('#bk-text').value || '').trim(), res = qs('#bk-res'), ap = qs('#bk-apply');
        ap.hidden = true; bkPending = null;
        if (!txt) { res.textContent = 'Elige un archivo o pega el texto del respaldo.'; break; }
        const r = parseBackup(txt);
        if (r.error) { res.textContent = r.error; break; }
        bkPending = r.data; res.textContent = r.summary + ' Si sigues, reemplazo todo lo que tienes ahora.'; ap.hidden = false; break;
      }
      case 'bk-apply': {
        if (!bkPending) break;
        const fresh = normalize(JSON.parse(JSON.stringify(bkPending)), false); if (!fresh) break;
        S.custom.forEach(c => unregisterCustom(c.id)); S.foods.forEach(f => unregisterFood(f.id));
        const n = normalize(JSON.parse(JSON.stringify(bkPending)), true);
        S = n; bkPending = null; open = new Set(); sel = Math.max(0, Math.min(6, dayIndexToday(S.week.start))); persist(); closeSheet(); route(); break;
      }
      case 'edit-price': editPrice = el.dataset.f; render(); { const i = qs('#pe-' + el.dataset.f); if (i) { i.focus(); i.select(); } } break;
      case 'cancel-price': editPrice = null; render(); break;
      case 'save-price': {
        const v = parseFloat(qs('#pe-' + el.dataset.f).value);
        const sid = el.dataset.sid || S.store;
        if (isFinite(v) && v >= 0) { S.prices[sid] = S.prices[sid] || {}; S.prices[sid][el.dataset.f] = Math.round(v); persist(); }
        editPrice = null; render(); break;
      }
      case 'clear-price': { const sid = el.dataset.sid || S.store; if (S.prices[sid]) delete S.prices[sid][el.dataset.f]; } editPrice = null; persist(); render(); break;
      case 'calibrate': {
        const t = parseFloat(qs('#ticket').value), sid = qs('#cal-store').value, nm = storeName(sid);
        if (!isFinite(t) || t <= 0) { calMsg = 'Escribe el total de tu ticket.'; render(); break; }
        const f = calibrateFactor(currentShop().filter(r => r.sid === sid), t);
        if (f === null) calMsg = 'No pude ajustar: el ticket es menor que los precios que ya fijaste en ' + nm + ', o no hay productos sin precio propio en esa tienda.';
        else { S.factors[sid] = f; persist(); calMsg = 'Listo: factor ×' + f.toFixed(2) + ' para ' + nm + '. Sus productos de esta lista suman cerca de ' + money(t) + '.'; }
        render(); break;
      }
      case 'add-stock': {
        const id = qs('#add-f').value, g = parseFloat(qs('#add-g').value);
        if (!FOODS[id]) { addG = qs('#add-g').value; pk = { ctx: 'add', q: '', isNew: false }; pickerSheet(); break; }
        if (isFinite(g) && g > 0) S.stock[id] = Math.round(g); else S.staples[id] = true;
        addPick = ''; addG = ''; S.example = false; persist(); render(); break;
      }
      case 'close-week': {
        const tg = targets(S.cfg), rows = currentShop(null, tg), prev = { stock: S.stock, week: S.week, bought: S.bought, example: S.example };
        S.stock = nextStock(rows, S.stock);
        S.week = blankWeek(); S.bought = {}; S.example = false; S.prevWeek = null; open = new Set(); sel = 0;
        S.undo = prev; persist(); render(); break;
      }
      case 'undo-close':
        if (S.undo) { S.stock = S.undo.stock; S.week = S.undo.week; S.bought = S.undo.bought; S.example = S.undo.example; S.undo = null; open = new Set(); sel = 0; persist(); render(); }
        break;
      case 'reset-factor': delete S.factors[el.dataset.sid || S.store]; persist(); calMsg = ''; render(); break;
    }
  }

  document.addEventListener('click', e => {
    const tg = e.target.closest('a[data-tgcopy]');
    if (tg) { const ta = qs('#share-text'); if (ta) { try { navigator.clipboard.writeText(ta.value).catch(() => {}); } catch (er) { /* sin portapapeles */ } } }
    const b = e.target.closest('button[data-act], a[data-act]');
    if (b) act(b.dataset.act, b);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bk-file' && t.files && t.files[0]) { const fr = new FileReader(); fr.onload = () => { const ta = qs('#bk-text'); if (ta) ta.value = String(fr.result || ''); }; fr.readAsText(t.files[0]); return; }
    if (t.dataset.act === 'cr-sum') { crSumUpdate(); return; }
    if (t.dataset.act === 'sh-cfg') { const ta = qs('#share-text'); if (ta) ta.value = planCode(t.checked); return; }
    if (t.dataset.pc) {
      const k = t.dataset.pc;
      if (k === 'myName') { S.myName = t.value.trim().slice(0, 30); persist(); return; }
      if (!S.partner) return;
      if (k === 'name') S.partner.name = t.value.trim().slice(0, 30) || 'Mi pareja';
      else if (k in NUMS && NUMS[k]) { const v = parseFloat(String(t.value).replace(',', '.')); if (isFinite(v)) S.partner.cfg[k] = Math.min(NUMS[k][1], Math.max(NUMS[k][0], v)); }
      else if (k === 'act') S.partner.cfg.act = Number(t.value);
      else S.partner.cfg[k] = t.value;
      persist(); render(); return;
    }
    if (t.dataset.act === 'tk-edit'  && tkDraft) {
      const l = tkDraft.lines[+t.dataset.i]; if (!l) return;
      if (t.dataset.k === 'use') l.use = t.checked;
      else if (t.dataset.k === 'id') { l.id = FOODS[t.value] ? t.value : ''; l.per = l.id ? tkPer(l) : 0; l.use = !!l.id && isFinite(l.per) && l.per > 0; }
      else if (t.dataset.k === 'per') { const v = parseFloat(t.value); l.per = isFinite(v) && v > 0 ? v : l.per; }
      render(); return;
    }
    if (t.dataset.cfg) { readCfg(t, true); persist(); if (view === 'ajustes') { const box = qs('#targets'); if (box) box.innerHTML = targetsHTML(); } render(); return; }
    switch (t.dataset.act) {
      case 'aisle-store': if (t.value) S.aisleStore[2] = t.value; else delete S.aisleStore[2]; calMsg = ''; persist(); render(); break;
      case 'store': S.store = t.value; if (S.aisleStore[2] === t.value) delete S.aisleStore[2]; editPrice = null; calMsg = ''; persist(); render(); break;
      case 'budget': { const v = parseFloat(t.value); S.budget = isFinite(v) && v >= 0 ? Math.round(v) : S.budget; persist(); render(); break; }
      case 'bought': S.bought[t.dataset.f] = t.checked; persist(); render(); break;
      case 'staple': if (t.checked) S.staples[t.dataset.f] = true; else delete S.staples[t.dataset.f]; S.example = false; persist(); render(); break;
      case 'stock': { const v = parseFloat(t.value); if (isFinite(v) && v > 0) S.stock[t.dataset.f] = Math.round(v); else delete S.stock[t.dataset.f]; S.example = false; persist(); render(); break; }
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.act === 'glass') { const v = +t.value; glassApply(v); try { localStorage.setItem(GKEY, String(v)); } catch (er) { /* sin almacenamiento */ } return; }
    if (t.dataset.cfg && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      readCfg(t, false);
      const box = qs('#targets'); if (box) box.innerHTML = targetsHTML();
    }
    if (t.dataset.act === 'out-prev') outPreview(+t.dataset.d, t.dataset.s);
    if (t.dataset.act === 'cr-sum') crSumUpdate();
    if (t.dataset.act === 'pk-q' && pk) { pk.q = t.value; const box = qs('#pk-list'); if (box) { box.innerHTML = pkListHTML(); box.scrollTop = 0; } pkCount(); }
    if (t.dataset.act === 'sub-q') subFilter(t.value);
    if (t.dataset.act === 'tk-text') tkText = t.value;
    if (t.dataset.act === 'rec-q') { recQ = t.value; const box = qs('#rec-list'); if (box) box.innerHTML = recListHTML(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !qs('#sheet').hidden) { if (pk) pkBack(); else closeSheet(); } });
  qs('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  window.addEventListener('hashchange', route);
  if (STANDALONE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  document.addEventListener('submit', e => e.preventDefault());

  function readCfg(t, final) {
    const k = t.dataset.cfg;
    S.example = false;
    if (t.type === 'checkbox') {
      if (k === 'excl') { const set = new Set(S.cfg.excl); if (t.checked) set.add(t.value); else set.delete(t.value); S.cfg.excl = Array.from(set); }
      else S.cfg[k] = t.checked;
      return;
    }
    if (!(k in NUMS)) { S.cfg[k] = t.value; return; }
    if (t.value === '') {
      if (k === 'kOv' || k === 'pOv') S.cfg[k] = null;
      else if (final) t.value = S.cfg[k];
      return;
    }
    let v = parseFloat(String(t.value).replace(',', '.'));
    if (!isFinite(v)) return;
    const r = NUMS[k];
    if (r) { if (final) { v = Math.min(r[1], Math.max(r[0], v)); t.value = v; } else if (v < r[0] || v > r[1]) return; }
    S.cfg[k] = v;
  }

  route();
})();
