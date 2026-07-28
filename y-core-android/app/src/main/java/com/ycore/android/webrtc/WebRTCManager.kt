package com.ycore.android.webrtc

import android.content.Context
import com.ycore.android.data.remote.websocket.CloudWebSocket
import com.ycore.android.data.remote.websocket.WsMessage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.webrtc.*
import javax.inject.Inject
import javax.inject.Singleton

data class WebRTCStats(
    val rttMs: Long? = null,
    val bitrateKbps: Long? = null,
    val packetsLost: Long? = null,
    val resolution: String? = null,
    val framerate: Int? = null
)

enum class StreamState {
    IDLE, CONNECTING, CONNECTED, DISCONNECTED, ERROR
}

@Singleton
class WebRTCManager @Inject constructor(
    private val context: Context,
    private val cloudWs: CloudWebSocket
) {
    private val _streamState = MutableStateFlow(StreamState.IDLE)
    val streamState: StateFlow<StreamState> = _streamState.asStateFlow()

    private val _remoteStream = MutableStateFlow<MediaStream?>(null)
    val remoteStream: StateFlow<MediaStream?> = _remoteStream.asStateFlow()

    private val _stats = MutableStateFlow(WebRTCStats())
    val stats: StateFlow<WebRTCStats> = _stats.asStateFlow()

    private var peerConnection: PeerConnection? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var eglBase: EglBase? = null
    private var currentHostId: String? = null
    private var statsJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val iceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun2.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer()
    )

    fun initialize(hostId: String) {
        currentHostId = hostId
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
        eglBase = EglBase.create()

        val options = PeerConnectionFactory.Options()
        peerConnectionFactory = PeerConnectionFactory.builder()
            .setOptions(options)
            .createPeerConnectionFactory()
    }

    fun startConnection() {
        if (peerConnectionFactory == null || currentHostId == null) return
        _streamState.value = StreamState.CONNECTING

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            iceCandidatePoolSize = 5
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                cloudWs.sendSignal(currentHostId!!, "ice", mapOf(
                    "candidate" to candidate.sdp,
                    "sdpMid" to candidate.sdpMid,
                    "sdpMLineIndex" to candidate.sdpMLineIndex
                ))
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}

            override fun onSignalingChange(state: SignalingState) {}

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                if (state == PeerConnection.IceConnectionState.CONNECTED) {
                    _streamState.value = StreamState.CONNECTED
                    startStatsPolling()
                } else if (state == PeerConnection.IceConnectionState.DISCONNECTED ||
                    state == PeerConnection.IceConnectionState.FAILED) {
                    _streamState.value = StreamState.DISCONNECTED
                    stopStatsPolling()
                }
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) {}

            override fun onAddStream(stream: MediaStream) {
                _remoteStream.value = stream
                _streamState.value = StreamState.CONNECTED
            }

            override fun onRemoveStream(stream: MediaStream) {
                _remoteStream.value = null
            }

            override fun onDataChannel(channel: DataChannel) {}

            override fun onRenegotiationNeeded() {}

            override fun onAddTrack(track: RtpReceiver?, streams: Array<out MediaStream>?) {
                if (streams != null && streams.isNotEmpty()) {
                    _remoteStream.value = streams[0]
                }
            }

            override fun onTrack(track: RtpTransceiver?) {}
        })

        // Wait for offer from host
        cloudWs.messages.onEach { msg ->
            handleMessage(msg)
        }.launchIn(scope)
    }

    private fun handleMessage(msg: WsMessage) {
        when (msg.type) {
            "signal" -> {
                val signal = msg.signal ?: return
                val signalType = signal["type"] as? String ?: return
                val data = signal["data"]

                when (signalType) {
                    "offer" -> handleOffer(data)
                    "answer" -> handleAnswer(data)
                    "ice" -> handleIce(data)
                    "bye" -> disconnect()
                }
            }
            "launch_response" -> {
                if (msg.success == true) {
                    // Launch successful, wait for WebRTC offer
                }
            }
        }
    }

    private fun handleOffer(data: Any?) {
        if (data == null) return
        val desc = SessionDescription(SessionDescription.Type.OFFER, data.toString())
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {}
            override fun onSetSuccess() {
                peerConnection?.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(sdp: SessionDescription?) {
                        if (sdp != null) {
                            peerConnection?.setLocalDescription(this, sdp)
                            cloudWs.sendSignal(currentHostId!!, "answer", sdp.description)
                        }
                    }
                    override fun onSetSuccess() {}
                    override fun onCreateFailure(msg: String?) {}
                    override fun onSetFailure(msg: String?) {}
                }, MediaConstraints())
            }
            override fun onCreateFailure(msg: String?) {}
            override fun onSetFailure(msg: String?) {}
        }, desc)
    }

    private fun handleAnswer(data: Any?) {
        if (data == null) return
        val desc = SessionDescription(SessionDescription.Type.ANSWER, data.toString())
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {}
            override fun onSetSuccess() {}
            override fun onCreateFailure(msg: String?) {}
            override fun onSetFailure(msg: String?) {
                _streamState.value = StreamState.ERROR
            }
        }, desc)
    }
    private fun handleIce(data: Any?) {
        if (data is Map<*, *>) {
            val candidate = data["candidate"] as? String ?: return
            val sdpMid = data["sdpMid"] as? String ?: return
            val sdpMLineIndex = data["sdpMLineIndex"] as? Int ?: return
            peerConnection?.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, candidate))
        }
    }

    private fun startStatsPolling() {
        statsJob = scope.launch {
            while (isActive) {
                peerConnection?.getStats { report ->
                    var rtt: Long? = null
                    var bitrate: Long? = null
                    var lost: Long? = null
                    var res: String? = null
                    var fps: Int? = null

                    report.statsMap.values.forEach { stat ->
                        when (stat.type) {
                            "candidate-pair" -> {
                                if (stat.members["state"]?.getString() == "succeeded") {
                                    rtt = (stat.members["currentRoundTripTime"]?.getDouble()?.times(1000))?.toLong()
                                }
                            }
                            "inbound-rtp" -> {
                                if (stat.members["kind"]?.getString() == "video") {
                                    lost = stat.members["packetsLost"]?.getLong()
                                    fps = stat.members["framesPerSecond"]?.getInt()
                                    val w = stat.members["frameWidth"]?.getInt()
                                    val h = stat.members["frameHeight"]?.getInt()
                                    if (w != null && h != null) res = "${w}x$h"
                                }
                            }
                        }
                    }
                    _stats.value = WebRTCStats(rtt, bitrate, lost, res, fps)
                }
                delay(2000)
            }
        }
    }

    private fun stopStatsPolling() {
        statsJob?.cancel()
        statsJob = null
    }

    fun createVideoRenderer(): VideoRenderer? {
        val egl = eglBase ?: return null
        return peerConnectionFactory?.createVideoSource(false)?.let { source ->
            val surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", egl.eglBaseContext)
            val videoSink = VideoSink { frame ->
                // Frame is enqueued to the renderer
            }
            source.initialize(surfaceTextureHelper, videoSink)
            VideoRenderer(source)
        }
    }

    fun disconnect() {
        stopStatsPolling()
        peerConnection?.close()
        peerConnection = null
        _remoteStream.value = null
        _streamState.value = StreamState.DISCONNECTED
        _stats.value = WebRTCStats()
    }

    fun destroy() {
        disconnect()
        scope.cancel()
        peerConnectionFactory?.dispose()
        eglBase?.release()
    }

    fun getEglBaseContext(): EglBase.Context? = eglBase?.eglBaseContext

    fun reconnect() {
        disconnect()
        currentHostId?.let { hostId ->
            initialize(hostId)
            startConnection()
        }
    }
}
