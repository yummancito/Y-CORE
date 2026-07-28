// Standalone test del handshake steampipe SIN la UI de electron.
// Corre con: npx tsx scripts/test-handshake.ts
// Prueba conectar + ChannelEncrypt handshake contra un CM real de Steam.
import { connectAndHandshake } from '../electron/modules/steampipe/handshake'
import { getCmServerList } from '../electron/modules/steampipe/cm-directory'

async function main() {
  console.log('[test] fetching CM list...')
  const cmList = await getCmServerList({ cellId: 0, maxServers: 3 })
  console.log('[test] got', cmList.servers.length, 'servers:', cmList.servers.map(s => s.host + ':' + s.port).join(', '))
  for (const s of cmList.servers) {
    console.log('[test] trying', s.host + ':' + s.port)
    try {
      const conn = await connectAndHandshake({ server: s, timeoutMs: 15000 })
      console.log('[test] ✅ HANDSHAKE OK! sessionKey =', conn.sessionKey ? 'set (' + conn.sessionKey.length + ' bytes)' : 'null')
      await conn.close()
      process.exit(0)
    } catch (err) {
      console.log('[test] ❌ failed:', (err as Error).message)
    }
  }
  console.log('[test] all servers failed')
  process.exit(1)
}
main().catch(e => { console.error('[test] fatal:', e.message); process.exit(1) })
