package com.ycore.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ycore.android.data.local.StreamSettings
import com.ycore.android.data.local.TokenManager
import com.ycore.android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    tokenManager: TokenManager,
    onLogout: () -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val settings by tokenManager.streamSettings.collectAsState(initial = StreamSettings())
    var maxBitrate by remember(settings) { mutableStateOf(settings.maxBitrate.toString()) }
    var fps by remember(settings) { mutableStateOf(settings.fps.toString()) }
    var enableAudio by remember(settings) { mutableStateOf(settings.enableAudio) }
    var useMobileData by remember(settings) { mutableStateOf(settings.useMobileData) }
    var codec by remember(settings) { mutableStateOf(settings.codec) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text("Stream Quality", color = TextBright, fontWeight = FontWeight.Bold, fontSize = 18.sp)

            OutlinedTextField(
                value = maxBitrate,
                onValueChange = { maxBitrate = it },
                label = { Text("Max Bitrate (Kbps)") },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = Border
                )
            )

            OutlinedTextField(
                value = fps,
                onValueChange = { fps = it },
                label = { Text("Target FPS") },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = Border
                )
            )

            // Codec selector
            Text("Video Codec", color = TextSecondary, fontSize = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("H264", "H265", "VP8", "VP9").forEach { c ->
                    FilterChip(
                        selected = codec == c,
                        onClick = { codec = c },
                        label = { Text(c, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Accent.copy(alpha = 0.2f),
                            selectedLabelColor = Accent
                        )
                    )
                }
            }

            Divider(color = Border)

            Text("General", color = TextBright, fontWeight = FontWeight.Bold, fontSize = 18.sp)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Audio", color = TextBright, fontSize = 14.sp)
                    Text("Stream audio from the PC", color = TextDim, fontSize = 12.sp)
                }
                Switch(
                    checked = enableAudio,
                    onCheckedChange = { enableAudio = it },
                    colors = SwitchDefaults.colors(checkedThumbColor = Accent, checkedTrackColor = Accent.copy(alpha = 0.3f))
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Mobile Data", color = TextBright, fontSize = 14.sp)
                    Text("Allow streaming on mobile data", color = TextDim, fontSize = 12.sp)
                }
                Switch(
                    checked = useMobileData,
                    onCheckedChange = { useMobileData = it },
                    colors = SwitchDefaults.colors(checkedThumbColor = Accent, checkedTrackColor = Accent.copy(alpha = 0.3f))
                )
            }

            Divider(color = Border)

            Button(
                onClick = {
                    scope.launch {
                        tokenManager.updateStreamSettings(StreamSettings(
                            maxBitrate = maxBitrate.toIntOrNull() ?: 20000,
                            fps = fps.toIntOrNull() ?: 60,
                            enableAudio = enableAudio,
                            useMobileData = useMobileData,
                            codec = codec
                        ))
                    }
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) {
                Text("Save Settings", fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = {
                    scope.launch {
                        tokenManager.clear()
                        onLogout()
                    }
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Error.copy(alpha = 0.2f)),
            ) {
                Text("Logout", color = Error, fontWeight = FontWeight.Bold)
            }
        }
    }
}
