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
import kotlin.concurrent.thread

class MessagingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MessagingModule"

    @ReactMethod
    fun processConversations(
        itemsJson: String,
        userId: String,
        activeKind: String, // 'Chats', 'Groups'
        activeFilter: String, // 'All', 'Unread'
        searchQuery: String,
        localReadMapJson: String,
        promise: Promise
    ) {
        try {
            val input = JSONArray(itemsJson)
            val localReadMap = if (localReadMapJson.isNotEmpty()) JSONObject(localReadMapJson) else JSONObject()
            val list = ArrayList<JSONObject>()
            val query = searchQuery.trim().lowercase()

            for (i in 0 until input.length()) {
                val c = input.getJSONObject(i)
                val id = c.optString("id")
                
                // --- 1. Calculate Unread ---
                var unreadCount = 0
                val lastMessageSenderId = c.optString("lastMessageSenderId")
                val hasLastMessage = c.has("lastMessage") && c.getString("lastMessage").isNotEmpty()
                val isMe = lastMessageSenderId == userId
                
                if (hasLastMessage && !isMe) {
                    val lastReadAtBy = c.optJSONObject("lastReadAtBy")
                    var serverReadMs: Long = 0
                    
                    if (lastReadAtBy != null) {
                        val valObj = lastReadAtBy.opt(userId)
                        serverReadMs = parseMillis(valObj)
                    }
                    
                    val localReadMs = localReadMap.optLong(id, 0)
                    val effectiveRead = Math.max(serverReadMs, localReadMs)
                    
                    val updatedAtMs = parseMillis(c.opt("updatedAt"))
                    
                    // Small skew 500ms
                    if (updatedAtMs > effectiveRead + 500) {
                        unreadCount = 1
                    }
                }
                
                c.put("unread", unreadCount)

                // --- 2. Filtering ---
                val isGroup = c.optBoolean("isGroup")
                
                if (activeKind == "Groups" && !isGroup) continue
                if (activeKind == "Chats" && isGroup) continue
                
                if (query.isNotEmpty()) {
                    val name = c.optString("name", "").lowercase()
                    // Try to search display names of members? Too hard without profiles map.
                    // Just name and last message for now.
                    val lastMsg = c.optString("lastMessage", "").lowercase()
                    if (!name.contains(query) && !lastMsg.contains(query)) continue
                }
                
                if (activeFilter == "Unread" && unreadCount == 0) continue
                
                val status = c.optString("status")
                val reqInit = c.optString("requestInitiatorId")
                
                val hasMsg = hasLastMessage || lastMessageSenderId.isNotEmpty()
                val isPending = status == "pending"
                if (!isPending && !hasMsg) continue
                
                if (status == "pending" && reqInit != userId) continue 

                list.add(c)
            }

            // --- 3. Sorting ---
            Collections.sort(list, object : Comparator<JSONObject> {
                override fun compare(o1: JSONObject, o2: JSONObject): Int {
                    val p1 = if (o1.optBoolean("pinned")) 1 else 0
                    val p2 = if (o2.optBoolean("pinned")) 1 else 0
                    if (p1 != p2) return p2 - p1 
                    
                    val t1 = parseMillis(o1.opt("updatedAt"))
                    val t2 = parseMillis(o2.opt("updatedAt"))
                    return t2.compareTo(t1) 
                }
            })

            val result = JSONArray()
            for (obj in list) result.put(obj)

            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PROCESSING_ERROR", e.message, e)
        }
    }

    private fun parseMillis(obj: Any?): Long {
        if (obj == null) return 0
        if (obj is Number) return obj.toLong()
        if (obj is String) return obj.toLongOrNull() ?: 0
        if (obj is JSONObject) {
            if (obj.has("toMillis")) return 0 // Can't invoke JS function
            if (obj.has("seconds")) {
                return obj.getLong("seconds") * 1000
            }
            if (obj.has("_seconds")) {
                return obj.getLong("_seconds") * 1000
            }
        }
        return 0
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

    @ReactMethod
    fun groupStories(storiesJson: String, promise: Promise) {
        thread {
            try {
                val input = JSONArray(storiesJson)
                val byUser = HashMap<String, ArrayList<JSONObject>>()
                val now = System.currentTimeMillis()
                val windowMs = 24 * 60 * 60 * 1000L

                for (i in 0 until input.length()) {
                    val s = input.getJSONObject(i)
                    val userId = s.optString("userId")
                    if (userId.isEmpty()) continue

                    val createdAt = parseMillis(s.opt("createdAt"))
                    if (createdAt > 0 && now - createdAt > windowMs) continue

                    if (!byUser.containsKey(userId)) {
                        byUser[userId] = ArrayList()
                    }
                    // Helper to copy object or just use it? safer to not mutate input if we can avoid it
                    // but query result objects are usually fresh.
                    // We'll add the processed 'createdAtMs' for easier sorting
                    s.put("createdAtMs", createdAt)
                    byUser[userId]?.add(s)
                }

                val groups = ArrayList<JSONObject>()
                
                for ((uid, list) in byUser) {
                    if (list.isEmpty()) continue
                    
                    // Sort stories by createdAt asc (oldest first) for viewing
                    Collections.sort(list) { o1, o2 ->
                        val t1 = o1.optLong("createdAtMs")
                        val t2 = o2.optLong("createdAtMs")
                        t1.compareTo(t2)
                    }

                    val first = list[0]
                    val last = list[list.size - 1]
                    val latestMs = last.optLong("createdAtMs")
                    
                    val avatar = last.optString("userAvatar").takeIf { it.isNotEmpty() } 
                        ?: last.optString("avatar").takeIf { it.isNotEmpty() }
                        ?: last.optString("photoURL")

                    val username = first.optString("username")

                    val mediaArray = JSONArray()
                    for (story in list) {
                         val m = JSONObject()
                         val uri = story.optString("photoURL").takeIf { it.isNotEmpty() } 
                            ?: story.optString("mediaUrl")
                         
                         if (uri.isEmpty()) continue
                         
                         val explicitType = story.optString("mediaType")
                         val lower = uri.lowercase()
                         val type = when {
                             explicitType == "video" -> "video"
                             explicitType == "image" -> "image"
                             lower.contains(".mp4") || lower.contains(".m3u8") -> "video"
                             else -> "image"
                         }
                         
                         m.put("type", type)
                         m.put("uri", uri)
                         m.put("storyId", story.optString("id"))
                         m.put("caption", story.optString("caption"))
                         val overlay = story.optString("overlayText")
                         if (overlay.isNotEmpty()) m.put("overlayText", overlay)
                         m.put("createdAtMs", story.optLong("createdAtMs"))
                         
                         mediaArray.put(m)
                    }
                    
                    if (mediaArray.length() > 0) {
                        val group = JSONObject()
                        group.put("id", uid)
                        group.put("userId", uid)
                        group.put("username", username)
                        group.put("title", username)
                        group.put("avatar", avatar)
                        group.put("image", avatar)
                        group.put("media", mediaArray)
                        group.put("__latestCreatedAt", latestMs)
                        groups.add(group)
                    }
                }

                // Sort groups by latest update desc
                Collections.sort(groups) { o1, o2 ->
                    val t1 = o1.optLong("__latestCreatedAt")
                    val t2 = o2.optLong("__latestCreatedAt")
                    t2.compareTo(t1)
                }

                val result = JSONArray()
                for (g in groups) result.put(g)
                
                resolveOnUi(promise, result.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "GROUP_STORIES_ERROR", e.message, e)
            }
        }
    }
}
