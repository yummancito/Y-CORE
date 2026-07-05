import {
  HeartPulse,
  Users,
  Ghost,
  AlertTriangle,
  Dumbbell,
  Swords,
  Gamepad2,
  Crown,
  BookOpen,
  Compass,
} from 'lucide-react'
import { t } from './i18n'

export type CategoryId =
  | 'survival'
  | 'roleplay'
  | 'horror'
  | 'nsfw'
  | 'sports'
  | 'action'
  | 'simulation'
  | 'strategy'
  | 'education'
  | 'adventure'
  | 'all'

export interface StoreCategory {
  id: CategoryId
  label: string
  icon: React.ComponentType<{ className?: string }>
  keywords: string[]
}

export const CATEGORIES: StoreCategory[] = [
  {
    id: 'survival',
    label: t('store.category.survival'),
    icon: HeartPulse,
    keywords: ['survival', 'survive', 'ark', 'valheim', 'raft', 'the forest', 'subnautica', 'green hell', 'long dark', 'stranded', 'dont starve', 'rust', 'dayz', 'project zomboid', 'state of decay', 'scum', 'unturned', 'icarus', 'empyrion', 'grounded', '7 days to die', 'sons of the forest'],
  },
  {
    id: 'roleplay',
    label: t('store.category.roleplay'),
    icon: Users,
    keywords: ['roleplay', 'rpg', 'fallout', 'skyrim', 'witcher', 'cyberpunk', 'baldur', 'mass effect', 'dragon age', 'disco elysium', 'kingdom come', 'outer worlds', 'pillars', 'pathfinder', 'divinity', 'neverwinter', 'dungeons', 'final fantasy', 'persona', 'xenoblade', 'monster hunter', 'pokemon', 'tales of', 'dragon quest', 'shin megami tensei', 'souls', 'dark souls', 'bloodborne', 'elden ring', 'sekiro', 'nioh', 'kingdom hearts'],
  },
  {
    id: 'horror',
    label: t('store.category.horror'),
    icon: Ghost,
    keywords: ['horror', 'terror', 'resident evil', 'silent hill', 'dead space', 'alien', 'outlast', 'amnesia', 'phasmophobia', 'layers of fear', 'little nightmares', 'darkwood', 'visage', 'devour', 'gtfo', 'dying light', 'left 4 dead', 'back 4 blood', 'dead by daylight', 'biohazard', 'the quarry', 'until dawn', 'friday 13', 'man of medan', 'callisto', 'evil within', 'fatal frame'],
  },
  {
    id: 'nsfw',
    label: t('store.category.nsfw'),
    icon: AlertTriangle,
    keywords: ['nsfw', 'adult', 'hentai', 'lewd', 'nude', 'erotic', 'harem', 'yuri', 'yaoi', 'waifu', 'lust', 'eroge', 'uncensored', 'furry love', 'furry', 'porn', 'adult game', 'sex'],
  },
  {
    id: 'sports',
    label: t('store.category.sports'),
    icon: Dumbbell,
    keywords: ['sport', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'golf', 'fifa', 'nba', 'nfl', 'madden', 'f1', 'forza', 'gran turismo', 'wwe', 'ufc', 'tony hawk', 'skate', 'steep', 'riders republic', 'descenders', 'motogp', 'assetto', 'iracing', 'need for speed', 'burnout', 'mario kart', 'rocket league', 'racing'],
  },
  {
    id: 'action',
    label: t('store.category.action'),
    icon: Swords,
    keywords: ['action', 'shooter', 'fps', 'cod', 'call of duty', 'battlefield', 'apex', 'fortnite', 'overwatch', 'counter', 'warframe', 'doom', 'titanfall', 'halo', 'valorant', 'pubg', 'rainbow six', 'siege', 'destiny', 'borderlands', 'gears of war', 'wolfenstein', 'quake', 'darksiders', 'bayonetta', 'devil may cry', 'metal gear', 'just cause', 'far cry', 'watch dogs', 'assassin', 'hitman', 'sniper', 'ghost recon', 'arma', 'squad', 'insurgency', 'hell let loose', 'ready or not', 'red dead', 'god of war', 'rogue', 'roguelike', 'platformer'],
  },
  {
    id: 'simulation',
    label: t('store.category.simulation'),
    icon: Gamepad2,
    keywords: ['simulation', 'simulator', 'the sims', 'sims', 'farming', 'euro truck', 'american truck', 'flight', 'x-plane', 'microsoft flight', 'train', 'bus', 'car mechanic', 'garage', 'pc building', 'cooking', 'restaurant', 'house flipper', 'powerwash', 'satisfactory', 'factorio', 'shapez', 'dyson sphere', 'space engineers', 'kerbal', 'cities', 'two point', 'planet coaster', 'planet zoo', 'rollercoaster', 'zoo', 'stardew', 'harvest', 'graveyard', 'gas station', 'supermarket', 'oxygen not included', 'rimworld', 'dwarf fortress', 'megaquarium', 'colony', 'spore', 'evolution', 'universe sandbox'],
  },
  {
    id: 'strategy',
    label: t('store.category.strategy'),
    icon: Crown,
    keywords: ['strategy', 'rts', 'tactical', 'civilization', 'age of empires', 'total war', 'crusader', 'stellaris', 'hearts of iron', 'europa universalis', 'humankind', 'old world', 'command & conquer', 'starcraft', 'warcraft', 'company of heroes', 'men of war', 'wargame', 'panzer', 'unity of command', 'xcom', 'phoenix point', 'battletech', 'advance wars', 'fire emblem', 'triangle strategy', 'tactics', 'dune', 'frostpunk', 'they are billions', 'age of darkness', 'northgard', 'bad north', 'stronghold', 'anno', 'tropico'],
  },
  {
    id: 'education',
    label: t('store.category.education'),
    icon: BookOpen,
    keywords: ['education', 'learning', 'learn', 'math', 'science', 'physics', 'chemistry', 'biology', 'history', 'geography', 'typing', 'language', 'scratch', 'coding', 'programming', 'engineering', 'chemist', 'rocketry', 'orbit', 'nasa', 'minecraft education'],
  },
  {
    id: 'adventure',
    label: t('store.category.adventure'),
    icon: Compass,
    keywords: ['adventure', 'journey', 'zelda', 'uncharted', 'tomb raider', 'horizon', 'odyssey', 'inside', 'limbo', 'ori', 'hollow knight', 'metroid', 'castlevania', 'metroidvania', 'no man', 'subnautica', 'little nightmare', 'journey'],
  },
]

export function categoryScore(name: string, category: StoreCategory): number {
  const n = name.toLowerCase()
  return category.keywords.reduce((score, keyword) => {
    return n.includes(keyword) ? score + keyword.length : score
  }, 0)
}

export function getPrimaryCategoryFromName(name: string): CategoryId | null {
  let bestId: CategoryId | null = null
  let bestScore = 0
  for (const category of CATEGORIES) {
    const score = categoryScore(name, category)
    if (score > bestScore) {
      bestScore = score
      bestId = category.id
    }
  }
  return bestId
}
