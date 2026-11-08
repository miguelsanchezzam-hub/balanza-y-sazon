/* ---------- Funciones locales: no dependen de ningún servicio externo ----------
   1) Estimador de comidas fuera de casa a partir de una descripción (tabla propia).
   2) Lector de texto de tickets (renglón → producto de tu lista, precio, gramos).
   3) OCR de fotos de tickets con Tesseract.js autoalojado (solo si la página lo trae en vendor/). */
const STANDALONE = typeof window !== 'undefined' && window.BYS_STANDALONE === true;

/* [nombre, unidad, kcal por unidad, proteína g por unidad, alias separados por |] — valores aproximados de porciones típicas en México */
const OUT_ITEMS = [
  ['Taco al pastor', 'pieza', 160, 8, 'taco al pastor|taco de pastor|pastor'], ['Taco de bistec o asada', 'pieza', 180, 11, 'taco de bistec|taco de asada|taco de carne asada|taco de arrachera|bistec'],
  ['Taco de carnitas', 'pieza', 220, 11, 'taco de carnitas|carnitas'], ['Taco de suadero', 'pieza', 200, 10, 'taco de suadero|suadero|taco de longaniza|taco de campechano'],
  ['Taco de pollo', 'pieza', 150, 10, 'taco de pollo'], ['Taco de canasta (papa o frijol)', 'pieza', 120, 3, 'taco de canasta|tacos de canasta|taco sudado'],
  ['Taco dorado o flauta', 'pieza', 170, 7, 'taco dorado|flauta|taquito|taquito dorado'], ['Quesadilla de queso', 'pieza', 230, 11, 'quesadilla'],
  ['Gordita de chicharrón', 'pieza', 250, 10, 'gordita'], ['Sope', 'pieza', 230, 8, 'sope|huarache|tlacoyo'], ['Tamal', 'pieza', 280, 9, 'tamal'], ['Torta de jamón', 'pieza', 450, 20, 'torta de jamon|torta'],
  ['Torta de milanesa', 'pieza', 650, 28, 'torta de milanesa|torta cubana|torta de pierna|torta ahogada'], ['Hamburguesa con queso', 'pieza', 500, 25, 'hamburguesa'], ['Hot dog', 'pieza', 300, 11, 'hot dog|hotdog|jocho|perro caliente'],
  ['Pozole', 'plato', 350, 20, 'pozole'], ['Enchiladas con pollo (3)', 'plato', 500, 25, 'enchiladas|enchilada|enmolada|entomatada|enfrijolada'],
  ['Chilaquiles con pollo o huevo', 'plato', 550, 22, 'chilaquile'], ['Huevo revuelto (2 huevos)', 'porción', 180, 12, 'huevo revuelto|huevos revueltos|huevos a la mexicana|huevo a la mexicana|huevos estrellados|huevo estrellado|huevos fritos|huevo frito'],
  ['Arroz', 'taza', 205, 4, 'arroz|arroz rojo'], ['Frijoles de la olla', 'media taza', 120, 7, 'frijol|frijoles|frijoles refritos'], ['Tortilla de maíz', 'pieza', 60, 1.5, 'tortilla'],
  ['Sopa de pasta', 'plato', 200, 6, 'sopa de pasta|sopa de fideo|fideo|sopa aguada'], ['Ensalada con aderezo', 'plato', 200, 5, 'ensalada'], ['Pizza', 'rebanada', 285, 12, 'pizza|rebanada de pizza'],
  ['Papas fritas', 'porción chica', 230, 3, 'papas fritas|papa frita|french fries|papas a la francesa'], ['Elote o esquite con mayonesa y queso', 'vaso', 250, 7, 'elote|esquite|esquites|elote en vaso'],
  ['Pan dulce (concha)', 'pieza', 300, 5, 'concha|pan dulce|cuernito|croissant|oreja|polvoron|empanada de dulce'], ['Refresco', '600 ml', 250, 0, 'refresco|coca|coca cola|pepsi|sprite|fanta|sidral|jarritos|soda'],
  ['Jugo', 'vaso', 110, 1, 'jugo|jugo de naranja|jugo de manzana'], ['Cerveza', 'lata o botella', 150, 1, 'cerveza|chela|caguama'], ['Café con leche y azúcar', 'taza grande', 150, 5, 'cafe con leche|cafe con azucar|capuchino|capuccino|cafe latte|latte|cafe'],
  ['Helado', 'bola', 140, 2, 'helado|nieve|bola de helado'], ['Pastel', 'rebanada', 350, 4, 'pastel|rebanada de pastel|pay|rebanada de pay|cheesecake'],
  /* extras para la descripción libre */
  ['Taco de barbacoa', 'pieza', 190, 12, 'taco de barbacoa|barbacoa'], ['Taco de cochinita pibil', 'pieza', 190, 11, 'taco de cochinita|cochinita|cochinita pibil'], ['Taco de pescado empanizado', 'pieza', 230, 10, 'taco de pescado|taco de camaron|taco gobernador'],
  ['Taco de lengua, tripa o chorizo', 'pieza', 210, 11, 'taco de lengua|taco de tripa|taco de cabeza|taco de buche|taco de chorizo'], ['Taco de papa, nopal o huevo', 'pieza', 140, 4, 'taco de papa|taco de nopal|taco de huevo|taco de frijol|taco de rajas'],
  ['Taco (de carne, genérico)', 'pieza', 180, 10, 'taco'], ['Burrito de carne', 'pieza', 450, 20, 'burrito'], ['Sincronizada o gringa', 'pieza', 350, 18, 'sincronizada|gringa|quesadilla de pastor|quesadilla de jamon'],
  ['Tostada de tinga o ceviche', 'pieza', 190, 9, 'tostada|tostada de tinga|tostada de ceviche|tostada de pata'], ['Molote o empanada salada', 'pieza', 280, 8, 'molote|empanada|empanada de carne|empanada de queso|empanada de pollo'],
  ['Alambre o plato de carne asada', 'plato', 480, 35, 'alambre|carne asada|plato de carne asada|parrillada'], ['Milanesa (sola)', 'pieza', 350, 25, 'milanesa|milanesa de res|milanesa de pollo|empanizado|nuggets'],
  ['Pollo frito o asado', 'pieza', 300, 24, 'pollo frito|pollo asado|pollo rostizado|pierna y muslo|muslo|cuarto de pollo|alitas|alita'], ['Mole con pollo', 'plato', 600, 35, 'mole|mole poblano|pipian|mole con pollo'],
  ['Caldo de pollo o res', 'plato', 250, 20, 'caldo|caldo de pollo|caldo de res|consome|sopa de tortilla|caldo tlalpeno'], ['Birria o menudo', 'plato', 450, 30, 'birria|menudo|consome de birria'], ['Sopa o crema de verduras', 'plato', 160, 5, 'crema de verduras|sopa de verduras|crema|sopa'],
  ['Pescado o camarones', 'plato', 320, 28, 'pescado|filete de pescado|camarones|camaron|mojarra|ceviche|aguachile|coctel de camaron'], ['Sushi (8 piezas)', 'porción', 350, 12, 'sushi|rollo de sushi|maki'],
  ['Pasta con salsa', 'plato', 450, 14, 'pasta|espagueti|spaghetti|lasana|fettuccine|macarrones'], ['Sándwich o wrap', 'pieza', 380, 18, 'sandwich|wrap|baguette|panini|sub'], ['Ensalada César con pollo', 'plato', 400, 22, 'ensalada cesar'],
  ['Sopa instantánea', 'vaso o pieza', 380, 8, 'maruchan|sopa instantanea|sopa maruchan|ramen|nissin'], ['Huevos con jamón u omelette', 'porción', 300, 20, 'omelette|omelet|huevos con jamon|huevo con jamon|huevos con tocino|huevos con chorizo'],
  ['Hot cakes (3)', 'porción', 450, 10, 'hot cakes|hotcakes|hot cake|pancakes|waffle|waffles|crepa|crepas'], ['Cereal con leche', 'tazón', 250, 8, 'cereal|cereal con leche|corn flakes|zucaritas'], ['Avena con leche', 'taza', 220, 9, 'avena|avena con leche'],
  ['Yogur con fruta o granola', 'vaso', 180, 7, 'yogur|yogurt|yoghurt|licuado de yogur'], ['Pan tostado con mantequilla', 'rebanada', 150, 3, 'pan tostado|tostada con mantequilla|pan con mantequilla|pan de caja'], ['Bolillo o telera', 'pieza', 200, 6, 'bolillo|telera|birote|pan blanco'],
  ['Dona o pan relleno', 'pieza', 270, 4, 'dona|donas|donut|rosca|muffin|bisquet|biscuit'], ['Galleta', 'pieza', 70, 1, 'galleta|galletas|galleta maria|oreo|galleta marias'], ['Barra de granola o de cereal', 'pieza', 130, 2, 'granola|barra de granola|barra|barrita'],
  ['Manzana, naranja o mandarina', 'pieza', 70, 1, 'manzana|naranja|mandarina|pera|durazno|guayaba|kiwi|ciruela'], ['Plátano', 'pieza', 105, 1.3, 'platano|banana'], ['Mango', 'pieza', 200, 3, 'mango|mango con chile'],
  ['Fruta picada', 'plato', 120, 2, 'fruta picada|fruta|ensalada de fruta|papaya|melon|sandia|pina|coctel de frutas|vaso de fruta'], ['Fresas o uvas', 'taza', 60, 1, 'fresas|fresa|uvas|uva|arandanos|zarzamoras'], ['Aguacate', 'pieza', 320, 4, 'aguacate|guacamole'],
  ['Papitas o frituras de bolsa', 'bolsa chica', 250, 3, 'papitas|sabritas|frituras|fritura|doritos|cheetos|ruffles|takis|churrumais|chicharrones de harina|chips|papas de bolsa|botana'], ['Cacahuates o nueces', 'puñado', 170, 7, 'cacahuates|cacahuate|nueces|nuez|almendras|almendra|pistaches|semillas|mix de nueces'],
  ['Palomitas', 'bolsa', 220, 4, 'palomitas'], ['Chicharrón de cerdo', 'porción', 150, 10, 'chicharron|chicharron de cerdo'], ['Dulces o chocolate', 'barra o bolsita', 230, 3, 'chocolate|dulce|dulces|gomitas|paleta de dulce|chicle|mazapan|dulce de tamarindo'],
  ['Paleta o helado de agua', 'pieza', 90, 1, 'paleta|paleta de hielo|helado de agua|raspado|raspado de hielo|mangonada|chamoyada'], ['Flan o gelatina', 'porción', 180, 4, 'flan|gelatina|arroz con leche|capirotada|pay de queso'], ['Churros', 'pieza', 160, 2, 'churro|churros'],
  ['Brownie o galleta grande', 'pieza', 260, 3, 'brownie|galleta grande|cookie|cookies'], ['Agua fresca', 'vaso', 100, 0, 'agua fresca|agua de jamaica|agua de limon|agua de tamarindo|agua de sandia|agua de melon|agua de pina|agua de horchata|horchata|jamaica|limonada|naranjada'],
  ['Café o té sin azúcar', 'taza', 5, 0, 'cafe americano|americano|te|te sin azucar|cafe sin azucar|cafe negro|espresso|expreso'], ['Café con crema o frappé', 'vaso grande', 350, 6, 'frappe|frapuccino|moka|cafe helado|frappuccino|chai latte'],
  ['Leche', 'vaso', 140, 7, 'leche|vaso de leche'], ['Licuado de plátano con leche', 'vaso', 300, 10, 'licuado|licuado de platano|malteada|smoothie'], ['Refresco de lata', 'lata 355 ml', 150, 0, 'refresco de lata|coca de lata|lata de refresco'],
  ['Bebida energética', 'lata', 160, 0, 'red bull|monster|energizante|bebida energetica|gatorade|powerade|suero'], ['Michelada o cerveza preparada', 'vaso', 220, 2, 'michelada|cubana|chelada|clamato'], ['Copa de vino', 'copa', 125, 0, 'vino|copa de vino|vino tinto|vino blanco'],
  ['Tequila, mezcal o whisky', 'caballito', 100, 0, 'tequila|mezcal|whisky|whiskey|vodka|ron|brandy|caballito|shot|trago'], ['Coctel (margarita, piña colada…)', 'vaso', 280, 0, 'margarita|pina colada|mojito|cuba|cuba libre|paloma|coctel|cocktail|vampiro|carajillo'],
  ['Queso o jamón (rebanada)', 'rebanada', 55, 5, 'rebanada de queso|rebanada de jamon|queso|jamon|queso panela|queso oaxaca|salchicha|salchichas|tocino|tocino rebanada'], ['Mantequilla o crema (cucharada)', 'cucharada', 90, 0, 'mantequilla|crema|aceite|mayonesa|aderezo'],
  ['Sopa de arroz o frijoles con carne', 'plato', 500, 25, 'comida corrida|comida completa|menu del dia|plato fuerte|guisado|guiso']
];

const OUT_SIZE = { c: ['Chica', 0.7], n: ['Normal', 1], g: ['Grande', 1.4] };

const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9./ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sing = w => (w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w);
const keyOf = s => nrm(s).split(' ').filter(Boolean).map(sing).join(' ');
const NUMW = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, medio: 0.5, media: 0.5, par: 2, docena: 12 };
const SIZEW = { chico: 0.7, chica: 0.7, pequeno: 0.7, pequena: 0.7, mini: 0.7, grande: 1.4, jumbo: 1.4, doble: 1.8, extra: 1.4, mediano: 1, mediana: 1, regular: 1 };

let _outIdx = null;
function outIndex() {
  if (_outIdx) return _outIdx;
  _outIdx = [];
  OUT_ITEMS.forEach((it, i) => String(it[4] || '').split('|').concat([it[0]]).forEach(a => { const k = keyOf(a); if (k) _outIdx.push({ i: i, key: k, len: k.length }); }));
  _outIdx.sort((a, b) => b.len - a.len);
  return _outIdx;
}
function qtyOf(tokens) {
  let q = null, rest = tokens.slice();
  const first = rest[0] || '';
  const m = /^(\d+(?:[.,]\d+)?)(?:x)?$/.exec(first), fr = /^(\d+)\/(\d+)$/.exec(first), xm = /^x(\d+)$/.exec(first);
  if (m) { q = parseFloat(m[1].replace(',', '.')); rest.shift(); }
  else if (fr && +fr[2]) { q = +fr[1] / +fr[2]; rest.shift(); }
  else if (xm) { q = +xm[1]; rest.shift(); }
  else if (NUMW[first] !== undefined) { q = NUMW[first]; rest.shift(); if (first === 'un' && rest[0] === 'par') { q = 2; rest.shift(); } if (first === 'par' || first === 'docena') { if (rest[0] === 'de') rest.shift(); } }
  if (rest[0] === 'de' && q !== null) rest.shift();
  if (q !== null && rest[0] === 'y' && rest[1] === 'medio') { q += 0.5; rest.splice(0, 2); }
  return { q: q, rest: rest };
}
function estimateLocal(desc) {
  const raw = String(desc || '').slice(0, 600);
  const segs = [];
  raw.split(/[,;\n+]+/).forEach(part => {
    let t = ' ' + nrm(part) + ' ';
    t = t.replace(/ mas (?=(\d|un |una |uno |dos |tres |cuatro |cinco |seis |medio |media ))/g, ' | ').replace(/ (y|e) (?=(\d|un |una |uno |dos |tres |cuatro |cinco |seis |siete |ocho |medio |media ))/g, ' | ').replace(/ y /g, ' | ').replace(/ mas /g, ' | ');
    t.split('|').forEach(s => { s = s.trim(); if (s) segs.push(s); });
  });
  const items = [], unknown = [], idx = outIndex();
  const TOP = /^(pina|queso|crema|aguacate|guacamole|frijol|salsa|limon|cebolla|cilantro|chile|tortilla|mayonesa|aderezo|mantequilla|azucar|leche|jamon)$/;
  const pick = text => { let best = null; for (const a of idx) { const p = text.indexOf(' ' + a.key + ' '); if (p >= 0 && (!best || p < best.p || (p === best.p && a.len > best.len))) best = { i: a.i, p: p, len: a.len, key: a.key }; } return best; };
  const one = (seg, tail) => {
    let vol = null;
    seg = seg.replace(/(\d+(?:[.,]\d+)?) ?(ml|mililitros?|l|lt|lts|litros?)\b/, (all, n, u) => { const v = parseFloat(n.replace(',', '.')); vol = /^m/.test(u) ? v : v * 1000; return ' '; }).replace(/\b\d+ ?(g|gr|grs|gramos?)\b/, ' ').replace(/\s+/g, ' ').trim();
    if (!seg) return;
    let toks = seg.split(' ').map(sing);
    const qr = qtyOf(toks); toks = qr.rest;
    let size = 1; toks = toks.filter(w => { if (SIZEW[w] !== undefined) { size = SIZEW[w]; return false; } return true; });
    const text = ' ' + toks.join(' ') + ' ';
    const hit = pick(text);
    if (!hit) { if (!tail) unknown.push(seg.slice(0, 40)); return; }
    if (tail && TOP.test(hit.key.split(' ')[0])) return;
    const it = OUT_ITEMS[hit.i];
    let qty = qr.q === null ? 1 : qr.q;
    const mlU = /^(\d+) ml/.exec(it[1]);
    if (vol && mlU) qty = (qr.q === null ? 1 : qr.q) * vol / +mlU[1];
    qty = Math.min(qty, 30);
    items.push({ i: hit.i, name: it[0], unit: it[1], qty: qty, size: size, k: it[2] * qty * size, p: it[3] * qty * size, per: it[2], tail: !!tail });
  };
  for (const seg of segs) { const parts = seg.split(' con '); one(parts[0], false); parts.slice(1).forEach(x => one(x, true)); }
  const k = items.reduce((x, y) => x + y.k, 0), p = items.reduce((x, y) => x + y.p, 0);
  return { items: items, unknown: unknown, k: Math.round(k), p: Math.round(p), lo: Math.round(k * 0.8 / 10) * 10, hi: Math.round(k * 1.25 / 10) * 10 };
}

/* ---------- lector de texto de tickets ---------- */
const TK_ALIAS = {
  pollo: ['pollo', 'pechug', 'pech'], res_molida: ['molida', 'mol res'], bistec: ['bistec', 'bisteck', 'arrachera', 'diezmillo'], cerdo: ['lomo', 'cerdo', 'chuleta'], tilapia: ['tilapia'], salmon: ['salmon'], atun: ['atun'],
  huevo: ['huevo', 'blanquillo', 'huevos'], yogur: ['yogur', 'yoghurt', 'yogurt', 'griego'], queso: ['queso', 'panela', 'oaxaca'], leche: ['leche'], tofu: ['tofu'], frijol: ['frijol'], lenteja: ['lenteja'], garbanzo: ['garbanzo'],
  arroz: ['arroz'], avena: ['avena'], tortilla: ['tortilla'], pan: ['pan integral', 'pan caja', 'pan bimbo', 'bimbo'], pasta: ['pasta', 'espagueti', 'spaghetti', 'fideo', 'penne', 'codo'], papa: ['papa'], camote: ['camote'],
  platano: ['platano', 'banana', 'tabasco'], manzana: ['manzana'], papaya: ['papaya'], aguacate: ['aguacate', 'hass'], jitomate: ['jitomate', 'jitom', 'tomate', 'saladet'], cebolla: ['cebolla'], espinaca: ['espinaca'], brocoli: ['brocoli'],
  calabacita: ['calabacita', 'calabaza'], zanahoria: ['zanahoria'], nopal: ['nopal'], chayote: ['chayote'], lechuga: ['lechuga'], aceite: ['aceite'], cacahuate: ['cacahuate'], almendra: ['almendra']
};
function tkMatch(text) {
  const toks = nrm(text).split(' ').filter(Boolean), joined = ' ' + toks.join(' ') + ' ';
  let best = null;
  for (const id in TK_ALIAS) {
    if (typeof FOODS === 'undefined' || !FOODS[id]) continue;
    for (const al of TK_ALIAS[id]) {
      let pos = -1, exact = false;
      if (al.indexOf(' ') >= 0) { const p = joined.indexOf(' ' + al + ' '); if (p >= 0) { pos = joined.slice(0, p + 1).split(' ').length - 2; exact = true; } }
      else for (let t = 0; t < toks.length; t++) {
        const w = toks[t], ws = sing(w);
        if (w === al || ws === al) { pos = t; exact = true; break; }
        if (al.length >= 4 && w.indexOf(al) === 0) { pos = t; break; }
      }
      if (pos < 0) continue;
      const score = (exact ? 10 : 0) + al.length;
      if (!best || pos < best.pos || (pos === best.pos && score > best.score)) best = { id: id, pos: pos, score: score };
    }
  }
  return best ? best.id : '';
}
const MONEY = /(?<![\d.,])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?![\d])/g;
const money = s => { const out = []; let m; MONEY.lastIndex = 0; while ((m = MONEY.exec(s))) out.push(parseFloat(m[1].replace(/,/g, '') + '.' + m[2])); return out; };
const TK_SKIP = /\b(total|subtotal|sub total|iva|ieps|cambio|efectivo|tarjeta|visa|mastercard|folio|rfc|ticket|fecha|hora|caja|cajero|gracias|descuento|ahorro|puntos|articulos|pago|suc|tel|www|http|factura|autoriz|aprobada|saldo|monedero|redondeo)\b/;
function tkWeight(line, id) {
  const m = /(\d+(?:[.,]\d{1,3})?)\s?(kg|kgs|kilo|kilos|g|gr|grs|gramos|l|lt|lts|litro|litros|ml)\b/i.exec(line);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.')), u = m[2].toLowerCase();
    const g = /^(kg|kgs|kilo|kilos|l|lt|lts|litro|litros)$/.test(u) ? n * 1000 : n;
    if (g >= 5 && g <= 20000) return Math.round(g);
  }
  const pz = /(\d+)\s?(pz|pza|pzas|piezas?)\b/i.exec(line);
  if (pz && id && FOODS[id] && FOODS[id].unitG) { const g = +pz[1] * FOODS[id].unitG; if (g >= 5 && g <= 20000) return g; }
  return null;
}
function parseTicketText(text) {
  const rows = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let total = null; const merged = []; let pend = null;
  for (const line of rows) {
    const low = nrm(line), amounts = money(line), letters = (low.replace(/\b(kg|kgs|g|gr|grs|x|pz|pza|pzas|l|lt|ml)\b/g, ' ').match(/[a-z]/g) || []).length;
    if (/\btotal\b/.test(low) && !/\b(sub|articulos|ahorro|descuento|iva)/.test(low) && amounts.length) { total = Math.max(total || 0, amounts[amounts.length - 1]); continue; }
    if (TK_SKIP.test(low)) { pend = null; continue; }
    if (amounts.length) {
      if (letters < 3 && pend) { merged.push(pend + ' ' + line); pend = null; } else { merged.push(line); pend = null; }
    } else if (letters >= 3) { pend = line; }
  }
  const lines = merged.map(l => {
    const am = money(l), price = am[am.length - 1], id = tkMatch(l);
    const t = l.replace(/\$?\s?\d[\d,]*[.,]\d{2}\b/g, ' ').replace(/[@*]+/g, ' ').replace(/\s+x\s*$/i, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Renglón';
    return { t: t, id: id, price: price, g: tkWeight(l, id) };
  }).filter(x => x.price > 0 && x.price < 5000).slice(0, 60);
  return { total: total && total < 50000 ? Math.round(total) : null, lines: lines };
}

/* ---------- OCR local de fotos (Tesseract.js autoalojado en vendor/tesseract) ---------- */
let _tessLoad = null, _ocrWorker = null;
function loadTesseract() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Tesseract) return Promise.resolve(true);
  if (!_tessLoad) _tessLoad = new Promise(res => {
    const s = document.createElement('script'); s.src = 'vendor/tesseract/tesseract.min.js'; s.onload = () => res(!!window.Tesseract); s.onerror = () => res(false); document.head.appendChild(s);
  });
  return _tessLoad;
}
async function prepImage(file) {
  const bmp = await createImageBitmap(file);
  const long = Math.max(bmp.width, bmp.height), scale = Math.min(2.5, Math.max(1, 2200 / long));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  const im = cx.getImageData(0, 0, w, h), d = im.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = w * h; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.2) { hi = v; break; } }
  const span = Math.max(30, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255 / span) | 0)); d[i] = d[i + 1] = d[i + 2] = v; }
  cx.putImageData(im, 0, 0);
  return cv;
}
async function ocrImages(files, onProgress) {
  if (!(await loadTesseract())) return null;
  if (!_ocrWorker) _ocrWorker = await window.Tesseract.createWorker('spa', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/lang', gzip: true, logger: m => { if (onProgress && m && m.status) onProgress(m); } });
  try { await _ocrWorker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' }); } catch (e) { /* opcional */ }
  const out = [];
  for (const f of files) { const cv = await prepImage(f); const r = await _ocrWorker.recognize(cv); out.push(r && r.data ? r.data.text : ''); }
  return out.join('\n');
}
