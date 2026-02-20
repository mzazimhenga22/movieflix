package com.movieflix.app.app

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import coil.load
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArrayList

import android.util.AttributeSet

class StoryView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val viewPager: ViewPager2
    private val adapter: StoryAdapter
    private val stories = mutableListOf<JSONObject>()
    
    // Track players to release them
    // unused: private val activePlayers =  mutableMapOf<Int, ExoPlayer>()

    init {
        viewPager = ViewPager2(context)
        viewPager.orientation = ViewPager2.ORIENTATION_HORIZONTAL
        
        adapter = StoryAdapter()
        viewPager.adapter = adapter
        viewPager.offscreenPageLimit = 1 // critical for preloading
        
        // Optimize internal RecyclerView
        viewPager.getChildAt(0)?.let {
            if (it is RecyclerView) {
                it.setItemViewCacheSize(3)
            }
        }
        
        addView(viewPager, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        
        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                super.onPageSelected(position)
                emitEvent("onStoryChange", Arguments.createMap().apply { putInt("index", position) })
                
                // Cleanup players far away? ViewPager2 handles detaching views, 
                // but we might want to eagerly pause/release players not in focus.
                adapter.notifyPageSelected(position)
            }
        })
    }
    
    fun setStories(json: String?) {
        if (json == null) return
        try {
            val array = JSONArray(json)
            val list =  mutableListOf<JSONObject>()
            for (i in 0 until array.length()) {
                list.add(array.getJSONObject(i))
            }
            // Diff util could be better but for now full reset
            val diff = list.size != stories.size // simple check
            stories.clear()
            stories.addAll(list)
            if (diff || stories.isEmpty()) {
                adapter.notifyDataSetChanged()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setInitialStoryIndex(index: Int) {
        // Post to ensure layout pass
        post {
            viewPager.setCurrentItem(index, false)
        }
    }
    
    fun setInitialMediaIndex(index: Int) {
        // Pass to adapter to handle initial media for the start story
         adapter.initialMediaIndex = index
    }

    private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, eventName, params)
    }

    inner class StoryAdapter : RecyclerView.Adapter<StoryViewHolder>() {
        
        var initialMediaIndex = 0
        private var currentPrimaryPosition = -1

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StoryViewHolder {
            val frame = FrameLayout(parent.context)
            frame.layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            return StoryViewHolder(frame)
        }

        override fun onBindViewHolder(holder: StoryViewHolder, position: Int) {
            holder.bind(stories[position], position, if (position == currentPrimaryPosition) initialMediaIndex else 0)
            initialMediaIndex = 0 // consume it
        }

        override fun getItemCount(): Int = stories.size
        
        fun notifyPageSelected(position: Int) {
            currentPrimaryPosition = position
            // We can iterate attached holders to pause others
            // For simplicity, the ViewHolder handles its own visibility/attached checks
        }

        override fun onViewAttachedToWindow(holder: StoryViewHolder) {
            super.onViewAttachedToWindow(holder)
            holder.onAttached()
        }

        override fun onViewDetachedFromWindow(holder: StoryViewHolder) {
            super.onViewDetachedFromWindow(holder)
            holder.onDetached()
        }
        
        override fun onViewRecycled(holder: StoryViewHolder) {
             super.onViewRecycled(holder)
             holder.cleanup()
        }
    }

    inner class StoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        
        private val container = itemView as FrameLayout
        private var playerView: PlayerView? = null
        private var imageView: ImageView? = null
        private var exoPlayer: ExoPlayer? = null
        
        private var progressBarContainer: LinearLayout? = null
        private val progressBars =  mutableListOf<ProgressBar>()
        
        private var storyData: JSONObject? = null
        private var mediaList = listOf<JSONObject>()
        private var currentMediaIndex = 0
        
        private val handler = Handler(Looper.getMainLooper())
        private var progressRunnable: Runnable? = null
        private var isPaused = false
        private var storyDuration = 5000L 
        private var startTime = 0L
        private var isVisible = false
        
        private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                if (e.x < container.width / 3) {
                   prevMedia()
                } else {
                   nextMedia()
                }
                return true
            }
            
            override fun onLongPress(e: MotionEvent) {
                isPaused = true
                pausePlayback()
            }
            
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                if (e1 == null) return false
                val dy = e2.y - e1.y
                val dx = e2.x - e1.x
                
                if (dy > 200 && Math.abs(dy) > Math.abs(dx)) {
                     emitEvent("onClose", Arguments.createMap())
                     return true
                }
                if (dy < -200 && Math.abs(dy) > Math.abs(dx)) {
                    val map = Arguments.createMap()
                    map.putString("storyId", storyData?.optString("id"))
                    emitEvent("onReply", map) 
                    return true
                }
                return false
            }
        })

        init {
            container.setBackgroundColor(Color.BLACK)
            
            imageView = ImageView(context).apply {
                layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
                scaleType = ImageView.ScaleType.CENTER_CROP
                visibility = View.GONE
            }
            container.addView(imageView)
            
            playerView = PlayerView(context).apply {
                layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
                useController = false
                visibility = View.GONE
            }
            container.addView(playerView)
            
            // Progress Container
            progressBarContainer = LinearLayout(context).apply {
                layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, 20).apply {
                    topMargin = 40 // safe areaish
                    leftMargin = 10
                    rightMargin = 10
                }
                orientation = LinearLayout.HORIZONTAL
            }
            container.addView(progressBarContainer)
            
            container.setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
                    if (isPaused) {
                         isPaused = false
                         resumePlayback()
                    }
                }
                gestureDetector.onTouchEvent(event)
                true
            }
        }

        fun bind(data: JSONObject, position: Int, startMediaIndex: Int) {
            storyData = data
            currentMediaIndex = startMediaIndex
            mediaList = parseMedia(data.optJSONArray("media"))
            
            setupProgressBars()
            loadMedia(currentMediaIndex)
        }
        
        fun onAttached() {
            isVisible = true
            resumePlayback()
        }
        
        fun onDetached() {
            isVisible = false
            pausePlayback()
        }
        
        fun cleanup() {
            releasePlayer()
            handler.removeCallbacksAndMessages(null)
        }
        
        private fun parseMedia(array: JSONArray?): List<JSONObject> {
            val list = mutableListOf<JSONObject>()
            if (array != null) {
                for (i in 0 until array.length()) {
                    list.add(array.getJSONObject(i))
                }
            }
            return list
        }
        
        private fun setupProgressBars() {
            progressBarContainer?.removeAllViews()
            progressBars.clear()
            
            val count = mediaList.size
            if (count == 0) return
            
            for (i in 0 until count) {
                val pb = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
                         marginStart = 4
                         marginEnd = 4
                    }
                    max = 100
                    progress = 0
                    progressDrawable = context.getDrawable(android.R.drawable.progress_horizontal) // Simplistic, ideally custom drawable
                    // Custom aesthetic needed: White progress, grey track
                }
                // Tinting native progress bar programmatically is tricky without XML, 
                // but setting indeterminateTintList/progressTintList works on newer APIs.
                pb.progressTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                pb.progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.GRAY)
                
                progressBarContainer?.addView(pb)
                progressBars.add(pb)
            }
        }
        
        private fun loadMedia(index: Int) {
            if (index < 0 || index >= mediaList.size) return
            
            // update bars
            for (i in 0 until mediaList.size) {
                 progressBars[i].progress = if (i < index) 100 else 0
            }
            
            val media = mediaList[index]
            val type = media.optString("type")
            val uri = media.optString("uri")
            
            if (type == "video") {
                imageView?.visibility = View.GONE
                playerView?.visibility = View.VISIBLE
                
                initializePlayer(uri)
            } else {
                playerView?.visibility = View.GONE
                imageView?.visibility = View.VISIBLE
                releasePlayer()
                
                imageView?.load(uri) 
                startImageProgressTimer(5000) // 5s for images
            }
            
             val pos = bindingAdapterPosition
             if (pos != RecyclerView.NO_POSITION) {
                 emitEvent("onMediaChange", Arguments.createMap().apply { 
                     putInt("storyIndex", pos)
                     putInt("mediaIndex", index)
                 })
             }
        }
        
        private fun initializePlayer(uri: String) {
            releasePlayer()
            val player = ExoPlayer.Builder(context).build()
            player.setMediaItem(MediaItem.fromUri(uri))
            player.prepare()
            player.playWhenReady = isVisible && !isPaused
            playerView?.player = player
            exoPlayer = player
            
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_ENDED) {
                        nextMedia()
                    }
                }
            })
            
            startVideoProgressTracker()
        }
        
        private fun releasePlayer() {
            exoPlayer?.release()
            exoPlayer = null
            stopProgressTracker()
        }
        
        private fun startVideoProgressTracker() {
            stopProgressTracker()
            progressRunnable = object : Runnable {
                override fun run() {
                    val player = exoPlayer ?: return
                    if (player.isPlaying) {
                        val duration = player.duration
                        val position = player.currentPosition
                        if (duration > 0) {
                            val p = (position * 100 / duration).toInt()
                            if (currentMediaIndex < progressBars.size) {
                                progressBars[currentMediaIndex].progress = p
                            }
                        }
                    }
                    handler.postDelayed(this, 16)
                }
            }
            handler.post(progressRunnable!!)
        }
        
        private fun startImageProgressTimer(duration: Long) {
            stopProgressTracker()
            storyDuration = duration
            startTime = System.currentTimeMillis()
            
            progressRunnable = object : Runnable {
                override fun run() {
                    if (isPaused) {
                         handler.postDelayed(this, 16)
                         return
                    }
                    val elapsed = System.currentTimeMillis() - startTime
                    val p = (elapsed * 100 / storyDuration).toInt()
                    
                    if (currentMediaIndex < progressBars.size) {
                         progressBars[currentMediaIndex].progress = Math.min(100, p)
                    }
                    
                    if (elapsed >= storyDuration) {
                        nextMedia()
                    } else {
                        handler.postDelayed(this, 16)
                    }
                }
            }
            handler.post(progressRunnable!!)
        }
        
        private fun stopProgressTracker() {
            progressRunnable?.let { handler.removeCallbacks(it) }
            progressRunnable = null
        }
        
        private fun pausePlayback() {
            exoPlayer?.pause()
            // timer logic handles paused flag
        }
        
        private fun resumePlayback() {
            if (isVisible && !isPaused) {
                exoPlayer?.play()
                // timer logic continues
            }
        }
        
        private fun nextMedia() {
            if (currentMediaIndex < mediaList.size - 1) {
                progressBars[currentMediaIndex].progress = 100
                currentMediaIndex++
                loadMedia(currentMediaIndex)
            } else {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return

                // Next story
                val nextPos = pos + 1
                if (nextPos < stories.size) {
                    viewPager.setCurrentItem(nextPos, true)
                } else {
                     emitEvent("onClose", Arguments.createMap())
                }
            }
        }
        
        private fun prevMedia() {
            if (currentMediaIndex > 0) {
                progressBars[currentMediaIndex].progress = 0
                currentMediaIndex--
                loadMedia(currentMediaIndex)
            } else {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return

                // Prev story
                val prevPos = pos - 1
                if (prevPos >= 0) {
                    viewPager.setCurrentItem(prevPos, true)
                }
            }
        }
    }
}
