package com.movieflix.app.app

import com.facebook.react.bridge.*
import android.os.Build
import android.util.Rational
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.pm.PackageManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL

class VideoPlayerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "VideoPlayerModule"

    // ─────────────────────────────────────────────────────────────────────────────
    // parseCaptionPayload(payload, type) → [{ start, end, text }, ...]
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun parseCaptionPayload(payload: String, type: String, promise: Promise) {
        try {
            val sanitized = payload.replace("\r", "").replace("\uFEFF", "")
            val content = if (type == "vtt") sanitized.replace(Regex("^WEBVTT.*\n"), "") else sanitized
            val blocks = content.split(Regex("\n\n+"))
            val cues = JSONArray()

            for (block in blocks) {
                val lines = block.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
                if (lines.isEmpty()) continue

                // Skip numeric index line
                if (lines.first().matches(Regex("^\\d+$"))) {
                    lines.removeAt(0)
                }
                if (lines.isEmpty()) continue

                val timing = lines.removeAt(0)
                if (!timing.contains("-->")) continue

                val parts = timing.split("-->")
                if (parts.size < 2) continue

                val start = parseTimestampToMillis(parts[0].trim())
                val end = parseTimestampToMillis(parts[1].trim())
                if (start < 0 || end < 0) continue

                val text = lines.joinToString("\n").replace(Regex("<[^>]+>"), "").trim()
                if (text.isEmpty()) continue

                val cue = JSONObject()
                cue.put("start", start)
                cue.put("end", end)
                cue.put("text", text)
                cues.put(cue)
            }

            resolveOnUi(promise, cues.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PARSE_ERROR", e.message, e)
        }
    }

    private fun parseTimestampToMillis(value: String): Long {
        // Formats: HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS,mmm or MM:SS.mmm
        val clean = value.replace(',', '.').trim()
        val parts = clean.split(":")
        return try {
            when (parts.size) {
                3 -> {
                    val hours = parts[0].toLong()
                    val minutes = parts[1].toLong()
                    val secParts = parts[2].split(".")
                    val seconds = secParts[0].toLong()
                    val millis = if (secParts.size > 1) secParts[1].padEnd(3, '0').take(3).toLong() else 0
                    (hours * 3600 + minutes * 60 + seconds) * 1000 + millis
                }
                2 -> {
                    val minutes = parts[0].toLong()
                    val secParts = parts[1].split(".")
                    val seconds = secParts[0].toLong()
                    val millis = if (secParts.size > 1) secParts[1].padEnd(3, '0').take(3).toLong() else 0
                    (minutes * 60 + seconds) * 1000 + millis
                }
                else -> -1
            }
        } catch (e: Exception) {
            -1
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // parseHlsAudioTracks(manifest) → [{ id, name, language, groupId, isDefault }, ...]
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun parseHlsAudioTracks(manifest: String, promise: Promise) {
        try {
            val lines = manifest.split("\n")
            val options = JSONArray()
            val regex = Regex("^#EXT-X-MEDIA:TYPE=AUDIO,(.*)$", RegexOption.IGNORE_CASE)

            lines.forEachIndexed { idx, rawLine ->
                val line = rawLine.trim()
                val match = regex.find(line) ?: return@forEachIndexed

                val attrs = parseAttributeDictionary(match.groupValues[1])
                val groupId = stripQuotes(attrs["GROUP-ID"])
                val name = stripQuotes(attrs["NAME"])
                val language = stripQuotes(attrs["LANGUAGE"])
                val isDefault = attrs["DEFAULT"] == "YES"

                val id = buildAudioTrackOptionId(groupId, language, name, idx)

                val opt = JSONObject()
                opt.put("id", id)
                opt.put("name", name ?: "")
                opt.put("language", language ?: "")
                opt.put("groupId", groupId ?: "")
                opt.put("isDefault", isDefault)
                options.put(opt)
            }

            resolveOnUi(promise, options.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PARSE_ERROR", e.message, e)
        }
    }

    private fun buildAudioTrackOptionId(groupId: String?, language: String?, name: String?, index: Int): String {
        val parts = mutableListOf<String>()
        if (!groupId.isNullOrEmpty()) parts.add(groupId)
        if (!language.isNullOrEmpty()) parts.add(language)
        if (!name.isNullOrEmpty()) parts.add(name)
        parts.add(index.toString())
        return parts.joinToString("-")
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // parseHlsQualityOptions(manifest, manifestUrl) → [{ id, label, uri, resolution, bandwidth, codecs }, ...]
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun parseHlsQualityOptions(manifest: String, manifestUrl: String, promise: Promise) {
        try {
            val lines = manifest.split("\n")
            val options = JSONArray()

            var i = 0
            while (i < lines.size) {
                val line = lines[i].trim()
                if (!line.startsWith("#EXT-X-STREAM-INF")) {
                    i++
                    continue
                }

                val attrString = line.substringAfter(":", "")
                val attrs = parseAttributeDictionary(attrString)

                var j = i + 1
                var uriLine: String? = null
                while (j < lines.size) {
                    val candidate = lines[j].trim()
                    j++
                    if (candidate.isEmpty() || candidate.startsWith("#")) continue
                    uriLine = candidate
                    break
                }

                if (uriLine == null) {
                    i++
                    continue
                }

                val resolution = stripQuotes(attrs["RESOLUTION"])
                val bandwidth = attrs["BANDWIDTH"]?.toIntOrNull()
                val codecs = stripQuotes(attrs["CODECS"])
                val label = buildQualityLabel(resolution, bandwidth)
                val uri = resolveRelativeUrl(uriLine, manifestUrl)

                val opt = JSONObject()
                opt.put("id", "${bandwidth ?: 0}-${resolution ?: uri}")
                opt.put("label", label)
                opt.put("uri", uri)
                opt.put("resolution", resolution ?: "")
                opt.put("bandwidth", bandwidth ?: 0)
                opt.put("codecs", codecs ?: "")
                options.put(opt)

                i = j
            }

            // Sort by resolution height descending
            val sorted = (0 until options.length())
                .map { options.getJSONObject(it) }
                .sortedByDescending { getResolutionHeight(it.optString("resolution")) }

            val result = JSONArray()
            sorted.forEach { result.put(it) }

            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PARSE_ERROR", e.message, e)
        }
    }

    private fun buildQualityLabel(resolution: String?, bandwidth: Int?): String {
        if (!resolution.isNullOrEmpty()) {
            val height = getResolutionHeight(resolution)
            if (height != null) return "${height}p"
        }
        if (bandwidth != null && bandwidth > 0) {
            return formatBandwidth(bandwidth)
        }
        return "Auto"
    }

    private fun getResolutionHeight(resolution: String?): Int? {
        if (resolution.isNullOrEmpty()) return null
        val parts = resolution.split("x")
        return if (parts.size == 2) parts[1].toIntOrNull() else null
    }

    private fun formatBandwidth(bandwidth: Int): String {
        return when {
            bandwidth >= 1_000_000 -> "${bandwidth / 1_000_000} Mbps"
            bandwidth >= 1_000 -> "${bandwidth / 1_000} Kbps"
            else -> "$bandwidth bps"
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // enterPip(width, height)
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun enterPip(width: Int, height: Int, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            rejectOnUi(promise, "PIP_ERROR", "PiP not supported on this Android version")
            return
        }

        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            rejectOnUi(promise, "PIP_ERROR", "Activity not found")
            return
        }

        val hasPip = activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        if (!hasPip) {
            resolveOnUi(promise, false) // Not an error, just not supported
            return
        }

        try {
            val builder = PictureInPictureParams.Builder()
            if (width > 0 && height > 0) {
                val rational = Rational(width, height)
                builder.setAspectRatio(rational)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder.setActions(emptyList<RemoteAction>())
            }
            val success = activity.enterPictureInPictureMode(builder.build())
            resolveOnUi(promise, success)
        } catch (e: Exception) {
            rejectOnUi(promise, "PIP_ERROR", "Failed to enter PiP: ${e.message}", e)
        }
    }

    @ReactMethod
    fun enterPipMinimal(width: Int, height: Int, promise: Promise) {
        enterPip(width, height, promise)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // fetchFallbackSubtitles(imdbId, tmdbId, mediaType, seasonNum, episodeNum)
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun fetchFallbackSubtitles(imdbId: String?, tmdbId: String?, mediaType: String?, seasonNum: Int, episodeNum: Int, promise: Promise) {
        thread {
            try {
                if (imdbId.isNullOrEmpty() && tmdbId.isNullOrEmpty()) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                val subs = JSONArray()
                val seenLangs = HashSet<String>()

                // 1. OpenSubtitles (unauthenticated hash based fallback or text search)
                try {
                    val imdbNum = imdbId?.replace("tt", "") ?: ""
                    var osUrl = "https://rest.opensubtitles.org/search/imdbid-$imdbNum"
                    if (mediaType == "tv" && seasonNum > 0 && episodeNum > 0) {
                        osUrl += "/season-$seasonNum/episode-$episodeNum"
                    }

                    val osData = fetchJsonArray(osUrl, mapOf("User-Agent" to "TemporaryUserAgent"))
                    
                    if (osData != null) {
                        for (i in 0 until osData.length()) {
                            val item = osData.getJSONObject(i)
                            val link = item.optString("SubDownloadLink")
                            if (link.isEmpty()) continue
                            
                            val rawLang = item.optString("ISO639").takeIf { it.isNotEmpty() } ?: item.optString("LanguageName") ?: "en"
                            val lang = rawLang.lowercase()

                            if (seenLangs.contains(lang)) continue
                            seenLangs.add(lang)

                            val sub = JSONObject()
                            sub.put("id", "os-${item.optString("IDSubtitleFile")}-${subs.length()}")
                            sub.put("type", "srt")
                            sub.put("url", link.replace(".gz", ""))
                            sub.put("language", lang)
                            sub.put("display", item.optString("LanguageName") ?: lang.uppercase())
                            subs.put(sub)

                            if (subs.length() >= 10) break
                        }
                    }
                } catch (e: Exception) {
                    // Ignore OS errors
                }

                // 2. YIFY Subtitles (Movies only fallback)
                if (subs.length() == 0 && mediaType != "tv" && !imdbId.isNullOrEmpty()) {
                    try {
                        val yifyUrl = "https://yifysubtitles.ch/movie-imdb/$imdbId"
                        val html = fetchText(yifyUrl)
                        if (html.isNotEmpty()) {
                            val regex = Regex("href=\"(/subtitles/[^\"]+)\"")
                            val matches = regex.findAll(html)
                            var count = 0
                            
                            for (match in matches) {
                                if (count >= 5) break
                                val subPage = match.groupValues[1]
                                
                                val langRegex = Regex("/subtitles/[^/]+/([^/]+)")
                                val langMatch = langRegex.find(subPage)
                                val langName = langMatch?.groupValues?.get(1) ?: "english"
                                
                                val sub = JSONObject()
                                sub.put("id", "yify-$count")
                                sub.put("type", "srt")
                                sub.put("url", "https://yifysubtitles.ch$subPage") // This often needs one more hop but sticking to JS logic
                                val langCode = if (langName.length >= 2) langName.substring(0, 2) else "en"
                                sub.put("language", langCode)
                                sub.put("display", langName.replaceFirstChar { it.uppercase() })
                                subs.put(sub)
                                count++
                            }
                        }
                    } catch (e: Exception) {
                        // Ignore YIFY errors
                    }
                }

                resolveOnUi(promise, subs.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "SUBTITLE_ERROR", e.message, e)
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // fetchTmdbEnrichment(tmdbId, mediaType)
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun fetchTmdbEnrichment(tmdbId: String, mediaType: String, promise: Promise) {
        thread {
            try {
                val apiKey = "15d2ea6d0dc1d476efbca3eba2b9bbfb" // Hardcoded matching JS or better passed in? JS used import.
                // Assuming standard key for now or passed as arg? The task request said "fetchTmdbEnrichment" without param details, 
                // but implementation needs key. I will assume I can hardcode the one from source or use a safe default if available using BuildConfig.
                // Re-checking JS: `API_KEY` import.
                // I will use the specific key found in `video-player.tsx` usage if feasible, or hardcode it since it's client key.
                // JS uses `API_KEY`. I'll hardcode it here for simplicity or pass it.
                // Passing it is cleaner but requires signature change. The prompt said "Add fetchTmdbEnrichment".
                
                val append = if (mediaType == "movie") "external_ids,release_dates" else "external_ids,content_ratings"
                val url = "https://api.themoviedb.org/3/$mediaType/$tmdbId?api_key=$apiKey&append_to_response=$append"

                val json = fetchJsonObject(url)
                if (json == null) {
                    resolveOnUi(promise, "{}")
                    return@thread
                }

                val res = JSONObject()
                
                // 1. IMDB ID
                val ext = json.optJSONObject("external_ids")
                val imdbId = json.optString("imdb_id").takeIf { it.isNotEmpty() } ?: ext?.optString("imdb_id")
                if (!imdbId.isNullOrEmpty()) res.put("imdbId", imdbId)

                // 2. Release Year
                val dateRaw = if (mediaType == "movie") json.optString("release_date") else json.optString("first_air_date")
                if (dateRaw.length >= 4) {
                    val year = dateRaw.substring(0, 4).toIntOrNull()
                    if (year != null) res.put("releaseYear", year)
                }

                // 3. Content Rating
                var rating: String? = null
                if (mediaType == "movie") {
                    val releases = json.optJSONObject("release_dates")?.optJSONArray("results")
                    if (releases != null) {
                        for (i in 0 until releases.length()) {
                            val r = releases.getJSONObject(i)
                            if (r.optString("iso_3166_1") == "US") {
                                val dates = r.optJSONArray("release_dates")
                                if (dates != null && dates.length() > 0) {
                                    for (k in 0 until dates.length()) {
                                        val cert = dates.getJSONObject(k).optString("certification")
                                        if (cert.isNotEmpty()) {
                                            rating = cert
                                            break
                                        }
                                    }
                                }
                            }
                            if (rating != null) break
                        }
                    }
                } else {
                    val ratings = json.optJSONObject("content_ratings")?.optJSONArray("results")
                    if (ratings != null) {
                        for (i in 0 until ratings.length()) {
                            val r = ratings.getJSONObject(i)
                            if (r.optString("iso_3166_1") == "US") {
                                rating = r.optString("rating")
                                break
                            }
                        }
                    }
                }
                if (rating != null) res.put("contentRating", rating)

                // 4. Runtime
                val run = json.optInt("runtime", 0)
                if (run > 0) {
                    res.put("runtime", run)
                } else {
                    val runs = json.optJSONArray("episode_run_time")
                    if (runs != null && runs.length() > 0) {
                        res.put("runtime", runs.getInt(0))
                    }
                }

                resolveOnUi(promise, res.toString())

            } catch (e: Exception) {
                 // Return empty object on error
                 resolveOnUi(promise, "{}")
            }
        }
    }

    private fun fetchText(urlStr: String, headers: Map<String, String> = emptyMap()): String {
        try {
            val url = URL(urlStr)
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.readTimeout = 10000
            conn.connectTimeout = 10000
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            
            if (conn.responseCode in 200..299) {
                return conn.inputStream.bufferedReader().use { it.readText() }
            }
        } catch (e: Exception) { }
        return ""
    }

    private fun fetchJsonObject(urlStr: String, headers: Map<String, String> = emptyMap()): JSONObject? {
        val txt = fetchText(urlStr, headers)
        return if (txt.isNotEmpty()) JSONObject(txt) else null
    }

    private fun fetchJsonArray(urlStr: String, headers: Map<String, String> = emptyMap()): JSONArray? {
        val txt = fetchText(urlStr, headers)
        return if (txt.isNotEmpty()) JSONArray(txt) else null
    }

    private fun thread(action: () -> Unit) {
        Thread(action).start()
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // parseHlsMediaSegments(manifestText, manifestUrl) → [{ uri, duration }, ...]
    // ─────────────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun parseHlsMediaSegments(manifestText: String, manifestUrl: String, promise: Promise) {
        try {
            val lines = manifestText.split("\n").map { it.trim() }
            val segments = JSONArray()
            var pendingDuration: Double? = null

            for (line in lines) {
                if (line.isEmpty()) continue

                if (line.startsWith("#EXTINF:")) {
                    val raw = line.substringAfter("#EXTINF:")
                    val num = raw.split(",")[0].toDoubleOrNull()
                    pendingDuration = num
                    continue
                }

                if (line.startsWith("#")) continue

                val seg = JSONObject()
                seg.put("uri", resolveRelativeUrl(line, manifestUrl))
                seg.put("duration", pendingDuration ?: JSONObject.NULL)
                segments.put(seg)
                pendingDuration = null
            }

            resolveOnUi(promise, segments.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "PARSE_ERROR", e.message, e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────
    private fun parseAttributeDictionary(input: String): Map<String, String> {
        val result = mutableMapOf<String, String>()
        var buffer = StringBuilder()
        var inQuotes = false

        for (char in input) {
            if (char == '"') {
                inQuotes = !inQuotes
            }
            if (char == ',' && !inQuotes) {
                flushAttribute(buffer.toString(), result)
                buffer = StringBuilder()
            } else {
                buffer.append(char)
            }
        }
        flushAttribute(buffer.toString(), result)
        return result
    }

    private fun flushAttribute(buffer: String, result: MutableMap<String, String>) {
        if (buffer.isEmpty()) return
        val idx = buffer.indexOf('=')
        if (idx > 0) {
            val key = buffer.substring(0, idx).trim()
            val value = buffer.substring(idx + 1).trim()
            result[key] = value
        }
    }

    private fun stripQuotes(value: String?): String? {
        if (value.isNullOrEmpty()) return value
        return if (value.startsWith("\"") && value.endsWith("\"")) {
            value.substring(1, value.length - 1)
        } else value
    }

    private fun resolveRelativeUrl(target: String, base: String): String {
        return try {
            URL(URL(base), target).toString()
        } catch (e: Exception) {
            target
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
