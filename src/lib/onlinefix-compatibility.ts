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
  }
  return reasons[reason] || reason
}
