#!/bin/bash
# Pruebas del motor (porciones, sustituciones, despensa). Cada archivo necesita data.js y engine.js antes.
cd "$(dirname "$0")"
for t in test test3 test4 test5 test6; do
  echo "== $t"; cat ../src/data.js ../src/engine.js ../src/local.js $t.js > /tmp/bys-test.js && node /tmp/bys-test.js | tail -6
done
