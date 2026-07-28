package com.ycore.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ycore_settings")

data class StreamSettings(
    val maxBitrate: Int = 20000,
    val resolution: String = "1920x1080",
    val fps: Int = 60,
    val enableAudio: Boolean = true,
    val enableVibration: Boolean = true,
    val useMobileData: Boolean = false,
    val codec: String = "H264",
    val language: String = "en"
)

@Singleton
class TokenManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    val accessToken: Flow<String?> = context.dataStore.data.map { it[ACCESS_TOKEN_KEY] }
    val refreshToken: Flow<String?> = context.dataStore.data.map { it[REFRESH_TOKEN_KEY] }
    val userEmail: Flow<String?> = context.dataStore.data.map { it[USER_EMAIL_KEY] }
    val rememberSession: Flow<Boolean> = context.dataStore.data.map { it[REMEMBER_SESSION_KEY] ?: true }
    val deviceId: Flow<String?> = context.dataStore.data.map { it[DEVICE_ID_KEY] }
    val streamSettings: Flow<StreamSettings> = context.dataStore.data.map { prefs ->
        StreamSettings(
            maxBitrate = prefs[MAX_BITRATE_KEY] ?: 20000,
            resolution = prefs[RESOLUTION_KEY] ?: "1920x1080",
            fps = prefs[FPS_KEY] ?: 60,
            enableAudio = prefs[ENABLE_AUDIO_KEY] ?: true,
            enableVibration = prefs[ENABLE_VIBRATION_KEY] ?: true,
            useMobileData = prefs[USE_MOBILE_DATA_KEY] ?: false,
            codec = prefs[CODEC_KEY] ?: "H264",
            language = prefs[LANGUAGE_KEY] ?: "en"
        )
    }

    suspend fun saveTokens(access: String, refresh: String) {
        context.dataStore.edit { prefs ->
            prefs[ACCESS_TOKEN_KEY] = access
            prefs[REFRESH_TOKEN_KEY] = refresh
        }
    }

    suspend fun saveUser(email: String) {
        context.dataStore.edit { prefs ->
            prefs[USER_EMAIL_KEY] = email
        }
    }

    suspend fun saveDeviceId(id: String) {
        context.dataStore.edit { prefs ->
            prefs[DEVICE_ID_KEY] = id
        }
    }

    suspend fun saveRememberSession(remember: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[REMEMBER_SESSION_KEY] = remember
        }
    }

    suspend fun updateStreamSettings(settings: StreamSettings) {
        context.dataStore.edit { prefs ->
            prefs[MAX_BITRATE_KEY] = settings.maxBitrate
            prefs[RESOLUTION_KEY] = settings.resolution
            prefs[FPS_KEY] = settings.fps
            prefs[ENABLE_AUDIO_KEY] = settings.enableAudio
            prefs[ENABLE_VIBRATION_KEY] = settings.enableVibration
            prefs[USE_MOBILE_DATA_KEY] = settings.useMobileData
            prefs[CODEC_KEY] = settings.codec
            prefs[LANGUAGE_KEY] = settings.language
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }

    companion object {
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
        private val USER_EMAIL_KEY = stringPreferencesKey("user_email")
        private val REMEMBER_SESSION_KEY = booleanPreferencesKey("remember_session")
        private val DEVICE_ID_KEY = stringPreferencesKey("device_id")
        private val MAX_BITRATE_KEY = intPreferencesKey("max_bitrate")
        private val RESOLUTION_KEY = stringPreferencesKey("resolution")
        private val FPS_KEY = intPreferencesKey("fps")
        private val ENABLE_AUDIO_KEY = booleanPreferencesKey("enable_audio")
        private val ENABLE_VIBRATION_KEY = booleanPreferencesKey("enable_vibration")
        private val USE_MOBILE_DATA_KEY = booleanPreferencesKey("use_mobile_data")
        private val CODEC_KEY = stringPreferencesKey("codec")
        private val LANGUAGE_KEY = stringPreferencesKey("language")
    }
}
