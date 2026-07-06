import { BrowserWindow, Tray } from 'electron'
import { logger } from './logger'

// Shared mutable state across Electron main process modules
export const state = {
  mainWindow: null as BrowserWindow | null,
  loginWindow: null as BrowserWindow | null,
  splashWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  username: null as string | null,
  isQuitting: false,
  gamesCache: null as any[] | null,
}

export function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

export function getLoginWindow(): BrowserWindow | null {
  return state.loginWindow
}

export function getSplashWindow(): BrowserWindow | null {
  return state.splashWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  state.mainWindow = win
}

export function setLoginWindow(win: BrowserWindow | null): void {
  state.loginWindow = win
}

export function setSplashWindow(win: BrowserWindow | null): void {
  state.splashWindow = win
}

export function setIsQuitting(val: boolean): void {
  state.isQuitting = val
}

export function getIsQuitting(): boolean {
  return state.isQuitting
}
