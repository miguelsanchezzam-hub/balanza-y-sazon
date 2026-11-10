# Revisión semanal del catálogo común

Las personas proponen ingredientes desde la app (Recetas → Mis ingredientes → *Proponer al catálogo común*). Cada propuesta llega como un *issue* de este repositorio con el título «Propuesta de ingrediente: …» y un bloque ```json con los valores **por 100 g**.

## Qué se revisa
1. **Coherencia de cifras.** `4·p + 4·c + 9·grasa` debe quedar a ±25 % de `k` (o ±40 kcal; los alimentos con mucha fibra pueden quedar por debajo). `p + c + grasa ≤ 100`. `k` entre 0 y 900. Si hay una referencia (USDA FoodData Central o la etiqueta del producto), comparar contra ella; con más de 25 % de diferencia en kcal o proteína, se rechaza o se corrige citando la referencia.
2. **Repetidos.** Mismo alimento ya en `FOODS`/`MORE_FOODS` (nombre o sinónimo, sin acentos) → no se agrega; se responde indicando el existente.
3. **Etiquetas de dieta.** `pollo` (aves), `res`, `cerdo`, `pescado` (incluye mariscos), `huevo`, `lacteo`, `nuez`, `gluten`. Revisar que correspondan al ingrediente real aunque quien propone no las marcara.
4. **Paquete y precio.** `pack` entre 10 y 5000 g; `price` entre 1 y 2000 MXN y razonable (por kilo) frente a productos parecidos.
5. **Pasillo.** 0 carnes y pescado · 1 huevo y lácteos · 2 frutas y verduras · 3 granos, pan y tortillas · 4 despensa.
6. **Nombre.** Español, claro, indica si es crudo o cocido cuando importa.

## Cómo se agrega
- Una línea nueva en `MORE_FOODS` de `src/data.js` (mismo formato que las demás; `id` en minúsculas sin acentos). Agregar `kw` (sinónimos) y `nosub: 1` si es dulce, salsa, bebida o botana.
- Si se conserva en casa varios días (seco, enlatado), agregar su `id` a `MORE_KEEPS`.
- Correr `./tests/run.sh` y `./build.sh`, subir el número de `CACHE` en `sw.js`, y subir a `main`.
- Anotar el número del issue en `catalog/processed.json` (`processed` = agregadas o rechazadas) para no revisarlo dos veces, con una línea de motivo.
