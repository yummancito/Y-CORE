package com.ycore.android.data.remote.api

import com.ycore.android.BuildConfig
import com.ycore.android.data.remote.dto.*
import retrofit2.http.*

interface YCoreApi {

    // ── Auth ──
    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): RegisterResponse

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("api/auth/refresh")
    suspend fun refresh(@Body request: RefreshRequest): RefreshResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body request: LogoutRequest)

    @GET("api/auth/me")
    suspend fun me(): UserResponse

    // ── Hosts ──
    @GET("api/hosts/my-hosts")
    suspend fun getMyHosts(): HostListResponse

    @GET("api/hosts/online")
    suspend fun getOnlineHosts(): HostListResponse

    @GET("api/hosts/{hostId}")
    suspend fun getHost(@Path("hostId") hostId: String): HostResponse

    // ── Devices ──
    @POST("api/devices")
    suspend fun registerDevice(@Body request: RegisterDeviceRequest): DeviceResponse

    @GET("api/devices")
    suspend fun getDevices(): DeviceListResponse

    @GET("api/devices/trusted")
    suspend fun getTrustedDevices(): DeviceListResponse

    @DELETE("api/devices/{deviceId}")
    suspend fun deleteDevice(@Path("deviceId") deviceId: String)

    // ── Library ──
    @GET("api/library/host/{hostId}/games")
    suspend fun getHostLibrary(@Path("hostId") hostId: String): LibraryResponse

    @GET("api/library/host/{hostId}")
    suspend fun getHostInfo(@Path("hostId") hostId: String): HostInfoResponse

    // ── Launch ──
    @POST("api/launch/host/{hostId}/launch")
    suspend fun launchGame(
        @Path("hostId") hostId: String,
        @Body request: LaunchRequest
    ): LaunchResponse

    @GET("api/launch/sessions")
    suspend fun getSessions(): SessionListResponse

    companion object {
        const val BASE_URL = "${BuildConfig.CLOUD_URL}/"
    }
}
