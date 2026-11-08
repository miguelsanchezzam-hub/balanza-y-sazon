const cfg = { meta: 'mantener', sexo: 'h', edad: 32, peso: 75, talla: 175, act: 1.375, kOv: null, pOv: null, dieta: 'todo', excl: [], snack: true, repeat: 1, gente: 1 };
const tg = targets(cfg);
const mk = (seed, have) => { const w = planWeek(cfg, tg, seed, have); return w.days.map(d => evalDay(defsOf({ dishes: d.dishes, outs: {} }), tg.k, tg.p)); };

// semana 1 sin despensa
let evs = mk(20261101, new Set());
let rows = shopRows(evs, 1, 'walmart', {}, {}, {}, {});
let t = shopTotals(rows);
console.log('semana 1: come', Math.round(t.eaten), 'paga', t.paid, 'paquetes', rows.reduce((s, r) => s + r.packs, 0));

// ya tengo 1 kg de arroz y aceite como básico
const stock = { arroz: 900, frijol: 500 }, staples = { aceite: true };
rows = shopRows(evs, 1, 'walmart', {}, {}, staples, stock);
t = shopTotals(rows);
console.log('con arroz, frijol y aceite en casa: paga', t.paid);
const ar = rows.find(r => r.id === 'arroz'), ac = rows.find(r => r.id === 'aceite'), fr = rows.find(r => r.id === 'frijol');
console.log('arroz', ar && [Math.round(ar.buyG), ar.have, ar.packs, Math.round(ar.leftover)], 'aceite', ac && [ac.packs, ac.paid, ac.staple], 'frijol', fr && [Math.round(fr.buyG), fr.have, fr.packs, Math.round(fr.leftover)]);

// verificación: total pagado = suma de paquetes enteros que cubren lo que falta
rows.forEach(r => { if (!r.staple) { const cover = r.have + r.packs * r.fd.pack; if (cover + 1e-6 < r.buyG) throw new Error('no cubre ' + r.id); if (r.packs > 0 && r.have + (r.packs - 1) * r.fd.pack >= r.buyG) throw new Error('sobra un paquete ' + r.id); } });
console.log('verificación de paquetes: ok');

// cierre de semana
const next = nextStock(rows, stock);
console.log('despensa siguiente', JSON.stringify(next));
const seeds = [11, 23, 37, 41, 59, 73];
const e1 = estimateNextWeek(cfg, tg, 'walmart', {}, {}, staples, next, seeds);
const e0 = estimateNextWeek(cfg, tg, 'walmart', {}, {}, {}, {}, seeds);
console.log('estimado desde cero', e0, 'con despensa', e1);

// el plan prefiere lo que hay en casa
const have = haveSet({ arroz: 900, lenteja: 500, garbanzo: 500, pasta: 200, avena: 800 }, {});
const count = (evsX, id) => evsX.reduce((n, ev) => n + ev.meals.reduce((m, ml) => m + ml.items.filter(i => i.f === id).length, 0), 0);
let withH = 0, without = 0;
for (let sd = 1; sd <= 12; sd++) { const a = mk(sd, have), b = mk(sd, new Set()); ['arroz', 'lenteja', 'garbanzo', 'pasta', 'avena'].forEach(id => { withH += count(a, id); without += count(b, id); }); }
console.log('usos de ingredientes en casa, con despensa vs sin:', withH, without);
const fails = [1, 2, 3, 4, 5].map(sd => mk(sd, have).filter(e => !e.ok).length); console.log('días fuera de banda con despensa', fails.join(','));
const tm = Date.now(); estimateNextWeek(cfg, tg, 'walmart', {}, {}, staples, next, seeds); console.log('ms por estimado', Date.now() - tm);
