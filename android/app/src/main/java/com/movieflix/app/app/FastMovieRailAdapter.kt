package com.movieflix.app.app

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import org.json.JSONObject

class FastMovieRailAdapter(
    private val onItemPress: (JSONObject) -> Unit
) : RecyclerView.Adapter<FastMovieRailAdapter.MovieViewHolder>() {

    private val movies = mutableListOf<JSONObject>()
    private val baseUrl = "https://image.tmdb.org/t/p/w342" // Adjust based on your API

    fun updateData(newMovies: List<JSONObject>) {
        movies.clear()
        movies.addAll(newMovies)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MovieViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_fast_movie_card, parent, false)
        return MovieViewHolder(view)
    }

    override fun onBindViewHolder(holder: MovieViewHolder, position: Int) {
        val movie = movies[position]
        holder.bind(movie)
    }

    override fun getItemCount(): Int = movies.size

    inner class MovieViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val poster: ImageView = itemView.findViewById(R.id.movie_poster)
        private val title: TextView = itemView.findViewById(R.id.movie_title)
        private val cardContainer: View = itemView.findViewById(R.id.card_container)
        
        // Metadata fields
        private val matchScore: TextView? = itemView.findViewById(R.id.match_score)
        private val mediaType: TextView? = itemView.findViewById(R.id.media_type_text)
        private val plusIcon: ImageView? = itemView.findViewById(R.id.plus_icon)
        private val badgeHd: TextView? = itemView.findViewById(R.id.badge_hd)

        fun bind(movie: JSONObject) {
            val titleText = movie.optString("title", movie.optString("name", "Unknown"))
            // Revert to poster for vertical cards
            val posterPath = movie.optString("poster_path")

            title.text = titleText
            
            // Randomize match score for demo "look" or use data if available
            val score = movie.optInt("match_score", (85..99).random())
            matchScore?.text = "$score% Match"
            
            // Media Type
            val isMovie = movie.optString("media_type") == "movie"
            mediaType?.text = if (isMovie) "Movie" else "Series"
            
            // HD Badge - always show for premium feel
            badgeHd?.visibility = View.VISIBLE
            
            // Plus Icon Click with iOS 26 glassy press effect
            plusIcon?.setOnClickListener {
                 // iOS 16-style press animation
                 val parent = it.parent as? View
                 parent?.apply {
                     // Press down effect
                     animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
                     
                     // Press release with spring back
                     android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                         animate()
                             .scaleX(1.05f).scaleY(1.05f)
                             .setDuration(150).withEndAction {
                                 animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                             }
                             .start()
                     }, 100)
                 }
            }
            
            if (posterPath.isNotEmpty() && posterPath != "null") {
                val fullUrl = if (posterPath.startsWith("http")) posterPath else "$baseUrl$posterPath"
                poster.load(fullUrl) {
                    crossfade(true)
                    placeholder(android.R.color.darker_gray)
                    error(android.R.color.darker_gray)
                }
            } else {
                poster.setImageResource(android.R.color.darker_gray)
            }

            itemView.setOnClickListener {
                onItemPress(movie)
            }
        }
    }
}
