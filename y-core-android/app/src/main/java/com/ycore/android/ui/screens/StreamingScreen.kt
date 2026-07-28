package com.ycore.android.ui.screens

import android.view.ViewGroup
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.ycore.android.controls.InputSender
import com.ycore.android.controls.VirtualGamepad
import com.ycore.android.ui.theme.*
import com.ycore.android.webrtc.WebRTCManager
import com.ycore.android.webrtc.WebRTCStats
import com.ycore.android.webrtc.StreamState
import org.webrtc.SurfaceViewRenderer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StreamingScreen(
    hostId: String,
    hostName: String,
    webrtc: WebRTCManager,
    inputSender: InputSender,
    onDisconnect: () -> Unit
) {
    val streamState by webrtc.streamState.collectAsState()
    val stats by webrtc.stats.collectAsState()
    val remoteStream by webrtc.remoteStream.collectAsState()
    var showStats by remember { mutableStateOf(true) }
    var showGamepad by remember { mutableStateOf(true) }
    var videoRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    // Bind video track when remote stream becomes available
    LaunchedEffect(remoteStream) {
        val stream = remoteStream ?: return@LaunchedEffect
        val track = stream.videoTracks.firstOrNull() ?: return@LaunchedEffect
        videoRenderer?.let { renderer ->
            track.addSink(renderer)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // WebRTC video surface — renders real stream
        AndroidView(
            factory = { ctx ->
                SurfaceViewRenderer(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    webrtc.getEglBaseContext()?.let { eglContext ->
                        init(eglContext, null)
                    }
                    setMirror(false)
                    setEnableHardwareScaler(true)
                    // Fill the entire screen without letterboxing (white/black borders)
                    // SCALE_ASPECT_FILL stretches to fill available space, cropping if needed
                    setScalingType(org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                }.also { videoRenderer = it }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Connecting / Disconnected overlay
        when (streamState) {
            StreamState.CONNECTING -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.5f)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(color = Accent)
                        Text("Connecting to stream...", color = Color.White, fontSize = 14.sp)
                    }
                }
            }
            StreamState.ERROR, StreamState.DISCONNECTED -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            Icons.Default.SignalWifiOff,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = Color.White.copy(alpha = 0.5f)
                        )
                        Text(
                            if (streamState == StreamState.ERROR) "Connection error" else "Stream disconnected",
                            color = Color.White.copy(alpha = 0.5f)
                        )
                        if (streamState == StreamState.ERROR) {
                            Button(
                                onClick = { webrtc.reconnect() },
                                colors = ButtonDefaults.buttonColors(containerColor = Accent)
                            ) { Text("Reconnect") }
                        }
                        Button(
                            onClick = onDisconnect,
                            colors = ButtonDefaults.buttonColors(containerColor = Accent)
                        ) { Text("Go Back") }
                    }
                }
            }
            StreamState.IDLE -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Initializing...", color = Color.White.copy(alpha = 0.5f))
                }
            }
            StreamState.CONNECTED -> {
                // Video is rendering underneath — no overlay needed
            }
        }

        // Stats overlay (top-left)
        if (showStats && stats.framerate != null) {
            Card(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color.Black.copy(alpha = 0.7f)
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(8.dp)) {
                    StatsRow("RTT", "${stats.rttMs ?: "--"}ms")
                    StatsRow("FPS", "${stats.framerate ?: "--"}")
                    StatsRow("Res", stats.resolution ?: "--")
                    StatsRow("Lost", "${stats.packetsLost ?: 0}")
                }
            }
        }

        // Top controls bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(8.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = onDisconnect) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Disconnect",
                    tint = Color.White
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(onClick = { showStats = !showStats }) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = "Toggle stats",
                        tint = Color.White
                    )
                }
                IconButton(onClick = { showGamepad = !showGamepad }) {
                    Icon(
                        if (showGamepad) Icons.Default.VideogameAsset else Icons.Default.TouchApp,
                        contentDescription = "Toggle controls",
                        tint = Color.White
                    )
                }
            }
        }

        // Virtual gamepad overlay — fills the screen since the redesigned
        // layout places L1/L2/R1/R2 in the top corners, not just the bottom.
        // Fades in/out on toggle instead of popping.
        AnimatedVisibility(
            visible = showGamepad,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            VirtualGamepad(
                inputSender = inputSender,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
private fun StatsRow(label: String, value: String) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 11.sp
        )
        Text(
            text = value,
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
