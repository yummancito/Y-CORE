package com.ycore.android.controls

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import kotlin.math.sqrt

// ============================================================================
// VirtualGamepad — dual-analog overlay rendered on top of the WebRTC video
// surface in StreamingScreen.kt. Layout/visual spec matches the approved
// design (Gamepad Overlay.dc.html): L1/L2 top-left, R1/R2 top-right, analog
// stick + D-pad-free left cluster, ABXY diamond + analog stick right cluster,
// START/SELECT bottom-center. Translucent so the game underneath stays
// legible, with an auto-fade-to-idle behavior so the overlay doesn't
// permanently obstruct the view.
// ============================================================================

private val AccentColor = Color(0xFF6C63FF)

private const val IDLE_TIMEOUT_MS = 3000L
private const val IDLE_OPACITY = 0.34f

@Composable
fun VirtualGamepad(
    inputSender: InputSender,
    modifier: Modifier = Modifier
) {
    // Auto-fade: any button press or stick drag bumps `lastInteraction`,
    // which restarts the idle countdown. Mirrors PS Remote Play / Steam
    // Link, where the overlay dims but never fully disappears while active.
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var isIdle by remember { mutableStateOf(false) }
    val onInteract: () -> Unit = { lastInteraction = System.currentTimeMillis() }

    LaunchedEffect(lastInteraction) {
        isIdle = false
        kotlinx.coroutines.delay(IDLE_TIMEOUT_MS)
        isIdle = true
    }

    val opacity by animateFloatAsState(
        targetValue = if (isIdle) IDLE_OPACITY else 1f,
        animationSpec = tween(400),
        label = "gamepad-opacity",
    )

    Box(
        modifier = modifier.graphicsLayer { alpha = opacity }
    ) {
        // top = 64.dp clears StreamingScreen's own top bar (disconnect /
        // stats-toggle / gamepad-toggle icon buttons, ~56dp tall) so the
        // shoulder clusters sit just below it instead of overlapping —
        // both live in the same screen corners.
        ShoulderCluster(
            topLabel = "L2", bottomLabel = "L1",
            inputSender = inputSender, onInteract = onInteract,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 10.dp, top = 64.dp),
        )
        ShoulderCluster(
            topLabel = "R2", bottomLabel = "R1",
            inputSender = inputSender, onInteract = onInteract,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(end = 10.dp, top = 64.dp),
        )

        AnalogStick(
            axisX = "left_x", axisY = "left_y",
            inputSender = inputSender, onInteract = onInteract,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 18.dp, bottom = 24.dp),
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 18.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            FaceButtonDiamond(inputSender = inputSender, onInteract = onInteract)
            AnalogStick(axisX = "right_x", axisY = "right_y", inputSender = inputSender, onInteract = onInteract)
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PillButton(label = "SELECT", button = "select", inputSender = inputSender, onInteract = onInteract)
            PillButton(label = "START", button = "start", inputSender = inputSender, onInteract = onInteract)
        }
    }
}

// ── Shoulder buttons (L1/L2, R1/R2) ─────────────────────────────────────────

@Composable
private fun ShoulderCluster(
    topLabel: String,
    bottomLabel: String,
    inputSender: InputSender,
    onInteract: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        ShoulderPill(topLabel, width = 54.dp, inputSender = inputSender, onInteract = onInteract)
        ShoulderPill(bottomLabel, width = 64.dp, inputSender = inputSender, onInteract = onInteract)
    }
}

@Composable
private fun ShoulderPill(
    label: String,
    width: Dp,
    inputSender: InputSender,
    onInteract: () -> Unit,
) {
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, label = "shoulder-scale")
    val bg by animateColorAsState(
        if (pressed) AccentColor.copy(alpha = 0.72f) else Color.White.copy(alpha = 0.09f),
        label = "shoulder-bg",
    )
    val fg = if (pressed) Color.White else Color.White.copy(alpha = 0.72f)

    Box(
        modifier = Modifier
            .width(width)
            .height(24.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(bg)
            .pointerInput(label) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        onInteract()
                        inputSender.sendGamepadButton(label, true)
                        tryAwaitRelease()
                        pressed = false
                        onInteract()
                        inputSender.sendGamepadButton(label, false)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = fg, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

// ── Face buttons (Y/A/X/B diamond) ──────────────────────────────────────────

@Composable
private fun FaceButtonDiamond(inputSender: InputSender, onInteract: () -> Unit) {
    Box(modifier = Modifier.size(92.dp)) {
        FaceButton("Y", inputSender, onInteract, Modifier.align(Alignment.TopCenter))
        FaceButton("A", inputSender, onInteract, Modifier.align(Alignment.BottomCenter))
        FaceButton("X", inputSender, onInteract, Modifier.align(Alignment.CenterStart))
        FaceButton("B", inputSender, onInteract, Modifier.align(Alignment.CenterEnd))
    }
}

@Composable
private fun FaceButton(
    label: String,
    inputSender: InputSender,
    onInteract: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (pressed) 0.88f else 1f, label = "face-scale")
    val bg by animateColorAsState(
        if (pressed) AccentColor.copy(alpha = 0.78f) else Color.White.copy(alpha = 0.08f),
        label = "face-bg",
    )
    val borderColor by animateColorAsState(
        if (pressed) Color.White.copy(alpha = 0.42f) else Color.White.copy(alpha = 0.12f),
        label = "face-border",
    )
    val fg = if (pressed) Color.White else Color.White.copy(alpha = 0.74f)

    Box(
        modifier = modifier
            .size(35.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, borderColor, CircleShape)
            .pointerInput(label) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        onInteract()
                        inputSender.sendGamepadButton(label, true)
                        tryAwaitRelease()
                        pressed = false
                        onInteract()
                        inputSender.sendGamepadButton(label, false)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

// ── Start / Select pills ─────────────────────────────────────────────────────

@Composable
private fun PillButton(
    label: String,
    button: String,
    inputSender: InputSender,
    onInteract: () -> Unit,
) {
    var pressed by remember { mutableStateOf(false) }
    val bg by animateColorAsState(
        if (pressed) Color.White.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.10f),
        label = "pill-bg",
    )

    Box(
        modifier = Modifier
            .width(44.dp)
            .height(17.dp)
            .clip(CircleShape)
            .background(bg)
            .pointerInput(button) {
                detectTapGestures(
                    onPress = {
                        pressed = true
                        onInteract()
                        inputSender.sendGamepadButton(button, true)
                        tryAwaitRelease()
                        pressed = false
                        onInteract()
                        inputSender.sendGamepadButton(button, false)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White.copy(alpha = 0.55f), fontSize = 6.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.sp)
    }
}

// ── Analog stick ─────────────────────────────────────────────────────────────
// Drag-bounded joystick: the thumb tracks the finger 1:1 up to the track's
// radius, clamped so it can't leave the ring. On release it springs back to
// center. Axis values are normalized to -1f..1f and throttled to ~30Hz so a
// fast-moving thumb doesn't flood sendGamepadAxis on every recomposition.

private val STICK_RING_RADIUS = 42.dp
private val STICK_THUMB_RADIUS = 17.dp
private const val AXIS_SEND_INTERVAL_MS = 33L

@Composable
private fun AnalogStick(
    axisX: String,
    axisY: String,
    inputSender: InputSender,
    onInteract: () -> Unit,
) {
    val density = LocalDensity.current
    val maxRadiusPx = remember(density) {
        with(density) { (STICK_RING_RADIUS - STICK_THUMB_RADIUS).toPx() }
    }
    val scope = rememberCoroutineScope()

    // `dragOffset` follows the finger 1:1 while dragging (plain state — no
    // suspend needed inside the non-suspend onDrag callback). `springOffset`
    // is an Animatable used only to animate the release-to-center bounce;
    // the rendered position is whichever one is currently authoritative.
    var dragOffset by remember { mutableStateOf(Offset.Zero) }
    val springOffset = remember { Animatable(Offset.Zero, Offset.VectorConverter) }
    var dragging by remember { mutableStateOf(false) }
    var lastSentAt by remember { mutableLongStateOf(0L) }

    val renderOffset = if (dragging) dragOffset else springOffset.value

    val ringBorderColor by animateColorAsState(
        if (dragging) AccentColor.copy(alpha = 0.45f) else Color.White.copy(alpha = 0.18f),
        label = "stick-ring-border",
    )
    val thumbColor by animateColorAsState(
        if (dragging) AccentColor.copy(alpha = 0.72f) else Color.White.copy(alpha = 0.15f),
        label = "stick-thumb-color",
    )
    val thumbBorderColor by animateColorAsState(
        if (dragging) Color.White.copy(alpha = 0.45f) else Color.White.copy(alpha = 0.16f),
        label = "stick-thumb-border",
    )

    Box(
        modifier = Modifier.size(STICK_RING_RADIUS * 2),
        contentAlignment = Alignment.Center,
    ) {
        // Track ring
        Box(
            modifier = Modifier
                .size(STICK_RING_RADIUS * 2)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.035f))
                .border(1.2.dp, ringBorderColor, CircleShape),
        )

        // Draggable thumb
        Box(
            modifier = Modifier
                .offset { IntOffset(renderOffset.x.roundToInt(), renderOffset.y.roundToInt()) }
                .size(STICK_THUMB_RADIUS * 2)
                .clip(CircleShape)
                .background(thumbColor)
                .border(1.dp, thumbBorderColor, CircleShape)
                .pointerInput(axisX, axisY) {
                    detectDragGestures(
                        onDragStart = {
                            dragging = true
                            dragOffset = springOffset.value
                            onInteract()
                        },
                        onDragEnd = {
                            dragging = false
                            onInteract()
                            val releasedFrom = dragOffset
                            scope.launch {
                                springOffset.snapTo(releasedFrom)
                                springOffset.animateTo(
                                    Offset.Zero,
                                    spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
                                )
                            }
                            inputSender.sendGamepadAxis(axisX, 0f)
                            inputSender.sendGamepadAxis(axisY, 0f)
                        },
                        onDragCancel = {
                            dragging = false
                            scope.launch { springOffset.snapTo(Offset.Zero) }
                        },
                    ) { change, dragAmount ->
                        change.consume()
                        onInteract()
                        val raw = dragOffset + dragAmount
                        val dist = sqrt(raw.x * raw.x + raw.y * raw.y)
                        dragOffset = if (dist > maxRadiusPx) raw * (maxRadiusPx / dist) else raw

                        val now = System.currentTimeMillis()
                        if (now - lastSentAt >= AXIS_SEND_INTERVAL_MS) {
                            lastSentAt = now
                            inputSender.sendGamepadAxis(axisX, (dragOffset.x / maxRadiusPx).coerceIn(-1f, 1f))
                            inputSender.sendGamepadAxis(axisY, (dragOffset.y / maxRadiusPx).coerceIn(-1f, 1f))
                        }
                    }
                },
        )
    }
}
