#!/bin/bash
# Arma index.html (un solo archivo) a partir de src/. Úsalo después de editar cualquier archivo de src/.
set -e
cd "$(dirname "$0")/src"
{ cat shell-head.html head.html mid.html data.js engine.js local.js img.js app.js tail.html; echo '</body></html>'; } > ../index.html
node --check <(cat data.js engine.js local.js app.js) 2>/dev/null || { cat data.js engine.js local.js app.js > /tmp/bys-check.js && node --check /tmp/bys-check.js; }
echo "index.html listo ($(wc -c < ../index.html) bytes). Si cambiaste algo, sube también la versión de CACHE en sw.js."
