import { motion, AnimatePresence } from 'framer-motion'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { t } from '../../lib/i18n'

export function OfflineBanner() {
  const online = useOnlineStatus()

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="relative z-50 flex items-center justify-center gap-2 bg-amber-600/90 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white"
        >
          <span className="w-2 h-2 rounded-full bg-amber-200 animate-pulse" />
          {t('errors.offline')}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
