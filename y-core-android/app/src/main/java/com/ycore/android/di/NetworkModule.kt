package com.ycore.android.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideCloudWebSocket(
        moshi: com.squareup.moshi.Moshi,
        okHttpClient: OkHttpClient
    ): com.ycore.android.data.remote.websocket.CloudWebSocket =
        com.ycore.android.data.remote.websocket.CloudWebSocket(moshi, okHttpClient)

    @Provides
    @Singleton
    fun provideWebRTCManager(
        context: android.content.Context,
        cloudWs: com.ycore.android.data.remote.websocket.CloudWebSocket
    ): com.ycore.android.webrtc.WebRTCManager =
        com.ycore.android.webrtc.WebRTCManager(context, cloudWs)
}
