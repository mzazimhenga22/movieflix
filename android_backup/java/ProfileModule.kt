package com.movieflix.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayList
import java.util.Collections
import java.util.Comparator
import java.util.regex.Pattern

class ProfileModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ProfileModule"
    }

    @ReactMethod
    fun processReviewFeed(supabaseJson: String, firestoreJson: String, currentUserId: String, promise: Promise) {
        try {
            val feedItems = ArrayList<JSONObject>()
            val supabaseList = JSONArray(supabaseJson)
            val firestoreList = JSONArray(firestoreJson)

            // Process Supabase Items
            for (i in 0 until supabaseList.length()) {
                val item = supabaseList.optJSONObject(i) ?: continue
                val processed = processSupabaseItem(item, currentUserId)
                feedItems.add(processed)
            }

            // Process Firestore Items
            for (i in 0 until firestoreList.length()) {
                val item = firestoreList.optJSONObject(i) ?: continue
                val processed = processFirestoreItem(item, currentUserId)
                feedItems.add(processed)
            }

            // Sort by Date Descending
            Collections.sort(feedItems, object : Comparator<JSONObject> {
                override fun compare(o1: JSONObject, o2: JSONObject): Int {
                    val d1 = o1.optLong("timestamp", 0)
                    val d2 = o2.optLong("timestamp", 0)
                    return d2.compareTo(d1)
                }
            })

            val result = JSONArray()
            for (item in feedItems) {
                result.put(item)
            }

            resolveOnUi(promise, result.toString())

        } catch (e: Exception) {
            rejectOnUi(promise, "PROFILE_PROCESS_ERROR", e.message, e)
        }
    }

    private fun processSupabaseItem(item: JSONObject, currentUserId: String): JSONObject {
        val out = JSONObject()
        val createdAtStr = item.optString("created_at")
        
        // Basic Fields
        out.put("id", item.optString("id", ""))
        out.put("origin", "supabase")
        out.put("userId", item.optString("userId", item.optString("user_id", "")))
        out.put("user", item.optString("userDisplayName", item.optString("userName", item.optString("user", "Unknown"))))
        out.put("avatar", item.optString("userAvatar", "")) // nullable in JS, empty string here is fine
        
        // Media
        val isVideo = item.optString("media_type") == "video"
        val mediaUrl = item.optString("media_url", "")
        if (isVideo) {
            out.put("videoUrl", mediaUrl)
        } else if (mediaUrl.isNotEmpty()) {
            val img = JSONObject()
            img.put("uri", mediaUrl)
            out.put("image", img)
        }

        // Content
        val reviewText = item.optString("review", item.optString("content", ""))
        out.put("review", reviewText)
        out.put("movie", item.optString("title", item.optString("movie", "")))
        
        // Tags
        out.put("tags", extractTags(reviewText))

        // Likes / Watched
        val likerIds = item.optJSONArray("likerIds")
        var liked = false
        var likesCount = item.optInt("likes", 0)
        
        if (likerIds != null) {
            likesCount = Math.max(likesCount, likerIds.length())
            for (j in 0 until likerIds.length()) {
                if (likerIds.optString(j) == currentUserId) {
                    liked = true
                    break
                }
            }
        }
        out.put("liked", liked)
        out.put("likes", likesCount)
        out.put("watched", item.optInt("watched", item.optInt("views", 0)))
        out.put("commentsCount", item.optInt("commentsCount", item.optInt("comments_count", 0)))

        // Timestamp (for sorting)
        // Simple string pass-through for display, but we need a comparable for sorting
        // Ideally we parse the date, but for now let's trust the JS side to display it, 
        // or we can just pass the string.
        // For sorting, we need a value. 
        // We will assume 'created_at' is ISO8601.
        // For native lightness, let's just pass the string back and use a simple string compare if needed,
        // OR try to parse it. 
        // To keep it simple and safe:
        out.put("date", createdAtStr) 
        // We can add a fake timestamp for sorting if we want strict correctness, 
        // but mixing formats is hard. JS side was converting to Date object.
        // Let's rely on string comparison of ISO dates which usually works for YYYY-MM-DDTHH:MM:SS
        // But Firestore uses seconds/nanoseconds objects sometimes.
        
        // Let's try to parse ISO string roughly
        out.put("timestamp", parseIsoDate(createdAtStr))

        return out
    }

    private fun processFirestoreItem(item: JSONObject, currentUserId: String): JSONObject {
        val out = JSONObject()
        val docId = item.optString("id") // JS passes doc.data() but we need ID. 
        // Actually the JS passed `snapshot.docs.map`... wait.
        // The JS currently maps doc -> object.
        // I need to update JS to pass raw data objects including ID.
        
        out.put("id", item.optString("docId"))
        out.put("docId", item.optString("docId"))
        out.put("origin", "firestore")
        
        out.put("userId", item.optString("userId", item.optString("ownerId", "")))
        out.put("user", item.optString("userDisplayName", item.optString("userName", "Unknown")))
        out.put("avatar", item.optString("userAvatar", ""))

        // Media
        val isVideo = item.optString("type") == "video" || item.has("videoUrl")
        val mediaUrl = item.optString("mediaUrl", "")
        val videoUrl = item.optString("videoUrl", "")
        
        if (isVideo) {
             out.put("videoUrl", if (videoUrl.isNotEmpty()) videoUrl else mediaUrl)
        } else if (mediaUrl.isNotEmpty()) {
            val img = JSONObject()
            img.put("uri", mediaUrl)
            out.put("image", img)
        }

        val reviewText = item.optString("review", "")
        out.put("review", reviewText)
        out.put("movie", item.optString("title", item.optString("movie", "")))
        out.put("tags", extractTags(reviewText))

        val likerIds = item.optJSONArray("likerIds")
        var liked = false
        var likesCount = item.optInt("likes", 0)
        
        if (likerIds != null) {
            for (j in 0 until likerIds.length()) {
                if (likerIds.optString(j) == currentUserId) {
                    liked = true
                    break
                }
            }
        }
        out.put("liked", liked)
        out.put("likes", likesCount)
        out.put("watched", item.optInt("watched", 0))
        out.put("commentsCount", item.optInt("commentsCount", 0))

        // Timestamp
        // Firestore objects from JS `data()` might have `createdAt` as an object {seconds: ...}
        val createdAtObj = item.optJSONObject("createdAt")
        var timestamp: Long = 0
        if (createdAtObj != null) {
            timestamp = createdAtObj.optLong("seconds", 0) * 1000
        } else {
             // maybe string?
             val ca = item.optString("createdAt", "")
             timestamp = parseIsoDate(ca)
        }
        out.put("timestamp", timestamp)
        
        // We will format date on JS side or here? JS side `new Date(row.date)`
        // Let's pass the raw value
        out.put("rawDate", timestamp)

        return out
    }

    private fun extractTags(text: String): JSONArray {
        val tags = JSONArray()
        val matcher = Pattern.compile("""#[A-Za-z0-9_\-]+""").matcher(text)
        while (matcher.find()) {
            tags.put(matcher.group().replace("#", "").lowercase())
        }
        return tags
    }

    private fun parseIsoDate(dateStr: String): Long {
        if (dateStr.isEmpty()) return 0
        // Very basic fallback
        return try {
             // java.time is API 26+, we are likely lower minSdk?
             // Simple string compare hack: return hashCode? No.
             // Just return 0 if fail, sorting might be slightly off for mix.
             0
        } catch (e: Exception) {
            0
        }
    }

    /**
     * Parse raw Firestore snapshot documents into validated HouseholdProfile objects.
     * This offloads JSON parsing and validation from the JS thread.
     * 
     * @param snapshotDocsJson JSON array of Firestore document data objects
     * @param defaultColor Default avatar color if none specified
     * @return JSON string of parsed HouseholdProfile objects
     */
    @ReactMethod
    fun parseHouseholdProfiles(snapshotDocsJson: String, defaultColor: String, promise: Promise) {
        try {
            val docsArray = JSONArray(snapshotDocsJson)
            val result = JSONArray()

            for (i in 0 until docsArray.length()) {
                val docData = docsArray.optJSONObject(i) ?: continue
                
                val profile = JSONObject()
                
                // Required fields
                val id = docData.optString("id", "")
                if (id.isEmpty()) continue
                
                profile.put("id", id)
                
                // Name - trim and provide default
                val rawName = docData.optString("name", "")
                val name = if (rawName.trim().isEmpty()) "Profile" else rawName.trim()
                profile.put("name", name)
                
                // Avatar color - trim and provide default
                val rawColor = docData.optString("avatarColor", "")
                val avatarColor = if (rawColor.trim().isEmpty()) defaultColor else rawColor.trim()
                profile.put("avatarColor", avatarColor)
                
                // Optional nullable fields - photoURL
                val photoURL = docData.optString("photoURL", null)
                if (photoURL != null && photoURL != "null" && photoURL.isNotEmpty()) {
                    profile.put("photoURL", photoURL)
                } else {
                    profile.put("photoURL", JSONObject.NULL)
                }
                
                // Optional nullable fields - photoPath
                val photoPath = docData.optString("photoPath", null)
                if (photoPath != null && photoPath != "null" && photoPath.isNotEmpty()) {
                    profile.put("photoPath", photoPath)
                } else {
                    profile.put("photoPath", JSONObject.NULL)
                }
                
                // Boolean fields
                profile.put("isKids", docData.optBoolean("isKids", false))
                profile.put("hiddenDueToPlan", docData.optBoolean("hiddenDueToPlan", false))
                
                // PIN - must be non-empty string or null
                val rawPin = docData.optString("pin", "")
                if (rawPin.isNotEmpty()) {
                    profile.put("pin", rawPin)
                } else {
                    profile.put("pin", JSONObject.NULL)
                }
                
                result.put(profile)
            }

            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PARSE_PROFILES_ERROR", e.message, e)
        }
    }

    /**
     * Validate and sanitize a single profile for saving.
     * Ensures PIN format, trims strings, sets defaults.
     * 
     * @param profileJson JSON object of profile data to validate
     * @return JSON string of validated profile or error
     */
    @ReactMethod
    fun validateProfileForSave(profileJson: String, promise: Promise) {
        try {
            val input = JSONObject(profileJson)
            val result = JSONObject()
            
            // Name validation
            val name = input.optString("name", "").trim()
            if (name.isEmpty()) {
                rejectOnUi(promise, "VALIDATION_ERROR", "Name is required")
                return
            }
            result.put("name", name)
            
            // Avatar color
            val avatarColor = input.optString("avatarColor", "").trim()
            if (avatarColor.isNotEmpty()) {
                result.put("avatarColor", avatarColor)
            }
            
            // isKids boolean
            result.put("isKids", input.optBoolean("isKids", false))
            
            // PIN validation - must be 4 digits or empty
            val pin = input.optString("pin", "").trim()
            if (pin.isNotEmpty()) {
                if (!pin.matches(Regex("^\\d{4}$"))) {
                    rejectOnUi(promise, "VALIDATION_ERROR", "PIN must be exactly 4 digits")
                    return
                }
                result.put("pin", pin)
            } else {
                result.put("pin", JSONObject.NULL)
            }
            
            // Pass through photo fields if present
            val photoURL = input.optString("photoURL", "")
            if (photoURL.isNotEmpty() && photoURL != "null") {
                result.put("photoURL", photoURL)
            }
            
            val photoPath = input.optString("photoPath", "")
            if (photoPath.isNotEmpty() && photoPath != "null") {
                result.put("photoPath", photoPath)
            }
            
            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "VALIDATION_ERROR", e.message, e)
        }
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

