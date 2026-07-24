# SDK VTable Audit — opp.md

**Single source of truth para slot positions en nuestro clean-room emulator.**

Esta opp.md es la salida del audit: cómo cada ISteam*_VTable en
`native/ycore_steam/src/steam_*.h` debe alinearse contra el slot index
real del SDK público. Los slots aquí listados están validados contra
documentación pública de Steamworks SDK (SteamClient017, SteamUser021,
SteamApps008, SteamUtils010, SteamNetworking005).

## Cómo se usó este archivo

1. **Round-7 (research)**: tres sub-passes de web research para confirmar
   los slot indices reales del SDK público. No son dumpbin de una DLL —
   son reconstrucciones a partir de headers públicos referenciados desde
   Proton, Goldberg, y SteamDatabase wiki.

2. **Round-7+v4 (este commit)**: las structs C++ en
   `native/ycore_steam/src/steam_*.h` se realinean slot-by-slot
   contra esta tabla. Donde un slot está marcado `(deprecated)`, lo
   mantenemos como `void*` nullptr en la struct para preservar offset.

3. **Round-7 validation**: `tests/sdk-vtable-audit.test.ts` activa este
   archivo vía grep de las structs; si drift entre la struct y opp.md,
   throw actionable error.

## Restricción importante

Ningún source en `native/ycore_steam/` debería contradecir este documento.
Si agregás un slot, AGREGALO ACÁ también. PRs sin sync → CI rompe.

---

## ISteamClient017

Referencia: Proton's `steamclient.cpp`, Goldberg `client.cpp`.

| Slot | Función | Return type | Comentario |
|------|---------|-------------|------------|
| 0 | (reserved) | void* | Primer slot suele ser InvalidateEnforcer o nullptr; games que leen slot 0 no esperan valor útil. Lo dejamos nullptr. |
| 1 | CreateSteamPipe() | uint32 | HSteamPipe handle |
| 2 | BReleaseSteamPipe(uint32) | bool | Idem SteamAPI old style |
| 3 | ConnectToGlobalUser(uint32) | int | ESteamError enum (0=OK) |
| 4 | CreateLocalUser(uint64, int) | int | HSteamUser nuevo |
| 5 | ReleaseUser(uint32, uint32) | void | close local user |
| 6 | GetISteamUser(uint32, uint32, const char*) | const void* | "SteamUser021" → nuestro kSteamUser021VTable |
| 7 | GetISteamGameServer(uint32, uint32, const char*) | const void* | nullptr en v1 — not used by single-player |
| 8 | SetLocalIPBinding(uint32, const char*) | void | nullptr |
| 9 | GetISteamFriends(uint32, uint32, const char*) | const void* | "SteamFriends015" → nullptr en v1 |
| 10 | GetISteamUtils(uint32, const char*) | const void* | "SteamUtils010" → nuestro kSteamUtils010VTable |
| 11+ | más interfaces | various | ver SteamClient017 full header si necesitamos |

### pchVersion parsing

La firma real del SDK para GetISteamUser:
```
const void* GetISteamUser(void* self,
                           HSteamUser hUser,
                           HSteamPipe hPipe,
                           const char* pchVersion);
```

pchVersion típica es `"SteamUser020"` o `"SteamUser021"` o
`"STEAMUSER_INTERFACE_VERSION"` (legacy). Para round-7 implementamos
un parser que extrae los dígitos y dispatche:
- "SteamUser0XX" donde XX ∈ {20, 21, 22} → kSteamUser0XXVTable struct.
- Otros / empty → fallback a la versión más nueva disponible.

Si pides "SteamUser021" → kSteamUser021VTable.
Si pides "SteamUser022" → fallback (todavía no tenemos struct 22).

---

## ISteamUser021

| Slot | Función | Return type | Nuestro stub |
|------|---------|-------------|-------------|
| 0 | GetHSteamUser() | uint32 | `\u2192 1u` |
| 1 | BLoggedOn() | bool | `\u2192 1` |
| 2 | GetSteamID() | uint64 (CSteamID) | `\u2192 0x0110000100000001ULL` |
| 3 | InitiateGameConnection_DEPRECATED | int | nullptr (deprecated) |
| 4 | TerminateGameConnection_DEPRECATED | void | nullptr (deprecated) |
| 5 | SetAppID_Internal(uint32) | void | nullptr (internal) |
| 6 | BLoggedOn_Internal(uint32) | bool | nullptr (internal) |
| 7 | GetPlayerSteamLevel() | int | `\u2192 0` |
| 8+ | (more, covered v2) | various | nullptr |

Notas:
- Slot 3 en SteamUser020 era la firma vieja de InitiateGameConnection
  con `unused`. En 021 también está el slot deprecated pero el orden
  de GetSteamID / SetAppID_Internal no conviene swap. Mantenemos el
  slot 3 nullptr para preservar offsets downstream.
- Slots 5-6 son interno SDK, games no los llaman; nullptr seguro.

---

## ISteamApps008

| Slot | Función | Return type | Stub |
|------|---------|-------------|------|
| 0 | BIsSubscribed() | bool | `\u2192 1` |
| 1 | IsLowViolence() | bool | `\u2192 0` |
| 2 | IsCybercafe() | bool | `\u2192 0` |
| 3 | IsVACBanned() | bool | `\u2192 0` |
| 4 | GetCurrentGameLanguage() | const char* | `\u2192 "english"` |
| 5 | GetAvailableGameLanguages() | const char* | `\u2192 "english\\ngerman\\nfrench\\njapanese\\n..."` |
| 6 | BIsSubscribedApp(uint32) | bool | `\u2192 1` |
| 7 | BIsDLCInstalled(uint32) | bool | `\u2192 1` |
| 8 | GetEarliestPurchaseUnixTime(uint32) | uint32 | `\u2192 0` (game probablemente no compara) |
| 9 | IsSubscribedFromFreeWeekend() | bool | `\u2192 0` |
| 10 | GetDLCCount() | int | `\u2192 0` |
| 11+ | InstallInfo, CDKey, etc. | various | nullptr |

Cambio importante vs v3.5: BIsSubscribed estaba en slot 3 antes, ahora en slot 0.
El cambio de slot 0 a 1-3 (libre para v2) requiere ordenarlos en el struct.

---

## ISteamUtils010

| Slot | Función | Return type | Stub |
|------|---------|-------------|------|
| 0 | GetSecondsSinceAppActive() | uint32 | `\u2192 0` |
| 1 | GetSecondsSinceComputerActive() | uint32 | `\u2192 0` |
| 2 | GetConnectedUniverse() | EUniverse | `\u2192 1` (k_EUniversePublic) |
| 3 | GetServerRealTimeClock() | ESteamError + uint32 out | `\u2192 0, 0` |
| 4 | GetIPCountry() | const char* | `\u2192 "US"` |
| 5 | GetImageSize(int, uint32*, uint32*) | bool | nullptr |
| 6 | GetImageRGBA(int, uint8*, int) | bool | nullptr |
| 7 | GetCSERIPPort(uint32*) | bool | nullptr |
| 8 | GetCurrentBatteryPower() | uint8 | `\u2192 255` (full) |
| 9 | GetAppID() | uint32 | `\u2192 current_app_id.load()` |
| 10 | SetOverlayNotificationPosition(int, int) | void | nullptr (no overlay) |
| 11+ | ShowGamepadTextInput, etc. | various | nullptr |

Cambio vs v3.5: GetAppID estaba en slot 5 antes, REAL es slot 9. Los slots
5-8 son otras funciones de utilidad (image, battery, etc). Round-7 los
mantiene nullptr porque single-player games no suelen concern con esos.

---

## ISteamNetworking005

NEW para v4. Ofrece LAN-style multiplayer sobre localhost Winsock sockets
(NO internet/Steam servers — esa pieza es inviable sin el steamauth real).

| Slot | Función | Return | Stub |
|------|---------|--------|------|
| 0 | SendP2PPacket(uint64, const void*, uint32, int, int) | bool | real sendto() |
| 1 | IsP2PPacketAvailable(uint32*, int, int) | bool | real recvfrom() peek |
| 2 | ReadP2PPacket(void*, uint32, uint32*, uint64*, int) | bool | real recvfrom() |
| 3 | AcceptP2PSessionWithUser(uint64) | bool | `\u2192 1` |
| 4 | CloseP2PSessionWithUser(uint64) | bool | `\u2192 1` |
| 5 | CloseP2PChannelWithUser(uint64, int) | bool | `\u2192 1` |
| 6 | GetP2PSessionState(uint64, P2PSessionState_t*) | bool | nullptr |
| 7 | AllowP2PPacketRelay(bool) | bool | `\u2192 1` |
| 8 | CreateListenSocket(int, int, int) | uint32 (HSteamListenSocket) | real socket()+bind() |
| 9 | CreateConnectionSocket(uint32, int, int, bool) | uint32 | real socket() |
| 10 | CreateSocketToRemoteHost(uint32, int, bool) | uint32 | nullptr (real implementation if needed) |
| 11+ | DestroyListenSocket, etc. | various | real closesocket() |

Implementación real usa Winsock2.h:
- socket() -> uint32 handle
- bind() para listen sockets
- sendto() / recvfrom() para P2P
- Sin threadsafe accept() por ahora → AcceptConnection es pending
- Cerrar sockets via closesocket()

Limitación v1:
- LAN-only (loopback addr 127.0.0.1, port range 0xC000-0xFFFF alto).
- No encryption / auth / NAT.
- No multi-threaded accept loop (peer-to-peer LAN via UDP only).
