const cfg = { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 };
const tg = targets(cfg), ex = expectedSlots(cfg); console.log('esperadas', ex.join(','));
const show = (nm, dd) => { const ev = evalDayAny(defsOf(dd), tg.k, tg.p, ex); console.log(nm, 'ok', ev.ok, 'faltan', ev.missing.join('/') || '-', 'k', Math.round(ev.tot.k), 'de', Math.round(ev.fK || tg.k), 'p', Math.round(ev.tot.p), 'comidas', ev.meals.map(m => Math.round(m.k)).join('/'), 'a,b', ev.a.toFixed(2), ev.b.toFixed(2)); };
show('vacío', { dishes: {}, outs: {} });
show('solo comida', { dishes: { com: 'com_pollo_arroz' }, outs: {} });
show('des+com', { dishes: { des: 'des_huevo_mex', com: 'com_pollo_arroz' }, outs: {} });
show('sin colación', { dishes: { des: 'des_huevo_mex', com: 'com_pollo_arroz', cen: 'cen_quesadillas' }, outs: {} });
show('completo', { dishes: { des: 'des_huevo_mex', com: 'com_pollo_arroz', cen: 'cen_quesadillas', sna: 'sna_yogur_fruta' }, outs: {} });
show('solo colación', { dishes: { sna: 'sna_yogur_fruta' }, outs: {} });
// cuántos platillos por separado quedan "razonables" solos en su hueco
let ok = 0, n = 0; for (const d of DISHES) { const ev = evalDayAny([{ slot: d.slot, dish: d.id }], tg.k, tg.p, ex); n++; if (ev.ok) ok++; else console.log('  no razonable solo:', d.id, ev.a.toFixed(2), ev.b.toFixed(2), Math.round(ev.tot.k), '/', Math.round(ev.fK), Math.round(ev.tot.p), '/', Math.round(ev.fP)); }
console.log('razonables solos:', ok, 'de', n);
