const base = { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 };
const scen = { h75: base, m62bajar: { ...base, sexo: 'm', edad: 35, peso: 62, talla: 160, meta: 'bajar' }, h80subir: { ...base, peso: 80, meta: 'subir', act: 1.55 } };
const rng = mulberry32(7); let bad = [];
for (const d of DISHES) {
  const res = [];
  for (const [n, cfg] of Object.entries(scen)) {
    const tg = targets(cfg), pools = poolsFor(cfg); let found = false, rangeOnly = false;
    for (let t = 0; t < 600 && !found; t++) {
      const pick = {}; for (const s of SLOTS_ALL) pick[s] = s === d.slot ? d.id : weightedPick(pools[s], {}, rng);
      const ev = evalDay(defsOf({ dishes: pick, outs: {} }), tg.k, tg.p); if (ev.ok) found = true;
    }
    res.push(found ? 1 : 0);
  }
  if (res.includes(0)) bad.push(d.id + ' ' + res.join(''));
}
console.log('platillos:', DISHES.length, '| sin día válido en algún perfil:', bad.length ? bad.join(', ') : 'ninguno');
