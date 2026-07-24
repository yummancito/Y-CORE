// scripts/sync-catalog.mjs — auto-injects error entries derived from src/lib/i18n.ts
// errors.* keys + regex patterns in src/lib/error-translator.ts DIRECTLY into the
// ALL_ERRORS array inside error-catalog.html, plus mirrors into rebuild-catalog.js T map
// for safety. Idempotent: re-running is a no-op when already in sync.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const I18N_TS        = path.join(ROOT, 'src/lib/i18n.ts');
const TRANSLATOR     = path.join(ROOT, 'src/lib/error-translator.ts');
const CATALOG_JS     = path.join(ROOT, 'rebuild-catalog.js');
const CATALOG_HTML   = path.join(ROOT, 'error-catalog.html');

console.log('[Sync] Sources:', path.relative(ROOT, I18N_TS), '|', path.relative(ROOT, TRANSLATOR));

const i18nText       = fs.readFileSync(I18N_TS, 'utf8');
const translatorText = fs.readFileSync(TRANSLATOR, 'utf8');
let   catalogJsText  = fs.readFileSync(CATALOG_JS, 'utf8');
let   catalogHtmlText = fs.readFileSync(CATALOG_HTML, 'utf8');

// ============================================================
// 1. Extract errors.* keys + values from `const es: Dict = { ... }` block
// ============================================================
const esStart = i18nText.indexOf('const es:');
if (esStart === -1) fail('`const es:` not found in i18n.ts');
const braceOpen = i18nText.indexOf('{', esStart);
if (braceOpen === -1) fail('`{` after `const es:` not found');

let depth = 0, inStr = null, esc = false, inL = false, inB = false, esEnd = -1;
for (let i = braceOpen; i < i18nText.length; i++) {
  const c = i18nText[i], n = i18nText[i+1];
  if (inL) { if (c === '\n') inL = false; continue; }
  if (inB) { if (c === '*' && n === '/') { inB = false; i++; } continue; }
  if (inStr) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === inStr) inStr = null; continue; }
  if (c === '/' && n === '/') { inL = true; i++; continue; }
  if (c === '/' && n === '*') { inB = true; i++; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { esEnd = i; break; } }
}
if (esEnd === -1) fail('matched `}` for es dict not found');

const esBlock = i18nText.slice(braceOpen + 1, esEnd);
const keyRe = /'((?:errors|common)\.[a-zA-Z0-9_.]+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
const keyToValue = new Map();
let m;
while ((m = keyRe.exec(esBlock)) !== null) keyToValue.set(m[1], m[2]);
console.log('[Sync] errors.* / common.* keys:', keyToValue.size);
if (keyToValue.size < 5) fail('too few keys parsed — i18n.ts format may have changed');

// ============================================================
// 2. Extract regex → key pairs from error-translator.ts
// ============================================================
const translatorRe = /\[\s*\/((?:[^/\\]|\\.)+)\/[gimsuy]*\s*,\s*'((?:errors|common)\.[a-zA-Z0-9_.]+)'/g;
const keyToPattern = new Map();
let tm;
while ((tm = translatorRe.exec(translatorText)) !== null) {
  const pat = tm[1].replace(/\\(.)/g, '$1');
  if (!keyToPattern.has(tm[2])) keyToPattern.set(tm[2], pat);
}
console.log('[Sync] regex patterns:', keyToPattern.size);

// ============================================================
// 3. Read error-catalog.html ALL_ERRORS array, extract IDs
// ============================================================
const scriptMatch = catalogHtmlText.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) fail('error-catalog.html has no <script>');
const oldScript = scriptMatch[1];
const dataDeclMatch = oldScript.match(/const ALL_ERRORS = (\[[\s\S]*?\]);/);
if (!dataDeclMatch) fail('error-catalog.html does not declare const ALL_ERRORS');

let arr;
try { arr = JSON.parse(dataDeclMatch[1]); }
catch (e) { fail('ALL_ERRORS JSON parse: ' + e.message); }
console.log('[Sync] current entries in catalog:', arr.length);
const existingIds = new Set(arr.map(e => e.id));

// Find position in error-catalog.html where the ]; of ALL_ERRORS ends
const arrayEndIdx = catalogHtmlText.indexOf(dataDeclMatch[0]) + dataDeclMatch[0].length - 2;
// arrayEndIdx points at the `]` character

// ============================================================
// 4. Pre-existing TR-* coverage in rebuild-catalog.js T
// ============================================================
const trKeyMap = {
  'TR-STEAM-NOT-FOUND':     'errors.steam.not_found',
  'TR-STEAM-NOT-RUNNING':   'errors.steam.not_running',
  'TR-STEAM-PATH':          'errors.steam.path',
  'TR-STEAM-CONFIG':        'errors.steam.config',
  'TR-STEAM-TIMEOUT':       'errors.steam.timeout',
  'TR-STEAM-BUSY':          'errors.steam.busy',
  'TR-APP-NOT-FOUND':       'errors.app.not_found',
  'TR-APP-INVALID':         'errors.app.invalid',
  'TR-DOWNLOAD-FAIL':       'errors.download.failed',
  'TR-NETWORK':             'errors.network',
  'TR-APP-INVALID-2':       'errors.app.invalid',
  'TR-TIMEOUT':             'errors.timeout',
  'TR-PERMISSION':          'errors.permission',
  'TR-DISK-FULL':           'errors.disk.full',
  'TR-DISK-SPACE':          'errors.disk.space',
  'TR-DISK-WRITE':          'errors.disk.write',
  'TR-DISK-READ':           'errors.disk.read',
  'TR-FILE-CORRUPT':        'errors.file.corrupt',
  'TR-MANIFEST-INVALID':    'errors.manifest.invalid',
  'TR-DEPOT-UNAVAILABLE':   'errors.depot.unavailable',
  'TR-DEPOT-KEY':           'errors.depot.key',
  'TR-LIB-MISSING':         'errors.library.missing',
  'TR-DLL-MISSING':         'errors.library.missing',
  'TR-REDIST':              'errors.redistributable',
  'TR-ACF-PARSE':           'errors.acf.parse',
  'TR-ACF-NOT-FOUND':       'errors.acf.not_found',
};
const coveredKeys = new Set(Object.values(trKeyMap));

function makeTailId(key) {
  return 'TAIL-ES-' + key.replace(/^errors\./, '').replace(/[._]/g, '-').toUpperCase();
}

// ============================================================
// 5. Determine missing: any errors.* / common.* key not present in:
//    - existingIds in ALL_ERRORS
//    - trKeyMap coverage
//    - existing TAIL-ES-* in catalog html
// ============================================================
function isAlreadyPresent(key) {
  if (coveredKeys.has(key)) return true;
  if (existingIds.has(makeTailId(key))) return true;
  // also check for entries whose category suggests this key
  return false;
}

const missing = [];
for (const [key, value] of keyToValue.entries()) {
  if (isAlreadyPresent(key)) continue;
  missing.push({ key, value, tailId: makeTailId(key), pattern: keyToPattern.get(key) });
}
console.log('[Sync] missing entries to inject:', missing.length);
if (missing.length === 0) {
  console.log('[Sync] up to date.');
  process.exit(0);
}

// ============================================================
// 6. Build entry injection strings
// ============================================================
function jsString(s) { return JSON.stringify(s); }

const titleMap = {
  not_found: 'No encontrado', notrunning: 'No en ejecución', not_running: 'No en ejecución',
  path: 'Ruta inválida', config: 'Configuración dañada',
  timeout: 'Tiempo agotado', busy: 'Ocupado',
  not_found_app: 'App no encontrada', invalid_app: 'App inválida',
  invalid: 'Inválido', failed: 'Falló', network: 'Sin red',
  connection: 'Conexión', permission: 'Permiso denegado',
  full: 'Disco lleno', space: 'Espacio insuficiente',
  write: 'Error de escritura', read: 'Error de lectura',
  corrupt: 'Archivo dañado', invalid_manifest: 'Manifiesto inválido',
  unavailable: 'No disponible', key: 'Clave faltante',
  missing: 'Librería faltante', redistributable: 'Redistribuible faltante',
  parse: 'Lectura fallida', acf_not_found: 'ACF no encontrado',
  retry: 'Reintentar', offline: 'Sin conexión',
  generic: 'Genérico',
  crash_title: 'Crash detectado', crash_desc: 'Descripción del crash',
  crash_reload: 'Recargar', crash_copy: 'Copiar error', crash_report: 'Reportar',
  fallback: 'Fallback', suggestions_steam_not_found: 'Sugerencia Steam',
  suggestions_steam_not_running: 'Sugerencia Steam corriendo',
  suggestions_generic: 'Sugerencia genérica',
};

const subTitleMap = {
  steam: 'Steam', app: 'app', download: 'descarga', network: 'red',
  disk: 'disco', file: 'archivo', permission: 'permiso', timeout: 'timeout',
  library: 'librería', depot: 'depósito', acf: 'ACF',
  manifest: 'manifiesto', redistributable: 'redistribuible', crash: 'crash',
  retry: 'reintentar', offline: 'offline', generic: 'genérico',
  fallback: 'genérico', suggestions: 'sugerencias',
};

const triggerTitleMap = {}; // unused

let htmlInjection = '';
let jsInjection = '';
for (const { key, value, tailId, pattern } of missing) {
  // Strip errors. prefix and split on dot/dash
  const segments = key.replace(/^errors\./, '').split(/[._]/).filter(Boolean);
  const sub = segments[0] || 'genérico';
  const last = segments[segments.length - 1] || key;

  const category = `Traductor (${subTitleMap[sub] || sub})`;
  const titleText = titleMap[last] || (segments.join(' '));
  const technical = pattern
    ? `Origen: regex /${pattern}/i en error-translator.ts → clave ${key} de i18n.ts`
    : `Origen: clave ${key} de i18n.ts (sin patrón regex en error-translator.ts)`;
  const triggers = pattern
    ? [`Cuando el mensaje de error contiene: "${pattern}"`]
    : [`Fallback cuando ningún patrón de error-translator.ts matchea el mensaje`];

  // Build the entry as JS object syntax (for ALL_ERRORS JSON-friendly)
  const entryLiteral = JSON.stringify({
    id: tailId,
    severity: 'warning',
    category,
    title: titleText,
    message: value,
    technical,
    source: 'src/lib/i18n.ts',
    actions: [],
    triggers,
  }, null, 2);

  // For the HTML file (ALL_ERRORS raw JSON), we just inject entryLiteral as is,
  // followed by a comma
  htmlInjection += '  ' + entryLiteral + ',\n';

  // For rebuild-catalog.js T map (translation lookup), store ONLY the Spanish message string.
  // Re-injecting the full entry object here would later be assigned into entry.message (overwriting
  // the i18n-derived Spanish with the JSON literal of the whole object).
  jsInjection += `  // AUTO — derived from i18n.ts key '${key}'\n`;
  jsInjection += `  '${tailId}': ${jsString(value)},\n`;
}

// ============================================================
// 7. Inject into error-catalog.html ALL_ERRORS array
// ============================================================
// Find end-of-array position: locate the `]` that closes ALL_ERRORS, after the last existing entry.
// dataDeclMatch[0] ends with `];` at position (catalogHtmlText.indexOf(dataDeclMatch[0]) + dataDeclMatch[0].length - 1)
// But we want to insert BEFORE that `]`.

// Use the index we computed earlier
const insertHtmlPos = arrayEndIdx;  // points at `]`

// Critical: ensure a comma separates the last existing entry's `}` from our first new entry's `{`.
// Trim trailing whitespace from the slice; if it doesn't end with `,`, prepend one.
const origSliceTrimmed = catalogHtmlText.slice(0, insertHtmlPos).replace(/\s+$/, '');
const needsSep = !origSliceTrimmed.endsWith(',');
const newHtmlText = origSliceTrimmed
  + (needsSep ? ',' : '')
  + htmlInjection.replace(/,\n$/, '')  // strip trailing comma from last injected entry
  + catalogHtmlText.slice(insertHtmlPos);

// ============================================================
// 8. Inject into rebuild-catalog.js T map
// ============================================================
const anchorJs = '// APPEND_TAIL_HERE';
const anchorJsIdx = catalogJsText.indexOf(anchorJs);
if (anchorJsIdx === -1) fail('anchor `// APPEND_TAIL_HERE` not found in rebuild-catalog.js');
const insertJsPos = catalogJsText.indexOf('\n', anchorJsIdx) + 1;
const newJsText = catalogJsText.slice(0, insertJsPos) + jsInjection + catalogJsText.slice(insertJsPos);

// ============================================================
// 9. Write atomically
// ============================================================
fs.writeFileSync(CATALOG_HTML, newHtmlText);
fs.writeFileSync(CATALOG_JS, newJsText);
console.log('[Sync] injected', missing.length, 'entries:');
console.log('  → error-catalog.html ALL_ERRORS array');
console.log('  → rebuild-catalog.js T map (mirrored)');
console.log('[Sync] sample IDs:', missing.slice(0, 6).map(m => m.tailId).join(', '));

function fail(msg) {
  console.error('[Sync] FATAL:', msg);
  process.exit(1);
}
