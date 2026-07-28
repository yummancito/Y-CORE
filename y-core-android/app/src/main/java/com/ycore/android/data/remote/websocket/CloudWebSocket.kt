package com.ycore.android.data.remote.websocket

import com.ycore.android.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.adapter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

// ── WebSocket message types matching y-core-cloud protocol ──

data class WsMessage(
    val type: String,
    val token: String? = null,
    val targetHostId: String? = null,
    val targetDeviceId: String? = null,
    val hostId: String? = null,
    val deviceId: String? = null,
    val requestId: String? = null,
    val sessionId: String? = null,
    val gameId: String? = null,
    val gameName: String? = null,
    val signal: Map<String, Any?>? = null,
    val data: Map<String, Any?>? = null,
    val status: String? = null,
    val error: String? = null,
    val games: List<Map<String, Any?>>? = null,
    val success: Boolean? = null,
    val accept: Boolean? = null,
    val rememberDevice: Boolean? = null,
    val fromDeviceId: String? = null,
    val fromHostId: String? = null,
    val autoAccepted: Boolean? = null,
    val device: Map<String, Any?>? = null,
    val message: String? = null,
    val code: String? = null
)

enum class ConnectionState {
    DISCONNECTED, CONNECTING, CONNECTED, AUTHENTICATED
}

@Singleton
class CloudWebSocket @Inject constructor(
    private val moshi: Moshi,
    private val okHttpClient: OkHttpClient
) {
    private val jsonAdapter by lazy { moshi.adapter<WsMessage>() }

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _messages = MutableSharedFlow<WsMessage>(replay = 0, extraBufferCapacity = 64)
    val messages: SharedFlow<WsMessage> = _messages.asSharedFlow()

    private var webSocket: WebSocket? = null
    private var job: Job? = null
    private var authToken: String? = null
    private var deviceId: String? = null
    private var currentHostId: String? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val reconnectDelayMs = 3000L
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 10
    private var shouldReconnect = false

    fun connect(token: String, deviceUuid: String) {
        authToken = token
        deviceId = deviceUuid
        shouldReconnect = true
        reconnectAttempts = 0
        doConnect()
    }

    private fun doConnect() {
        _connectionState.value = ConnectionState.CONNECTING
        val wsUrl = "${BuildConfig.WS_URL}/ws?token=${authToken}&role=client&deviceId=$deviceId"
        val request = Request.Builder().url(wsUrl).build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                _connectionState.value = ConnectionState.CONNECTED
                reconnectAttempts = 0
                if (authToken != null) {
                    sendMessage(WsMessage(
                        type = "auth",
                        token = authToken,
                        data = mapOf("role" to "client"),
                        deviceId = deviceId
                    ))
                }
            }

            override fun onMessage(ws: WebSocket, text: String) {
                scope.launch {
                    try {
                        val msg = jsonAdapter.fromJson(text)
                        if (msg != null) {
                            when (msg.type) {
                                "auth_success" -> {
                                    _connectionState.value = ConnectionState.AUTHENTICATED
                                }
                                "auth_error" -> {
                                    _connectionState.value = ConnectionState.DISCONNECTED
                                }
                                "auth_required" -> {
                                    if (authToken != null) {
                                        sendMessage(WsMessage(
                                            type = "auth",
                                            token = authToken,
                                            data = mapOf("role" to "client"),
                                            deviceId = deviceId
                                        ))
                                    }
                                }
                                "ping" -> {
                                    sendMessage(WsMessage(type = "heartbeat"))
                                }
                            }
                            _messages.emit(msg)
                        }
                    } catch (_: Exception) {}
                }
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scheduleReconnect()
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect || reconnectAttempts >= maxReconnectAttempts) return
        reconnectAttempts++
        val delay = reconnectDelayMs * minOf(reconnectAttempts, 5)
        job = scope.launch {
            delay(delay)
            doConnect()
        }
    }

    fun sendMessage(msg: WsMessage) {
        val json = jsonAdapter.toJson(msg)
        webSocket?.send(json)
    }

    fun sendSignal(targetHostId: String, signalType: String, data: Any?) {
        sendMessage(WsMessage(
            type = "signal",
            targetHostId = targetHostId,
            signal = mapOf(
                "type" to signalType,
                "data" to data
            )
        ))
    }

    fun requestLibrary(hostUuid: String) {
        currentHostId = hostUuid
        sendMessage(WsMessage(type = "library_request", hostId = hostUuid))
    }

    fun requestLaunch(hostUuid: String, gameId: String, gameName: String) {
        currentHostId = hostUuid
        sendMessage(WsMessage(type = "launch_request", hostId = hostUuid, gameId = gameId, gameName = gameName))
    }

    fun sendConnectionRequest(hostUuid: String) {
        currentHostId = hostUuid
        sendMessage(WsMessage(type = "connection_request", hostId = hostUuid))
    }

    fun disconnect() {
        shouldReconnect = false
        job?.cancel()
        webSocket?.close(1000, "Client closing")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}
