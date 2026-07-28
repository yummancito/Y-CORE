package com.ycore.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Accent,
    secondary = AccentDim,
    tertiary = Purple80,
    background = Surface,
    surface = SurfaceCard,
    surfaceVariant = SurfaceElevated,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = TextBright,
    onSurface = TextBright,
    onSurfaceVariant = TextSecondary,
    outline = Border,
    error = Error,
)

@Composable
fun YCoreTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
