import { detectRuntimes, detectRuntime, checkGameRequirements, installRuntime, detectDirectXVersion } from '../modules/runtime-detector'
import type { RuntimeType } from '../modules/runtime-detector'

export const runtimeDetectorService = {
  async detectAll() {
    const runtimes = detectRuntimes()
    const directX = detectDirectXVersion()
    return { runtimes, directX }
  },
  async detectRuntime(type: string) {
    return detectRuntime(type as RuntimeType)
  },
  async checkRequirements() {
    return checkGameRequirements()
  },
  async installRuntime(type: string) {
    return installRuntime(type as RuntimeType)
  },
  async detectDirectX() {
    return detectDirectXVersion()
  },
}
