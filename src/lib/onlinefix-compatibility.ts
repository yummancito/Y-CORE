export type CompatibilityStatus = 'compatible' | 'incompatible' | 'unknown'

export interface CompatibilityEntry {
  appId: string
  name: string
  status: CompatibilityStatus
  reason?: string
}

const INCOMPATIBLE_GAMES: CompatibilityEntry[] = [
  { appId: '1336200', name: 'Sons of the Forest', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '1366540', name: 'Warhammer: Darktide', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '1646240', name: 'For the King 2', status: 'incompatible', reason: 'authentication' },
  { appId: '2378290', name: 'FBC: Firebreak', status: 'incompatible', reason: 'authentication' },
  { appId: '962130', name: 'Grounded', status: 'incompatible', reason: 'microsoft_auth' },
  { appId: '270880', name: 'American Truck Simulator', status: 'incompatible', reason: 'compatibility' },
  { appId: '239140', name: 'Dying Light', status: 'incompatible', reason: 'compatibility' },
  { appId: '578080', name: 'PUBG: BATTLEGROUNDS', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '444090', name: 'Paladins', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '813780', name: 'Age of Empires II: Definitive Edition', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '1089980', name: 'Age of Empires III: Definitive Edition', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '602280', name: 'Barotrauma', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '548430', name: 'Deep Rock Galactic', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '774171', name: 'Risk of Rain 2', status: 'incompatible', reason: 'dedicated_servers' },
  { appId: '289070', name: 'Sid Meier\'s Civilization VI', status: 'incompatible', reason: 'dedicated_servers' },
  // Rockstar Games Launcher (RGL)
  { appId: '3240220', name: 'Grand Theft Auto V Enhanced', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '12210', name: 'Grand Theft Auto IV', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '204100', name: 'Max Payne 3', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '110800', name: 'L.A. Noire', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '1227920', name: 'Max Payne 2', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '12150', name: 'Max Payne', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '2369390', name: 'Red Dead Redemption', status: 'incompatible', reason: 'rockstar_launcher' },
  { appId: '1174180', name: 'Red Dead Redemption 2', status: 'incompatible', reason: 'rockstar_launcher' },
  // EA App
  { appId: '1222680', name: 'Need for Speed Heat', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1262560', name: 'Need for Speed Unbound', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '738060', name: 'Dead Space (Remake)', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1172380', name: 'Star Wars Jedi: Fallen Order', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1774580', name: 'Star Wars Jedi: Survivor', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1238810', name: 'Battlefield V', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1238811', name: 'Battlefield 2042', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1238860', name: 'Apex Legends', status: 'incompatible', reason: 'ea_launcher' },
  { appId: '1446780', name: 'MONOPOLY Plus', status: 'incompatible', reason: 'ea_launcher' },
  // Ubisoft Connect
  { appId: '359550', name: 'Tom Clancy\'s Rainbow Six Siege', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '417910', name: 'Tom Clancy\'s The Division 2', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '236390', name: 'Tom Clancy\'s The Division', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '582010', name: 'Assassin\'s Creed Origins', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '289930', name: 'Assassin\'s Creed Odyssey', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '883710', name: 'Assassin\'s Creed Valhalla', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '561910', name: 'Far Cry 5', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '2369390', name: 'Far Cry 6', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '2050650', name: 'Avatar: Frontiers of Pandora', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '15370', name: 'Heroes of Might & Magic V', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '281990', name: 'Starlink: Battle for Atlas', status: 'incompatible', reason: 'ubisoft_connect' },
  { appId: '233450', name: 'Might & Magic: Clash of Heroes', status: 'incompatible', reason: 'ubisoft_connect' },
  // Activision / Battle.net
  { appId: '1962663', name: 'Call of Duty: Modern Warfare II', status: 'incompatible', reason: 'battlenet' },
  { appId: '1938090', name: 'Call of Duty: Modern Warfare III', status: 'incompatible', reason: 'battlenet' },
  { appId: '1999770', name: 'Call of Duty: Black Ops 6', status: 'incompatible', reason: 'battlenet' },
  { appId: '1659040', name: 'Call of Duty: Vanguard', status: 'incompatible', reason: 'battlenet' },
  { appId: '7940', name: 'Call of Duty: Black Ops', status: 'incompatible', reason: 'battlenet' },
  // Paradox Launcher
  { appId: '281990', name: 'Stellaris', status: 'incompatible', reason: 'paradox_launcher' },
  { appId: '394360', name: 'Hearts of Iron IV', status: 'incompatible', reason: 'paradox_launcher' },
  // 2K Launcher
  { appId: '1097150', name: 'Borderlands 3', status: 'incompatible', reason: 'launcher_2k' },
  { appId: '261550', name: 'Mafia II: Definitive Edition', status: 'incompatible', reason: 'launcher_2k' },
  { appId: '768200', name: 'Mafia III: Definitive Edition', status: 'incompatible', reason: 'launcher_2k' },
]

const COMPATIBLE_GAMES: CompatibilityEntry[] = [
  { appId: '892970', name: 'Valheim', status: 'compatible' },
  { appId: '1086320', name: 'Baldur\'s Gate 3', status: 'compatible' },
  { appId: '367520', name: 'Hollow Knight', status: 'compatible' },
  { appId: '460930', name: 'Don\'t Starve Together', status: 'compatible' },
  { appId: '322330', name: 'Don\'t Starve Together', status: 'compatible' },
  { appId: '105600', name: 'Terraria', status: 'compatible' },
  { appId: '413150', name: 'Stardew Valley', status: 'compatible' },
  { appId: '274850', name: 'Broforce', status: 'compatible' },
  { appId: '242760', name: 'The Forest', status: 'compatible' },
  { appId: '677120', name: 'Barony', status: 'compatible' },
  { appId: '506540', name: 'Wargroove', status: 'compatible' },
  { appId: '692890', name: 'Castle Crashers', status: 'compatible' },
  { appId: '40900', name: 'Serious Sam HD: The First Encounter', status: 'compatible' },
  { appId: '227600', name: 'Magicka', status: 'compatible' },
  { appId: '410370', name: 'Serious Sam 3: BFE', status: 'compatible' },
  { appId: '211820', name: 'Starbound', status: 'compatible' },
  { appId: '108600', name: 'Project Zomboid', status: 'compatible' },
  { appId: '251570', name: '7 Days to Die', status: 'compatible' },
  { appId: '346110', name: 'ARK: Survival Evolved', status: 'compatible' },
  { appId: '648800', name: 'Raft', status: 'compatible' },
  { appId: '527230', name: 'For The King', status: 'compatible' },
  { appId: '1621690', name: 'Core Keeper', status: 'compatible' },
  { appId: '361420', name: 'Astroneer', status: 'compatible' },
  { appId: '728880', name: 'Overcooked! 2', status: 'compatible' },
  { appId: '477160', name: 'Human Fall Flat', status: 'compatible' },
  { appId: '550', name: 'Left 4 Dead 2', status: 'compatible' },
  { appId: '620', name: 'Portal 2', status: 'compatible' },
  { appId: '49520', name: 'Borderlands 2', status: 'compatible' },
  { appId: '397540', name: 'Borderlands 3', status: 'compatible' },
  { appId: '435150', name: 'Divinity: Original Sin 2', status: 'compatible' },
  { appId: '311690', name: 'Enter the Gungeon', status: 'compatible' },
  { appId: '268910', name: 'Cuphead', status: 'compatible' },
  { appId: '4000', name: 'Garry\'s Mod', status: 'compatible' },
  { appId: '3435960', name: 'PEAK', status: 'compatible' },
  { appId: '1687950', name: 'Content Warning', status: 'compatible' },
  { appId: '739630', name: 'Phasmophobia', status: 'compatible' },
  { appId: '2186680', name: 'Warhammer 40,000: Rogue Trader', status: 'compatible' },
]

const incompatibleMap = new Map<string, CompatibilityEntry>(
  INCOMPATIBLE_GAMES.map((g) => [g.appId, g])
)
const compatibleMap = new Map<string, CompatibilityEntry>(
  COMPATIBLE_GAMES.map((g) => [g.appId, g])
)

export function getCompatibility(appId: string): CompatibilityEntry {
  const incompatible = incompatibleMap.get(appId)
  if (incompatible) return incompatible

  const compatible = compatibleMap.get(appId)
  if (compatible) return compatible

  return { appId, name: '', status: 'unknown' }
}

export function getCompatibilityReason(reason: string | undefined): string {
  if (!reason) return ''
  const reasons: Record<string, string> = {
    dedicated_servers: 'Uses dedicated servers',
    photon: 'Uses Photon networking',
    authentication: 'Requires external authentication',
    microsoft_auth: 'Requires Microsoft account',
    eos: 'Uses Epic Online Services',
    compatibility: 'Known compatibility issues',
    rockstar_launcher: 'Rockstar Games Launcher',
    ea_launcher: 'EA App',
    ubisoft_connect: 'Ubisoft Connect',
    battlenet: 'Activision / Battle.net',
    paradox_launcher: 'Paradox Launcher',
    launcher_2k: '2K Launcher',
  }
  return reasons[reason] || reason
}

export interface LauncherInfo {
  appId: string
  name: string
  launcher: string
}

const LAUNCHER_GAMES: LauncherInfo[] = [
  { appId: '3240220', name: 'Grand Theft Auto V Enhanced', launcher: 'Rockstar Games Launcher' },
  { appId: '12210', name: 'Grand Theft Auto IV', launcher: 'Rockstar Games Launcher' },
  { appId: '204100', name: 'Max Payne 3', launcher: 'Rockstar Games Launcher' },
  { appId: '110800', name: 'L.A. Noire', launcher: 'Rockstar Games Launcher' },
  { appId: '1227920', name: 'Max Payne 2', launcher: 'Rockstar Games Launcher' },
  { appId: '12150', name: 'Max Payne', launcher: 'Rockstar Games Launcher' },
  { appId: '2369390', name: 'Red Dead Redemption', launcher: 'Rockstar Games Launcher' },
  { appId: '1174180', name: 'Red Dead Redemption 2', launcher: 'Rockstar Games Launcher' },
  { appId: '1222680', name: 'Need for Speed Heat', launcher: 'EA App' },
  { appId: '1262560', name: 'Need for Speed Unbound', launcher: 'EA App' },
  { appId: '738060', name: 'Dead Space (Remake)', launcher: 'EA App' },
  { appId: '1172380', name: 'Star Wars Jedi: Fallen Order', launcher: 'EA App' },
  { appId: '1774580', name: 'Star Wars Jedi: Survivor', launcher: 'EA App' },
  { appId: '1238810', name: 'Battlefield V', launcher: 'EA App' },
  { appId: '1238811', name: 'Battlefield 2042', launcher: 'EA App' },
  { appId: '359550', name: 'Rainbow Six Siege', launcher: 'Ubisoft Connect' },
  { appId: '417910', name: 'The Division 2', launcher: 'Ubisoft Connect' },
  { appId: '582010', name: 'Assassin\'s Creed Origins', launcher: 'Ubisoft Connect' },
  { appId: '289930', name: 'Assassin\'s Creed Odyssey', launcher: 'Ubisoft Connect' },
  { appId: '883710', name: 'Assassin\'s Creed Valhalla', launcher: 'Ubisoft Connect' },
  { appId: '561910', name: 'Far Cry 5', launcher: 'Ubisoft Connect' },
  { appId: '1938090', name: 'Call of Duty: Modern Warfare III', launcher: 'Activision / Battle.net' },
  { appId: '1999770', name: 'Call of Duty: Black Ops 6', launcher: 'Activision / Battle.net' },
]

const launcherMap = new Map<string, LauncherInfo>(
  LAUNCHER_GAMES.map((g) => [g.appId, g])
)

export function getLauncherInfo(appId: string): LauncherInfo | undefined {
  return launcherMap.get(appId)
}
