# Bot de Tickets - Discord

Bot de tickets simple y seguro para Discord. Facil de configurar.

## Requisitos

- Node.js 18 o superior
- Un bot creado en [Discord Developer Portal](https://discord.com/developers/applications)

## Instalacion

1. Instala dependencias:
```bash
npm install
```

2. Configura el token en `bot.js` (linea 15) o usa variable de entorno:
```bash
# En Windows (PowerShell):
$env:TOKEN="tu-token-aqui"; npm start

# En Linux/Mac:
TOKEN=tu-token-aqui npm start
```

3. Configura `config.json` con tu categoria y canal de logs (ver abajo).

4. Inicia el bot:
```bash
npm start
```

## Configuracion rapida

### 1. Crear el bot en Discord

1. Ve a https://discord.com/developers/applications
2. Crea una nueva aplicacion
3. Ve a la seccion "Bot" y crea un bot
4. Copia el **token** y pegalo en `bot.js` (linea 15)
5. Activa los **Privileged Gateway Intents**:
   - Server Members
   - Message Content

### 2. Invitar el bot a tu server

Usa esta URL (cambia `TU_ID_DE_APLICACION`):
```
https://discord.com/api/oauth2/authorize?client_id=TU_ID_DE_APLICACION&permissions=2147483648&scope=bot%20applications.commands
```

Permisos minimos necesarios:
- Manage Channels (crear canales de tickets)
- No necesita Administrator

### 3. Configurar config.json

```json
{
  "color": "#4b0082",
  "footer": "P4S Support System",
  "advertencia": "If you create a joke ticket, you will be sanctioned with a mute or warning.",
  "tituloPanel": "SUPPORT TICKETS",
  "descripcionPanel": "Select one of the buttons below to open a ticket and receive support.",
  "imagenPanel": "URL_DE_LA_IMAGEN_AQUI",
  "categoriaTickets": "",
  "canalLog": "",
  "rolStaff": "",
  "mensajeBienvenida": "Welcome {user}! Please describe your inquiry and wait for a staff member to assist you.",
  "tipos": [...]
}
```

- `categoriaTickets`: ID de la categoria donde se crean los tickets (opcional)
- `canalLog`: ID del canal donde se envian los logs (opcional)
- `rolStaff`: ID del rol de staff que se mencionara al abrir un ticket (opcional)
- `imagenPanel`: URL de la imagen/banner que aparecera en el panel (opcional)
- `tipos`: Lista de tipos de ticket que aparecen en el panel

### 4. Configurar dentro de Discord

Una vez el bot este en tu server:

1. `/setcategoria` - Configura la categoria para los tickets
2. `/setlog` - Configura el canal de logs
3. `/panel` - Crea el panel de tickets en un canal

## Comandos

| Comando | Descripcion | Permisos |
|---|---|---|
| `/panel` | Crea el panel de tickets en el canal actual | Manage Channels |
| `/config` | Muestra la configuracion actual | Manage Channels |
| `/setcategoria` | Configura la categoria de tickets | Manage Channels |
| `/setlog` | Configura el canal de logs | Manage Channels |
| `/cerrar` | Cierra el ticket actual | Cualquiera (dentro del ticket) |

## Seguridad

- **No compartas tu token con nadie.** Si alguien obtiene tu token, puede controlar el bot.
- Si sospechas que se filtro el token, ve al Developer Portal y dale a "Reset Token".
- El bot no necesita permisos de Administrator. Solo Manage Channels.
- Rate limiting: maximo 3 tickets por usuario cada 10 minutos.
- El bot no crashea ante errores inesperados.

## Hosting gratis

Puedes hostear este bot gratis en:

- [Render.com](https://render.com) - Gratis, 750h/mes
- [Railway.app](https://railway.app) - Gratis, $5 de creditos/mes
- [Fly.io](https://fly.io) - Gratis, 3 VMs pequeñas

### Deploy en Render

1. Sube el codigo a GitHub (sin el token)
2. Conecta Render con tu repo de GitHub
3. Set la variable de entorno `TOKEN` con tu token
4. Build command: `npm install`
5. Start command: `npm start`

## Personalizar tipos de tickets

Edita `config.json` y modifica el array `tipos`:

```json
{
  "id": "soporte",
  "label": "Soporte",
  "emoji": "🛠️",
  "color": "Primary",
  "descripcion": "Dudas generales o problemas con el server."
}
```

Colores disponibles: `Primary`, `Secondary`, `Success`, `Danger`

Maximo 5 tipos de ticket (Discord limita a 5 botones por fila).
