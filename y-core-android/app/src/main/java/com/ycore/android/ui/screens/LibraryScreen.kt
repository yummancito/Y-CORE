package com.ycore.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ycore.android.data.remote.dto.LibraryGameDto
import com.ycore.android.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    hostName: String,
    hostId: String,
    games: List<LibraryGameDto>,
    isLoading: Boolean,
    launchStatus: String?,
    onLaunchGame: (String, String) -> Unit,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(hostName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("${games.size} games", color = TextDim, fontSize = 12.sp)
                    }
                },
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = Accent
                )
            } else if (games.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.Gamepad, contentDescription = null, modifier = Modifier.size(64.dp), tint = TextDim)
                    Text("No games found", color = TextDim, fontSize = 16.sp)
                    Text("Start a game on your PC to see it here", color = TextDim, fontSize = 13.sp)
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 160.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(games) { game ->
                        GameCard(
                            game = game,
                            onClick = { onLaunchGame(game.appId, game.name) },
                            isLaunching = launchStatus == "launching"
                        )
                    }
                }
            }

            // Launch status overlay
            if (launchStatus == "launching") {
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
                        Text("Launching game...", color = TextBright, fontWeight = FontWeight.SemiBold)
                        Text("The game is starting on your PC", color = TextDim, fontSize = 13.sp)
                    }
                }
            }

            if (launchStatus == "failed") {
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp),
                    containerColor = Error
                ) {
                    Text("Failed to launch game")
                }
            }
        }
    }
}

@Composable
fun GameCard(
    game: LibraryGameDto,
    onClick: () -> Unit,
    isLaunching: Boolean
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isLaunching, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            // Game card header — game icon fallback when no headerImage URL
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                    .background(SurfaceElevated),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.VideogameAsset,
                    contentDescription = game.name,
                    modifier = Modifier.size(36.dp),
                    tint = TextDim
                )
            }

            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = game.name,
                    color = TextBright,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val playTimeHours = game.playTime / 3600
                    if (playTimeHours > 0) {
                        Text(
                            text = "${playTimeHours}h",
                            color = TextDim,
                            fontSize = 11.sp
                        )
                    }
                    Text(
                        text = formatSize(game.sizeOnDisk),
                        color = TextDim,
                        fontSize = 11.sp
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = onClick,
                    enabled = !isLaunching,
                    modifier = Modifier.fillMaxWidth().height(32.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Play", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

private fun formatSize(bytes: Long): String {
    return when {
        bytes >= 1_000_000_000 -> "${bytes / 1_000_000_000}GB"
        bytes >= 1_000_000 -> "${bytes / 1_000_000}MB"
        bytes >= 1_000 -> "${bytes / 1_000}KB"
        else -> "${bytes}B"
    }
}
