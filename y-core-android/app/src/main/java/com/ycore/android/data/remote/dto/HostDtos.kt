package com.ycore.android.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RegisterHostRequest(
    @Json(name = "name") val name: String,
    @Json(name = "os") val os: String = "",
    @Json(name = "version") val version: String = "",
    @Json(name = "publicIp") val publicIp: String = "",
    @Json(name = "capabilities") val capabilities: List<String> = emptyList(),
    @Json(name = "gameCount") val gameCount: Int = 0
)

@JsonClass(generateAdapter = true)
data class HostResponse(
    @Json(name = "host") val host: HostDto
)

@JsonClass(generateAdapter = true)
data class HostListResponse(
    @Json(name = "hosts") val hosts: List<HostDto>
)

@JsonClass(generateAdapter = true)
data class HostDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "os") val os: String,
    @Json(name = "version") val version: String,
    @Json(name = "publicIp") val publicIp: String,
    @Json(name = "status") val status: String,
    @Json(name = "capabilities") val capabilities: List<String>,
    @Json(name = "gameCount") val gameCount: Int,
    @Json(name = "lastHeartbeatAt") val lastHeartbeatAt: String?,
    @Json(name = "createdAt") val createdAt: String
)

@JsonClass(generateAdapter = true)
data class HeartbeatRequest(
    @Json(name = "publicIp") val publicIp: String? = null
)

@JsonClass(generateAdapter = true)
data class HeartbeatResponse(
    @Json(name = "host") val host: HostDto,
    @Json(name = "status") val status: String
)

@JsonClass(generateAdapter = true)
data class RegisterDeviceRequest(
    @Json(name = "name") val name: String,
    @Json(name = "platform") val platform: String,
    @Json(name = "pushToken") val pushToken: String? = null
)

@JsonClass(generateAdapter = true)
data class DeviceResponse(
    @Json(name = "device") val DeviceDto: DeviceDto
)

@JsonClass(generateAdapter = true)
data class DeviceListResponse(
    @Json(name = "devices") val devices: List<DeviceDto>
)

@JsonClass(generateAdapter = true)
data class DeviceDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "platform") val platform: String,
    @Json(name = "trusted") val trusted: Boolean,
    @Json(name = "lastConnectedAt") val lastConnectedAt: String?,
    @Json(name = "createdAt") val createdAt: String
)
