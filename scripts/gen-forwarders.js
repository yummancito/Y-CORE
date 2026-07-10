const fs = require('fs');
const path = require('path');

const hooked = [
  'SteamAPI_Init',
  'SteamAPI_InitFlat',
  'SteamInternal_SteamAPI_Init',
  'SteamAPI_InitSafe',
  'SteamAPI_InitAnonymousUser',
  'SteamInternal_ContextInit',
  'SteamAPI_Shutdown',
  'SteamAPI_ReleaseCurrentThreadMemory',
  'SteamInternal_CreateInterface',
  'SteamInternal_FindOrCreateUserInterface',
  'SteamInternal_FindOrCreateGameServerInterface',
  'SteamAPI_GetHSteamUser',
  'SteamAPI_GetHSteamPipe',
  'SteamAPI_SetMiniDumpComment',
  'SteamAPI_WriteMiniDump',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_GetSteamInstallPath',
];

function genForwarders(defPath, outPath, origDllName) {
  const def = fs.readFileSync(defPath, 'ascii');
  const lines = def.split('\n').slice(2).map(l => l.trim().split('=')[0].trim()).filter(n => n);
  let out = '// Auto-generated forwarder exports\n';
  for (const n of lines) {
    if (!hooked.includes(n)) {
      out += '#pragma comment(linker, "/export:' + n + '=' + origDllName + '.' + n + '")\n';
    }
  }
  fs.writeFileSync(outPath, out, 'ascii');
  console.log('Generated ' + lines.length + ' forwarders -> ' + outPath);
}

genForwarders(
  path.join(__dirname, '..', 'native', 'ycore-online', 'steam_api64_exports.def'),
  path.join(__dirname, '..', 'native', 'ycore-online', 'src', 'forwarders_x64.cpp'),
  'steam_api64_o'
);

genForwarders(
  path.join(__dirname, '..', 'native', 'ycore-online', 'steam_api_exports.def'),
  path.join(__dirname, '..', 'native', 'ycore-online', 'src', 'forwarders_x86.cpp'),
  'steam_api_o'
);
