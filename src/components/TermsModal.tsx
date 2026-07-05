import { X, ShieldAlert, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '../lib/i18n'

interface TermsModalProps {
  open: boolean
  onClose: () => void
  type: 'terms' | 'privacy'
}

export function TermsModal({ open, onClose, type }: TermsModalProps) {
  const isTerms = type === 'terms'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-2xl bg-zinc-900 border border-white/[0.08] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-3">
                {isTerms ? (
                  <FileText className="w-5 h-5 text-accent" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-accent" />
                )}
                <h2 className="text-lg font-bold text-white">
                  {isTerms ? t('login.termsOfService') : t('login.privacyPolicy')}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 overflow-y-auto space-y-4 text-sm text-zinc-300 leading-relaxed">
              {isTerms ? (
                <>
                  <section>
                    <h3 className="text-white font-semibold mb-2">1. Aceptación de los términos</h3>
                    <p>
                      Al utilizar Y-core, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo
                      con alguna parte, no debes utilizar la aplicación.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">2. No afiliación con Valve Corporation</h3>
                    <p>
                      Y-core no está afiliado, asociado, autorizado, respaldado por, ni de ninguna manera oficialmente
                      conectado con Valve Corporation, Steam, o cualquiera de sus subsidiarias o afiliados. Todos los
                      nombres, marcas y logotipos de Steam son propiedad de sus respectivos dueños.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">3. Responsabilidad sobre suspensiones de Steam</h3>
                    <p>
                      El uso de Y-core puede implicar la modificación del cliente de Steam mediante la instalación de
                      hooks (DLLs). Reconoces y aceptas que:
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>Valve Corporation puede detectar estas modificaciones.</li>
                      <li>Tu cuenta de Steam puede ser suspendida o baneada como consecuencia.</li>
                      <li>Y-core no se hace responsable de ninguna suspensión, ban, pérdida de cuenta o pérdida de juegos.</li>
                      <li>Utilizas esta herramienta bajo tu propio riesgo.</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">4. Uso aceptable</h3>
                    <p>
                      Te comprometes a no utilizar Y-core para: distribuir contenido malicioso, realizar actividades
                      comerciales ilegales, infringir derechos de propiedad intelectual, o dañar la experiencia de
                      otros usuarios.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">5. Software de terceros</h3>
                    <p>
                      Y-core integra y depende de software de terceros, incluyendo pero no limitado a Steam, depotbox.org,
                      y bibliotecas de código abierto. No nos hacemos responsables del funcionamiento o disponibilidad
                      de estos servicios externos.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">6. Limitación de responsabilidad</h3>
                    <p>
                      Y-core se proporciona "tal cual", sin garantías de ningún tipo, expresas o implícitas. En ningún
                      caso el equipo de Y-core será responsable por daños directos, indirectos, incidentales,
                      especiales o consecuentes resultantes del uso o la imposibilidad de uso de la aplicación.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">7. Modificaciones</h3>
                    <p>
                      Nos reservamos el derecho de modificar estos términos en cualquier momento. Es tu responsabilidad
                      revisarlos periódicamente. El uso continuado de Y-core constituye la aceptación de los términos
                      modificados.
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <h3 className="text-white font-semibold mb-2">1. Datos que recopilamos</h3>
                    <p>
                      Y-core recopila la siguiente información para proporcionar sus servicios:
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>Credenciales de cuenta (email, nombre de usuario, hash de contraseña).</li>
                      <li>Lista de juegos instalados en tu biblioteca de Steam.</li>
                      <li>Configuraciones de la aplicación (idioma, tema, preferencias).</li>
                      <li>Logs de eventos para diagnóstico y depuración.</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">2. Datos locales vs. remotos</h3>
                    <p>
                      La mayoría de los datos se almacenan localmente en tu equipo. Los datos de cuenta se almacenan
                      en nuestros servidores para permitir la autenticación. Los logs se guardan en tu disco local
                      y nunca se envían automáticamente a nuestros servidores.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">3. No compartimos tus datos</h3>
                    <p>
                      No vendemos, alquilamos ni compartimos tus datos personales con terceros. Tus datos se utilizan
                      exclusivamente para proporcionar la funcionalidad de Y-core.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">4. Seguridad</h3>
                    <p>
                      Implementamos medidas de seguridad razonables para proteger tus datos. Sin embargo, ninguna
                      transmisión por internet o almacenamiento electrónico es 100% seguro.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">5. Tus derechos</h3>
                    <p>
                      Puedes solicitar la eliminación de tu cuenta y todos los datos asociados en cualquier momento
                      contactando al equipo de soporte.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-white font-semibold mb-2">6. Cookies y tokens</h3>
                    <p>
                      Y-core utiliza tokens de autenticación almacenados localmente para mantener tu sesión activa.
                      No utilizamos cookies de seguimiento ni herramientas de analítica de terceros.
                    </p>
                  </section>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex-shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-accent text-black font-semibold text-sm hover:bg-accent-hover transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
