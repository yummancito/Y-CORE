import { create } from 'zustand'
import { type RecommendableGame } from '../lib/recommendations'

interface RecommendationState {
  recommendations: RecommendableGame[]
  consumedAppIds: Set<string>
  selected: RecommendableGame | null
  setRecommendations: (games: RecommendableGame[]) => void
  consumeGame: (appId: string) => void
  selectGame: (game: RecommendableGame) => void
  clearSelection: () => void
  resetConsumed: () => void
}

export const useRecommendationStore = create<RecommendationState>((set) => ({
  recommendations: [],
  consumedAppIds: new Set(),
  selected: null,
  setRecommendations: (games) => set({ recommendations: games }),
  consumeGame: (appId) =>
    set((state) => ({
      recommendations: state.recommendations.filter((g) => g.app_id !== appId),
      consumedAppIds: new Set([...state.consumedAppIds, appId]),
    })),
  selectGame: (game) => set({ selected: game }),
  clearSelection: () => set({ selected: null }),
  resetConsumed: () => set({ consumedAppIds: new Set() }),
}))
