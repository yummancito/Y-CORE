package com.ycore.android.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ycore.android.data.remote.dto.HostDto
import com.ycore.android.data.remote.dto.LibraryGameDto
import com.ycore.android.data.remote.websocket.CloudWebSocket
import com.ycore.android.data.remote.websocket.ConnectionState
import com.ycore.android.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HostListUiState(
    val hosts: List<HostDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedHost: HostDto? = null,
    val wsState: ConnectionState = ConnectionState.DISCONNECTED,
    val pairingStatus: String? = null, // pending, accepted, rejected
    val libraryGames: List<LibraryGameDto> = emptyList(),
    val libraryLoading: Boolean = false,
    val launchStatus: String? = null // launching, success, failed
)

@HiltViewModel
class HostListViewModel @Inject constructor(
    private val hostRepository: HostRepository,
    private val cloudWs: CloudWebSocket
) : ViewModel() {

    private val _uiState = MutableStateFlow(HostListUiState())
    val uiState: StateFlow<HostListUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            cloudWs.connectionState.collect { state ->
                _uiState.update { it.copy(wsState = state) }
            }
        }
        observeWsMessages()
    }

    fun connectWebSocket(token: String, deviceId: String) {
        cloudWs.connect(token, deviceId)
    }

    private fun observeWsMessages() {
        viewModelScope.launch {
            cloudWs.messages.collect { msg ->
                when (msg.type) {
                    "connection_response" -> {
                        _uiState.update { it.copy(pairingStatus = msg.status) }
                        if (msg.status == "accepted" && _uiState.value.selectedHost != null) {
                            loadLibrary(_uiState.value.selectedHost!!.id)
                        }
                    }
                    "connection_status" -> {
                        _uiState.update { it.copy(pairingStatus = msg.status) }
                    }
                    "library_response" -> {
                        val games = msg.games?.map { g ->
                            LibraryGameDto(
                                appId = g["appId"] as? String ?: "",
                                name = g["name"] as? String ?: "",
                                installDir = g["installDir"] as? String ?: "",
                                sizeOnDisk = (g["sizeOnDisk"] as? Number)?.toLong() ?: 0,
                                lastPlayed = (g["lastPlayed"] as? Number)?.toLong(),
                                playTime = (g["playTime"] as? Number)?.toLong() ?: 0,
                                headerImage = g["headerImage"] as? String,
                                isInstalled = g["isInstalled"] as? Boolean ?: true
                            )
                        } ?: emptyList()
                        _uiState.update { it.copy(libraryGames = games, libraryLoading = false) }
                    }
                    "launch_response" -> {
                        _uiState.update {
                            it.copy(
                                launchStatus = if (msg.success == true) "success" else "failed"
                            )
                        }
                    }
                    "launch_requested" -> {
                        _uiState.update { it.copy(launchStatus = "launching") }
                    }
                    "signal" -> {
                        val signal = msg.signal
                        if (signal != null && signal["type"] == "input") {
                            // Host sent input acknowledgment
                        }
                    }
                }
            }
        }
    }

    fun loadHosts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = hostRepository.getMyHosts()
            _uiState.update {
                if (result.success) {
                    it.copy(hosts = result.hosts, isLoading = false)
                } else {
                    it.copy(isLoading = false, error = result.error)
                }
            }
            // Also try online hosts as fallback
            if (!result.success || result.hosts.isEmpty()) {
                val onlineResult = hostRepository.getOnlineHosts()
                if (onlineResult.success) {
                    _uiState.update { it.copy(hosts = onlineResult.hosts, isLoading = false) }
                }
            }
        }
    }

    fun selectHost(host: HostDto) {
        _uiState.update { it.copy(selectedHost = host, pairingStatus = null, libraryGames = emptyList()) }
        if (host.status == "ONLINE") {
            cloudWs.sendConnectionRequest(host.id)
        }
    }

    private fun loadLibrary(hostId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(libraryLoading = true) }
            // Request via WebSocket for real-time response
            cloudWs.requestLibrary(hostId)
            // Also try REST API as fallback
            val result = hostRepository.getLibrary(hostId)
            if (result.success) {
                _uiState.update { it.copy(libraryGames = result.games, libraryLoading = false) }
            } else {
                // Wait for WebSocket response
            }
        }
    }

    fun launchGame(gameId: String, gameName: String) {
        val host = _uiState.value.selectedHost ?: return
        _uiState.update { it.copy(launchStatus = null) }
        cloudWs.requestLaunch(host.id, gameId, gameName)
    }

    fun disconnect() {
        cloudWs.disconnect()
        _uiState.update { HostListUiState() }
    }

    override fun onCleared() {
        super.onCleared()
        cloudWs.disconnect()
    }
}
