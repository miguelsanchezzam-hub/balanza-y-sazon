# Balanza y Sazón

Planificador de comidas semanal en español: porciones calculadas para tu meta de calorías y proteína, lista de compras con precios, despensa, registro de peso y modo pareja. Funciona en el navegador, se puede instalar en el celular y **no depende de ningún servicio externo**: tus datos se quedan en tu dispositivo.

## Publicarla en GitHub Pages

1. En este repositorio: **Settings → Pages**.
2. En *Build and deployment*, **Source: Deploy from a branch**; rama **main**, carpeta **/ (root)**; **Save**.
3. En uno o dos minutos la página queda en `https://<tu-usuario>.github.io/<nombre-del-repositorio>/`.

## Instalarla como app

- **iPhone (Safari):** abre la página → botón Compartir → **Agregar a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar app**.
- **Compu (Chrome o Edge):** ícono de instalar en la barra de direcciones.

Después de abrirla una vez con internet, abre sin conexión. El lector de fotos de tickets baja unos 10 MB la primera vez que lo usas y queda guardado.

## Pasar tus datos de la versión anterior (artefacto de Claude)

Los datos viven en el navegador de cada sitio, así que la página nueva empieza vacía.

1. En la versión anterior: **Ajustes → Tus datos → Copiar respaldo como texto**.
2. En esta: **Ajustes → Tus datos → Restaurar un respaldo**, pega el texto, **Revisar respaldo** y **Reemplazar mis datos**.

Para pasar el plan entre dos personas (tú y tu pareja) usa **Ajustes → En pareja → Enviar mi plan / Recibir un plan**.

## Qué hace sin servicios externos

| Función | Cómo funciona |
|---|---|
| Porciones, compras, despensa, peso, recetas propias | Todo se calcula en tu navegador (`src/engine.js`). |
| **Comí fuera** con descripción libre («3 tacos al pastor y un refresco») | Tabla propia de comidas comunes de México con cifras aproximadas (`OUT_ITEMS` en `src/local.js`). Si no reconoce algo, te lo dice y puedes completar en la calculadora o a mano. |
| **Leer ticket** (foto) | OCR con [Tesseract.js](https://github.com/naptha/tesseract.js) autoalojado en `vendor/tesseract/`. La foto no sale de tu dispositivo. |
| **Leer ticket** (texto pegado) | Lector propio de renglones, precios y pesos (`parseTicketText` en `src/local.js`). |
| Respaldo | Descarga un `.json` o copia el texto. |

**Límites que conviene saber.** El OCR lee bien fotos nítidas y rectas; con tickets arrugados, torcidos o muy claros se equivoca más. Por eso siempre muestra el texto leído y una pantalla de revisión antes de guardar precios. La tabla de comidas es aproximada: úsala como estimado, no como medición.

## Cómo está organizado

```
index.html            ← lo que se publica (un solo archivo, generado)
src/head.html         ← estilos
src/mid.html          ← estructura de la página
src/data.js           ← alimentos (FOODS), platillos (DISHES) y tiendas (STORES)
src/engine.js         ← cálculo de porciones, compras y despensa
src/local.js          ← estimador de comidas, lector de tickets y OCR
src/app.js            ← pantallas y acciones
src/img.js            ← ilustraciones incrustadas
src/shell-head.html   ← cabecera de la página instalable
manifest.webmanifest, sw.js, icons/   ← instalación y modo sin conexión
vendor/tesseract/     ← lector de fotos
tests/run.sh          ← pruebas del motor
```

### Editar y volver a publicar

1. Cambia el archivo de `src/` que corresponda.
2. Ejecuta `./build.sh` (necesita Node.js). Regenera `index.html`.
3. Sube a la rama `main` (`index.html` y los archivos que cambiaste).
4. Si cambiaste algo visible, sube el número de `CACHE` en `sw.js` (por ejemplo `bys-v2`) para que el modo sin conexión recoja la versión nueva.

### Tareas comunes

- **Buscar un ingrediente:** al armar una receta, en la despensa y al cambiar un ingrediente hay un buscador (sin acentos, con sinónimos como tomate/jitomate o palta/aguacate). La lista base trae unos 210 alimentos.
- **Agregar un ingrediente propio (sin tocar código):** en la app, Recetas → «Mis ingredientes» o, dentro de una receta, «Crear ingrediente nuevo». Se guarda en tu respaldo y viaja con «Enviar mi plan».
- **Cambiar un alimento de la lista base:** `FOODS` y `MORE_FOODS` en `src/data.js` (los de `MORE_FOODS` se escriben en una línea: `[id, nombre, kcal, proteína, carbohidratos, grasa, paquete, precio, pasillo, 'etiquetas', extras]`). Valores por 100 g; `pack` es el tamaño del paquete de compra y `price` el precio supuesto en pesos.
- **Agregar un platillo:** `DISHES` en `src/data.js`. Copia uno existente; cada ingrediente usa el `id` de un alimento de `FOODS`. Después corre `tests/run.sh`: revisa que ningún perfil se quede sin días válidos.
- **Agregar una comida a «Comí fuera»:** una línea en `OUT_ITEMS` de `src/local.js`: `[nombre, unidad, kcal, proteína, 'alias1|alias2']`. Los alias van sin acentos y en singular o plural indistinto.
- **Que el lector de tickets reconozca otro producto:** `TK_ALIAS` en `src/local.js` (raíces de palabras como salen impresas, por ejemplo `pech` para «PECH POLLO»).
- **Tiendas y factores de precio:** `STORES` en `src/data.js`.

## Catálogo común

Cada ingrediente propio tiene el botón **Proponer al catálogo común**: abre una propuesta (un *issue*) en este repositorio con las cifras ya escritas. Una vez por semana se revisan (cifras coherentes, sin repetidos, etiquetas de dieta; reglas en `catalog/REVIEW.md`) y las que pasan entran en `MORE_FOODS` y llegan a todas las personas con la siguiente versión. Mientras tanto el ingrediente sigue disponible en tu propio dispositivo.

## Recetas de la comunidad

Tus recetas creadas están en **Recetas → Mías** (y también en el menú general con la etiqueta «mía»). Al crearlas dices **para cuántas personas** son: pones los gramos de toda la receta y la app te cuenta solo tu porción. En «Mías» siempre está **Enviar todas las recetas** (de 3 en 3); al abrir una receta aparecen **Editar** y **Proponer**. Las aprobadas pasan al menú de todos (`MORE_DISHES` en `src/data.js`) y dejan de salir en «Mías» sin perder tu semana ni tus favoritas. Si no tienes cuenta de GitHub, cada pantalla de envío tiene **Compartir por Telegram**; abre directo el chat del administrador (usuario en `TELEGRAM_USER` de `src/app.js`) y copia el texto para pegarlo.

## Precios de la comunidad

En **Compras → Compartir mis precios con la comunidad** envías (por una propuesta en GitHub) los precios que calibraste con tickets: solo tienda, producto, precio por paquete y mes; sin fotos ni nombre. Cada semana se juntan con los de todos (`catalog/aggregate.js`: se descartan los raros y se usa la mediana) y llegan a la app como «precio de la comunidad». Tus propios precios siempre ganan sobre los de la comunidad.

## Pruebas

`./tests/run.sh` corre las pruebas del motor: cada perfil de dieta debe cumplir la meta de calorías y proteína en los 140 días de prueba, y las sustituciones y la despensa se verifican por separado.

## Privacidad

No hay cuentas ni servidores. Todo lo que escribes se guarda en el almacenamiento del navegador de tu dispositivo. La única conexión externa es la tipografía de Google Fonts; si no carga, se usa una del sistema.

## Avisos

Esta es una herramienta de planeación, no consejo médico ni nutricional. Los valores por 100 g son de referencia tipo USDA FoodData Central, redondeados y escritos a mano; verifícalos antes de usarlos con fines médicos. Los precios son suposiciones para México que puedes editar o calibrar con tu ticket.

`vendor/tesseract/` contiene Tesseract.js y su motor y datos de idioma (Apache-2.0).
