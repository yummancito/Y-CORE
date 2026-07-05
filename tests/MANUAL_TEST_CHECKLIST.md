# Y-core Tool - Test Checklist

## DLL Smoke Test (automated)
```bash
npx tsx tests/dll-smoke-test.ts
```

## Unit Tests (automated)
```bash
npx vitest run
```

---

## Manual E2E Test Cases

### 1. Build & Compile
- [ ] `npm run build` passes without errors
- [ ] `build_y_core.bat` compiles successfully (Release + Debug)
- [ ] `YCoreTool.dll`, `dwmapi.dll`, `xinput1_4.dll` exist in `native/opensteamtool/`
- [ ] No `OpenSteamTool.dll` in `native/opensteamtool/`

### 2. App Startup
- [ ] App launches without crash
- [ ] Splash screen appears
- [ ] Login screen appears
- [ ] After login, main window shows correctly
- [ ] Sidebar shows "Online Fix" navigation item

### 3. Hook Installation
- [ ] Install hook → copies `YCoreTool.dll` to Steam directory
- [ ] Install hook → copies `dwmapi.dll` to Steam directory
- [ ] Install hook → copies `xinput1_4.dll` to Steam directory
- [ ] After install, `YCoreTool.dll` exists in Steam root
- [ ] No `OpenSteamTool.dll` in Steam root (cleaned up if was there)
- [ ] Restart Steam → Steam loads without errors
- [ ] Check `<Steam>/ycoretool/` directory is created (logs)

### 4. Online Fix - UI
- [ ] Navigate to Online Fix page → search bar visible
- [ ] Search for "Valheim" → shows as "Compatible"
- [ ] Search for "PUBG" → shows as "Incompatible" with reason
- [ ] Search for unknown game → shows as "Unknown"
- [ ] Compatible badge (green) shows on compatible games
- [ ] Incompatible badge (red) shows on incompatible games

### 5. Online Fix - Enable/Disable
- [ ] Right-click game in Library → "Online Fix" option visible
- [ ] Click "Online Fix" on compatible game → toast shows success
- [ ] Check ACF file: `-onlinefix` added to LaunchOptions
- [ ] Click "Online Fix" again → toast says "already enabled"
- [ ] Disable Online Fix → toast shows success
- [ ] Check ACF file: `-onlinefix` removed from LaunchOptions
- [ ] Disable when not enabled → toast says "not enabled"

### 6. Online Fix - Edge Cases
- [ ] Enable on game without ACF file → error toast
- [ ] Enable with invalid AppID (letters) → error: "Invalid AppID"
- [ ] Enable with empty AppID → error: "Invalid AppID"
- [ ] Enable with AppID with special chars → error: "Invalid AppID"
- [ ] Game with existing LaunchOptions → `-onlinefix` appended, not replaced
- [ ] Game without UserConfig block → UserConfig + LaunchOptions added
- [ ] Disable preserves other LaunchOptions (e.g. `-novid`)

### 7. Lua Scripts
- [ ] With `YCoreTool.dll` installed → Lua dir is `Steam/config/lua/`
- [ ] List Lua scripts → shows scripts from `config/lua/`
- [ ] Import Lua script → copies to `config/lua/`
- [ ] Delete Lua script → removes from `config/lua/`

### 8. Security Audit
- [ ] No outbound HTTP calls from YCoreTool.dll (stats API disabled)
- [ ] No remote TOML downloads (RemoteToml returns empty)
- [ ] No external manifest providers (ManifestClient returns false)
- [ ] Config `enable_api = false` by default
- [ ] Config `url = "lua"` by default

### 9. Rebranding Verification
- [ ] No "OpenSteamTool" string in any source file (excluding .deps/, build/)
- [ ] No "OSTPlatform" in any source file
- [ ] No "OPENSTEAMTOOL_" macro in any source file
- [ ] Config file is `ycoretool.toml` (lowercase)
- [ ] Log directory is `<Steam>/ycoretool/` (lowercase)
- [ ] User-Agent is `YCoreTool/1.0`
- [ ] Diagnostic popups say "YCoreTool" not "OpenSteamTool"

### 10. Game Launch
- [ ] Launch game from Library → game starts
- [ ] Game with Online Fix enabled → launches with `-onlinefix`
- [ ] Game without Online Fix → launches normally
- [ ] Steam restart works from app
- [ ] Close Steam from app works

---

## Quick Regression Script
```bash
# Run all automated tests
npx vitest run && npx tsx tests/dll-smoke-test.ts
```
