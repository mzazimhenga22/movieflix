package com.movieflix.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import android.app.PendingIntent
import android.content.Context
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import java.net.HttpURLConnection
import java.net.URL

class MusicPlaybackService : Service() {

    companion object {
        const val CHANNEL_ID = "MusicPlaybackChannel"
        const val NOTIFICATION_ID = 2424
        const val ACTION_UPDATE = "com.movieflix.app.action.UPDATE"
        const val ACTION_PLAY = "com.movieflix.app.action.PLAY"
        const val ACTION_PAUSE = "com.movieflix.app.action.PAUSE"
        const val ACTION_NEXT = "com.movieflix.app.action.NEXT"
        const val ACTION_PREV = "com.movieflix.app.action.PREV"
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaSession: MediaSessionCompat? = null
    private var lastTitle: String = "Now Playing"
    private var lastArtist: String = "MovieFlix Music"
    private var lastArtworkUrl: String? = null
    private var artworkBitmap: Bitmap? = null
    private var isPlaying: Boolean = true
    private var positionMs: Int = 0
    private var durationMs: Int = 0
    private var foregroundStarted = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        mediaSession = MediaSessionCompat(this, "MovieFlixMusicSession").apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    isPlaying = true
                    MusicPlaybackServiceModule.emitAction("play")
                    updatePlaybackState()
                    updateNotification()
                }

                override fun onPause() {
                    isPlaying = false
                    MusicPlaybackServiceModule.emitAction("pause")
                    updatePlaybackState()
                    updateNotification()
                }

                override fun onSkipToNext() {
                    MusicPlaybackServiceModule.emitAction("next")
                    updateNotification()
                }

                override fun onSkipToPrevious() {
                    MusicPlaybackServiceModule.emitAction("prev")
                    updateNotification()
                }

                override fun onSeekTo(pos: Long) {
                    positionMs = pos.toInt().coerceAtLeast(0)
                    updatePlaybackState()
                    updateNotification()
                    MusicPlaybackServiceModule.emitAction("seekTo:$positionMs")
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> {
                isPlaying = true
                MusicPlaybackServiceModule.emitAction("play")
                updatePlaybackState()
                updateNotification()
            }
            ACTION_PAUSE -> {
                isPlaying = false
                MusicPlaybackServiceModule.emitAction("pause")
                updatePlaybackState()
                updateNotification()
            }
            ACTION_NEXT -> {
                MusicPlaybackServiceModule.emitAction("next")
                updateNotification()
            }
            ACTION_PREV -> {
                MusicPlaybackServiceModule.emitAction("prev")
                updateNotification()
            }
            ACTION_UPDATE -> {
                updateFromIntent(intent)
                updateNotification()
            }
            else -> {
                updateFromIntent(intent)
                updateNotification(true)
            }
        }

        try {
            if (wakeLock?.isHeld == true) return START_NOT_STICKY
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MovieFlix:MusicPlaybackWakeLock")
            wakeLock?.acquire(30 * 60 * 1000L)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App swiped away from recents — stop everything
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        try {
            mediaSession?.release()
        } catch (_: Exception) {}
        stopForeground(true)
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        try {
            mediaSession?.release()
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
                "Music Playback",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun buildNotification(title: String, body: String): Notification {
        val session = mediaSession
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (artworkBitmap != null) {
            builder.setLargeIcon(artworkBitmap)
        }

        if (durationMs > 0) {
            builder.setProgress(durationMs, positionMs.coerceAtMost(durationMs), false)
        }

        val prevIntent = buildActionIntent(this, ACTION_PREV, 100)
        val playIntent = buildActionIntent(this, if (isPlaying) ACTION_PAUSE else ACTION_PLAY, 101)
        val nextIntent = buildActionIntent(this, ACTION_NEXT, 102)

        builder
            .addAction(NotificationCompat.Action(android.R.drawable.ic_media_previous, "Previous", prevIntent))
            .addAction(
                NotificationCompat.Action(
                    if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                    if (isPlaying) "Pause" else "Play",
                    playIntent,
                )
            )
            .addAction(NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", nextIntent))

        if (session != null) {
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
        }

        return builder.build()
    }

    private fun updateFromIntent(intent: Intent?) {
        if (intent == null) return
        intent.getStringExtra("title")?.let { lastTitle = it }
        val hasArtist = intent.hasExtra("artist")
        intent.getStringExtra("artist")?.let { lastArtist = it }
        if (!hasArtist) {
            intent.getStringExtra("body")?.let { lastArtist = it }
        }
        intent.getStringExtra("artworkUrl")?.let { url ->
            if (url.isNotBlank() && url != lastArtworkUrl) {
                lastArtworkUrl = url
                fetchArtworkAsync(url)
            }
            if (url.isBlank()) {
                lastArtworkUrl = null
                artworkBitmap = null
            }
        }
        if (intent.hasExtra("isPlaying")) {
            isPlaying = intent.getBooleanExtra("isPlaying", isPlaying)
        }
        if (intent.hasExtra("positionMs")) {
            positionMs = intent.getIntExtra("positionMs", positionMs)
        }
        if (intent.hasExtra("durationMs")) {
            durationMs = intent.getIntExtra("durationMs", durationMs)
        }

        updatePlaybackState()
        updateMetadata()
    }

    private fun updatePlaybackState() {
        val session = mediaSession ?: return
        val actions =
            PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO

        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val speed = if (isPlaying) 1.0f else 0f

        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs.toLong(), speed)
            .build()

        session.setPlaybackState(playbackState)
    }

    private fun updateMetadata() {
        val session = mediaSession ?: return
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, lastTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, lastArtist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs.toLong())

        artworkBitmap?.let { builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
        session.setMetadata(builder.build())
    }

    private fun updateNotification(startForegroundNow: Boolean = false) {
        val notification = buildNotification(lastTitle, lastArtist)
        if (startForegroundNow || !foregroundStarted) {
            startForeground(NOTIFICATION_ID, notification)
            foregroundStarted = true
        } else {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
        }
    }

    private fun buildActionIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MusicPlaybackService::class.java).apply {
            this.action = action
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getService(context, requestCode, intent, flags)
    }

    private fun fetchArtworkAsync(url: String) {
        Thread {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.doInput = true
                connection.connect()
                val stream = connection.inputStream
                val bitmap = BitmapFactory.decodeStream(stream)
                stream.close()
                if (bitmap != null && url == lastArtworkUrl) {
                    artworkBitmap = bitmap
                    updateMetadata()
                    updateNotification()
                }
            } catch (_: Exception) {
            }
        }.start()
    }
}
