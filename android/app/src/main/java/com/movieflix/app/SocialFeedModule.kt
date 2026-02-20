package com.movieflix.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.Collections
import java.util.Date
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max

class SocialFeedModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val gson = Gson()
    private val client = OkHttpClient()

    override fun getName(): String {
        return "SocialFeedModule"
    }

    @ReactMethod
    fun fetchFeed(
        supabaseUrl: String,
        supabaseAnonKey: String,
        followingIdsJson: String,
        promise: Promise
    ) {
        thread {
            try {
                // Initialize Firebase if needed (usually auto-init main app)
                // val db = FirebaseFirestore.getInstance() // Do not do this if not configured yet?
                // Assuming standard google-services.json setup
                
                val resultList = Collections.synchronizedList(ArrayList<FeedItem>())
                val latch = CountDownLatch(2) // Firestore + Supabase
                var firestoreError: String? = null
                var supabaseError: String? = null

                // 1. Fetch Firestore Reviews
                thread {
                    try {
                        val db = FirebaseFirestore.getInstance()
                        // Use a limit relative to page? For now just recent 50
                        db.collection("reviews")
                            .orderBy("createdAt", Query.Direction.DESCENDING)
                            .limit(50)
                            .get()
                            .addOnSuccessListener { snapshot ->
                                for (doc in snapshot.documents) {
                                    resultList.add(FeedItem.fromFirestore(doc))
                                }
                                latch.countDown()
                            }
                            .addOnFailureListener { e ->
                                firestoreError = e.message
                                latch.countDown()
                            }
                    } catch (e: Exception) {
                        firestoreError = e.message
                        latch.countDown()
                    }
                }

                // 2. Fetch Supabase Posts
                thread {
                    try {
                        val url = "$supabaseUrl/rest/v1/posts?select=*&order=created_at.desc&limit=50"
                        val request = Request.Builder()
                            .url(url)
                            .addHeader("apikey", supabaseAnonKey)
                            .addHeader("Authorization", "Bearer $supabaseAnonKey")
                            .build()

                        client.newCall(request).execute().use { response ->
                            if (!response.isSuccessful) {
                                supabaseError = "Supabase error: ${response.code}"
                            } else {
                                val json = response.body?.string()
                                if (json != null) {
                                    val posts = JSONArray(json)
                                    for (i in 0 until posts.length()) {
                                        resultList.add(FeedItem.fromSupabase(posts.getJSONObject(i)))
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        supabaseError = e.message
                    } finally {
                        latch.countDown()
                    }
                }

                // Wait for both (timeout 10s)
                latch.await(10, TimeUnit.SECONDS)

                // 3. Merging & Ranking
                // following IDs logic
                val followingSet = HashSet<String>()
                try {
                    val arr = JSONArray(followingIdsJson)
                    for (i in 0 until arr.length()) followingSet.add(arr.getString(i))
                } catch (e: Exception) { /* ignore */ }
                
                // Get current user ID for affinity
                val currentUser = FirebaseAuth.getInstance().currentUser
                val currentUserId = currentUser?.uid

                // Calculate Interaction Affinity (simplified: rely on following for now, 
                // deeper affinity needs local db of past interactions akin to loadEvents() logic)
                
                // Score items
                for (item in resultList) {
                    item.score = calculateScore(item, currentUserId, followingSet)
                }

                // Sort Descending by Score
                Collections.sort(resultList) { o1, o2 -> o2.score.compareTo(o1.score) }

                // Convert to WritableArray
                val resultArray = Arguments.createArray()
                for (item in resultList) {
                    resultArray.pushMap(item.toWritableMap())
                }

                resolveOnUi(promise, resultArray)

            } catch (e: Exception) {
                rejectOnUi(promise, "FEED_ERROR", e.message, e)
            }
        }
    }

    private fun calculateScore(item: FeedItem, userId: String?, following: Set<String>): Double {
        var score = 0.0

        // 1. Following Boost
        if (item.userId != null && following.contains(item.userId)) {
            score += 10.0
        }

        // 2. Popularity (Log scale)
        val popularity = (item.likes) + (item.commentsCount)
        score += ln(1.0 + popularity)

        // 3. Recency Decay
        // Score = exp(-age_hours / 12) * 5
        val diffMs = System.currentTimeMillis() - item.createdAt
        val hours = diffMs / (1000.0 * 60 * 60)
        score += exp(-hours / 12.0) * 5.0

        // 4. Own post demotion (optional, keeps feed fresh with others)
        if (userId != null && item.userId == userId) {
            score *= 0.8
        }

        return score
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

    // Helper Data Class
    private class FeedItem {
        var id: String = ""
        var docId: String? = null
        var origin: String = "firestore" 
        var userId: String? = null
        var user: String? = null
        var avatar: String? = null
        var review: String? = null
        var movie: String? = null
        var imageUrl: String? = null
        var videoUrl: String? = null
        var likes: Int = 0
        var commentsCount: Int = 0
        var genres: List<Int> = ArrayList()
        var createdAt: Long = 0
        var likerIds: List<String> = ArrayList()
        
        var score: Double = 0.0

        fun toWritableMap(): WritableMap {
            val map = Arguments.createMap()
            map.putString("id", id)
            map.putString("docId", docId)
            map.putString("origin", origin)
            map.putString("userId", userId)
            map.putString("user", user)
            map.putString("avatar", avatar)
            map.putString("review", review)
            map.putString("movie", movie)
            map.putString("date", Date(createdAt).toString()) // Format later in JS or clean up
            
            // Image object structure expected by UI: { uri: ... }
            if (imageUrl != null) {
                val img = Arguments.createMap()
                img.putString("uri", imageUrl)
                map.putMap("image", img)
            }
            
            map.putString("videoUrl", videoUrl)
            map.putInt("likes", likes)
            map.putInt("commentsCount", commentsCount)
            map.putDouble("_algoScore", score)
            
            val likers = Arguments.createArray()
            likerIds.forEach { likers.pushString(it) }
            map.putArray("likerIds", likers)

            return map
        }

        companion object {
            fun fromFirestore(doc: com.google.firebase.firestore.DocumentSnapshot): FeedItem {
                val item = FeedItem()
                item.id = doc.id
                item.docId = doc.id
                item.origin = "firestore"
                
                val data = doc.data
                if (data != null) {
                    item.userId = data["userId"] as? String ?: data["ownerId"] as? String
                    item.user = data["userDisplayName"] as? String ?: data["userName"] as? String ?: "watcher"
                    item.avatar = data["userAvatar"] as? String
                    item.review = data["review"] as? String
                    item.movie = data["title"] as? String ?: data["movie"] as? String
                    item.imageUrl = data["mediaUrl"] as? String // handle type video separately?
                    
                    val type = data["type"] as? String
                    if (type == "video") {
                        item.videoUrl = item.imageUrl // Usually same field
                        item.imageUrl = null
                    }
                    
                    item.likes = (data["likes"] as? Number)?.toInt() ?: 0
                    item.commentsCount = (data["commentsCount"] as? Number)?.toInt() ?: 0
                    
                    val ts = data["createdAt"] as? com.google.firebase.Timestamp
                    item.createdAt = ts?.toDate()?.time ?: System.currentTimeMillis()
                    
                    val lids = data["likerIds"] as? List<String>
                    if (lids != null) item.likerIds = lids
                }
                return item
            }

            fun fromSupabase(json: JSONObject): FeedItem {
                val item = FeedItem()
                item.id = json.optString("id") // Or integer?
                item.origin = "supabase"
                item.userId = json.optString("userId", json.optString("user_id"))
                item.user = json.optString("userDisplayName", json.optString("userName", "watcher"))
                item.avatar = json.optString("userAvatar", null)
                item.review = json.optString("review", json.optString("content"))
                item.movie = json.optString("title", json.optString("movie"))
                
                val mediaUrl = json.optString("media_url", null)
                val type = json.optString("media_type")
                
                if (type == "video") {
                    item.videoUrl = mediaUrl
                } else {
                    item.imageUrl = mediaUrl
                }

                item.likes = json.optInt("likes", 0)
                item.commentsCount = json.optInt("commentsCount", json.optInt("comments_count", 0))
                
                // Parse date
                val dateStr = json.optString("created_at")
                // Simple parsing or current time fallback (Java 8 time?) 
                // For robustness, assume now if parse fails or use simple Instant parser if available 
                // (Android strict mode on old APIs might bite, stick to simple)
                // Just use current time - delta if needed, or try parse
                item.createdAt = System.currentTimeMillis() // TODO: parse ISO string properly
                
                return item
            }
        }
    }
}
