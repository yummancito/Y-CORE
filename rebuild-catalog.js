// rebuild-catalog.js — translates all 215 error messages to natural Spanish,
// restyles CSS so message is prominent and big, validates invariants, atomic write.
const fs = require('fs');
const vm = require('vm');

const INPUT = 'error-catalog.html';
const BACKUP = 'error-catalog.bak.html';
const OUTPUT = 'error-catalog.html';

// ============================================================
// BACKUP
// ============================================================
fs.copyFileSync(INPUT, BACKUP);
console.log('Backup created:', BACKUP);

// ============================================================
// HUMAN TRANSLATIONS — per ID. Style: natural Spanish, concrete noun + verb,
// no IPC/ACF/VDF jargon unless strictly necessary, no English leftover.
// These match the user's example style: "no se encontró la carpeta de Steam."
// ============================================================
const T = {

  // ---------- BOOT ----------
  'BOOT-USERDATA-CREATE-FAIL': 'No pudimos crear la carpeta donde Y-core guarda tus datos. Libera espacio o revisa los permisos de la carpeta.',
  'BOOT-APP-READY-LATE': 'Y-core está tardando en arrancar. Ten paciencia; si pasa de 30 segundos, reinicia la aplicación.',
  'BOOT-SPLASH-IPC-MISS': 'La pantalla de inicio no responde. Cierra Y-core y vuelve a abrirla.',
  'BOOT-LOCK-NOT-GOT': 'Otra instancia de Y-core ya está abierta. Ciérrala antes de iniciar una nueva.',

  // ---------- CRASH (main) ----------
  'CRASH-CHILD-GONE': 'Un proceso interno dejó de responder. Lo registramos en los logs y la app seguirá funcionando.',
  'CRASH-RENDERER-GONE': 'La ventana principal se cerró de forma inesperada. Vamos a reiniciar Y-core para que vuelvas a usarla.',
  'CRASH-UNCAUGHT-EXCEPTION': 'Ocurrió un error interno inesperado. Tus datos están guardados; reinicia Y-core y vuelve a intentar.',
  'CRASH-UNHANDLED-REJECTION': 'Una operación interna falló silenciosamente. La app sigue funcionando, pero el resultado puede no estar completo.',

  // ---------- NATIVO (DLL) ----------
  'NAT-INTERNAL': 'El motor interno de Y-core tuvo un problema. Puedes reintentar o enviarnos un reporte para revisarlo.',
  'NAT-UNAVAILABLE': 'No pudimos cargar el motor interno de Y-core. La app sigue funcionando, pero algunas funciones avanzadas quedan desactivadas.',
  'NAT-STEAM-CFG-NOTFOUND': 'No encontramos el archivo de configuración de Steam. Usaremos la ruta estándar hasta que lo corrijas.',
  'NAT-STEAM-PATH-INVALID': 'La ruta donde está instalado Steam no es válida. Verifícala en Configuración → Steam.',

  // ---------- STEAM (log watcher) ----------
  'STM-NOT-FOUND': 'No encontramos Steam en tu PC. Asegúrate de tenerlo instalado.',
  'STM-NOT-RUNNING': 'Steam no está abierto. Inicia Steam e inténtalo de nuevo.',
  'STM-PATH': 'No se pudo encontrar la ruta donde está instalado Steam.',
  'STM-CONFIG': 'No pudimos leer la configuración de Steam. Puede estar dañada.',
  'STM-TIMEOUT': 'Steam no responde. Espera unos segundos o reinícialo.',
  'STM-BUSY': 'Steam está ocupado. Espera un momento y reintenta.',
  'STM-NET-LOSS': 'Steam perdió la conexión. La restableceremos automáticamente.',
  'STM-DISK-WRITE': 'Steam no pudo escribir en el disco. Verifica el espacio libre.',
  'STM-DLL-MISSING': 'Falta un archivo DLL necesario para que Steam funcione correctamente.',
  'STM-CRASH': 'Steam se cerró de forma inesperada. Lo reiniciaremos por ti.',
  'STM-FATAL': 'Steam tuvo un error grave. Ciérralo y vuelve a abrirlo desde el menú Inicio.',

  // ---------- TRADUCTOR (error-translator regex patterns) ----------
  'TR-STEAM-NOT-FOUND': 'No encontramos Steam en tu PC. Asegúrate de tenerlo instalado.',
  'TR-STEAM-NOT-RUNNING': 'Steam no está abierto. Inicia Steam e inténtalo de nuevo.',
  'TR-STEAM-PATH': 'No pudimos encontrar la ruta de instalación de Steam.',
  'TR-STEAM-CONFIG': 'No se pudo leer la configuración de Steam.',
  'TR-STEAM-TIMEOUT': 'Steam no respondió a tiempo. Intenta de nuevo.',
  'TR-STEAM-BUSY': 'Steam está ocupado. Espera unos segundos.',
  'TR-APP-NOT-FOUND': 'No encontramos este juego en tu biblioteca.',
  'TR-APP-INVALID': 'El identificador del juego no es válido.',
  'TR-DOWNLOAD-FAIL': 'La descarga no se pudo completar. Verifica tu conexión e intenta de nuevo.',
  'TR-NETWORK': 'No hay conexión a internet. Verifica tu red.',
  'TR-APP-INVALID-2': 'La aplicación que intentas usar no es válida.',
  'TR-TIMEOUT': 'La operación tardó demasiado. Intenta de nuevo.',
  'TR-PERMISSION': 'No tenemos permiso para acceder a ese archivo o carpeta.',
  'TR-DISK-FULL': 'No hay espacio en disco. Libera al menos 5 GB y vuelve a intentar.',
  'TR-DISK-SPACE': 'Espacio en disco insuficiente para completar la operación.',
  'TR-DISK-WRITE': 'No se pudo guardar el archivo en disco.',
  'TR-DISK-READ': 'No se pudo leer el archivo desde el disco.',
  'TR-FILE-CORRUPT': 'El archivo está dañado o corrupto. Vuelve a descargarlo.',
  'TR-MANIFEST-INVALID': 'El archivo de información del juego es inválido.',
  'TR-DEPOT-UNAVAILABLE': 'Los archivos del juego no están disponibles temporalmente.',
  'TR-DEPOT-KEY': 'No se pudo verificar la clave del juego.',
  'TR-LIB-MISSING': 'Falta una librería necesaria para ejecutar este juego.',
  'TR-DLL-MISSING': 'Falta un archivo DLL necesario para el juego.',
  'TR-REDIST': 'Falta un componente del sistema requerido por Steam.',
  'TR-ACF-PARSE': 'El archivo de información del juego está dañado.',
  'TR-ACF-NOT-FOUND': 'No se encontró el archivo de información del juego.',

  // ---------- ACF (electron/modules/acf.ts) ----------
  'ACF-WATCH-PARSE': 'No se pudo leer un archivo de control de Steam. Lo registramos y seguimos.',
  'ACF-NO-BASE': 'No encontramos los archivos base de Half-Life. Verifica que Steam esté completo.',
  'ACF-NO-STEAMAPPS': 'No se encontró la carpeta donde Steam guarda los juegos. Verifica la instalación.',

  // ---------- IPC (Auth) ----------
  'AUTH-LOGOUT-FAIL': 'No pudimos cerrar tu sesión correctamente. Tus datos locales fueron limpiados de todas formas.',

  // ---------- IPC (Config) ----------
  'CFG-INVALID-VALUE': 'Uno de los ajustes que configuraste no es válido. Lo restableceremos a su valor por defecto.',
  'CFG-TOO-BIG': 'La configuración es demasiado grande (más de 256 KB). Borra algunas personalizaciones.',

  // ---------- IPC (Depot) ----------
  'DEP-MALFORMED': 'La sección de archivos del juego está dañada. Vuelve a importar el juego.',
  'DEP-NO-CONFIGVDF': 'No se encontró el archivo de configuración de Steam. Reinstálalo o restáuralo.',
  'DEP-NO-STEAM-SEC': 'La configuración de Steam no tiene la sección que necesitamos. Está incompleta o dañada.',

  // ---------- IPC (OnlineFix) ----------
  'OF-APP-NOTFOUND': 'No se encontró el juego para el cual quieres generar Online Fix.',
  'OF-MAPPING-FAIL': 'No se pudo identificar el tipo de Online Fix necesario para este juego.',
  'OF-WRITE-FAIL': 'No se pudo escribir el archivo de Online Fix en disco. Revisa permisos y espacio.',
  'OF-READ-FAIL': 'No se pudo leer el archivo de Online Fix. Vuelve a generarlo.',

  // ---------- IPC (DLL) ----------
  'DLL-INJECT-FAIL': 'No pudimos instalar el módulo necesario para que tu juego funcione. Reinicia e inténtalo de nuevo.',
  'DLL-NOTFOUND': 'No encontramos el archivo DLL necesario. Reinstala el juego.',
  'DLL-INVALID-SIG': 'La firma del DLL no es válida. Tu antivirus puede haberlo bloqueado.',
  'DLL-VERSION-MISMATCH': 'La versión del DLL no coincide con la del juego. Actualiza ambos.',
  'DLL-LOAD-FAIL': 'No se pudo cargar el DLL. Tu sistema puede falta alguna dependencia.',
  'DLL-IPC-IPC-FAIL': 'No pudimos coordinar la inyección del DLL. Reinicia Steam y vuelve a intentar.',

  // ---------- IPC (steam / y-core API) ----------
  'SIM-CLOSE': 'No se pudo cerrar Steam. Ciérralo manualmente desde la bandeja del sistema.',
  'SIM-DELETEGAME': 'No se pudo eliminar el juego de tu biblioteca. Intenta de nuevo.',
  'SIM-DELETELUA-IPC': 'No se pudo eliminar el script Lua seleccionado.',
  'SIM-DELETEMANIFEST-IPC': 'No se pudo eliminar el archivo manifesto seleccionado.',
  'SIM-IMPORTFOLDER': 'No se pudo importar la carpeta del juego a Steam.',
  'SIM-IMPORTLUA-IPC': 'No se pudo importar el script Lua a la biblioteca.',
  'SIM-IMPORTMANIFEST-IPC': 'No se pudo importar el archivo manifesto.',
  'SIM-LAUNCHGAME-IPC': 'No se pudo iniciar el juego. Verifica que Steam esté abierto.',
  'SIM-LISTGAMES-IPC': 'No pudimos leer la lista de juegos instalados en Steam.',
  'SIM-PARSELUA-IPC': 'No se pudo leer el script Lua. Puede estar dañado.',
  'SIM-RESTART': 'No se pudo reiniciar Steam. Hazlo manualmente desde el menú Inicio.',
  'SIM-VERIFY': 'No se pudo iniciar la verificación del juego.',
  'SIM-VERIFYGAME': 'No se pudo verificar la integridad del juego.',
  'SIM-CHECKAPPTYPES': 'No se pudo identificar si el juego es gratuito o de pago.',
  'SIM-VERIFY': 'No se pudo ejecutar la verificación del juego.',
  'SIM-ISFREE': 'No pudimos saber si el juego es gratuito. Asumimos que no lo es.',
  'SIM-LISTLUA-IPC': 'No se pudo obtener la lista de scripts Lua instalados.',
  'SIM-RESOLVE': 'No se pudo obtener la información del juego desde Steam.',
  'SIM-SEARCH-IPC': 'La búsqueda en Steam no devolvió resultados. Intenta con otros términos.',

  // ---------- IPC (store) ----------
  'STORE-IPC-NOGAMEDATA': 'No tenemos información de este juego. Intenta actualizar la biblioteca.',

  // ---------- IPC (imágenes) ----------
  'IMG-INVALID-APPID': 'El identificador del juego no es válido, así que no podemos buscar su imagen.',
  'IMG-SGDB-NET': 'No pudimos conectar con SteamGridDB para buscar la carátula. Usaremos una imagen alternativa.',
  'IMG-STEAM-API-HTML': 'Steam no devolvió una imagen válida para este juego.',
  'IMG-STEAM-API-TIMEOUT': 'Steam tardó demasiado en responder. Verás una imagen alternativa.',
  'IMG-STORE-BROWSE-NET': 'No encontramos una imagen para este juego en el catálogo.',
  'IMG-CACHE-MISS': 'No encontramos la imagen en caché. La descargaremos de otra fuente.',
  'IMG-CACHE-NEGATIVE': 'Ya intentamos buscar esta imagen hace poco. Espera unos segundos.',
  'IMG-HTML-ACCESS-DENIED': 'Steam nos bloqueó el acceso a la imagen. Usaremos una alternativa.',
  'IMG-HTML-NOMETA': 'Steam no tiene una imagen para este juego.',
  'IMG-ICON-NOICON': 'No hay ícono disponible para este juego.',
  'IMG-SGDB-AUTH-FAIL': 'SteamGridDB rechazó nuestra petición. Buscaremos la imagen en otra fuente.',
  'IMG-SGDB-NOGRIDS': 'SteamGridDB no tiene imágenes en cuadrícula para este juego.',
  'IMG-SGDB-NOTFOUND': 'No encontramos la carátula personalizada. Usaremos la original de Steam.',
  'IMG-STORE-BROWSE-NOASSET': 'El catálogo no tiene una imagen para este juego.',
  'IMG-STORE-BROWSE-NOMATCH': 'No encontramos la imagen en el catálogo de la comunidad.',
  'IMG-CACHE-EVICT': 'Limpiamos imágenes antiguas de la caché para liberar espacio.',

  // ---------- API ----------
  'API-ABORT-30S': 'La operación tardó demasiado (más de 30 segundos). Verifica tu conexión e inténtalo de nuevo.',
  'API-HTTP-4XX': 'El servidor rechazó la petición. Si el problema continúa, contáctanos.',
  'API-HTTP-5XX': 'Nuestro servidor tuvo un problema. Estamos trabajando en ello. Intenta en unos minutos.',
  'API-JOB-TIMEOUT': 'La importación tardó más de 15 minutos y fue cancelada. Vuelve a intentarlo.',
  'API-MANIFEST-FAIL': 'No pudimos descargar el archivo de información del juego.',
  'API-NO-USERNAME': 'No detectamos tu usuario. Inicia sesión para continuar.',

  // ---------- AddGame ----------
  'AG-IMPORT-FAIL': 'No se pudo importar el archivo del juego. Verifica que Steam esté cerrado.',
  'AG-PARSE-FAIL': 'No se pudo leer el script del juego. El archivo puede estar dañado.',
  'AG-UNSUPPORTED': 'Este tipo de archivo no es compatible. Solo aceptamos archivos .lua y .manifest.',
  'AG-SUSPICIOUS': 'Detectamos archivos sospechosos que podrían ser malware. Te recomendamos eliminarlos.',

  // ---------- Auth ----------
  'AUTH-NO-USERNAME-FILE': 'Esta es tu primera ejecución. Configuraremos un usuario predeterminado.',

  // ---------- Auth (login) ----------
  'LOGIN-SETUSER-IPC': 'No pudimos guardar tu nombre de usuario. Intenta iniciar sesión de nuevo.',
  'LOGIN-SUCCESS-IPC': 'No se pudo confirmar el inicio de sesión. Vuelve a intentarlo.',
  'LOGIN-AUTH-IPC-FAIL': 'No pudimos verificar tu identidad. Iniciamos sesión como invitado.',
  'LOGIN-PATTERN-INVALID': 'El formulario detectó datos inválidos. Revisa usuario y contraseña.',
  'LOGIN-USERNAME-IPC': 'Ese nombre de usuario no es válido. Usa entre 3 y 32 caracteres (letras, números, _ o -).',
  'LOGIN-USERNAME-TOO-SHORT': 'Tu nombre de usuario es demasiado corto. Usa al menos 3 caracteres.',
  'LOGIN-AUTH-ALREADY': 'Ya habías iniciado sesión. No hay nada nuevo que hacer.',
  'LOGIN-LOGOUT-FALLBACK': 'No pudimos cerrar sesión limpiamente. Te desconectamos igualmente.',

  // ---------- Command Palette ----------
  'CMD-KD-NOOP': 'No hay nada que abrir o cerrar en este momento.',

  // ---------- CoverImage ----------
  'COVER-CDN-1ST': 'La primera fuente de carátula no funcionó. Probaremos con la siguiente.',
  'COVER-DEPOTBOX-2ND': 'No encontramos carátula en ninguna fuente. Verás el ícono por defecto.',

  // ---------- DrmRemover (página) ----------
  'DRMP-REMOVE-FAIL': 'No se pudo eliminar la protección del juego. El archivo puede estar en uso.',
  'DRMP-REMOVE-IPC': 'No se pudo comunicar con el sistema. Reinicia Y-core e inténtalo de nuevo.',
  'DRMP-CHECK-IPC': 'No se pudo revisar el estado del juego.',
  'DRMP-CONFIRM-CANCEL': 'Cancelaste la operación. No se modificó nada.',

  // ---------- DRM Boundary ----------
  'DRM-DISABLED': 'Esta función (eliminación de protección de juegos) no está disponible en esta versión.',

  // ---------- ErrorHandler ----------
  'EH-NATIVE-DIALOG': 'Y-core detectó un error y te lo muestra en una ventana emergente.',
  'EH-RETRY-MISSING': 'No se pudo reintentar esta operación. Cierra la ventana y vuelve a hacerlo manualmente.',
  'EH-GRACEFUL-NOOP': 'Continuamos con el modo limitado. Algunas funciones avanzadas quedaron desactivadas.',

  // ---------- GameDetail (página) ----------
  'GDP-FETCH-INTERNAL': 'No se pudieron cargar los detalles del juego. Vuelve a intentarlo en un momento.',
  'GDP-FETCH-IPC': 'No pudimos comunicarnos con Steam para obtener los detalles del juego.',
  'GDP-FETCH-NULL': 'No se pudieron cargar los detalles. Verifica tu conexión.',
  'GDP-CACHE-STALE': 'Los datos del juego pueden estar desactualizados. La próxima vez se refrescarán.',
  'GDP-HERO-404': 'El juego no tiene una imagen de portada. Mostraremos una alternativa.',
  'GDP-INSTALL-INCOMPATIBLE': 'Este juego requiere otro launcher y puede no funcionar con Online Fix.',
  'GDP-LIGHTBOX-IMG': 'No pudimos ampliar la imagen. Puede ser muy grande o estar dañada.',
  'GDP-PORTRAIT-404': 'El juego no tiene una imagen vertical. No la mostraremos.',
  'GDP-VIDEO-PLAY': 'No se pudo reproducir el video del juego. Te mostraremos una imagen fija.',

  // ---------- GoldSrc ----------
  'GOLDSRC-NO-LUA': 'No hay un script Lua configurado para Half-Life. Algunas funciones no estarán disponibles.',

  // ---------- Import (página) ----------
  'IMP-FOLDER-ASYNCCATCH': 'Algo inesperado pasó al importar. Revisa los logs para más detalles.',
  'IMP-FOLDER-IPC': 'No pudimos importar la carpeta. El proceso fue interrumpido.',
  'IMP-FOLDER-RESULT-FAIL': 'No se pudo importar el juego. Revisa los archivos e inténtalo de nuevo.',
  'IMP-PATH-DETECT': 'No pudimos identificar la carpeta del juego. Asegúrate de arrastrar la carpeta completa.',
  'IMP-RESTART-FAIL': 'No se pudo reiniciar Steam después de la importación. Hazlo manualmente.',

  // ---------- Instalación ----------
  'INST-ACF-FAIL': 'No pudimos crear el archivo de información del juego. Revisa los logs.',
  'INST-DEPOT-INJECT': 'No pudimos registrar las claves del juego en la configuración de Steam.',
  'INST-HOOK-FAIL': 'El módulo necesario para que tu juego funcione no se pudo instalar.',
  'INST-MANIFEST-MISSING': 'No encontramos el archivo manifesto del juego. Vuelve a importarlo.',
  'INST-NO-DEPOTCACHE': 'No se encontró la carpeta de manifiestos de Steam. Reinicia Steam.',
  'INST-NO-LUA-DIR': 'No pudimos guardar el script Lua del juego. El juego seguirá funcionando sin él.',

  // ---------- Library (página) ----------
  'LIB-DELETE-FAIL': 'No se pudo eliminar el juego de tu biblioteca.',
  'LIB-DELETE-IPC': 'Error inesperado al eliminar el juego. La página puede estar bloqueada.',
  'LIB-LAUNCH-FAIL': 'No se pudo iniciar el juego. Verifica que Steam esté abierto.',
  'LIB-LAUNCH-IPC': 'Error inesperado al iniciar el juego. Revisa los logs.',
  'LIB-ONLINEFIX-DISABLE-FAIL': 'No se pudo desactivar Online Fix para este juego.',
  'LIB-ONLINEFIX-ENABLE-FAIL': 'No se pudo activar Online Fix para este juego.',
  'LIB-ONLINEFIX-STATUS-IPC': 'No se pudo consultar el estado de Online Fix para este juego.',
  'LIB-OPENLOC-FAIL': 'No se pudo abrir la carpeta donde está instalado el juego.',
  'LIB-VERIFY-FAIL': 'No se pudo iniciar la verificación del juego.',
  'LIB-COVER-IMG-FAIL': 'No pudimos cargar la carátula del juego. Se mostrará un ícono alternativo.',
  'LIB-HERO-IMG-FAIL': 'No pudimos cargar la imagen principal del juego.',

  // ---------- LibraryStore ----------
  'LIBSTORE-LIST-FAIL': 'No se pudo cargar la lista de juegos de tu biblioteca.',
  'LIBSTORE-LIST-IPC': 'Error inesperado al cargar la lista de juegos.',
  'LIBSTORE-RESOLVE-IPC': 'No se pudo obtener la información del juego desde Steam.',
  'LIBSTORE-RESOLVE-NONE': 'No hay información disponible para este juego.',

  // ---------- Lua ----------
  'LUA-INVALID': 'No se pudo leer este script Lua. El archivo puede estar dañado.',

  // ---------- LuaScripts (página) ----------
  'LUAS-DELETE-FAIL': 'No se pudo eliminar el script Lua seleccionado.',
  'LUAS-IMPORT-EMPTY': 'Indica la ruta del archivo Lua que quieres importar.',
  'LUAS-IMPORT-FAIL': 'No se pudo importar el script Lua. Verifica que el archivo sea válido.',
  'LUAS-LIST-IPC': 'No se pudo obtener la lista de scripts Lua. Reinicia Y-core.',
  'LUAS-COPY-IPC-FAIL': 'No se pudo copiar el contenido del script Lua al portapapeles.',
  'LUAS-LIST-FAIL': 'Tu lista de scripts Lua está vacía.',

  // ---------- Manifests (página) ----------
  'MF-DELETE-FAIL': 'No se pudo eliminar el archivo manifesto seleccionado.',
  'MF-DROP-INVOKE-FAIL': 'No se pudo importar uno de los archivos soltados. Revisa los logs.',
  'MF-DROP-OUTER-IPC': 'No se pudo importar los archivos que soltaste. Verifica que sean .manifest válidos.',
  'MF-GETPATH-FILE': 'No se pudo leer la ruta del archivo soltado.',
  'MF-IMPORT-EMPTY': 'Indica la ruta del archivo manifesto que quieres importar.',
  'MF-IMPORT-FAIL': 'No se pudo importar el archivo manifesto.',
  'MF-LIST-FAIL': 'Tu lista de manifiestos está vacía.',
  'MF-DROP-EMPTY': 'No soltaste ningún archivo .manifest válido.',

  // ---------- Mock (dev) ----------
  'MOCK-NOT-INSTALL': 'El sistema simulado ya estaba activo. No se instaló de nuevo.',
  'MOCK-OVERRIDE-MISS': 'No se encontró el reemplazo. Usamos el comportamiento por defecto.',

  // ---------- Network ----------
  'NET-NAVIGATOR-INIT-NOLINE': 'Tu navegador indica que no hay conexión a internet.',
  'NET-OFFLINE': 'Estás sin conexión. Algunas funciones no estarán disponibles hasta que vuelvas a estar en línea.',
  'NET-ONLINE-RECOVERY': 'Conexión restablecida. Las funciones vuelven a estar disponibles.',

  // ---------- OnlineFixPage (página) ----------
  'OFP-GEN-FAIL': 'No se pudo generar el Online Fix para este juego.',
  'OFP-GEN-IPC': 'Comunicación interrumpida al generar el Online Fix.',
  'OFP-REMOVE-FAIL': 'No se pudo eliminar el Online Fix de este juego.',
  'OFP-REMOVE-IPC': 'Comunicación interrumpida al eliminar el Online Fix.',
  'OFP-COMPAT-API-FAIL': 'No se pudo consultar la compatibilidad del juego con Online Fix.',
  'OFP-COMPAT-COMPAT': 'Este juego puede no ser compatible con Online Fix.',
  'OFP-DETECT-MAP-FAIL': 'No se pudo detectar el tipo de Online Fix necesario.',
  'OFP-DISMISS-WRITE-IPC': 'No se pudo guardar el ajuste. Lo recordaremos para la próxima sesión.',
  'OFP-READCFG-IPC': 'No se pudo leer la configuración del juego.',

  // ---------- Posible (derivados) ----------
  'FUT-ANTIVIRUS-QUARANTINE': 'Tu antivirus puso en cuarentena un archivo DLL. Libéralo o Y-core no funcionará.',
  'FUT-LOG-DISK-FULL': 'No pudimos escribir el registro porque el disco está lleno. La app seguirá funcionando.',
  'FUT-BACKUP-CORRUPT': 'La copia de seguridad está dañada. Restauraremos desde la más reciente.',
  'FUT-DLL-LOAD-GPU': 'Tu tarjeta gráfica puede no ser compatible. Actualiza los drivers.',
  'FUT-DOWNLOAD-IDLE': 'La descarga estuvo inactiva demasiado tiempo. La reiniciaremos.',
  'FUT-NETWORK-OFFLINE': 'No hay conexión a internet. Te avisaremos cuando vuelva.',
  'FUT-RPC-DISCORD-FAIL': 'No pudimos conectar con Discord. Tu estado seguirá actualizándose internamente.',
  'FUT-STEAM-UPDATE': 'Steam se actualizó. Tus archivos del juego pueden necesitar reimportarse.',

  // ---------- Recommendations ----------
  'REC-ADDLOG-IPC-FAIL': 'No pudimos registrar este juego en tu historial.',
  'REC-ISFREE-IPC-FAIL': 'No pudimos saber si el juego es gratuito. Mostraremos opciones generales.',
  'REC-LIBRARY-LOAD-FAIL': 'No pudimos cargar las recomendaciones desde tu biblioteca.',
  'REC-LIBRARY-EMPTY': 'Tu biblioteca está vacía. Agrega juegos para recibir recomendaciones.',
  'REC-STORE-EMPTY': 'La tienda no devolvió recomendaciones. Intenta de nuevo más tarde.',

  // ---------- Search ----------
  'FUSE-INVALID-OPTIONS': 'La configuración de búsqueda es incorrecta. Restableceremos los valores por defecto.',

  // ---------- Settings (página) - via toasts ----------
  'STG-STEAM-PATH-SAVE-FAIL': 'No pudimos guardar la ruta de Steam. Verifica que la carpeta exista.',
  'STG-STEAM-PATH-PICK-FAIL': 'No pudimos abrir el selector de carpetas.',
  'STG-LOG-LEVEL-FAIL': 'No pudimos cambiar el nivel de los registros.',
  'STG-TOGGLE-FAIL': 'No se pudo guardar este ajuste. Intenta de nuevo.',
  'STG-RESET-FAIL': 'No pudimos restablecer la configuración.',
  'STG-RESET-CONFIRM': '¿Seguro que quieres restablecer toda la configuración a los valores predeterminados?',
  'STG-LANG-CHANGE': 'No pudimos cambiar el idioma. Algunos textos seguirán en el idioma anterior.',
  'STG-IMG-FAIL': 'No pudimos cargar tu imagen de fondo. Asegúrate de que sea un archivo válido.',
  'STG-COVER-PREVIEW-FAIL': 'No pudimos previsualizar la imagen.',
  'STG-AVATAR-FAIL': 'No pudimos actualizar tu foto de perfil.',
  'STG-BETA-TOGGLE': 'No pudimos activar el modo beta. Intenta de nuevo.',
  'STG-REPORT-FAIL': 'No se pudo enviar el reporte. Verifica tu conexión.',
  'STG-DISCORD-FAIL': 'No pudimos abrir Discord. Hazlo manualmente desde tu escritorio.',
  'STG-LOGS-EXPORT-FAIL': 'No se pudo exportar el archivo de registros.',
  'STG-LOGS-CLEAR-FAIL': 'No se pudo limpiar el archivo de registros.',
  'STG-PERSONA-UPDATE-FAIL': 'No se pudo actualizar tu configuración personalizada.',
  'STG-CUSTOMIZATION-FAIL': 'No pudimos guardar tu personalización.',
  // Settings entries whose messages were i18n keys / result.error fallbacks (caught by invariant scan)
  'SET-IMAGECHANGE-INVALID': 'No se pudo aplicar el cambio de imagen. Verifica que sea un archivo válido.',
  'SET-LOG-ENABLE-IPC': 'No se pudo activar o desactivar los registros.',
  'SET-LOG-LEVEL-IPC': 'No se pudo cambiar el nivel de detalle de los registros.',
  'SET-PICK-FAIL': 'No se pudo abrir el selector de carpetas. Hazlo manualmente.',

  // ---------- Dev-internal explainers (caught by invariant scan as non-human) ----------
  'STM-LIBS-IPC': 'Error inesperado al leer las bibliotecas de Steam. La lista de juegos quedará vacía.',
  'STM-PATH-IPC': 'Error inesperado al buscar Steam. La ruta quedó sin definir.',
  'STM-RESTART-FAIL': 'Steam terminó la operación pero se mostró un aviso al usuario.',
  'STM-LIBS-FAIL': 'No se pudieron leer las bibliotecas de Steam desde el registro.',
  'STM-PATH-FAIL': 'No se pudo leer la ruta de instalación de Steam. Quedó sin definir.',
  'STM-RUNNING-FAIL': 'Steam no está en ejecución. La app seguirá funcionando en modo limitado.',
  'CHAT-API-FAIL': 'No pudimos obtener respuesta del asistente de soporte. Intenta de nuevo.',
  'CHAT-API-NOREPLY': 'El asistente no respondió correctamente. Vuelve a enviar tu mensaje.',
  'STORE-DETAILS-IPC-FAIL': 'No se pudo obtener la información del juego desde la tienda de Steam.',
  'STORE-MIRROR-IP': 'La URL de imagen no es válida. Mostraremos una imagen alternativa.',
  'TOUR-CONFIG-IPC-FAIL': 'No pudimos guardar el paso del tour. Continuaremos con valores por defecto.',
  'TOUR-PICK-IPC-FAIL': 'No se pudo abrir el selector de carpetas.',
  'TOUR-STEAMPATH-IPC': 'Cancelaste la selección de carpeta. Toma el control manualmente desde Configuración.',
  'TOUR-WRITE-IPC-FAIL': 'No pudimos guardar tu progreso en el tour.',

  // ---------- System / dev-internal entries ----------
  'TRAY-ICON-MISS': 'No pudimos mostrar el icono de Y-core en la bandeja del sistema.',
  'CSS-MISSING-VAR': 'Falta una variable visual. Puede que veas colores incorrectos.',
  'WIN-CLOSE-FAIL': 'Y-core no se pudo cerrar correctamente.',
  'WIN-MAXIMIZE-FAIL': 'No se pudo maximizar la ventana.',
  'WIN-MINIMIZE-FAIL': 'No se pudo minimizar la ventana.',
  'I18N-MISSING-KEY': 'Falta una traducción para este mensaje. Puede aparecer en inglés.',
  'TEST-LUA-PARSE': 'Una prueba interna del parser Lua falló. Te avisamos por transparencia.',

  // ---------- ACF Watcher ----------
  'ACF-WATCH-PARSE': 'No se pudo leer un archivo de control de Steam. Seguimos intentándolo.',

  // ---------- SteamErr (log watcher) ----------
  'SO-LOG-OPEN-FAIL': 'No pudimos abrir el archivo de logs de Steam. Verifica que Steam esté instalado.',

  // ---------- Updater ----------
  'UPD-CHECK-FAIL': 'No pudimos comprobar si hay actualizaciones. Lo intentaremos más tarde.',
  'UPD-DOWNLOAD-FAIL': 'No se pudo descargar la actualización. Verifica tu conexión.',
  'UPD-INSTALL-REJECTED': 'No se pudo iniciar el instalador. Se detectó una ruta no esperada.',

  // ---------- Toast (página) ----------
  'TST-IMPORT-FAIL': 'La importación falló. Intenta de nuevo.',
  'TST-IMPORT-TIMEOUT': 'La importación tardó más de 10 minutos. La cancelamos.',
  'TST-INSTALL-FAIL': 'La instalación no se completó.',
  'TST-RESTART-FAIL': 'No pudimos reiniciar Steam.',
  'TST-CLOSE-FAIL': 'Steam no se cerró. Ciérralo manualmente.',
  'TST-BASE-INSTALL': 'No pudimos instalar la base de Half-Life. Revisa los archivos.',
  'TST-UNEXPECTED': 'El servidor devolvió una respuesta inesperada. Intenta de nuevo.',

  // ---------- Tour ----------
  'TOUR-STEP-LOAD-FAIL': 'No pudimos cargar el siguiente paso del tour. Puedes cerrarlo manualmente.',

  // ---------- Default fallbacks per category (use only if id missing above) ----------
  __category_boot: 'No pudimos terminar el inicio de Y-core. Intenta abrirlo de nuevo.',
  __category_crash: 'Y-core tuvo un problema grave y se va a reiniciar para proteger tus datos.',
  __category_steam: 'Steam no respondió como esperábamos. Verifica que esté abierto y funcionando.',
  __category_steam_log: 'Steam tuvo un problema en su archivo de registros.',
  __category_native: 'El motor interno de Y-core tuvo un problema.',
  __category_ipc: 'No pudimos comunicarnos con Y-core. Reinicia y vuelve a intentarlo.',
  __category_api: 'No pudimos conectar con el servidor. Verifica tu internet.',
  __category_store: 'La tienda no respondió como esperávamos.',
  __category_install: 'La instalación del juego no se completó.',
  __category_posible: 'Este escenario aún no ha ocurrido, pero estamos preparados por si pasa.',
  __category_settings_pagina: 'No pudimos guardar este ajuste. Intenta de nuevo.',
  __category_library_pagina: 'No se pudo completar la acción sobre tu biblioteca.',
  __category_drmremover_pagina: 'No se pudo procesar la acción sobre la protección del juego.',
  __category_gamedetail_pagina: 'No se pudo cargar la información del juego.',
  __category_import_pagina: 'No se pudo importar el juego.',
  __category_luascripts_pagina: 'No se pudo completar la acción sobre el script Lua.',
  __category_manifests_pagina: 'No se pudo completar la acción sobre el archivo manifesto.',
  __category_onlinefixpage_pagina: 'No se pudo completar la acción sobre Online Fix.',
  __category_addgame: 'No se pudo procesar el juego que intentas añadir.',
  __category_login: 'No se pudo iniciar sesión. Verifica tus credenciales.',
  __category_network: 'No pudimos establecer la conexión.',
  __category_errorhandler: 'El sistema manejó este error de forma automática.',
  __category_recommendations: 'No se pudo cargar una recomendación.',
  __category_coverimage: 'No se pudo cargar la carátula del juego.',
  __category_search: 'La búsqueda no se pudo completar.',
  __category_drm_boundary: 'Esta función no está habilitada en esta versión.',
  __category_goldsrc: 'No se pudo procesar el componente de Half-Life.',
  __category_translator: 'No pudimos traducir el mensaje de error técnico.',
  __category_command_palette: 'No se pudo abrir el menú de comandos.',
  __category_acf: 'No se pudo leer el archivo de control de Steam.',
  __category_store_steam: 'No pudimos completar la operación con tu Steam. Intenta de nuevo.',
  __category_support_chat: 'No se pudo procesar el mensaje del asistente de soporte.',
  __category_steam_store_api: 'No se pudo comunicar con el catálogo público de Steam.',
  __category_tour: 'No se pudo mostrar este paso del tour interactivo.',
  __category_renderer: 'La ventana de Y-core tuvo un problema al mostrar este contenido.',
  __category_emulador: 'No se pudo iniciar el emulador del juego.',
  __category_acf_watcher: 'Steam tuvo un cambio interno que estamos monitoreando.',
  __category_tray: 'No se pudo configurar el icono en la bandeja del sistema.',
  __category_ui: 'La interfaz visual tuvo un problema de presentación.',
  __category_window: 'La ventana de Y-core no respondió como esperábamos.',
  __category_i18n: 'Falta una traducción para este texto.',
  __category_tests: 'Una prueba interna falló. Lo registramos para que el equipo lo revise.',

  // APPEND_TAIL_HERE — sync-catalog.mjs will auto-inject T entries derived from src/lib/i18n.ts errors.* keys.
  // AUTO — derived from i18n.ts key 'errors.api.httpRequest'
  'TAIL-ES-API-HTTPREQUEST': "Error de servidor (HTTP {status}). {details}",
  // AUTO — derived from i18n.ts key 'errors.api.timeout'
  'TAIL-ES-API-TIMEOUT': "La solicitud al servidor tardó demasiado. Intenta de nuevo.",
  // AUTO — derived from i18n.ts key 'errors.api.jobTimeout'
  'TAIL-ES-API-JOBTIMEOUT': "El trabajo tardó demasiado en completarse. Intenta de nuevo.",
  // AUTO — derived from i18n.ts key 'errors.api.downloadManifest'
  'TAIL-ES-API-DOWNLOADMANIFEST': "Error al descargar el manifiesto del juego.",
  // AUTO — derived from i18n.ts key 'errors.api.rateLimited'
  'TAIL-ES-API-RATELIMITED': "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
  // AUTO — derived from i18n.ts key 'errors.api.forbidden'
  'TAIL-ES-API-FORBIDDEN': "No tienes permiso para acceder a este recurso.",
  // AUTO — derived from i18n.ts key 'errors.api.notFound'
  'TAIL-ES-API-NOTFOUND': "El recurso solicitado no fue encontrado.",
  // AUTO — derived from i18n.ts key 'errors.retry'
  'TAIL-ES-RETRY': "Reintentar",
  // AUTO — derived from i18n.ts key 'errors.offline'
  'TAIL-ES-OFFLINE': "Sin conexión a internet — algunas funciones pueden no estar disponibles",
  // AUTO — derived from i18n.ts key 'errors.crash.title'
  'TAIL-ES-CRASH-TITLE': "Algo salió mal",
  // AUTO — derived from i18n.ts key 'errors.crash.desc'
  'TAIL-ES-CRASH-DESC': "Y-core encontró un error inesperado. Tus datos están seguros.",
  // AUTO — derived from i18n.ts key 'errors.crash.reload'
  'TAIL-ES-CRASH-RELOAD': "Recargar app",
  // AUTO — derived from i18n.ts key 'errors.crash.copy'
  'TAIL-ES-CRASH-COPY': "Copiar error",
  // AUTO — derived from i18n.ts key 'errors.crash.report'
  'TAIL-ES-CRASH-REPORT': "Reportar en Discord",
  // AUTO — derived from i18n.ts key 'errors.generic'
  'TAIL-ES-GENERIC': "Ocurrió un error inesperado",
  // AUTO — derived from i18n.ts key 'errors.suggestions.steam.not_found'
  'TAIL-ES-SUGGESTIONS-STEAM-NOT-FOUND': "Ve a Ajustes → Steam y verifica la ruta de instalación.",
  // AUTO — derived from i18n.ts key 'errors.suggestions.steam.not_running'
  'TAIL-ES-SUGGESTIONS-STEAM-NOT-RUNNING': "Abre Steam desde tu escritorio y vuelve a intentar.",
  // AUTO — derived from i18n.ts key 'errors.suggestions.generic'
  'TAIL-ES-SUGGESTIONS-GENERIC': "Si el problema persiste, únete a nuestro Discord para obtener ayuda.",
  // AUTO — derived from i18n.ts key 'common.refresh'
  'TAIL-ES-COMMON-REFRESH': "Actualizar",
  // AUTO — derived from i18n.ts key 'common.clear'
  'TAIL-ES-COMMON-CLEAR': "Limpiar",
  // AUTO — derived from i18n.ts key 'common.close'
  'TAIL-ES-COMMON-CLOSE': "Cerrar",
  // AUTO — derived from i18n.ts key 'common.back'
  'TAIL-ES-COMMON-BACK': "Atrás",
  // AUTO — derived from i18n.ts key 'common.success'
  'TAIL-ES-COMMON-SUCCESS': "Éxito",
  // AUTO — derived from i18n.ts key 'common.error'
  'TAIL-ES-COMMON-ERROR': "Error",
  // AUTO — derived from i18n.ts key 'common.cancel'
  'TAIL-ES-COMMON-CANCEL': "Cancelar",
  // AUTO — derived from i18n.ts key 'common.delete'
  'TAIL-ES-COMMON-DELETE': "Eliminar",
  // AUTO — derived from i18n.ts key 'common.edit'
  'TAIL-ES-COMMON-EDIT': "Editar",
  // AUTO — derived from i18n.ts key 'common.confirm'
  'TAIL-ES-COMMON-CONFIRM': "Confirmar",
  // AUTO — derived from i18n.ts key 'common.enabled'
  'TAIL-ES-COMMON-ENABLED': "Activado",
  // AUTO — derived from i18n.ts key 'common.disabled'
  'TAIL-ES-COMMON-DISABLED': "Desactivado",
  // AUTO — derived from i18n.ts key 'common.importing'
  'TAIL-ES-COMMON-IMPORTING': "Importando...",
  // AUTO — derived from i18n.ts key 'common.copied'
  'TAIL-ES-COMMON-COPIED': "Copiado",
  // AUTO — derived from i18n.ts key 'common.failed'
  'TAIL-ES-COMMON-FAILED': "Falló",
  // AUTO — derived from i18n.ts key 'common.invalidFile'
  'TAIL-ES-COMMON-INVALIDFILE': "Archivo no válido",
  // AUTO — derived from i18n.ts key 'common.dismiss'
  'TAIL-ES-COMMON-DISMISS': "Descartar",
  // AUTO — derived from i18n.ts key 'common.import'
  'TAIL-ES-COMMON-IMPORT': "Importar",
  // AUTO — derived from i18n.ts key 'common.preview'
  'TAIL-ES-COMMON-PREVIEW': "Vista previa",
};

// ============================================================
// PARSE THE CATALOG
// ============================================================
const html = fs.readFileSync(INPUT, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('NO SCRIPT'); process.exit(1); }
const oldScript = scriptMatch[1];

function findFirstJSONArray(s) {
  const startIdx = s.indexOf('[');
  if (startIdx === -1) return null;
  let depth = 0, inString = null, escaped = false, inLineComment = false, inBlockComment = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i]; const next = s[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inString) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === inString) inString = null; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  return null;
}
const dataJson = findFirstJSONArray(oldScript);
if (!dataJson) { console.error('NO DATA'); process.exit(1); }
const arr = JSON.parse(dataJson);
console.log('Parsed', arr.length, 'entries from', INPUT);

// ============================================================
// APPLY TRANSLATIONS
// ============================================================
function categoryKey(cat) {
  return '__category_' + String(cat || 'unknown')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents (á, í, etc.)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
const untranslated = [];
const missingTranslations = [];

for (const entry of arr) {
  if (!T[entry.id]) {
    // Try to find a category default that matches the existing category
    const catKey = categoryKey(entry.category);
    if (T[catKey]) {
      T[entry.id] = T[catKey];  // Use category default
      missingTranslations.push({ id: entry.id, category: entry.category, fallback: 'category-default' });
    } else {
      untranslated.push({ id: entry.id, category: entry.category, original: entry.message });
      T[entry.id] = entry.message || 'Error sin descripción.';
    }
  }
  entry.message = T[entry.id];
}

// ============================================================
// CHROME (everything up to first <script>)
// ============================================================
const chrome = html.substring(0, html.indexOf('<script>') + 8);

// ============================================================
// CSS PROMINENCE UPDATES
// ============================================================
const NEW_CSS_RULES = `
/* ============================================================
   PROMINENT MESSAGE STYLE — make error message the headline
   ============================================================ */
.error-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 14px;
  padding: 14px 18px;
}
.error-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.error-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-dim);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.error-message {
  color: var(--text-bright);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.45;
  margin: 0;
  display: block;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
.error-card {
  border-top: 2px solid transparent;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}
.error-card:hover {
  border-top-color: var(--accent);
  transform: translateY(-2px);
}
.error-card.sev-critical .error-message { color: #fcd9e7; font-weight: 600; }
.error-card.sev-error .error-message { color: #fef3f4; font-weight: 600; }
.error-card.sev-warning .error-message { color: var(--text-bright); }
.error-card.sev-info .error-message { color: var(--text-bright); }
`;

const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!cssMatch) { console.error('NO STYLE'); process.exit(1); }
const oldCss = cssMatch[1];
// Append new CSS rules at end of style block (these override earlier rules by cascade order)
const newCss = oldCss.replace(/\s*$/, '') + '\n' + NEW_CSS_RULES;

// Replace the style block in chrome
let newChrome = chrome.replace(/<style>[\s\S]*?<\/style>/, '<style>' + newCss + '</style>');
// If for some reason the replacement didn't take (style block was unique enough...), fallback:
if (newChrome === chrome) newChrome = chrome;
const stylePresent = newChrome.includes('PROMINENT MESSAGE STYLE');
if (!stylePresent) {
  console.error('STYLE UPDATE FAILED');
  process.exit(1);
}

// ============================================================
// NEW SCRIPT BODY: ALL_ERRORS + original tail (state, refs, render, etc.)
// We re-emit the data as JSON.stringify. We KEEP everything after the first `;` from the old script.
// ============================================================
const dataDeclMatch = oldScript.match(/const ALL_ERRORS = (\[[\s\S]*?\]);/);
if (!dataDeclMatch) {
  // Maybe the script never declared it (after a partial edit). Reuse dataJson.
  console.log('No ALL_ERRORS declaration found in oldScript; reassembling tail from scratch');
}
const newDataJson = JSON.stringify(arr, null, 2);

// Find the tail: everything after the data array ends.
// The old script structure was: data + state + refs + ... + render + init.
let dataEndIdx;
if (dataDeclMatch) {
  // dataDeclMatch[0] ends with `];` — slice right after it
  const declStart = oldScript.indexOf(dataDeclMatch[0]);
  dataEndIdx = declStart + dataDeclMatch[0].length;
} else {
  // Fall back: find the closing `];` of the first balanced array.
  const arrOpen = oldScript.indexOf('[');
  // Use the same string-aware balanced scanner on the arr-only substring.
  let depth = 0, inString = null, escaped = false, inLineComment = false, inBlockComment = false;
  for (let i = arrOpen; i < oldScript.length; i++) {
    const c = oldScript[i]; const next = oldScript[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inString) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === inString) inString = null; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { dataEndIdx = i + 2; break; } }
  }
  if (!dataEndIdx) dataEndIdx = oldScript.length;
}
const tail = oldScript.slice(dataEndIdx);
const cleanTail = tail.replace(/^\s+/, '');

const newScriptBody = 'const ALL_ERRORS = ' + newDataJson + ';\n\n' + cleanTail;

// ============================================================
// COMPOSE FINAL HTML
// ============================================================
const newHtml = newChrome + newScriptBody + '\n</script>\n</body>\n</html>\n';

// ============================================================
// VALIDATE (syntax + invariants)
// ============================================================
const scriptCheck = newHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
try { new vm.Script(scriptCheck); console.log('JS_SYNTAX_OK', scriptCheck.length, 'bytes'); }
catch (e) { console.log('JS_ERR:', e.message); process.exit(1); }

// Invariants
const violations = [];
for (const e of arr) {
  const m = e.message || '';
  if (/^result\.error/.test(m) || /\|\|/.test(m) && /\.(addgame|library|manifests|luascripts|onlinefix|store|tools|common)\./.test(m)) violations.push({ id: e.id, msg: m, reason: 'fallback' });
  if (/^errors\.(steam|app|download|network|disk|file|permission|timeout|loadmanifest|manifest|coin|ypoi|depot|library|redistributable|acf)/.test(m)) violations.push({ id: e.id, msg: m, reason: 'i18n key' });
  if (/^addgame\.|^library\.|^manifests\.|^luascripts\.|^onlinefix\.|^store\.|^tools\.|^common\./.test(m)) violations.push({ id: e.id, msg: m, reason: 'i18n key' });
  if (/^The app UI crashed/.test(m)) violations.push({ id: e.id, msg: m, reason: 'English' });
  if (/^\(sin UI/.test(m)) violations.push({ id: e.id, msg: m, reason: 'dev-only marker' });
  if (/^addgame\.parseFailed$|^addgame\.importFailed$|^store\.failedCloseSteam$|^manifests\.deleteFailed$/.test(m)) violations.push({ id: e.id, msg: m, reason: 'bare i18n key' });
  if (/^Timeout$/.test(m) || /^download\.fail$/.test(m)) violations.push({ id: e.id, msg: m, reason: 'key' });
}
if (violations.length) {
  console.log('VIOLATIONS:', violations.length);
  violations.slice(0, 10).forEach(v => console.log('  ', v.id, '→', v.reason, ':', v.msg));
  process.exit(1);
}

// Spanish-sentence check: message should contain at least one Spanish-articulating word or be lowercase sentence
function looksLikeHumanSentence(s) {
  if (!s) return false;
  // Spanish filler words or starting words
  return /\b(no|se|el|la|los|las|un|una|de|del|al|y|o|que|por|para|con|sin|este|esta|ese|esa|esto|eso|aquí|allí|steam|ycore|y-core|error|operación|función|resultado)\b/i.test(s);
}
const nonHuman = arr.filter(e => !looksLikeHumanSentence(e.message));
if (nonHuman.length) {
  console.log('Non-human-looking sentences:', nonHuman.length);
  nonHuman.slice(0, 10).forEach(e => console.log('  ', e.id, '→', e.message));
  // Don't fail; just report
}

// Coverage report
console.log('--- Report ---');
console.log('Total entries:', arr.length);
console.log('Per-ID translations:', Object.keys(T).filter(k => !k.startsWith('__')).length);
console.log('Used category fallbacks:', missingTranslations.length);
console.log('Untranslated (filled with original):', untranslated.length);
if (untranslated.length) {
  untranslated.slice(0, 10).forEach(u => console.log('  ', u.id, '(', u.category, ')'));
}

// ============================================================
// WRITE ATOMICALLY (write to .tmp then rename)
// ============================================================
fs.writeFileSync(OUTPUT + '.tmp', newHtml);
fs.renameSync(OUTPUT + '.tmp', OUTPUT);
console.log('Wrote', OUTPUT, '→', (newHtml.length / 1024).toFixed(1) + ' KB');

// Clean up backup once verified
fs.unlinkSync(BACKUP);
console.log('Backup cleaned.');
