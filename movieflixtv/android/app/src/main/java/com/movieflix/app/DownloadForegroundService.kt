package com.movieflix.app.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

import android.os.PowerManager

class DownloadForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "DownloadChannel"
        const val NOTIFICATION_ID = 1337
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "Downloading..."
        val body = intent?.getStringExtra("body") ?: "Please wait."
        
        startForeground(NOTIFICATION_ID, buildNotification(title, body))

        // Acquire partial wake lock to keep CPU running when screen is off (short timeout)
        try {
            if (wakeLock?.isHeld == true) return START_NOT_STICKY
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MovieFlix:DownloadServiceWakeLock")
            wakeLock?.acquire(30 * 60 * 1000L) // 30 min timeout safety
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        stopForeground(true)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Download Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun buildNotification(title: String, body: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .build()
    }
}
