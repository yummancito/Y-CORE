import { useErrorStore } from '../stores/useErrorStore'
import type { YCoreNativeError } from '../../electron/modules/ycore-native'

/**
 * Muestra un error nativo en el ErrorDialog global.
 * Usa el userMessage (corto, humano), mantiene el technical para reportes.
 */
export function showNativeError(err: YCoreNativeError, retryFn?: () => void) {
  useErrorStore.setState({
    error: {
      message: err.userMessage,
      operation: err.operation,
      code: err.code,
      technical: err.technical,
      actions: err.actions,
    },
    open: true,
    retry: retryFn || null,
  })
}

/**
 * Alterna entre el error modal y una UI de fallback graceful.
 * Útil cuando hay un error pero la app puede seguir funcionando.
 */
export function handleNativeErrorGraceful(err: YCoreNativeError, log?: (msg: string) => void) {
  if (log) log(`[native] ${err.technical}`)
  // En lugar de mostrar modal alarmante, logramos de forma silenciosa.
  // La app degrada a implementación JS sin contar nada al usuario.
  // Este helper existe por si queremos cambiar la estrategia más adelante.
}
