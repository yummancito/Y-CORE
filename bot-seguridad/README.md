# Bot de Seguridad Y-CORE

Bot standalone de seguridad para Discord con proteccion anti-nuke, anti-raid, anti-spam y moderacion automatica.

## Caracteristicas

- **Anti-Nuke**: detecta y neutraliza creacion/borrado masivo de canales, roles, emojis, webhooks, baneos masivos, expulsiones, cambios peligrosos en el servidor y escalada de permisos.
- **Anti-Raid**: detecta uniones masivas, activa lockdown automatico y banea raiders.
- **Anti-Bot**: expulsa bots no autorizados al entrar.
- **AutoMod**: elimina spam, duplicados, menciones masivas, emojis excesivos, mayusculas excesivas, links de invitacion y archivos peligrosos.
- **Comandos**: `/lockdown`, `/unlock`, `/eliminarwebhooks`, `/configurar`.

## Requisitos

- Node.js 18+
- Bot de Discord con intents: Guilds, GuildMessages, MessageContent, GuildMembers, GuildBans, GuildModeration, GuildEmojisAndStickers, GuildWebhooks.
- Permiso `Administrator` recomendado para funcionar correctamente.

## Instalacion

1. Clona o copia la carpeta `bot-seguridad`.
2. Copia `config.example.json` a `config.json`:
   ```bash
   cp config.example.json config.json
   ```
3. Rellena tu `token`, `clientId`, `ownerId` y IDs de guild/canal de logs.
4. Instala dependencias:
   ```bash
   npm install
   ```
5. Inicia:
   ```bash
   npm start
   ```

## Configuracion

Edita `config.json` para ajustar limites y activar/desactivar protecciones:

```json
{
  "antiNuke": {
    "maxChannels": 3,
    "channelWindow": 10000,
    ...
  },
  "antiRaid": {
    "maxJoins": 5,
    "joinWindow": 10000,
    ...
  }
}
```

## Comandos

| Comando | Descripcion | Permiso |
|---|---|---|
| `/lockdown` | Bloquea todos los canales de texto | Administrator |
| `/unlock` | Desbloquea todos los canales de texto | Administrator |
| `/eliminarwebhooks` | Borra webhooks del canal actual | ManageWebhooks |
| `/configurar` | Muestra la configuracion actual | Administrator |

## Notas

- No incluyas tu token en el repositorio.
- El bot solo opera en los `allowedGuilds` configurados.
