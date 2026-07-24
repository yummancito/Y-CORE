// Dev-only stand-in for the Electron preload bridge (window.steamtools).
// Lets the renderer boot in a plain browser tab for UI preview/screenshots.
// Never runs in the packaged app: window.steamtools always exists there,
// and import.meta.env.DEV is false (tree-shaken) in production builds.

const fakeGames: InstalledGame[] = [
  {
    appId: '730',
    name: 'Counter-Strike 2',
    installDir: 'Counter-Strike Global Offensive',
    universe: '1',
    stateFlags: '4',
    sizeOnDisk: 32_000_000_000,
    lastUpdated: Date.now() / 1000,
    lastPlayed: Date.now() / 1000,
    installedAt: Date.now() / 1000,
    buildid: '1000',
    bytesToDownload: 0,
    bytesDownloaded: 0,
    autoUpdateBehavior: '0',
    manifestFile: 'appmanifest_730.acf',
    playtime: 842,
  },
  {
    appId: '1245620',
    name: 'ELDEN RING',
    installDir: 'ELDEN RING',
    universe: '1',
    stateFlags: '4',
    sizeOnDisk: 45_000_000_000,
    lastUpdated: Date.now() / 1000,
    lastPlayed: Date.now() / 1000,
    installedAt: Date.now() / 1000,
    buildid: '1000',
    bytesToDownload: 0,
    bytesDownloaded: 0,
    autoUpdateBehavior: '0',
    manifestFile: 'appmanifest_1245620.acf',
    playtime: 210,
  },
  {
    appId: '1091500',
    name: "Cyberpunk 2077",
    installDir: 'Cyberpunk 2077',
    universe: '1',
    stateFlags: '4',
    sizeOnDisk: 70_000_000_000,
    lastUpdated: Date.now() / 1000,
    lastPlayed: Date.now() / 1000,
    installedAt: Date.now() / 1000,
    buildid: '1000',
    bytesToDownload: 0,
    bytesDownloaded: 0,
    autoUpdateBehavior: '0',
    manifestFile: 'appmanifest_1091500.acf',
    playtime: 96,
  },
]

const fakeAppDetails: Record<string, any> = {
  '730': {
    name: 'Counter-Strike 2',
    steam_appid: 730,
    short_description: 'El shooter táctico competitivo más jugado del mundo, ahora sobre el motor Source 2.',
    about_the_game: 'Counter-Strike 2 marca la mayor actualización técnica en la historia de la franquicia. Mapas remasterizados, humo dinámico y física de proyectiles renovada para el modo competitivo más popular del planeta.',
    detailed_description: 'Counter-Strike 2 marca la mayor actualización técnica en la historia de la franquicia, con humo dinámico, iluminación renovada y física de proyectiles mejorada.',
    header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
    capsule_image: 'https://cdn.akamai.steamstatic.com/steam/apps/730/capsule_231x87.jpg',
    capsule_imagev5: '',
    background: '',
    background_raw: '',
    is_free: true,
    developers: ['Valve'],
    publishers: ['Valve'],
    platforms: { windows: true, mac: false, linux: false },
    categories: [{ id: 1, description: 'Multijugador' }, { id: 49, description: 'PvP' }],
    genres: [{ id: '1', description: 'Acción' }, { id: '37', description: 'Free To Play' }],
    screenshots: [],
    pc_requirements: {
      minimum: 'Mínimo: SO: Windows 10<br>Procesador: 4 hilos<br>Memoria: 8 GB RAM<br>Gráficos: 8 GB VRAM',
      recommended: 'Recomendado: SO: Windows 11<br>Procesador: 6 hilos<br>Memoria: 16 GB RAM<br>Gráficos: 8 GB VRAM',
    },
    release_date: { coming_soon: false, date: '27 sep, 2023' },
  },
  '1245620': {
    name: 'ELDEN RING',
    steam_appid: 1245620,
    short_description: 'Álzate, Sinluz. Explora las Tierras Intermedias en el aclamado RPG de acción de FromSoftware.',
    about_the_game: 'ELDEN RING es un RPG de acción y fantasía desarrollado por FromSoftware con la colaboración de George R. R. Martin, ambientado en un vasto mundo abierto lleno de peligro y descubrimiento.',
    detailed_description: 'Un mundo repleto de misterio y peligro te espera, con historias entrelazadas y un diseño de niveles inolvidable, marca de la casa de FromSoftware.',
    header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg',
    capsule_image: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/capsule_231x87.jpg',
    capsule_imagev5: '',
    background: '',
    background_raw: '',
    is_free: false,
    developers: ['FromSoftware Inc.'],
    publishers: ['Bandai Namco Entertainment'],
    platforms: { windows: true, mac: false, linux: false },
    categories: [{ id: 2, description: 'Un jugador' }, { id: 1, description: 'Multijugador' }],
    genres: [{ id: '3', description: 'RPG' }, { id: '1', description: 'Acción' }],
    screenshots: [],
    pc_requirements: {
      minimum: 'Mínimo: SO: Windows 10<br>Procesador: Intel Core i5-8400<br>Memoria: 12 GB RAM<br>Gráficos: GTX 1060 3GB',
      recommended: 'Recomendado: SO: Windows 10/11<br>Procesador: Intel Core i7-8700K<br>Memoria: 16 GB RAM<br>Gráficos: GTX 1070 8GB',
    },
    release_date: { coming_soon: false, date: '25 feb, 2022' },
  },
  '1091500': {
    name: 'Cyberpunk 2077',
    steam_appid: 1091500,
    short_description: 'Un RPG de acción y aventura de mundo abierto ambientado en Night City.',
    about_the_game: 'Cyberpunk 2077 es un RPG de acción de mundo abierto ambientado en Night City, una megalópolis obsesionada con el poder, el glamour y la modificación corporal.',
    detailed_description: 'Juega como V, un mercenario forajido en busca de un implante único que es la clave de la inmortalidad, en la ciudad más peligrosa del futuro.',
    header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/header.jpg',
    capsule_image: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/capsule_231x87.jpg',
    capsule_imagev5: '',
    background: '',
    background_raw: '',
    is_free: false,
    developers: ['CD PROJEKT RED'],
    publishers: ['CD PROJEKT RED'],
    platforms: { windows: true, mac: false, linux: false },
    categories: [{ id: 2, description: 'Un jugador' }],
    genres: [{ id: '3', description: 'RPG' }, { id: '1', description: 'Acción' }],
    screenshots: [],
    pc_requirements: {
      minimum: 'Mínimo: SO: Windows 10<br>Procesador: Core i7-6700<br>Memoria: 12 GB RAM<br>Gráficos: GTX 1060 6GB',
      recommended: 'Recomendado: SO: Windows 10/11<br>Procesador: Core i7-12700<br>Memoria: 16 GB RAM<br>Gráficos: RTX 2060 Super',
    },
    release_date: { coming_soon: false, date: '10 dic, 2020' },
  },
}

const overrides: Record<string, (...args: any[]) => any> = {
  appReady: async () => {},
  getLocale: async () => 'es',
  getVersion: async () => '3.0.1-dev',
  isAuthenticated: async () => true,
  getUsername: async () => 'Y-core Demo',
  getPathForFile: () => '',
  getSteamPath: async () => ({ success: true, path: 'C:\\Program Files (x86)\\Steam' }),
  getLibraryFolders: async () => ({ success: true, folders: ['C:\\Program Files (x86)\\Steam'] }),
  listInstalledGames: async () => ({ success: true, games: fakeGames }),
  isSteamRunning: async () => ({ running: true }),
  checkVerification: async () => ({ installed: true, missing: [] }),
  listManifestFiles: async () => ({ success: true, manifests: [] }),
  listLuaScripts: async () => ({ success: true, scripts: [] }),
  storeGetLocalAppIds: async () => ({ success: true, appIds: [] }),
  getLogs: async () => [],
  getLogConfig: async () => ({ enabled: true, minLevel: 'INFO', maxFileSize: 5_000_000, maxBackups: 3 }),
  readConfig: async () => ({ colorTheme: 'ct-y-core' }),
  fetchAppDetails: async (appId: string) => {
    const data = fakeAppDetails[appId]
    return data ? { success: true, data } : { success: false }
  },
  searchGames: async () => ({ success: true, results: [] }),
  onSteamError: () => () => {},
  onLogEntry: () => () => {},
  onUpdateAvailable: () => () => {},
  onUpdateProgress: () => () => {},
  onUpdateDownloaded: () => () => {},
  onUpdateError: () => () => {},
}

export function installMockSteamtools() {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined' || window.steamtools) return

  window.steamtools = new Proxy({} as Window['steamtools'], {
    get(_target, prop: string) {
      if (prop in overrides) return overrides[prop]
      return async () => ({ success: true })
    },
  })
}
