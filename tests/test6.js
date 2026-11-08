const cfg = { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 };
const tg = targets(cfg), ex = expectedSlots(cfg);
console.log('clases:', Object.keys(FOODS).map(k => k + ':' + foodClass(k)).join(' '));
const dd = { dishes: { des: 'des_huevo_mex', com: 'com_pollo_arroz', cen: 'cen_quesadillas', sna: 'sna_yogur_fruta' }, outs: {} };
const a = evalDayAny(defsOf(dd), tg.k, tg.p, ex);
const dd2 = { ...dd, subs: { com: { pollo: 'bistec' } } };
const b = evalDayAny(defsOf(dd2), tg.k, tg.p, ex);
const mc = ev => ev.meals.find(m => m.slot === 'com').items.map(i => i.f + ' ' + i.g).join(', ');
console.log('sin sustitución ok', a.ok, Math.round(a.tot.k), Math.round(a.tot.p), '|', mc(a));
console.log('pollo→bistec    ok', b.ok, Math.round(b.tot.k), Math.round(b.tot.p), '|', mc(b));
// a medias con sustitución
const c = evalDayAny(defsOf({ dishes: { com: 'com_pollo_arroz' }, outs: {}, subs: { com: { pollo: 'tofu', arroz: 'pasta' } } }), tg.k, tg.p, ex);
console.log('parcial tofu/pasta', Math.round(c.tot.k), '/', Math.round(c.fK), mc(c));
// regresión: sin subs idéntico a antes
console.log('mismo resultado sin subs:', JSON.stringify(a.tot) === JSON.stringify(evalDayAny(defsOf({ dishes: dd.dishes, outs: {}, subs: {} }), tg.k, tg.p, ex).tot));
