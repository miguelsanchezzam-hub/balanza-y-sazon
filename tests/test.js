const base = { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 };
const scen = {
  'hombre mantener 75kg': { ...base },
  'mujer bajar 62kg': { ...base, sexo: 'm', edad: 35, peso: 62, talla: 160, meta: 'bajar' },
  'hombre subir 80kg': { ...base, peso: 80, meta: 'subir', act: 1.55 },
  'sin cerdo, repetir 3': { ...base, dieta: 'sincerdo', repeat: 3 },
  'vegetariano': { ...base, dieta: 'vegetariano' },
  'vegetariano sin lacteo sin huevo sin nuez': { ...base, dieta: 'vegetariano', excl: ['lacteo', 'huevo', 'nuez'] },
  'sin gluten sin lacteo': { ...base, excl: ['gluten', 'lacteo'], meta: 'bajar' },
  'sin snack bajar mujer': { ...base, sexo: 'm', peso: 58, talla: 158, edad: 40, meta: 'bajar', snack: false }
};
let verbose = process.argv.includes('-v');
for (const [name, cfg] of Object.entries(scen)) {
  const tg = targets(cfg);
  let fails = 0, total = 0, reps = [];
  for (let seed = 1; seed <= 20; seed++) {
    const w = planWeek(cfg, tg, seed);
    if (w.error) { console.log(name, 'ERROR', w.error); break; }
    w.days.forEach(d => {
      const ev = evalDay(defsOf({ dishes: d.dishes, outs: {} }), tg.k, tg.p);
      total++; if (!ev.ok) { fails++; if (reps.length < 3) reps.push([seed, Math.round(ev.tot.k), Math.round(ev.tot.p), ev.a.toFixed(2), ev.b.toFixed(2), ev.kOK, ev.pOK, ev.scaleOK, ev.rangeOK].join(',')); }
    });
    if (verbose && seed === 1) w.days.forEach((d, i) => { const ev = evalDay(defsOf({ dishes: d.dishes, outs: {} }), tg.k, tg.p); console.log(i, Math.round(ev.tot.k), Math.round(ev.tot.p), ev.ok, JSON.stringify(d.dishes), ev.meals.map(m => Math.round(m.k)).join('/')); });
  }
  console.log(`${name}: meta ${tg.k} kcal / ${tg.p} g -> fallan ${fails}/${total}`, reps.length ? 'ej: ' + reps.join(' | ') : '');
}
