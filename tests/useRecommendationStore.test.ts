import { describe, it, expect, beforeEach } from 'vitest'
import { useRecommendationStore } from '../src/stores/useRecommendationStore'
import type { RecommendableGame } from '../src/lib/recommendations'

function makeGame(overrides: Partial<RecommendableGame> & { app_id: string }): RecommendableGame {
  return {
    name: 'Test Game',
    type: 'game' as const,
    image: '',
    description: '',
    reason: 'test',
    ...overrides,
  }
}

beforeEach(() => {
  useRecommendationStore.setState({
    recommendations: [],
    consumedAppIds: new Set(),
    selected: null,
  })
})

describe('useRecommendationStore', () => {
  it('starts with empty recommendations', () => {
    const state = useRecommendationStore.getState()
    expect(state.recommendations).toHaveLength(0)
    expect(state.consumedAppIds.size).toBe(0)
    expect(state.selected).toBeNull()
  })

  it('setRecommendations replaces the list', () => {
    const games = [makeGame({ app_id: '100' }), makeGame({ app_id: '200' })]
    useRecommendationStore.getState().setRecommendations(games)
    expect(useRecommendationStore.getState().recommendations).toHaveLength(2)
  })

  it('consumeGame removes from recommendations and adds to consumed', () => {
    const games = [
      makeGame({ app_id: '100', name: 'Game A' }),
      makeGame({ app_id: '200', name: 'Game B' }),
      makeGame({ app_id: '300', name: 'Game C' }),
    ]
    useRecommendationStore.getState().setRecommendations(games)
    useRecommendationStore.getState().consumeGame('200')

    const state = useRecommendationStore.getState()
    expect(state.recommendations).toHaveLength(2)
    expect(state.recommendations.find(g => g.app_id === '200')).toBeUndefined()
    expect(state.consumedAppIds.has('200')).toBe(true)
    expect(state.consumedAppIds.has('100')).toBe(false)
  })

  it('consumeGame on already consumed id is idempotent', () => {
    const games = [makeGame({ app_id: '100' })]
    useRecommendationStore.getState().setRecommendations(games)
    useRecommendationStore.getState().consumeGame('100')
    useRecommendationStore.getState().consumeGame('100')
    expect(useRecommendationStore.getState().recommendations).toHaveLength(0)
    expect(useRecommendationStore.getState().consumedAppIds.size).toBe(1)
  })

  it('consumeGame consumes last remaining game', () => {
    const games = [makeGame({ app_id: '100' })]
    useRecommendationStore.getState().setRecommendations(games)
    useRecommendationStore.getState().consumeGame('100')
    expect(useRecommendationStore.getState().recommendations).toHaveLength(0)
  })

  it('selectGame sets selected game', () => {
    const game = makeGame({ app_id: '100', name: 'Portal 2' })
    useRecommendationStore.getState().selectGame(game)
    expect(useRecommendationStore.getState().selected?.app_id).toBe('100')
    expect(useRecommendationStore.getState().selected?.name).toBe('Portal 2')
  })

  it('clearSelection clears selected game', () => {
    const game = makeGame({ app_id: '100' })
    useRecommendationStore.getState().selectGame(game)
    useRecommendationStore.getState().clearSelection()
    expect(useRecommendationStore.getState().selected).toBeNull()
  })

  it('resetConsumed clears consumed set without affecting recommendations', () => {
    const games = [makeGame({ app_id: '100' })]
    useRecommendationStore.getState().setRecommendations(games)
    useRecommendationStore.getState().consumeGame('100')
    useRecommendationStore.getState().resetConsumed()
    expect(useRecommendationStore.getState().consumedAppIds.size).toBe(0)
    expect(useRecommendationStore.getState().recommendations).toHaveLength(0)
  })

  it('prevents duplicate app_ids in recommendations', () => {
    const game = makeGame({ app_id: '100' })
    useRecommendationStore.getState().setRecommendations([game, game])
    expect(useRecommendationStore.getState().recommendations).toHaveLength(2)
  })
})
