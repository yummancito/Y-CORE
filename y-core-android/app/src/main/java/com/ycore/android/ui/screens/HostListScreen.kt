package com.ycore.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ycore.android.data.remote.dto.HostDto
import com.ycore.android.ui.theme.*
import com.ycore.android.viewmodel.HostListViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostListScreen(
    onHostSelected: (String, String) -> Unit, // hostId, hostName
    viewModel: HostListViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadHosts()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My PCs", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        backgroundColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = Accent
                )
            } else if (uiState.hosts.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DesktopWindows,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = TextDim
                    )
                    Text("No PCs available", color = TextDim, fontSize = 16.sp)
                    Text(
                        "Open Y-Core Desktop and start Remote Play",
                        color = TextDim,
                        fontSize = 13.sp
                    )
                    Button(
                        onClick = viewModel::loadHosts,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent)
                    ) {
                        Text("Refresh")
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.hosts) { host ->
                        HostCard(
                            host = host,
                            onClick = {
                                viewModel.selectHost(host)
                                // After pairing, navigate to library
                                if (uiState.pairingStatus == "accepted") {
                                    onHostSelected(host.id, host.name)
                                }
                            }
                        )
                    }
                }
            }

            // Pairing overlay
            if (uiState.pairingStatus == "pending") {
                Card(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(32.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(color = Accent)
                        Text("Connecting...", color = TextBright, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Waiting for PC to accept",
                            color = TextDim,
                            fontSize = 13.sp
                        )
                    }
                }
            }

            if (uiState.error != null) {
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp),
                    containerColor = Error
                ) {
                    Text(uiState.error!!)
                }
            }
        }
    }
}

@Composable
fun HostCard(
    host: HostDto,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Status indicator
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(
                        if (host.status == "ONLINE") Success
                        else if (host.status == "AWAY") Warning
                        else TextDim
                    )
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = host.name,
                    color = TextBright,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = host.status.lowercase().replaceFirstChar { it.uppercase() },
                        color = if (host.status == "ONLINE") Success else TextDim,
                        fontSize = 12.sp
                    )
                    if (host.lastHeartbeatAt != null) {
                        Text(
                            text = "·",
                            color = TextDim,
                            fontSize = 12.sp
                        )
                        Text(
                            text = host.gameCount.toString(),
                            color = TextDim,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            if (host.status == "ONLINE") {
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = TextDim
                )
            } else {
                Icon(
                    imageVector = Icons.Default.CloudOff,
                    contentDescription = null,
                    tint = TextDim,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
