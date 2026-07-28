package com.ycore.android.data.repository

import com.ycore.android.data.remote.api.YCoreApi
import com.ycore.android.data.remote.dto.HostDto
import com.ycore.android.data.remote.dto.LibraryGameDto
import javax.inject.Inject
import javax.inject.Singleton

data class HostListResult(
    val success: Boolean,
    val hosts: List<HostDto> = emptyList(),
    val error: String? = null
)

data class LibraryResult(
    val success: Boolean,
    val games: List<LibraryGameDto> = emptyList(),
    val error: String? = null
)

data class HostInfoResult(
    val success: Boolean,
    val host: HostDto? = null,
    val error: String? = null
)

@Singleton
class HostRepository @Inject constructor(
    private val api: YCoreApi
) {
    suspend fun getMyHosts(): HostListResult {
        return try {
            val response = api.getMyHosts()
            HostListResult(success = true, hosts = response.hosts)
        } catch (e: Exception) {
            HostListResult(success = false, error = e.message ?: "Failed to fetch hosts")
        }
    }

    suspend fun getOnlineHosts(): HostListResult {
        return try {
            val response = api.getOnlineHosts()
            HostListResult(success = true, hosts = response.hosts)
        } catch (e: Exception) {
            HostListResult(success = false, error = e.message ?: "Failed to fetch hosts")
        }
    }

    suspend fun getLibrary(hostId: String): LibraryResult {
        return try {
            val response = api.getHostLibrary(hostId)
            LibraryResult(success = true, games = response.games)
        } catch (e: Exception) {
            LibraryResult(success = false, error = e.message ?: "Failed to fetch library")
        }
    }

    suspend fun getHostInfo(hostId: String): HostInfoResult {
        return try {
            val response = api.getHostInfo(hostId)
            response.host?.let {
                HostInfoResult(success = true, host = HostDto(
                    id = it.id, name = it.name, os = it.os, version = it.version,
                    publicIp = "", status = it.status, capabilities = it.capabilities,
                    gameCount = it.gameCount, lastHeartbeatAt = it.lastHeartbeatAt,
                    createdAt = ""
                ))
            } ?: HostInfoResult(success = false, error = "Host not found")
        } catch (e: Exception) {
            HostInfoResult(success = false, error = e.message ?: "Failed to fetch host")
        }
    }
}
