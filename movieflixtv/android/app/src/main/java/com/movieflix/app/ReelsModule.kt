package com.movieflix.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.regex.Pattern
import kotlin.concurrent.thread

class ReelsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ReelsModule"
    }

    private fun fetchUrl(urlStr: String): String? {
        return try {
            val url = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")
            conn.setRequestProperty("Accept", "*/*")
            conn.setRequestProperty("Referer", "https://clip.cafe/")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000

            if (conn.responseCode != 200) return null

            val reader = BufferedReader(InputStreamReader(conn.inputStream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line).append("\n")
            }
            reader.close()
            sb.toString()
        } catch (e: Exception) {
            null
        }
    }

    private fun fetchUrlWithHeaders(urlStr: String, headers: Map<String, String>): String? {
        return try {
            val url = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            conn.connectTimeout = 10000
            conn.readTimeout = 10000

            if (conn.responseCode !in 200..299) return null

            val reader = BufferedReader(InputStreamReader(conn.inputStream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line).append("\n")
            }
            reader.close()
            sb.toString()
        } catch (e: Exception) {
            null
        }
    }

    private fun slugify(text: String?): String {
        if (text.isNullOrEmpty()) return ""
        return text.lowercase()
            .trim()
            .replace(Regex("\\s+"), "-")
            .replace(Regex("[^\\w\\-]+"), "")
            .replace(Regex("\\-\\-+"), "-")
    }

    /**
     * FAST: Browse genre and return movie items WITHOUT resolving video streams yet.
     * This allows the UI to load immediately.
     */
    @ReactMethod
    fun browseGenreMoviesLazy(genre: String, limit: Double, promise: Promise) {
        thread {
            try {
                val url = "https://clip.cafe/t/$genre"
                val html = fetchUrl(url)

                if (html == null) {
                    promise.resolve("[]")
                    return@thread
                }

                // Match movie links ending in -YEAR/
                val pattern = Pattern.compile("""href="([^"]*-\d{4}/)"""")
                val matcher = pattern.matcher(html)

                val uniquePaths = HashSet<String>()
                while (matcher.find()) {
                    matcher.group(1)?.let { uniquePaths.add(it) }
                }

                if (uniquePaths.isEmpty()) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                // Shuffle and take limit
                val shuffled = uniquePaths.toList().shuffled().take(limit.toInt())

                val results = JSONArray()
                shuffled.forEachIndexed { idx, path ->
                    val cleanPath = path.removePrefix("/").removeSuffix("/")
                    val parts = cleanPath.split("-").toMutableList()
                    val year = parts.removeLastOrNull() ?: ""
                    val title = parts.joinToString(" ")

                    val obj = JSONObject()
                    obj.put("title", title)
                    obj.put("year", year)
                    obj.put("slug", cleanPath)
                    obj.put("id", "cc-$cleanPath-$idx")
                    results.put(obj)
                }

                resolveOnUi(promise, results.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "BROWSE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Scrape stream URL from clip.cafe embed page
     */
    private fun scrapeClipCafeStream(embedId: String): JSONObject? {
        try {
            val embedUrl = "https://clip.cafe/e/$embedId"
            val html = fetchUrl(embedUrl) ?: return null

            // 1. Try MP4
            val mp4Pattern = Pattern.compile("""https?://[^"' ]+\.mp4[^"' ]*""")
            val mp4Matcher = mp4Pattern.matcher(html)
            if (mp4Matcher.find()) {
                val result = JSONObject()
                result.put("url", mp4Matcher.group())
                result.put("type", "mp4")
                return result
            }

            // 2. Try HLS
            val hlsPattern = Pattern.compile("""https?://[^"' ]+\.m3u8[^"' ]*""")
            val hlsMatcher = hlsPattern.matcher(html)
            if (hlsMatcher.find()) {
                val result = JSONObject()
                result.put("url", hlsMatcher.group())
                result.put("type", "hls")
                return result
            }

            // 3. Try DASH
            val mpdPattern = Pattern.compile("""https?://[^"' ]+\.mpd[^"' ]*""")
            val mpdMatcher = mpdPattern.matcher(html)
            if (mpdMatcher.find()) {
                val result = JSONObject()
                result.put("url", mpdMatcher.group())
                result.put("type", "dash")
                return result
            }

            // 4. Try JSON-style config
            val jsonPattern = Pattern.compile(""""(https?://[^"]+\.(m3u8|mp4|mpd)[^"]*)"""")
            val jsonMatcher = jsonPattern.matcher(html)
            if (jsonMatcher.find()) {
                val result = JSONObject()
                result.put("url", jsonMatcher.group(1))
                val ext = jsonMatcher.group(2)
                val type = when (ext) {
                    "mp4" -> "mp4"
                    "m3u8" -> "hls"
                    "mpd" -> "dash"
                    else -> "unknown"
                }
                result.put("type", type)
                return result
            }

            return null
        } catch (e: Exception) {
            return null
        }
    }

    private fun fetchImdbTrailer(imdbId: String): JSONObject? {
        try {
            val titleUrl = "https://www.imdb.com/title/$imdbId/"
            val titleHtml = fetchUrl(titleUrl) ?: return null

            var videoId: String? = null
            val patterns = listOf(
                """/video/(vi\d+)""",
                """\"video\":\s*\"(vi\d+)\"""",
                """\"videoId\":\s*\"(vi\d+)\"""",
                """data-video-id=\"(vi\d+)\"""",
                """href=\"/video/(vi\d+)"""
            )

            for (p in patterns) {
                val m = Pattern.compile(p).matcher(titleHtml)
                if (m.find()) {
                    videoId = m.group(1)
                    break
                }
            }

            if (videoId == null) {
                val mediaUrl = "https://www.imdb.com/title/$imdbId/mediaindex"
                val mediaHtml = fetchUrl(mediaUrl)
                if (mediaHtml != null) {
                    var m = Pattern.compile("""/video/(vi\d+)""").matcher(mediaHtml)
                    if (m.find()) videoId = m.group(1)
                    else {
                        m = Pattern.compile("""data-video-id=\"(vi\d+)\"""").matcher(mediaHtml)
                        if (m.find()) videoId = m.group(1)
                    }
                }
            }

            if (videoId == null) return null

            val embedUrl = "https://www.imdb.com/videoembed/$videoId"
            val embedHtml = fetchUrl(embedUrl) ?: return null

            val hlsM = Pattern.compile("""https:[^"' ]+\.m3u8[^"' ]*""").matcher(embedHtml)
            if (hlsM.find()) {
                val map = JSONObject()
                map.put("url", hlsM.group())
                map.put("type", "hls")
                return map
            }

            val mp4M = Pattern.compile("""https:[^"' ]+\.mp4[^"' ]*""").matcher(embedHtml)
            if (mp4M.find()) {
                val map = JSONObject()
                map.put("url", mp4M.group())
                map.put("type", "mp4")
                return map
            }

            return null
        } catch (e: Exception) {
            return null
        }
    }

    private fun getImdbIdFromTmdb(apiKey: String, baseUrl: String, tmdbId: String): String? {
        val url = "$baseUrl/movie/$tmdbId/external_ids?api_key=$apiKey"
        val json = fetchUrl(url) ?: return null
        return try {
            val obj = JSONObject(json)
            obj.optString("imdb_id", null)
        } catch (_: Exception) {
            null
        }
    }

    @ReactMethod
    fun resolveMovieReelsFromTmdb(apiKey: String, baseUrl: String, candidatesJson: String, limit: Double, promise: Promise) {
        thread {
            try {
                val candidates = JSONArray(candidatesJson)
                val out = JSONArray()

                val max = Math.min(limit.toInt(), candidates.length())
                for (i in 0 until max) {
                    val m = candidates.optJSONObject(i) ?: continue
                    val tmdbId = m.optString("id")
                    val title = m.optString("title", m.optString("name", ""))
                    val originalTitle = m.optString("original_title", "")
                    val releaseDate = m.optString("release_date", "")
                    val releaseYear = if (releaseDate.length >= 4) releaseDate.substring(0, 4) else ""

                    var clipResult: JSONObject? = null
                    var source = "clip.cafe"

                    if (title.isNotEmpty()) {
                        clipResult = searchClipCafeInternal(title, releaseYear)
                    }
                    if (clipResult == null && originalTitle.isNotEmpty() && originalTitle != title) {
                        clipResult = searchClipCafeInternal(originalTitle, releaseYear)
                    }

                    if (clipResult == null && tmdbId.isNotEmpty()) {
                        val imdbId = getImdbIdFromTmdb(apiKey, baseUrl, tmdbId)
                        if (!imdbId.isNullOrEmpty()) {
                            val imdb = fetchImdbTrailer(imdbId)
                            if (imdb != null) {
                                clipResult = imdb
                                source = "imdb"
                            }
                        }
                    }

                    if (clipResult != null && clipResult.optString("url").isNotEmpty()) {
                        m.put("videoUrl", clipResult.optString("url"))
                        m.put("mediaType", "clip")
                        m.put("sourceType", source)
                        m.put("media_type", "clip")
                        out.put(m)
                    }
                }

                resolveOnUi(promise, out.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "RESOLVE_REELS_ERROR", e.message, e)
            }
        }
    }

    private fun searchClipCafeInternal(title: String, year: String): JSONObject? {
        return try {
            val slug = slugify(title) + if (year.isNotEmpty()) "-$year" else ""
            val movieUrl = "https://clip.cafe/$slug/"
            val html = fetchUrl(movieUrl) ?: return null

            val clipRegex = Pattern.compile("""href=["']/?$slug/[^"']+["']""", Pattern.CASE_INSENSITIVE)
            val matcher = clipRegex.matcher(html)
            val matches = ArrayList<String>()
            while (matcher.find()) {
                matches.add(matcher.group())
            }
            if (matches.isEmpty()) return null

            val randomClipAttr = matches.random()
            val pathMatch = Pattern.compile("""href=["']([^"']+)["']""").matcher(randomClipAttr)
            var clipPath = ""
            if (pathMatch.find()) {
                clipPath = pathMatch.group(1) ?: ""
            }
            if (!clipPath.startsWith("/")) {
                clipPath = "/$clipPath"
            }

            val clipUrl = "https://clip.cafe$clipPath"
            val clipHtml = fetchUrl(clipUrl) ?: return null

            val embedMatch = Pattern.compile("""clip\.cafe/e/([a-zA-Z0-9_-]+)""").matcher(clipHtml)
            if (!embedMatch.find()) return null

            val embedId = embedMatch.group(1) ?: return null
            scrapeClipCafeStream(embedId)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Search for a clip by title/year and resolve the stream URL
     */
    @ReactMethod
    fun searchClipCafe(title: String, year: String, promise: Promise) {
        thread {
            try {
                // 1. Construct movie page URL
                val slug = slugify(title) + if (year.isNotEmpty()) "-$year" else ""
                val movieUrl = "https://clip.cafe/$slug/"

                val html = fetchUrl(movieUrl)
                if (html == null) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // 2. Find a clip link
                val clipRegex = Pattern.compile("""href=["']/?$slug/[^"']+["']""", Pattern.CASE_INSENSITIVE)
                val matcher = clipRegex.matcher(html)

                val matches = ArrayList<String>()
                while (matcher.find()) {
                    matches.add(matcher.group())
                }

                if (matches.isEmpty()) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // Pick a random clip
                val randomClipAttr = matches.random()
                val pathMatch = Pattern.compile("""href=["']([^"']+)["']""").matcher(randomClipAttr)

                var clipPath = ""
                if (pathMatch.find()) {
                    clipPath = pathMatch.group(1) ?: ""
                }

                if (!clipPath.startsWith("/")) {
                    clipPath = "/$clipPath"
                }

                // 3. Go to clip page to get embed ID
                val clipUrl = "https://clip.cafe$clipPath"
                val clipHtml = fetchUrl(clipUrl)
                if (clipHtml == null) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                val embedMatch = Pattern.compile("""clip\.cafe/e/([a-zA-Z0-9_-]+)""").matcher(clipHtml)
                if (!embedMatch.find()) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                val embedId = embedMatch.group(1) ?: ""

                // 4. Get the stream
                val streamResult = scrapeClipCafeStream(embedId)
                if (streamResult != null) {
                    resolveOnUi(promise, streamResult.toString())
                } else {
                    resolveOnUi(promise, null)
                }

            } catch (e: Exception) {
                rejectOnUi(promise, "SEARCH_ERROR", e.message, e)
            }
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
