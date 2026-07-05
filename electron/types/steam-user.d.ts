declare module 'steam-user' {
  class SteamUser {
    constructor()
    on(event: string, listener: (...args: any[]) => void): void
    logOn(details: { anonymous: true }): void
    logOff(): void
    getRawManifest(): Promise<{ manifest: Buffer }>
    getDepotDecryptionKey(): Promise<{ key: Buffer }>
    getManifest(): Promise<{ manifest: any }>
    downloadFile(
      appId: any,
      depotId: string,
      fileManifest: any,
      outputFilePath: string,
      callback: (error: Error | null, res?: any) => void
    ): void
  }
  export default SteamUser
}
