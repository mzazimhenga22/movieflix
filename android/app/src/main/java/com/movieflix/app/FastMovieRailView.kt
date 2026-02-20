package com.movieflix.app

import android.content.Context
import android.graphics.Color
import android.media.MediaPlayer
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import org.json.JSONArray
import org.json.JSONObject

class FastMovieRailView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val titleView: TextView
    private val seeAllButton: TextView
    private val accentIndicator: View
    private val recyclerView: RecyclerView
    private val adapter: FastMovieRailAdapter
    private var tickPlayer: MediaPlayer? = null

    init {
        val view = LayoutInflater.from(context).inflate(R.layout.view_fast_movie_rail, this, true)
        
        titleView = view.findViewById(R.id.rail_title)
        seeAllButton = view.findViewById(R.id.see_all_button)
        accentIndicator = view.findViewById(R.id.accent_indicator)
        recyclerView = view.findViewById(R.id.recycler_view)

        adapter = FastMovieRailAdapter { movie ->
            onItemPress(movie)
        }

        recyclerView.layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false).apply {
            initialPrefetchItemCount = 6 
        }
        recyclerView.adapter = adapter
        
        // Optimize Recycler
        recyclerView.setItemViewCacheSize(20)
        recyclerView.isNestedScrollingEnabled = false

        // Initialize tick sound player
        try {
            val tickResId = resources.getIdentifier("tick", "raw", context.packageName)
            if (tickResId != 0) {
                tickPlayer = MediaPlayer.create(context, tickResId)
                tickPlayer?.setVolume(0.3f, 0.3f) // Subtle volume
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // SnapHelper for premium "tick" feel
        val snapHelper = androidx.recyclerview.widget.LinearSnapHelper()
        snapHelper.attachToRecyclerView(recyclerView)

        // Scroll Sound & Tile-up Animation
        recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            var lastSnapPos = -1
            override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                val centerView = snapHelper.findSnapView(rv.layoutManager)
                val pos = centerView?.let { rv.layoutManager?.getPosition(it) } ?: -1
                
                if (pos != -1 && pos != lastSnapPos && dx != 0) {
                    lastSnapPos = pos
                    // Play tick sound
                    playTickSound()
                    
                    // Tile-up animation on focused card
                    centerView?.let { animateTileUp(it) }
                }
            }
        })

        // Entrance Animation (Slide in from right with tile effect)
        try {
            val animResId = resources.getIdentifier("layout_animation_slide_right", "anim", context.packageName)
            if (animResId != 0) {
                val layoutAnimation = android.view.animation.AnimationUtils.loadLayoutAnimation(context, animResId)
                recyclerView.layoutAnimation = layoutAnimation
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        seeAllButton.setOnClickListener {
            onSeeAllPress()
        }
    }
    
    private fun playTickSound() {
        try {
            tickPlayer?.let { player ->
                if (player.isPlaying) {
                    player.seekTo(0)
                } else {
                    player.start()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    private fun animateTileUp(view: View) {
        // Tile-up effect: slight scale up and translate up
        view.animate()
            .scaleX(1.05f)
            .scaleY(1.05f)
            .translationY(-8f)
            .setDuration(150)
            .withEndAction {
                view.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .translationY(0f)
                    .setDuration(150)
                    .start()
            }
            .start()
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // Clean up media player
        try {
            tickPlayer?.release()
            tickPlayer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setTitle(title: String) {
        titleView.text = title
    }

    fun setAccentColor(colorHex: String?) {
        if (colorHex.isNullOrEmpty()) return
        try {
            val color = Color.parseColor(colorHex)
            accentIndicator.setBackgroundColor(color)
            seeAllButton.setTextColor(color)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setMovies(moviesJson: String) {
        try {
            val jsonArray = JSONArray(moviesJson)
            val list = mutableListOf<JSONObject>()
            for (i in 0 until jsonArray.length()) {
                list.add(jsonArray.getJSONObject(i))
            }
            adapter.updateData(list)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun onItemPress(movie: JSONObject) {
        val reactContext = context as? ReactContext ?: return
        val map = Arguments.createMap()
        try {
            // Unified ID strategy: string for "id", double for numeric if needed
            map.putString("id", movie.opt("id")?.toString()) 
            map.putString("media_type", movie.optString("media_type"))
            map.putDouble("id_number", movie.optInt("id", 0).toDouble())
        } catch(e: Exception) {
            e.printStackTrace()
        }
        
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onItemPress", map)
    }

    private fun onSeeAllPress() {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onSeeAllPress", Arguments.createMap())
    }
}
