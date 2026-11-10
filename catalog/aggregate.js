#!/usr/bin/env node
/* Junta los precios reportados con tickets (catalog/price-reports.json) y reescribe el bloque COMMUNITY de src/data.js.
   Uso: node catalog/aggregate.js [--dry]   (desde la raíz del repositorio)
   Reglas: se ignoran reportes de tiendas o productos que no existen, o a menos de 0.4× / más de 2.5× del precio base de esa tienda;
   por tienda y producto se usan los últimos 8 reportes; con 3 o más se descartan los que se alejan más de 35 % de la mediana; el resultado es la mediana. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..'), dataPath = path.join(root, 'src', 'data.js');
const src = fs.readFileSync(dataPath, 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.replace(/\nconst COMMUNITY[^\n]*\n/, '\n') + '\n;this.FOODS = FOODS; this.STORES = STORES;', ctx);
const { FOODS, STORES } = ctx, storeF = Object.fromEntries(STORES.map(s => [s.id, s.f]));
const rep = JSON.parse(fs.readFileSync(path.join(__dirname, 'price-reports.json'), 'utf8'));
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const group = (list, keyOf) => { const g = {}; list.forEach(r => { (g[keyOf(r)] = g[keyOf(r)] || []).push(r); }); return g; };
const latest = (rs, n) => rs.slice().sort((a, b) => String(b.month).localeCompare(String(a.month)) || b.issue - a.issue).slice(0, n);
const dropped = [];
const okPrice = (r) => storeF[r.store] && FOODS[r.food] && r.price >= FOODS[r.food].price * storeF[r.store] * 0.4 && r.price <= FOODS[r.food].price * storeF[r.store] * 2.5;
const prices = {};
const gp = group((rep.prices || []).filter(r => { const ok = okPrice(r); if (!ok) dropped.push('precio ' + r.store + '/' + r.food + '=' + r.price + ' (#' + r.issue + ')'); return ok; }), r => r.store + '|' + r.food);
Object.keys(gp).forEach(k => {
  let rs = latest(gp[k], 8), v = rs.map(r => r.price);
  if (v.length >= 3) { const m = median(v); v = v.filter(x => Math.abs(x - m) / m <= 0.35); }
  const [s, f] = k.split('|'); (prices[s] = prices[s] || {})[f] = [Math.round(median(v)), v.length];
});
const factors = {};
const gf = group((rep.factors || []).filter(r => { const ok = storeF[r.store] && r.f >= 0.7 && r.f <= 1.5; if (!ok) dropped.push('factor ' + r.store + '=' + r.f + ' (#' + r.issue + ')'); return ok; }), r => r.store);
Object.keys(gf).forEach(s => { let v = latest(gf[s], 8).map(r => r.f); if (v.length >= 3) { const m = median(v); v = v.filter(x => Math.abs(x - m) / m <= 0.15); } factors[s] = [Math.round(median(v) * 100) / 100, v.length]; });
const out = '/* COMMUNITY:START (lo regenera catalog/aggregate.js cada semana; no editar a mano)\n   Precios medidos con tickets de la gente: tienda → producto → [precio por paquete, tickets]; factores de tienda → [factor, tickets]. */\n' +
  'const COMMUNITY = ' + JSON.stringify({ updated: new Date().toISOString().slice(0, 10), prices: prices, factors: factors }) + ';\n/* COMMUNITY:END */';
const re = /\/\* COMMUNITY:START[\s\S]*?COMMUNITY:END \*\//;
if (!re.test(src)) { console.error('No encontré el bloque COMMUNITY en src/data.js'); process.exit(1); }
const nPrices = Object.values(prices).reduce((a, o) => a + Object.keys(o).length, 0);
console.log('precios de la comunidad:', nPrices, '· factores:', Object.keys(factors).length, '· descartados:', dropped.length); dropped.forEach(d => console.log('  descartado', d));
if (process.argv.includes('--dry')) process.exit(0);
fs.writeFileSync(dataPath, src.replace(re, () => out));
