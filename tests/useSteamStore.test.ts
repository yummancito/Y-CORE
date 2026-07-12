import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSteamStore } from '../src/stores/useSteamStore'

const mockGetSteamPath = vi.fn()
const mockIsSteamRunning = vi.fn()
const mockGetLibraryFolders = vi.fn()
const mockRestartSteam = vi.fn()
const mockVerifySteam = vi.fn()

beforeEach(() => {
  window.steamtools = {
    getSteamPath: mockGetSteamPath,
    isSteamRunning: mockIsSteamRunning,
    getLibraryFolders: mockGetLibraryFolders,
    restartSteam: mockRestartSteam,
    verifySteam: mockVerifySteam,
  } as any

  useSteamStore.setState({
    path: null,
    running: false,
    libraryFolders: [],
    loading: false,
  })
})

describe('useSteamStore', () => {
  it('starts with default state', () => {
    const state = useSteamStore.getState()
    expect(state.path).toBeNull()
    expect(state.running).toBe(false)
    expect(state.libraryFolders).toEqual([])
    expect(state.loading).toBe(false)
  })

  it('loadSteamPath sets path on success', async () => {
    mockGetSteamPath.mockResolvedValue({ success: true, path: 'C:\\Steam' })
    await useSteamStore.getState().loadSteamPath()
    expect(useSteamStore.getState().path).toBe('C:\\Steam')
  })

  it('loadSteamPath does not set path on failure', async () => {
    mockGetSteamPath.mockResolvedValue({ success: false, error: 'not found', path: null })
    await useSteamStore.getState().loadSteamPath()
    expect(useSteamStore.getState().path).toBeNull()
  })

  it('loadSteamRunning sets running flag', async () => {
    mockIsSteamRunning.mockResolvedValue({ running: true })
    await useSteamStore.getState().loadSteamRunning()
    expect(useSteamStore.getState().running).toBe(true)
  })

  it('loadSteamRunning sets running false', async () => {
    mockIsSteamRunning.mockResolvedValue({ running: false })
    await useSteamStore.getState().loadSteamRunning()
    expect(useSteamStore.getState().running).toBe(false)
  })

  it('loadLibraryFolders sets folders on success', async () => {
    mockGetLibraryFolders.mockResolvedValue({ success: true, folders: ['C:\\Steam', 'D:\\Games'] })
    await useSteamStore.getState().loadLibraryFolders()
    expect(useSteamStore.getState().libraryFolders).toEqual(['C:\\Steam', 'D:\\Games'])
  })

  it('loadLibraryFolders does not set folders on failure', async () => {
    mockGetLibraryFolders.mockResolvedValue({ success: false, error: 'not found', folders: [] })
    await useSteamStore.getState().loadLibraryFolders()
    expect(useSteamStore.getState().libraryFolders).toEqual([])
  })

  it('restartSteam delegates to IPC', async () => {
    mockRestartSteam.mockResolvedValue({ success: true, message: 'restarting' })
    const result = await useSteamStore.getState().restartSteam()
    expect(result.success).toBe(true)
    expect(result.message).toBe('restarting')
  })

  it('verifySteam delegates to IPC', async () => {
    mockVerifySteam.mockResolvedValue({ success: true, message: 'verified' })
    const result = await useSteamStore.getState().verifySteam()
    expect(result.success).toBe(true)
  })

  it('init loads all three values and sets loading', async () => {
    mockGetSteamPath.mockResolvedValue({ success: true, path: 'C:\\Steam' })
    mockIsSteamRunning.mockResolvedValue({ running: true })
    mockGetLibraryFolders.mockResolvedValue({ success: true, folders: ['C:\\Steam'] })

    const promise = useSteamStore.getState().init()
    expect(useSteamStore.getState().loading).toBe(true)
    await promise
    expect(useSteamStore.getState().loading).toBe(false)
    expect(useSteamStore.getState().path).toBe('C:\\Steam')
    expect(useSteamStore.getState().running).toBe(true)
    expect(useSteamStore.getState().libraryFolders).toEqual(['C:\\Steam'])
  })

  it('restartSteam returns error when IPC fails', async () => {
    mockRestartSteam.mockResolvedValue({ success: false, error: 'Steam not found' })
    const result = await useSteamStore.getState().restartSteam()
    expect(result.success).toBe(false)
    expect(result.error).toBe('Steam not found')
  })
})
