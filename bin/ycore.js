#!/usr/bin/env node
// Y-core CLI shim.
//
// Carga el entry compilado desde ./compiled/bin/ycore.js (generado por
// `pnpm build:cli` desde bin/ycore.ts + sus 4 deps).
//
// En un clone fresco, o después de un `pnpm clean`, ese directorio todavía
// no existe — mostramos mensaje accionable y salimos con código 1, en lugar
// de tirar un stacktrace genérico.
//
// Solo tratamos el fallo del require *de este archivo* como "deps faltantes":
// err.code === 'MODULE_NOT_FOUND' + este shim como último frame del stack.
// Si el código compilado falla su propio require interno (e.g. falta un
// devDep), dejamos que el stacktrace llegue al usuario — la pista "pnpm
// build:cli" sería incorrecta para ese caso.
//
// El entry exportado parsea argv y ejecuta el subcomando en su propio
// module-load side-effect. Este shim solo lo carga.

const SHIM_REQUIRE = './compiled/bin/ycore.js'
try {
  require(SHIM_REQUIRE)
} catch (err) {
  const isShimMissing =
    err &&
    err.code === 'MODULE_NOT_FOUND' &&
    Array.isArray(err.requireStack) &&
    err.requireStack[err.requireStack.length - 1] === __filename
  if (isShimMissing) {
    console.error('[ycore] Dependencias compiladas no encontradas (bin/compiled/ vacío).')
    console.error('         Si acabas de clonar el repo o hiciste `pnpm clean`, ejecuta:')
    console.error('             pnpm build:cli')
    console.error('         Si instalaste globalmente (`npm i -g y-core`) y nunca se construyó,')
    console.error('         clona el repo y enlaza con: pnpm link --global.')
    process.exit(1)
  }
  throw err
}
