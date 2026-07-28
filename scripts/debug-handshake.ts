// Test handshake with the CORRECTED RSA key (from steam-crypto/system.pem)
import { getCmServerList } from '../electron/modules/steampipe/cm-directory'
import { connectAndHandshake } from '../electron/modules/steampipe/handshake'

async function main() {
  const cmList = await getCmServerList({ cellId: 0, maxServers: 3 })
  console.log('Servers:', cmList.servers.length)
  
  for (const s of cmList.servers) {
    console.log(`\nTrying ${s.host}:${s.port}...`)
    try {
      const conn = await connectAndHandshake({ server: s, timeoutMs: 20000 })
      console.log(`✅ HANDSHAKE OK! sessionKey=${conn.sessionKey ? conn.sessionKey.length + 'B' : 'null'}`)
      await conn.close()
      console.log(`\n🎉 ÉXITO! Handshake completado en ${s.host}:${s.port}`)
      process.exit(0)
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`)
    }
  }
  
  console.log('\nAll servers failed')
  process.exit(1)
}

main()
