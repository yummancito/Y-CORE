# SteamKit2 — Handler Pattern as a Service Layer Model

## Metadata

- **URL**: https://github.com/SteamRE/SteamKit (cloned at `reference/research/download-engine/SteamKit`, remote `origin` confirms `SteamRE/SteamKit.git`)
- **Language**: C# (.NET), targeting modern TPL (`Task`, `async`/`await`, `TaskCompletionSource`)
- **License**: LGPL-2.1
- **Maturity signal**: 15+ years old, the reference implementation the entire third-party Steam tooling ecosystem (DepotDownloader, ArchiSteamFarm, etc.) is built on. The checked-out commit is from 2026-07-01, actively maintained. `SteamClient.cs` alone registers 15 handlers; the `Steam/Handlers/` directory has 15 subfolders, each a self-contained handler module with its own `Callbacks.cs`.

## The `ClientMsgHandler` pattern

The abstraction is deliberately tiny. `Steam/Handlers/ClientMsgHandler.cs` is the entire base class:

```csharp
public abstract class ClientMsgHandler
{
    protected SteamClient? Client { get; private set; }
    protected bool ExpectDisconnection { get; set; }  // delegates to Client.ExpectDisconnection

    internal void Setup( SteamClient client ) { this.Client = client; }

    public abstract void HandleMsg( IPacketMsg packetMsg );
}
```

That's it — one protected back-reference to the owning `SteamClient` (for sending messages and posting callbacks) and one abstract method, `HandleMsg`, that every incoming packet gets forwarded to. There is no shared message-routing table, no attribute-based registration, no reflection magic.

`SteamClient` (`Steam/SteamClient/SteamClient.cs`) owns a flat `List<ClientMsgHandler> handlers` and, in its constructor, explicitly instantiates and registers the 15 built-in handlers:

```csharp
this.AddHandlerCore( new SteamFriends() );   // note: before SteamUser, comment explains why (ordering dependency)
this.AddHandlerCore( new SteamUser() );
this.AddHandlerCore( new SteamApps() );
this.AddHandlerCore( new SteamGameCoordinator() );
... // 15 total, asserted via Debug.Assert
```

`AddHandlerCore` just calls `handler.Setup(this)` (injects the back-reference) and appends to the list. Every inbound packet is fanned out to **every** handler unconditionally:

```csharp
protected override bool OnClientMsgReceived( IPacketMsg? packetMsg )
{
    ...
    foreach ( var value in handlers )
    {
        try { value.HandleMsg( packetMsg ); }
        catch ( ProtoException ex ) { /* log, disconnect */ }
        catch ( Exception ex )       { /* log, disconnect */ }
    }
    return true;
}
```

Each handler is individually responsible for ignoring message types it doesn't care about (see below — it's a `switch` expression that returns `null` for unrecognized `EMsg`s). This is a broadcast/filter model, not a routed/exclusive-ownership model: nothing stops two handlers from reacting to the same `EMsg`, and nothing declares up front "I own these message types." The exception handling is centralized at the fan-out site, not in each handler — if any handler throws, `SteamClient` disconnects the whole connection. This is a meaningful simplification compared to Y-Core's per-module try/catch scattered across `cm-connection.ts`/`cm-protocol.ts`.

## Callback/event model

SteamKit2 supports **three consumption styles simultaneously**, all fed by the same underlying `PostCallback` mechanism:

1. **Pull-based polling loop** (classic style, still the documented default): `SteamClient.GetCallback()` / `WaitForCallback()` / `WaitForCallbackAsync()` drain a `BufferBlock<CallbackMsg> callbackQueue`. Consumers write a `while (true) { var cb = client.WaitForCallback(); ... }` loop.

2. **`CallbackManager` subscription model** (`Steam/SteamClient/CallbackMgr/CallbackMgr.cs`) — the more commonly used pattern in practice. A `CallbackManager` wraps a `SteamClient` and exposes `Subscribe<TCallback>(Action<TCallback>)` and an async variant `Subscribe<TCallback>(Func<TCallback, Task>)`. Subscribing returns an `IDisposable` — disposing unsubscribes. Internally this is an `ImmutableList<CallbackBase>` matched by `callback.CallbackType.IsAssignableFrom(type)` against each dequeued `CallbackMsg`, so it's a typed pub/sub table keyed by C# runtime type, not by `EMsg`. The consumer still has to pump it via `manager.RunCallbacks()` / `RunWaitCallbackAsync()` in a loop — SteamKit2 does not run its own background thread; the host application owns the pump loop. This maps very directly to a message-loop / event-loop model.

3. **`AsyncJob<T>` / `AsyncJobMultiple<T>`** (`Types/JobID.cs`) — genuine awaitable request/response. Every "send a request, get a typed reply" method (e.g. `SteamApps.GetDepotDecryptionKey`) returns an `AsyncJob<DepotKeyCallback>` wrapping a `TaskCompletionSource<T>`. `AsyncJobManager` correlates the `JobID` on the outbound request with the `JobID` on the eventual `PostCallback` call and resolves the `TaskCompletionSource`. The returned object has a `GetAwaiter()`, so callers can just `await steamApps.GetDepotDecryptionKey(depotId, appId)` directly — no manual correlation needed. `AsyncJobMultiple<T>` extends this for jobs that stream multiple partial results before completing (a `Predicate<T> finishCondition` decides when the set is "done"), with `Heartbeat()` extending the timeout on each partial result — directly analogous to a chunked/streaming download progress model.

   Some newer handlers (`SteamContent`, and anything routed through `SteamUnifiedMessages`) skip `AsyncJob` entirely and expose plain `async Task<T>` methods that `await` an underlying unified-message call — i.e., the callback/job machinery is fully hidden behind idiomatic async/await at the public API surface. `SteamContent.GetManifestRequestCode()` is a clean example: it's `async Task<ulong>`, with zero callback-shaped ceremony visible to the caller.

**Mapping to Y-Core's IPC model**: Y-Core's `ipcRenderer.on('onDownloadProgress', cb)` listeners are structurally closest to style (2) — an event you subscribe to that fires repeatedly and you must unsubscribe. Y-Core's request/response `window.steamtools.xxx()` calls (already `Promise`-returning over `ipcRenderer.invoke`) are structurally closest to style (3) — `AsyncJob<T>`, minus the manual `JobID` correlation, since Electron's IPC already does request/response correlation for you under the hood. The useful takeaway isn't "adopt a callback queue" (Electron's IPC already gives async/await for free) — it's the **separation of concerns**: one push-style channel (progress/events, many-to-one, ipcRenderer.on) and one pull-style channel (typed request/response, one-to-one, invoke/handle), each backed by the same underlying connection but exposed through different consumer-facing shapes, exactly as `AsyncJob` (pull) and `CallbackManager` subscriptions (push) sit side by side over the same `PostCallback` mechanism in SteamKit2.

## Extension point for new handlers

Adding a handler is a genuinely clean, low-friction extension point:

```csharp
public void AddHandler( ClientMsgHandler handler )
{
    foreach ( var h in handlers )
        if ( h.GetType() == handler.GetType() )
            throw new InvalidOperationException(...); // no duplicate handler types
    AddHandlerCore( handler );
}
```

This is a **public** API (`Samples/010_Extending` in the repo demonstrates exactly this — a consumer-authored custom handler registered via `steamClient.AddHandler(new MyCustomHandler())`). To write a new handler you only need to:

1. Subclass `ClientMsgHandler`.
2. Implement `HandleMsg(IPacketMsg)` — typically a `switch` on `packetMsg.MsgType` that constructs typed `CallbackMsg` subclasses and calls `Client.PostCallback(...)`.
3. Add public methods that build a `ClientMsgProtobuf<T>`, set `SourceJobID = Client.GetNextJobID()` if a reply is expected, call `Client.Send(request)`, and return an `AsyncJob<TCallback>`.

Retrieval is symmetric and type-safe: `GetHandler<T>()` / `GetRequiredHandler<T>()` look the handler up by its concrete `Type` in the flat list. There's also `RemoveHandler`. Nothing about this requires touching `SteamClient` internals or any central registry file beyond the constructor's built-in list (and even that's just for the 15 first-party handlers — third-party handlers never touch that list).

The only real entanglement is that `SteamClient`'s constructor hardcodes construction order for the 15 built-in handlers because of a documented ordering dependency (`SteamFriends` before `SteamUser`, "due to AccountInfoCallback") — a reminder that even a clean extension point can accrue one sharp edge over 15 years, but it's contained to a single, callable-out comment rather than architectural coupling.

## Wire protocol vs public API separation

This is cleanly separated, and the separation is enforced by **directory structure and file convention**, not just discipline:

- **Wire-level plumbing** lives entirely outside `Steam/Handlers/`: `CMClient` (the base class `SteamClient` extends) owns the raw connection, encryption handshake, and `IPacketMsg` framing/deframing. `Steam/SteamClient/AsyncJobManager.cs` owns `JobID` correlation and timeouts. None of this protocol machinery knows what a "depot" or a "friend" is.
- **Each handler file is a `switch`-based translation layer, nothing more.** The pattern repeats verbatim across `SteamApps.cs`, `SteamFriends.cs`, etc.:
  ```csharp
  private static CallbackMsg? GetCallback( IPacketMsg packetMsg ) => packetMsg.MsgType switch
  {
      EMsg.ClientLicenseList => new LicenseListCallback( packetMsg ),
      EMsg.ClientGetDepotDecryptionKeyResponse => new DepotKeyCallback( packetMsg ),
      ...
      _ => null,
  };
  public override void HandleMsg( IPacketMsg packetMsg )
  {
      var callback = GetCallback( packetMsg );
      if ( callback == null ) return;      // ignore anything not ours
      this.Client.PostCallback( callback );
  }
  ```
  The `CallbackMsg` subclasses that do the actual protobuf-field-to-C#-property unwrapping live in a sibling `Callbacks.cs` file per handler (e.g. `Steam/Handlers/SteamApps/Callbacks.cs`), keeping "what does the wire message contain" separate from "how do I dispatch it."
- **Public typed methods are pure orchestration**, not protocol code: build a `ClientMsgProtobuf<T>`, stamp a `JobID`, call `Client.Send`, return an `AsyncJob<T>`. They never touch socket/framing/encryption directly — that's `CMClient`'s job.
- **The CDN/depot-download path is instructive and is the closest analog to Y-Core's `depot-downloader.ts`.** `Steam/CDN/Client.cs` (`SteamKit2.CDN.Client`) is deliberately **not** a `ClientMsgHandler` at all — it's a standalone `sealed partial class Client : IDisposable` that takes a `SteamClient` reference only to pull an `HttpClient` out of its configuration, then does plain HTTPS requests (`DownloadManifestAsync`, chunk downloads) against CDN servers, entirely outside the CM binary-protocol/handler system. The CM connection (via `SteamApps.GetDepotDecryptionKey` and `SteamContent.GetManifestRequestCode`/`GetCDNAuthToken`) is used only to *authorize* the download (decryption keys, manifest request codes, auth tokens); the actual bulk byte transfer happens over a completely separate HTTP client. This is a strong architectural signal: **authorization/metadata (CM protocol, small typed messages) and bulk data transfer (HTTP, large binary payloads) are different concerns with different failure modes, and SteamKit2 keeps them in different classes even though both are "part of downloading a depot."** Y-Core's `depot-downloader.ts` currently blends session/key negotiation and chunk-download orchestration in one file; SteamKit2's answer is that the file boundary should follow the transport boundary (CM protocol vs. CDN HTTP), not the feature boundary ("downloading").

The one place this separation gets slightly blurred in SteamKit2 itself: newer handlers like `SteamContent` bypass their own `HandleMsg` (it's literally `// not used`) and instead reach into `SteamUnifiedMessages` (a generic protobuf-service RPC handler) to do request/response. This means "wire protocol translation" for newer Steam features has migrated into a shared generic handler rather than being handler-specific — a reasonable evolution (protobuf services made the old per-EMsg switch statements largely obsolete for anything built after ~2015), but it does mean two different dispatch idioms coexist in the codebase depending on message age.

## Concrete sketch: a Y-Core `SteamService` modeled on this pattern

Goal: keep `electron/modules/steampipe/*` as the "CMClient" layer (raw framing, RSA/AES handshake, CM connection lifecycle) and put a thin handler-style service layer in front of it, without rewriting steampipe's internals.

```ts
// electron/services/steam/SteamService.ts
// Analogous to SteamKit2's SteamClient: owns the CM connection lifecycle,
// a handler registry, and the callback/event fan-out. Does NOT know about
// depots, licenses, or friends directly.

class SteamService {
  private connection: CmConnection | null = null;   // wraps steampipe/cm-connection.ts
  private handlers = new Map<string, SteamServiceHandler>();
  private emitter = new EventEmitter();              // push channel (progress, state changes)

  registerHandler(handler: SteamServiceHandler) {
    if (this.handlers.has(handler.name)) throw new Error(`duplicate handler: ${handler.name}`);
    handler.attach(this);                             // handler.Setup(client) equivalent
    this.handlers.set(handler.name, handler);
  }

  getHandler<T extends SteamServiceHandler>(name: string): T { ... }

  // fan-out, mirrors SteamClient.OnClientMsgReceived
  private onCmMessage(packet: DecodedCmMessage) {
    for (const handler of this.handlers.values()) {
      try { handler.handleMessage(packet); }
      catch (err) { this.disconnect(); throw err; }
    }
  }

  // request/response correlation, mirrors AsyncJobManager
  sendJob<TResult>(msg: OutboundMessage): Promise<TResult> {
    const jobId = this.nextJobId();
    const { promise, resolve, reject } = Promise.withResolvers<TResult>();
    this.pendingJobs.set(jobId, { resolve, reject });
    this.connection!.send({ ...msg, jobId });
    return promise;   // AsyncJob<T> equivalent — just a Promise, no need for a custom awaitable type in TS
  }

  onEvent<T>(event: string, cb: (payload: T) => void): () => void {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);   // IDisposable-equivalent unsubscribe
  }
}

// Base "ClientMsgHandler" equivalent
abstract class SteamServiceHandler {
  abstract readonly name: string;
  protected client!: SteamService;
  attach(client: SteamService) { this.client = client; }
  abstract handleMessage(packet: DecodedCmMessage): void;  // ignore what you don't own
}

// electron/services/steam/handlers/SteamAppsHandler.ts
// Wraps steampipe/depot-key.ts + content-servers.ts request/response traffic.
class SteamAppsHandler extends SteamServiceHandler {
  readonly name = "apps";

  handleMessage(packet: DecodedCmMessage) {
    switch (packet.emsg) {
      case EMsg.ClientGetDepotDecryptionKeyResponse:
        this.client.resolveJob(packet.jobId, decodeDepotKeyResponse(packet)); break;
      case EMsg.ClientLicenseList:
        this.client.emit("licenseList", decodeLicenseList(packet)); break;
      default:
        return; // not ours
    }
  }

  async getDepotDecryptionKey(depotId: number, appId: number): Promise<Buffer> {
    return this.client.sendJob({ emsg: EMsg.ClientGetDepotDecryptionKey, depotId, appId });
  }
}

// electron/services/steam/handlers/SteamContentHandler.ts
// The SteamKit2.SteamContent analog — CM-authorized metadata only.
class SteamContentHandler extends SteamServiceHandler {
  readonly name = "content";
  handleMessage() { /* unused — routed through unified-message-style RPC if/when Y-Core adds it */ }

  async getManifestRequestCode(depotId: number, appId: number, manifestId: bigint): Promise<bigint> {
    return this.client.sendJob({ emsg: EMsg.ClientPICSGetManifestCode, depotId, appId, manifestId });
  }
}

// electron/modules/steampipe/cdn-client.ts stays a SEPARATE, non-handler class,
// exactly like SteamKit2.CDN.Client — it does HTTPS chunk downloads, not CM protocol.
// depot-downloader.ts's orchestration logic moves into a DepotDownloadService that
// composes SteamAppsHandler (keys), SteamContentHandler (manifest codes/auth tokens),
// and the existing cdn-client.ts (bulk transfer) — mirroring how SteamKit2's
// DepotDownloader sample composes SteamApps + SteamContent + CDN.Client rather than
// any one of them doing everything.
```

**Wiring into Zustand/IPC**: `useSteamStore` (and the other 15 stores) would stop calling `window.steamtools.xxx()` directly and instead the main process would expose a small number of IPC channels — `steam:invoke` (routes to `SteamService.sendJob`-backed handler methods, request/response, replacing most of the 88 flat bridge methods) and `steam:events` (routes to `SteamService.onEvent`, replacing the existing `ipcRenderer.on('onDownloadProgress', ...)`-style listeners). The preload bridge shrinks from 88 flat methods to effectively 2 generic ones plus typed wrapper functions generated per-handler, and the main-process side gains the same benefit SteamKit2 gets from `ClientMsgHandler`: new Steam capabilities (e.g. a future `SteamWorkshopHandler`) are additive — register a new handler class, no changes to `SteamService` core or to unrelated handlers.

## Patterns identified

1. **Minimal shared base class, maximal per-handler autonomy.** `ClientMsgHandler` is ~10 lines of real logic (a back-reference and an abstract dispatch method). All behavior lives in subclasses. This keeps the "core" (`SteamClient`) stable while handlers proliferate — 15 of them today, and third parties add more via the exact same public `AddHandler` API the library uses internally (see `Samples/010_Extending`).

2. **Broadcast-and-filter dispatch, not routed dispatch.** Every packet goes to every handler; each handler's `GetCallback`/`HandleMsg` switch statement is responsible for recognizing and ignoring what isn't its. This trades a small amount of per-packet overhead (N handler checks instead of 1 routed lookup) for zero central routing-table maintenance — adding a handler never requires editing a shared dispatch table.

3. **Three consumption styles over one underlying event source**, chosen per call site based on shape of the interaction: blocking poll loop (rare today), typed pub/sub via `CallbackManager.Subscribe` (for unsolicited/repeated events — friend messages, persona state), and awaitable `AsyncJob<T>`/`AsyncJobMultiple<T>` (for request/response and streaming request/multi-response). Newest code (`SteamContent`, unified-message-backed handlers) skips the callback ceremony entirely and exposes plain `async Task<T>` — the library's own evolution trends toward hiding the callback machinery behind idiomatic async/await at the edges while keeping it available underneath for handlers that need push semantics.

4. **Protocol translation is a `switch` statement, kept separate from both the raw framing layer (`CMClient`) and the callback data classes (`Callbacks.cs`).** The handler's `HandleMsg`/`GetCallback` pair is intentionally "dumb" glue: `EMsg -> constructor call -> PostCallback`. All the actual protobuf-to-typed-object unwrapping happens in the `CallbackMsg` subclass constructors in a sibling file, not inline in the dispatch switch. This is a directly reusable convention for Y-Core: keep the "which EMsg maps to which decoder" table trivial and push real parsing into named decoder functions/classes.

5. **Transport boundary, not feature boundary, drives file/class boundaries for downloads.** The single most transferable lesson for Y-Core's `depot-downloader.ts`: SteamKit2 does not have one class that "downloads a depot." It has a CM-protocol handler for authorization metadata (keys, manifest codes, auth tokens) and a completely separate plain-HTTP `CDN.Client` for bulk transfer, composed together by orchestration code (the `DepotDownloader` sample) that owns neither transport. Y-Core's service layer should draw the `SteamService` boundary the same way: CM-protocol concerns (handshake, session, small request/response messages) in handler classes, HTTP/CDN chunk transfer in a separate non-handler class, and depot-download orchestration as a composing service above both — not inside either.

6. **The extension point is genuinely public and low-ceremony**, which is the strongest architectural validation for a Y-Core `SteamService`: subclass, implement one method, register with one call, retrieve with one generic method (`GetHandler<T>`/`GetRequiredHandler<T>`). If Y-Core adopts this shape, adding e.g. workshop or matchmaking support later means writing a new handler class and registering it — not modifying `SteamService` core, not touching the IPC bridge surface beyond generic invoke/event channels, and not touching unrelated handlers.
