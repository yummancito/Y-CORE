# Y-Core Technical Audit — Phase 02: Startup Flow

## Overview

This document traces the complete startup sequence from user double-clicking the Y-core executable to the application being fully ready for interaction.

---

## 1. Executable Launch

### 1.1 Entry Point
- User double-clicks `Y-core Setup.exe` (NSIS installer) or `Y-core.exe` (portable)
- Electron runtime starts, loads `dist-electron/main.js` (compiled from `electron/main.ts`)

### 1.2 Early Initialization (`electron/main.ts:1-60`)

```
1. Crash logging setup
   - process.on('uncaughtException') → writes to crash log file
   - process.on('unhandledRejection') → writes to crash log file

2. App identity
   - app.setName('Y-core')
   - User data path set to default Electron userData directory

3. Single-instance lock
   - app.requestSingleInstanceLock()
   - If second instance → focuses existing window and quits
   - 'second-instance' event listener → focuses mainWindow if exists
```

### 1.3 Global Variables Declared

| Variable | Type | Purpose |
|----------|------|---------|
| `mainWindow` | `BrowserWindow \| null` | Main application window |
| `loginWindow` | `BrowserWindow \| null` | Login window |
| `splashWindow` | `BrowserWindow \| null` | Splash screen window |
| `authSession` | `AuthSession \| null` | JWT session (access + refresh tokens) |
| `isQuitting` | `boolean` | Track app quit state |
| `storeImageCache` | `Map<string, any>` | In-memory cache for Steam store images |
| `_gamesCache` | `any \| null` | In-memory cache for installed games list |

### 1.4 API URL Resolution

```typescript
const DEFAULT_API_URL = 'http://localhost:3000'
function getApiUrl(): string {
  // Reads from config file or returns default
}
```

- `getApiUrl()` reads from user config file (`ycore-config.json`) or falls back to `DEFAULT_API_URL`
- Used by Electron for manifest downloads, depot key fetches, token refresh

---

## 2. Splash Window Creation

### 2.1 `createSplashWindow()` (`main.ts:~120`)

```
1. Create BrowserWindow:
   - width: 400, height: 300
   - frame: false
   - transparent: true
   - resizable: false
   - alwaysOnTop: true
   - skipTaskbar: true
   - webPreferences:
     - preload: splash-preload.js
     - contextIsolation: true
     - nodeIntegration: false

2. Load splash.html (inline HTML file)

3. Show window when ready-to-show
```

### 2.2 Splash Preload (`electron/splash-preload.ts`)

Exposes `window.splash` API:
- `onReady(callback)` — listens for `splash:ready` IPC event
- `onStatus(callback)` — listens for `splash:status` IPC events with `{ status, percent }`

### 2.3 Splash Status Updates

The splash screen receives status updates via IPC:
```
ipcMain.handle('splash:setStatus', (_event, { status, percent }) => {
  splashWindow?.webContents.send('splash:status', { status, percent })
})
```

Status sequence during startup:
1. "Loading..." (0%)
2. "Loading catalog..." (15%) — sent by StorePage when it starts fetching
3. "Preparing store..." (75%) — sent by StorePage when catalog data arrives
4. Splash hidden when `app:ready` is received

---

## 3. Login Window Creation

### 3.1 `createLoginWindow()` (`main.ts:~200`)

```
1. Create BrowserWindow:
   - width: 900, height: 700
   - frame: false
   - resizable: false
   - webPreferences:
     - preload: preload.js
     - contextIsolation: true
     - nodeIntegration: false

2. Load URL:
   - Dev: http://localhost:5173/#/login
   - Prod: file://.../index.html#/login

3. Show window when ready-to-show
```

### 3.2 Login Window Lifecycle

- Created on `app.whenReady()` if no existing session
- Destroyed after successful login (`auth:loginSuccess` handler)
- Main window created after login window closes

---

## 4. Main Window Creation

### 4.1 `createWindow()` (`main.ts:~350`)

```
1. Create BrowserWindow:
   - width: 1280, height: 800
   - minWidth: 900, minHeight: 600
   - frame: false
   - show: false (hidden until app:ready)
   - webPreferences:
     - preload: preload.js
     - contextIsolation: true
     - nodeIntegration: false

2. Load URL:
   - Dev: http://localhost:5173/
   - Prod: file://.../index.html

3. Content Security Policy (CSP):
   - default-src: 'self'
   - script-src: 'self' 'unsafe-inline'
   - style-src: 'self' 'unsafe-inline'
   - img-src: 'self' https: data: blob:
   - connect-src: 'self' https://api.y-core.app https://depotbox.org https://store.steampowered.com https://steamcdn-a.akamaihd.net https://steamspy.com

4. Window controls IPC handlers registered:
   - window-minimize → mainWindow.minimize()
   - window-maximize → toggle maximize/restore
   - window-close → mainWindow.close()
```

### 4.2 System Tray

Created after main window:
- Icon: `build/icon.ico` (or tray icon variant)
- Context menu items: Show, Settings, Quit
- Click on tray icon → focus main window

---

## 5. `app.whenReady()` Flow (`main.ts:~480`)

```
app.whenReady() →
  1. logger.init() — initialize file logger
  2. createSplashWindow() — show splash
  3. Check for existing auth session:
     a. If session exists → createWindow() (main window)
     b. If no session → createLoginWindow()
  4. Create system tray
  5. Register modular IPC handlers:
     - registerConfigHandlers() — config:read, config:write
     - registerOnlineFixHandlers() — onlinefix:enable, onlinefix:disable, onlinefix:status
     - registerLogsHandlers() — logs:getEntries, logs:add, logs:clear, logs:export, logs:getConfig, logs:setConfig
  6. Auto-updater setup (packaged builds only):
     - autoUpdater.checkForUpdates()
     - 'update-available' → send to renderer
     - 'update-downloaded' → send to renderer
     - app:installUpdate → autoUpdater.quitAndInstall()
```

---

## 6. Renderer Bootstrap (`src/main.tsx`)

```
bootstrap() →
  1. Add 'theme-dark' class to <html>
  2. Load color theme from config:
     - window.steamtools.readConfig() → get colorTheme
     - Add theme class (default: 'ct-y-core')
  3. Detect system language:
     - window.steamtools.getLocale() → get Electron locale
     - setLanguage(detectSystemLanguage(locale))
  4. ReactDOM.createRoot() → render:
     <React.StrictMode>
       <HashRouter>
         <ErrorBoundary>
           <App />
         </ErrorBoundary>
       </HashRouter>
     </React.StrictMode>
```

---

## 7. React App Routing (`src/App.tsx`)

```
<App> →
  1. Ctrl+K listener for command palette
  2. Routes:
     /login → <LoginPage />
     /* → <ProtectedRoute>
            <AppRoutes>
              <AppShell>
                / → <LibraryPage />
                /store → <StorePage />
                /add-game → <AddGame />
                /import-game → <ImportGame />
                /logs → <LogsPage />
                /online-fix → <OnlineFixPage />
                /settings → <SettingsPage />
              </AppShell>
            </AppRoutes>
          </ProtectedRoute>
  3. <ToastContainer /> — toast notifications
  4. <UpdateNotification /> — auto-update UI
  5. <CommandPalette /> — Ctrl+K palette
```

---

## 8. Auth Initialization (`src/components/ProtectedRoute.tsx`)

```
<ProtectedRoute> →
  1. useEffect: if (!initialized) → init()
  2. useAuthStore.init():
     a. Check localStorage for 'ycore_session'
     b. If session exists:
        - Parse JWT to extract email, username
        - Sync tokens to Electron via window.steamtools.setAuthSession()
        - Set user state
     c. If no session:
        - Sync null to Electron
        - Set user: null
     d. Listen for token refresh from Electron (onTokenRefreshed)
  3. If initialized && !user:
     - Render "Waiting for login..." (login window should be visible)
  4. If initialized && user:
     - Render children
     - After 100ms delay → window.steamtools.appReady()
       → This triggers main process to:
         a. Hide splash window
         b. Show main window
         c. Focus main window
```

---

## 9. IPC: `app:ready` Handler (`main.ts:~500`)

```
ipcMain.handle('app:ready', () => {
  if (splashWindow) {
    splashWindow.close()
    splashWindow = null
  }
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})
```

---

## 10. Window Lifecycle Events

### 10.1 `window-all-closed`
```
app.on('window-all-closed') →
  if (process.platform !== 'darwin') → app.quit()
```

### 10.2 `before-quit`
```
app.on('before-quit') →
  isQuitting = true
```

### 10.3 `will-quit`
```
app.on('will-quit') →
  // Cleanup tasks
```

### 10.4 `activate` (macOS)
```
app.on('activate') →
  if (BrowserWindow.getAllWindows().length === 0) → createWindow()
```

---

## 11. Auto-Updater Flow (Packaged Builds Only)

```
1. autoUpdater.checkForUpdates()
2. 'update-available' event →
   mainWindow.webContents.send('update-available', { version })
3. 'update-downloaded' event →
   mainWindow.webContents.send('update-downloaded', { version })
4. User clicks "Install Update" in UI →
   ipcMain.handle('app:installUpdate') →
   autoUpdater.quitAndInstall()
```

---

## 12. Complete Startup Timeline

```
T=0ms     User double-clicks Y-core.exe
T=100ms   Electron runtime starts
T=200ms   Crash handlers registered, single-instance lock acquired
T=300ms   app.whenReady() fires
T=350ms   Logger initialized
T=400ms   Splash window created and shown
T=450ms   Auth session check:
            → No session: Login window created
            → Has session: Main window created (hidden)
T=500ms   System tray created
T=550ms   Modular IPC handlers registered
T=600ms   Auto-updater check (packaged only)
T=700ms   Vite dev server responds (dev mode) / index.html loaded (prod)
T=800ms   React bootstrap: theme + language detected
T=900ms   React renders ProtectedRoute
T=1000ms  Auth init: session found in localStorage, synced to Electron
T=1100ms  ProtectedRoute renders children (AppShell + LibraryPage)
T=1200ms  app:ready IPC sent (after 100ms delay)
T=1250ms  Splash window closed, main window shown and focused
T=1300ms  LibraryPage calls listInstalledGames() via IPC
T=1500ms  Store page loads catalog (if navigated to)
T=2000ms  App fully ready for user interaction
```

---

## 13. Startup Error Handling

| Scenario | Behavior |
|----------|----------|
| Second instance launched | Focuses existing window, second instance quits |
| Vite dev server not ready | Electron waits (wait-on tcp:5173 in dev script) |
| No auth session | Login window shown instead of main window |
| Config file corrupt | `config:read` returns null, defaults used |
| Logger init fails | Silent catch, app continues without file logging |
| Auto-updater network error | Silent catch, app continues without update check |
| Splash window fails to create | App continues without splash, main window shown directly |
