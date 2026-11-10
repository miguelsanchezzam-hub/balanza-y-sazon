/* Motor del plan: metas, solución por día, búsqueda de combinaciones. Sin DOM. */
const DISH = Object.fromEntries(DISHES.map(d => [d.id, d]));
const SLOTS_ALL = ['des', 'com', 'cen', 'sna'];
const SLOT_NAME = { des: 'Desayuno', com: 'Comida', cen: 'Cena', sna: 'Colación' };
const DIETS = { todo: [], sincerdo: ['cerdo'], sinroja: ['res', 'cerdo'], vegetariano: ['res', 'cerdo', 'pollo', 'pescado'] };

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Metas diarias: Mifflin-St Jeor × actividad, ajuste por objetivo, proteína por kg. */
function targets(cfg) {
  const bmr = 10 * cfg.peso + 6.25 * cfg.talla - 5 * cfg.edad + (cfg.sexo === 'h' ? 5 : -161);
  const tdee = bmr * cfg.act;
  const adj = { bajar: -0.18, mantener: 0, subir: 0.10 }[cfg.meta];
  const pk = { bajar: 1.8, mantener: 1.6, subir: 1.8 }[cfg.meta];
  const kAuto = clamp(Math.round(tdee * (1 + adj) / 10) * 10, 1400, 4500);
  const pAuto = clamp(Math.round(cfg.peso * pk / 5) * 5, 50, 260);
  const k = cfg.kOv ? clamp(Math.round(cfg.kOv), 1200, 4500) : kAuto;
  const p = cfg.pOv ? clamp(Math.round(cfg.pOv), 40, 300) : pAuto;
  return { bmr, tdee, kAuto, pAuto, k, p };
}

function excludedTags(cfg) {
  const t = new Set(DIETS[cfg.dieta] || []);
  (cfg.excl || []).forEach(x => t.add(x));
  return t;
}
function dishAllowed(d, ex) { return d.ing.every(i => !FOODS[i.f].tags.some(t => ex.has(t))); }
function poolsFor(cfg) {
  const ex = excludedTags(cfg), o = {};
  for (const s of SLOTS_ALL) o[s] = DISHES.filter(d => d.slot === s && dishAllowed(d, ex));
  return o;
}
function shares(withSnack) {
  return withSnack ? { des: 0.25, com: 0.35, cen: 0.30, sna: 0.10 } : { des: 0.27, com: 0.40, cen: 0.33 };
}

function roundG(food, g) {
  if (food.unitG) return Math.max(1, Math.round(g / food.unitG)) * food.unitG;
  const st = food.step || 5;
  return Math.max(st, Math.round(g / st) * st);
}
function itemFor(id, g) {
  const fd = FOODS[id];
  return { f: id, g, k: fd.k * g / 100, p: fd.p * g / 100, c: fd.c * g / 100, fat: fd.fat * g / 100 };
}
function sumItems(items) {
  return items.reduce((s, i) => ({ k: s.k + i.k, p: s.p + i.p, c: s.c + i.c, fat: s.fat + i.fat }), { k: 0, p: 0, c: 0, fat: 0 });
}

/* Clase de un alimento según lo que aporta: P proteína (se ajusta), B base (se ajusta), V fija (verduras y fruta de pocas calorías). */
function foodClass(id) {
  const f = FOODS[id];
  if (f.p >= 8 && f.p * 4 / f.k >= 0.20) return 'P';
  if (f.k < 70) return 'V';
  return 'B';
}
/* Ingredientes efectivos de un platillo, con las sustituciones de ese día: subs = { alimentoOriginal: alimentoNuevo }. */
function subGrams(ing, to) {
  const a = FOODS[ing.f], b = FOODS[to];
  const g = ing.r === 'P' && a.p > 0 && b.p > 0 ? ing.g * a.p / b.p : ing.g * a.k / Math.max(1, b.k);
  return Math.round(Math.min(800, Math.max(5, g)));
}
function effIng(dishId, subs) {
  const base = DISH[dishId].ing;
  if (!subs) return base;
  return base.map(ing => { const to = subs[ing.f]; return to && FOODS[to] ? { f: to, g: subGrams(ing, to), r: ing.r } : ing; });
}

/* Resuelve dos escalas: a para ingredientes P (proteína) y b para B (base), de modo que el día llegue a K kcal y P g de proteína. */
function solveScales(defs, K, P) {
  let Kf = 0, Pf = 0, Kp = 0, Pp = 0, Kb = 0, Pb = 0;
  for (const m of defs) {
    if (m.out) { Kf += m.out.k; Pf += m.out.p; continue; }
    for (const ing of effIng(m.dish, m.subs)) {
      const fd = FOODS[ing.f], k = fd.k * ing.g / 100, p = fd.p * ing.g / 100;
      if (ing.r === 'P') { Kp += k; Pp += p; } else if (ing.r === 'B') { Kb += k; Pb += p; } else { Kf += k; Pf += p; }
    }
  }
  const K2 = K - Kf, P2 = P - Pf;
  if (Kp + Kb < 1e-6) return { a: 1, b: 1, fixedOnly: true };
  const det = Kp * Pb - Kb * Pp;
  if (Math.abs(det) > 0.03 * (Kp * Pb + Kb * Pp)) {
    return { a: (K2 * Pb - Kb * P2) / det, b: (Kp * P2 - K2 * Pp) / det };
  }
  const s = K2 / (Kp + Kb);
  return { a: s, b: s };
}

function buildMeal(slot, dishId, a, b, subs) {
  const items = effIng(dishId, subs).map(ing => {
    const mult = ing.r === 'P' ? a : ing.r === 'B' ? b : 1;
    return itemFor(ing.f, roundG(FOODS[ing.f], ing.g * mult));
  });
  return { slot, dish: dishId, items, ...sumItems(items) };
}

/* defs: [{slot, dish} | {slot, out:{k,p,label}}]. Devuelve el día con totales y estado. */
function evalDay(defs, K, P) {
  const sc = solveScales(defs, K, P);
  const hasOut = defs.some(m => m.out);
  const sh = shares(defs.some(m => m.slot === 'sna'));
  const meals = defs.map(m => m.out
    ? { slot: m.slot, out: m.out, items: [], k: m.out.k, p: m.out.p, c: 0, fat: 0 }
    : buildMeal(m.slot, m.dish, sc.a, sc.b, m.subs));
  const tot = sumItems(meals);
  const errK = (tot.k - K) / K, errP = (tot.p - P) / P;
  const kOK = Math.abs(errK) <= 0.05;
  const pOK = tot.p >= 0.95 * P && tot.p <= 1.3 * P;
  const scaleOK = sc.a >= 0.4 && sc.a <= 2.6 && sc.b >= 0.4 && sc.b <= 2.6;
  let rangeOK = true;
  if (!hasOut) for (const m of meals) { const rel = m.k / (K * (sh[m.slot] || 0.1)); if (rel < 0.5 || rel > 1.6) rangeOK = false; }
  return { meals, tot, a: sc.a, b: sc.b, errK, errP, kOK, pOK, scaleOK, rangeOK, ok: kOK && pOK && scaleOK && rangeOK };
}

function weightedPick(list, used, rng) {
  const w = list.map(d => 1 / Math.pow(1 + (used[d.id] || 0), 2));
  let r = rng() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i].id; }
  return list[list.length - 1].id;
}

function dishFoods(id) { return DISH[id].ing.map(i => i.f); }

/* Busca una combinación que cumpla la banda del día. Prefiere platillos poco repetidos, ingredientes que ya se compran esa semana
   (cada ingrediente nuevo obliga a comprar un paquete completo) y ingredientes que ya hay en casa. */
function findDay(pools, slots, fixed, used, usedFoods, have, K, P, rng) {
  let best = null, bestScore = Infinity, passes = 0;
  for (let t = 0; t < 500; t++) {
    const pick = {};
    for (const s of slots) pick[s] = fixed && fixed[s] ? fixed[s] : weightedPick(pools[s], used, rng);
    const ev = evalDay(slots.map(s => ({ slot: s, dish: pick[s] })), K, P);
    const rep = slots.reduce((n, s) => n + (fixed && fixed[s] ? 0 : (used[pick[s]] || 0)), 0);
    const fresh = new Set(), home = new Set();
    for (const s of slots) if (!(fixed && fixed[s])) for (const f of dishFoods(pick[s])) {
      if (FOODS[f].price < 20) continue;
      if (have.has(f)) home.add(f); else if (!usedFoods.has(f)) fresh.add(f);
    }
    const score = (ev.ok ? 0 : 1000) + Math.abs(ev.errK) * 100 + Math.max(0, -ev.errP) * 100 + rep * 2 + fresh.size * 1.6 - home.size * 0.8;
    if (score < bestScore) { bestScore = score; best = { pick, ev }; }
    if (ev.ok && ++passes >= 60) break;
  }
  return best;
}

/* Arma 7 días. Con repeat > 1, comida y cena se repiten en bloques de ese tamaño. */
function planWeek(cfg, tg, seed, have) {
  const rng = mulberry32(seed), pools = poolsFor(cfg);
  const warns = [];
  for (const s of ['des', 'com', 'cen']) {
    if (!pools[s].length) return { error: `Con esas restricciones no queda ningún platillo de ${SLOT_NAME[s].toLowerCase()}. Quita alguna restricción.` };
    if (pools[s].length < 3) warns.push(pools[s].length === 1
      ? `Solo hay 1 opción de ${SLOT_NAME[s].toLowerCase()}, así que se repetirá todos los días.`
      : `Solo hay ${pools[s].length} opciones de ${SLOT_NAME[s].toLowerCase()}, así que se repetirán.`);
  }
  let snack = !!cfg.snack;
  if (snack && !pools.sna.length) { snack = false; warns.push('Con esas restricciones no hay colaciones, así que el plan va sin ellas.'); }
  const slots = snack ? SLOTS_ALL : ['des', 'com', 'cen'];
  const used = {}, usedFoods = new Set(have || []), home = have || new Set(), days = [];
  for (let d = 0; d < 7; d++) {
    let fixed = null, repeatOf = null;
    if (cfg.repeat > 1 && d % cfg.repeat !== 0) {
      repeatOf = d - (d % cfg.repeat);
      fixed = { com: days[repeatOf].dishes.com, cen: days[repeatOf].dishes.cen };
    }
    const r = findDay(pools, slots, fixed, used, usedFoods, home, tg.k, tg.p, rng);
    for (const s of slots) { if (!(fixed && fixed[s])) used[r.pick[s]] = (used[r.pick[s]] || 0) + 1; dishFoods(r.pick[s]).forEach(f => usedFoods.add(f)); }
    days.push({ dishes: r.pick, repeatOf });
  }
  return { days, warns, snack };
}

/* Comidas que se esperan en un día completo. */
function expectedSlots(cfg) {
  return ['des', 'com', 'cen'].concat(cfg.snack && poolsFor(cfg).sna.length ? ['sna'] : []);
}
/* Día con cualquier cantidad de comidas elegidas. Si faltan comidas, cada una se dimensiona a su parte de la meta del día
   (desayuno 25 %, comida 35 %, cena 30 %, colación 10 %) y el día se compara con la parte que ya cubre. */
function evalDayAny(defs, K, P, expected) {
  const have = new Set(defs.map(m => m.slot));
  const present = defs.map(m => m.slot);
  const all = expected.slice(); present.forEach(s => { if (all.indexOf(s) < 0) all.push(s); });
  const missing = expected.filter(s => !have.has(s));
  if (!defs.length) return { meals: [], tot: { k: 0, p: 0, c: 0, fat: 0 }, empty: true, partial: true, missing: missing, fK: 0, fP: 0, ok: false, kOK: false, pOK: false, scaleOK: true, rangeOK: true, errK: -1, errP: -1, a: 1, b: 1 };
  if (!missing.length) return Object.assign(evalDay(defs, K, P), { missing: [], partial: false });
  /* Día incompleto: cada platillo se escala solo para llegar a su parte de las calorías; la proteína se informa pero no se fuerza.
     Al completar el día, el ajuste de dos palancas reparte las porciones para llegar también a la proteína. */
  const sh = shares(expected.indexOf('sna') >= 0);
  const f = defs.reduce((x, m) => x + (sh[m.slot] || 0.1), 0);
  let scaleOK = true;
  const meals = defs.map(m => {
    if (m.out) return { slot: m.slot, out: m.out, items: [], k: m.out.k, p: m.out.p, c: 0, fat: 0 };
    let Kv = 0, Kpb = 0;
    for (const ing of effIng(m.dish, m.subs)) { const kk = FOODS[ing.f].k * ing.g / 100; if (ing.r === 'V') Kv += kk; else Kpb += kk; }
    const target = K * (sh[m.slot] || 0.1);
    const sc = Kpb > 1e-6 ? Math.max(0.05, (target - Kv) / Kpb) : 1;
    if (sc < 0.4 || sc > 2.6) scaleOK = false;
    return Object.assign(buildMeal(m.slot, m.dish, sc, sc, m.subs), { scale: sc });
  });
  const tot = sumItems(meals);
  const fK = K * f, fP = P * f;
  const kOK = Math.abs(tot.k - fK) / fK <= 0.15;
  return { meals: meals, tot: tot, missing: missing, partial: true, fK: fK, fP: fP, a: 1, b: 1, errK: (tot.k - fK) / fK, errP: (tot.p - fP) / fP, kOK: kOK, pOK: true, scaleOK: scaleOK, rangeOK: true, ok: kOK && scaleOK };
}

function defsOf(dd) {
  return SLOTS_ALL.filter(s => dd.dishes[s] || (dd.outs && dd.outs[s])).map(s => dd.outs && dd.outs[s] ? { slot: s, out: dd.outs[s] } : { slot: s, dish: dd.dishes[s], subs: dd.subs && dd.subs[s] && Object.keys(dd.subs[s]).length ? dd.subs[s] : undefined });
}

/* Compras: gramos de toda la semana → paquetes completos → precio por tienda. */
function storeFactor(factors, storeId) {
  const st = STORES.find(s => s.id === storeId) || STORES[2];
  return factors && typeof factors[storeId] === 'number' ? factors[storeId] : st.f;
}
/* Alimentos que duran más de una semana: sus sobrantes se guardan para la siguiente. El resto (hoja verde, carne, lácteos, pan) se echa a perder. */
const KEEPS = new Set(['arroz', 'pasta', 'avena', 'frijol', 'lenteja', 'garbanzo', 'aceite', 'cacahuate', 'almendra', 'atun', 'papa', 'camote', 'cebolla', 'zanahoria', 'huevo', 'manzana'].concat(typeof MORE_KEEPS !== 'undefined' ? MORE_KEEPS : []));

/* stock: gramos que ya hay en casa (en gramos de compra: secos para legumbres). staples: lo que siempre hay y nunca se compra. */
function shopRows(dayEvs, people, storeId, factors, prices, staples, stock, aisleStores, more) {
  const need = {};
  for (const ev of dayEvs) for (const m of ev.meals) for (const it of m.items) need[it.f] = (need[it.f] || 0) + it.g * people;
  /* more: porciones de otras personas de la casa, [{evs, people}] */
  for (const x of (more || [])) for (const ev of x.evs) for (const m of ev.meals) for (const it of m.items) need[it.f] = (need[it.f] || 0) + it.g * x.people;
  return Object.keys(need).map(id => {
    const fd = FOODS[id];
    const sid = (aisleStores && aisleStores[fd.aisle]) || storeId;
    const fac = storeFactor(factors, sid);
    const ov = (prices && prices[sid]) || {};
    const buyG = need[id] / (fd.dry || 1);
    const exact = buyG / fd.pack;
    const staple = !!(staples && staples[id]);
    const have = staple ? 0 : Math.max(0, (stock && stock[id]) || 0);
    const net = Math.max(0, buyG - have);
    const packs = staple || net < 0.5 ? 0 : Math.ceil(net / fd.pack - 1e-9);
    const over = typeof ov[id] === 'number';
    const unit = over ? ov[id] : Math.round(fd.price * fac);
    const leftover = staple ? null : have + packs * fd.pack - buyG;
    return { id, fd, sid, need: need[id], buyG, exact, net, have, packs, unit, over, eaten: exact * unit, paid: packs * unit, staple, leftover };
  });
}
function shopTotals(rows) {
  return { eaten: rows.reduce((s, r) => s + r.eaten, 0), paid: rows.reduce((s, r) => s + r.paid, 0) };
}
/* Factor que hace que el total de la lista iguale tu ticket, respetando los precios que tú ya corregiste. */
function calibrateFactor(rows, ticket) {
  const act = rows.filter(r => r.packs > 0);
  const ovSum = act.filter(r => r.over).reduce((s, r) => s + r.paid, 0);
  const baseSum = act.filter(r => !r.over).reduce((s, r) => s + r.packs * r.fd.price, 0);
  if (baseSum <= 0) return null;
  const f = (ticket - ovSum) / baseSum;
  return f > 0 ? clamp(f, 0.4, 2.5) : null;
}
/* Despensa de la semana siguiente: lo que había más lo que sobra de cada paquete, solo de lo que dura. */
function nextStock(rows, stock) {
  const out = {};
  for (const k in stock) if (KEEPS.has(k)) out[k] = stock[k];
  for (const r of rows) {
    if (r.staple) continue;
    out[r.id] = KEEPS.has(r.id) ? Math.max(0, Math.round(r.leftover)) : 0;
  }
  for (const k in out) if (!(out[k] > 0)) delete out[k];
  return out;
}
function haveSet(stock, staples) {
  const s = new Set();
  for (const id in (stock || {})) if (FOODS[id] && stock[id] >= FOODS[id].pack * 0.3) s.add(id);
  for (const id in (staples || {})) if (staples[id] && FOODS[id]) s.add(id);
  return s;
}
/* Rango de gasto de una semana típica con esa despensa, probando varias combinaciones. */
function estimateNextWeek(cfg, tg, storeId, factors, prices, staples, stock, seeds, aisleStores, ptg) {
  const have = haveSet(stock, staples), totals = [];
  for (const sd of seeds) {
    const w = planWeek(cfg, tg, sd, have);
    if (w.error) return null;
    const evs = w.days.map(d => evalDay(defsOf({ dishes: d.dishes, outs: {} }), tg.k, tg.p));
    const more = ptg ? [{ evs: w.days.map(d => evalDay(defsOf({ dishes: d.dishes, outs: {} }), ptg.k, ptg.p)), people: 1 }] : undefined;
    totals.push(shopTotals(shopRows(evs, cfg.gente, storeId, factors, prices, staples, stock, aisleStores, more)).paid);
  }
  return { min: Math.min.apply(null, totals), max: Math.max.apply(null, totals) };
}
