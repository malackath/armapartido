#!/usr/bin/env bash
# Corre dentro de "firebase emulators:exec": carga la demo y las tres pruebas de punta a punta.
# Sale con error si falla cualquiera (antes el código de salida se perdía entre comillas y siempre daba 0).
FIREBASE_EMULATORS=1 DEMO_PASSWORD=prueba-local-123 npx tsx scripts/seed-demo.ts || exit 1
node functions/test/armado.emulator.mjs; A=$?
node functions/test/faltauno.emulator.mjs; B=$?
node functions/test/clientes.emulator.mjs; C=$?
node functions/test/resultados.emulator.mjs; D=$?
node functions/test/invitados.emulator.mjs; E=$?
node functions/test/billetera.emulator.mjs; F=$?
exit $((A || B || C || D || E || F))
