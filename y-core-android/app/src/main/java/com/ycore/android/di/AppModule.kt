package com.ycore.android.di

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: com.ycore.android.data.remote.api.AuthInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        moshi: Moshi
    ): retrofit2.Retrofit = retrofit2.Retrofit.Builder()
        .baseUrl(com.ycore.android.data.remote.api.YCoreApi.BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(com.squareup.moshi.MoshiConverterFactory.create(moshi))
        .build()

    @Provides
    @Singleton
    fun provideYCoreApi(retrofit: retrofit2.Retrofit): com.ycore.android.data.remote.api.YCoreApi =
        retrofit.create(com.ycore.android.data.remote.api.YCoreApi::class.java)
}
