package com.movieflix.app.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.ArrayList
import java.util.Collections
import java.util.Comparator
import java.util.Date
import java.util.HashMap
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.exp

class AlgorithmModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AlgorithmModule"

    private val weights = HashMap<String, Int>().apply {
        put("market_purchase", 25)
        put("party_join", 18)
        put("watch_complete", 15)
        put("match_swipe_right", 12)
        put("follow_user", 10)
        put("market_view", 8)
        put("trailer_view", 6)
        put("like", 4)
        put("view", 2)
        put("story_view", 2)
        put("comment", 3)
        put("share", 5)
        put("watch_partial", 5)
        put("match_swipe_left", -15)
    }

    @ReactMethod
    fun computeTasteProfile(eventsJson: String, promise: Promise) {
        thread {
            try {
                val events = JSONArray(eventsJson)
                val genreScores = HashMap<Int, Int>()
                val keywordScores = HashMap<String, Int>()
                val actorScores = HashMap<String, Int>() // Placeholder if needed

                val now = System.currentTimeMillis()
                val thirtyDaysMs = 30L * 24 * 60 * 60 * 1000
                val cutoff = now - thirtyDaysMs

                for (i in 0 until events.length()) {
                    val evt = events.getJSONObject(i)
                    val ts = evt.optLong("timestamp", 0)
                    if (ts < cutoff) continue

                    val type = evt.optString("type")
                    val weight = weights[type] ?: 0
                    if (weight == 0) continue

                    val meta = evt.optJSONObject("meta")
                    if (meta != null) {
                        // Genres
                        val genres = meta.optJSONArray("genres")
                        if (genres != null) {
                            for (j in 0 until genres.length()) {
                                val gId = genres.getInt(j)
                                genreScores[gId] = (genreScores[gId] ?: 0) + weight
                            }
                        }
                        // Keywords
                        val keywords = meta.optJSONArray("keywords")
                        if (keywords != null) {
                            for (j in 0 until keywords.length()) {
                                val tag = keywords.getString(j)
                                keywordScores[tag] = (keywordScores[tag] ?: 0) + weight
                            }
                        }
                    }
                }

                val profile = JSONObject()
                
                val genresJson = JSONObject()
                for ((k, v) in genreScores) genresJson.put(k.toString(), v)
                profile.put("genres", genresJson)

                val keywordsJson = JSONObject()
                for ((k, v) in keywordScores) keywordsJson.put(k, v)
                profile.put("keywords", keywordsJson)

                profile.put("actors", JSONObject()) // Empty for now
                profile.put("updatedAt", now)

                resolveOnUi(promise, profile.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "COMPUTE_PROFILE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun recommend(itemsJson: String, profileJson: String, socialSignalsJson: String, promise: Promise) {
        thread {
            try {
                val items = JSONArray(itemsJson)
                val profile = if (profileJson.isNotEmpty()) JSONObject(profileJson) else null
                val social = if (socialSignalsJson.isNotEmpty()) JSONObject(socialSignalsJson) else null

                val pGenres = profile?.optJSONObject("genres")
                val pKeywords = profile?.optJSONObject("keywords")
                
                // Parse following IDs into set
                val followingIds = HashSet<String>()
                if (social != null) {
                    val arr = social.optJSONArray("followingIds")
                    if (arr != null) {
                        for (i in 0 until arr.length()) followingIds.add(arr.getString(i))
                    }
                }

                val scoredItems = ArrayList<JSONObject>()
                val now = System.currentTimeMillis()

                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    var score = 0.0

                    // 1. Base popularity
                    val voteAvg = item.optDouble("vote_average", item.optDouble("popularity", 0.0))
                    score += voteAvg * 0.1

                    if (profile != null) {
                        // 2. Genre Match
                        val itemGenres = item.optJSONArray("genre_ids") 
                            ?: item.optJSONArray("genres")?.let { 
                                val arr = JSONArray()
                                for (k in 0 until it.length()) arr.put(it.getJSONObject(k).optInt("id"))
                                arr
                            }
                        
                        if (itemGenres != null && pGenres != null) {
                            for (j in 0 until itemGenres.length()) {
                                val gId = itemGenres.getInt(j).toString()
                                val affinity = pGenres.optInt(gId, 0)
                                score += affinity * 0.5
                            }
                        }

                        // 3. Keyword Match
                        val itemKeywords = item.optJSONArray("keywords")
                        val itemTags = item.optJSONArray("tags")
                        val allTags = ArrayList<String>()
                        if (itemKeywords != null) for (j in 0 until itemKeywords.length()) allTags.add(itemKeywords.getString(j))
                        if (itemTags != null) for (j in 0 until itemTags.length()) allTags.add(itemTags.getString(j))

                        if (pKeywords != null) {
                            for (tag in allTags) {
                                val affinity = pKeywords.optInt(tag, 0)
                                score += affinity * 0.3
                            }
                        }
                    }

                    // 4. Social Boost (existing prop)
                    val socialCount = item.optDouble("_socialActivityCount", 0.0)
                    score += socialCount * 5.0

                    // 5. Recency
                    val dateStr = item.optString("release_date").takeIf { it.isNotEmpty() }
                        ?: item.optString("first_air_date").takeIf { it.isNotEmpty() }
                        ?: item.optString("createdAt")
                    
                    if (dateStr.isNotEmpty()) {
                        val dateMs = parseDate(dateStr)
                        if (dateMs > 0) {
                            val ageDays = (now - dateMs) / (1000.0 * 60 * 60 * 24)
                            if (ageDays >= 0) {
                                val boost = max(0.0, 10.0 - ln(1.0 + ageDays))
                                score += boost
                            }
                        }
                    }

                    item.put("_algoScore", score)
                    scoredItems.add(item)
                }

                // Sort descending
                Collections.sort(scoredItems, object : Comparator<JSONObject> {
                    override fun compare(o1: JSONObject, o2: JSONObject): Int {
                        val s1 = o1.optDouble("_algoScore", 0.0)
                        val s2 = o2.optDouble("_algoScore", 0.0)
                        return s2.compareTo(s1)
                    }
                })

                val result = JSONArray()
                for (obj in scoredItems) result.put(obj)

                resolveOnUi(promise, result.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "RECOMMEND_ERROR", e.message, e)
            }
        }
    }

    private fun parseDate(dateStr: String): Long {
         // Try standard formats
         // yyyy-MM-dd is common for TMDB
         try {
             if (dateStr.length >= 10) {
                 val f = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                 f.timeZone = TimeZone.getTimeZone("UTC")
                 return f.parse(dateStr.substring(0, 10))?.time ?: 0
             }
         } catch (e: Exception) {}
         return 0
    }

    private fun thread(action: () -> Unit) {
        Thread(action).start()
    }

    private fun resolveOnUi(promise: Promise, value: Any?) {
        reactApplicationContext.runOnUiQueueThread {
            promise.resolve(value)
        }
    }

    private fun rejectOnUi(promise: Promise, code: String, message: String?, e: Throwable? = null) {
        reactApplicationContext.runOnUiQueueThread {
            promise.reject(code, message, e)
        }
    }
}
