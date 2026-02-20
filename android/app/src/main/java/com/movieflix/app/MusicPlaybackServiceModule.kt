package com.movieflix.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class MusicPlaybackServiceModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        @Volatile
        private var reactContextRef: ReactApplicationContext? = null

        @Volatile
        var serviceRunning: Boolean = false

        fun emitAction(action: String) {
            val context = reactContextRef ?: return
            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("MusicPlaybackAction", action)
        }
    }

    init {
        reactContextRef = reactContext
    }

    override fun getName() = "MusicPlaybackServiceModule"

    @ReactMethod
    fun startService(title: String, body: String) {
        val intent = Intent(reactContext, MusicPlaybackService::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
        }
        serviceRunning = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun updateNowPlaying(payload: ReadableMap) {
        if (!serviceRunning) return
        val intent = Intent(reactContext, MusicPlaybackService::class.java).apply {
            action = MusicPlaybackService.ACTION_UPDATE
            if (payload.hasKey("title")) putExtra("title", payload.getString("title"))
            if (payload.hasKey("artist")) putExtra("artist", payload.getString("artist"))
            if (payload.hasKey("artworkUrl")) putExtra("artworkUrl", payload.getString("artworkUrl"))
            if (payload.hasKey("isPlaying")) putExtra("isPlaying", payload.getBoolean("isPlaying"))
            if (payload.hasKey("positionMs")) {
                putExtra("positionMs", payload.getDouble("positionMs").toInt())
            }
            if (payload.hasKey("durationMs")) {
                putExtra("durationMs", payload.getDouble("durationMs").toInt())
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopService() {
        serviceRunning = false
        val intent = Intent(reactContext, MusicPlaybackService::class.java)
        reactContext.stopService(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }
}
