package com.ycore.android.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LibraryResponse(
    @Json(name = "games") val games: List<LibraryGameDto>
)

@JsonClass(generateAdapter = true)
data class LibraryGameDto(
    @Json(name = "appId") val appId: String,
    @Json(name = "name") val name: String,
    @Json(name = "installDir") val installDir: String,
    @Json(name = "sizeOnDisk") val sizeOnDisk: Long,
    @Json(name = "lastPlayed") val lastPlayed: Long?,
    @Json(name = "playTime") val playTime: Long,
    @Json(name = "headerImage") val headerImage: String?,
    @Json(name = "isInstalled") val isInstalled: Boolean
)

@JsonClass(generateAdapter = true)
data class LaunchRequest(
    @Json(name = "gameId") val gameId: String,
    @Json(name = "gameName") val gameName: String
)

@JsonClass(generateAdapter = true)
data class LaunchResponse(
    @Json(name = "sessionId") val sessionId: String?,
    @Json(name = "status") val status: String?
)

@JsonClass(generateAdapter = true)
data class SessionListResponse(
    @Json(name = "sessions") val sessions: List<SessionDto>
)

@JsonClass(generateAdapter = true)
data class SessionDto(
    @Json(name = "id") val id: String,
    @Json(name = "hostId") val hostId: String,
    @Json(name = "gameId") val gameId: String,
    @Json(name = "gameName") val gameName: String,
    @Json(name = "status") val status: String,
    @Json(name = "startedAt") val startedAt: String
)

@JsonClass(generateAdapter = true)
data class HostInfoResponse(
    @Json(name = "host") val host: HostInfoDto
)

@JsonClass(generateAdapter = true)
data class HostInfoDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "os") val os: String,
    @Json(name = "version") val version: String,
    @Json(name = "status") val status: String,
    @Json(name = "gameCount") val gameCount: Int,
    @Json(name = "capabilities") val capabilities: List<String>,
    @Json(name = "lastHeartbeatAt") val lastHeartbeatAt: String?
)
