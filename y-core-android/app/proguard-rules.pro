# Y-Core Android ProGuard Rules
# Keep Hilt
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# Keep Moshi
-keep class com.squareup.moshi.** { *; }
-keep class com.ycore.android.data.remote.dto.** { *; }

# Keep Retrofit
-keep class retrofit2.** { *; }
-keep class okhttp3.** { *; }

# Keep WebRTC
-keep class org.webrtc.** { *; }

# Keep Y-Core models
-keep class com.ycore.android.** { *; }

# Keep Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
