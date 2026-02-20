package com.movieflix.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayList
import java.util.Collections
import java.util.Comparator
import java.util.HashSet
import java.util.regex.Pattern
import kotlin.concurrent.thread

class MoviesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val kidsGenres = setOf(10751, 16, 10762)

    override fun getName(): String {
        return "MoviesModule"
    }

    @ReactMethod
    fun filterMovies(itemsJson: String, type: String, genreId: Double, sortMode: String, promise: Promise) {
        try {
            val input = JSONArray(itemsJson)
            val wantType = if (type == "all") null else type
            val wantGenre = if (genreId < 0) null else genreId.toInt()
            
            val result = filterJsonArray(input, wantType, wantGenre, sortMode)
            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "FILTER_ERROR", e.message, e)
        }
    }

    private fun filterJsonArray(input: JSONArray, wantType: String?, wantGenre: Int?, sortMode: String): JSONArray {
        val list = ArrayList<JSONObject>()
        for (i in 0 until input.length()) {
            val item = input.getJSONObject(i)
            var itemType = item.optString("media_type")
            if (itemType.isEmpty() || itemType == "null") {
                    if (item.has("title")) itemType = "movie"
                    else if (item.has("name")) itemType = "tv"
                    else itemType = "movie"
            }
            
            if (wantType != null && itemType != wantType) continue

            if (wantGenre != null) {
                val genreIds = item.optJSONArray("genre_ids")
                var hasGenre = false
                if (genreIds != null) {
                    for (j in 0 until genreIds.length()) {
                        if (genreIds.getInt(j) == wantGenre) {
                            hasGenre = true
                            break
                        }
                    }
                }
                if (!hasGenre) continue
            }
            list.add(item)
        }

        // Sorting
        if (sortMode == "TopRated") {
            Collections.sort(list, object : Comparator<JSONObject> {
                override fun compare(o1: JSONObject, o2: JSONObject): Int {
                    val v1 = o1.optDouble("vote_average", 0.0)
                    val v2 = o2.optDouble("vote_average", 0.0)
                    return v2.compareTo(v1) // Descending
                }
            })
        } else if (sortMode == "New") {
            Collections.sort(list, object : Comparator<JSONObject> {
                override fun compare(o1: JSONObject, o2: JSONObject): Int {
                    val d1 = o1.optString("release_date", o1.optString("first_air_date", ""))
                    val d2 = o2.optString("release_date", o2.optString("first_air_date", ""))
                    return d2.compareTo(d1) // Descending
                }
            })
        }

        val result = JSONArray()
        for (obj in list) result.put(obj)
        return result
    }

    @ReactMethod
    fun aggregateCollections(
        trendingJson: String,
        recommendedJson: String,
        netflixJson: String,
        amazonJson: String,
        hboJson: String,
        trendingMoviesJson: String,
        trendingTvJson: String,
        songsJson: String,
        reelsJson: String,
        genreId: Double,
        sortMode: String,
        promise: Promise
    ) {
        thread {
            try {
                val result = Arguments.createMap()
                val gId = if (genreId < 0) null else genreId.toInt()

                // Parse once
                val trending = JSONArray(trendingJson)
                val recommended = JSONArray(recommendedJson)
                val netflix = JSONArray(netflixJson)
                val amazon = JSONArray(amazonJson)
                val hbo = JSONArray(hboJson)
                val trendingMovies = JSONArray(trendingMoviesJson)
                val trendingTv = JSONArray(trendingTvJson)
                val songs = JSONArray(songsJson)
                val reels = JSONArray(reelsJson)

                // Main filters
                result.putString("filteredTrending", filterJsonArray(trending, null, gId, sortMode).toString())
                result.putString("filteredRecommended", filterJsonArray(recommended, null, gId, sortMode).toString())
                result.putString("filteredNetflix", filterJsonArray(netflix, null, gId, sortMode).toString())
                result.putString("filteredAmazon", filterJsonArray(amazon, null, gId, sortMode).toString())
                result.putString("filteredHbo", filterJsonArray(hbo, null, gId, sortMode).toString())
                result.putString("filteredTrendingMoviesOnly", filterJsonArray(trendingMovies, null, gId, sortMode).toString())
                result.putString("filteredTrendingTvOnly", filterJsonArray(trendingTv, null, gId, sortMode).toString())
                result.putString("filteredSongs", filterJsonArray(songs, null, gId, sortMode).toString())
                result.putString("filteredMovieReels", filterJsonArray(reels, null, gId, sortMode).toString())

                // Picks (always from trendingMovies)
                result.putString("actionPicks", filterJsonArray(trendingMovies, null, 28, sortMode).toString())
                result.putString("comedyPicks", filterJsonArray(trendingMovies, null, 35, sortMode).toString())
                result.putString("horrorPicks", filterJsonArray(trendingMovies, null, 27, sortMode).toString())
                result.putString("romancePicks", filterJsonArray(trendingMovies, null, 10749, sortMode).toString())
                result.putString("sciFiPicks", filterJsonArray(trendingMovies, null, 878, sortMode).toString())

                resolveOnUi(promise, result)
            } catch (e: Exception) {
                rejectOnUi(promise, "AGGREGATE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getBecauseYouWatched(recommendedJson: String, genreIdsArray: ReadableArray, promise: Promise) {
        thread {
            try {
                val input = JSONArray(recommendedJson)
                val targetGenres = HashSet<Int>()
                for (i in 0 until genreIdsArray.size()) {
                    targetGenres.add(genreIdsArray.getInt(i))
                }

                val list = ArrayList<JSONObject>()
                for (i in 0 until input.length()) {
                    val item = input.getJSONObject(i)
                    val itemGenres = item.optJSONArray("genre_ids")
                    if (itemGenres != null) {
                        for (j in 0 until itemGenres.length()) {
                            if (targetGenres.contains(itemGenres.getInt(j))) {
                                list.add(item)
                                break
                            }
                        }
                    }
                }
                
                // Shuffle logic to keep it fresh? Or just return matches.
                // Replicating existing filterByGenreList behavior for now which just filters.
                
                val result = JSONArray()
                for (obj in list) result.put(obj)
                
                resolveOnUi(promise, result.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "BECAUSE_YOU_WATCHED_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun filterByGenreList(itemsJson: String, genreIdsArray: ReadableArray, promise: Promise) {
        try {
            val input = JSONArray(itemsJson)
            val result = JSONArray()
            val targetGenres = HashSet<Int>()
            
            for (i in 0 until genreIdsArray.size()) {
                targetGenres.add(genreIdsArray.getInt(i))
            }

            for (i in 0 until input.length()) {
                val item = input.getJSONObject(i)
                val itemGenres = item.optJSONArray("genre_ids")
                var match = false
                if (itemGenres != null) {
                    for (j in 0 until itemGenres.length()) {
                        if (targetGenres.contains(itemGenres.getInt(j))) {
                            match = true
                            break
                        }
                    }
                }
                if (match) {
                    result.put(item)
                }
            }
            resolveOnUi(promise, result.toString())
        } catch (e: Exception) {
            rejectOnUi(promise, "FILTER_GENRE_LIST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun fetchImdbTrailer(imdbId: String, promise: Promise) {
        thread {
            try {
                // 1. Fetch Title Page
                val titleUrl = "https://www.imdb.com/title/$imdbId/"
                val titleHtml = fetchUrl(titleUrl)
                
                if (titleHtml == null) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // Find video ID
                var videoId: String? = null
                val patterns = listOf(
                    """/video/(vi\d+)""",
                    """"video":\s*"(vi\d+)"""",
                    """"videoId":\s*"(vi\d+)"""",
                    """data-video-id="(vi\d+)"""",
                    """href="/video/(vi\d+)"""
                )
                
                for (p in patterns) {
                    val m = Pattern.compile(p).matcher(titleHtml)
                    if (m.find()) {
                        videoId = m.group(1)
                        break
                    }
                }

                if (videoId == null) {
                    // Fallback
                    val mediaUrl = "https://www.imdb.com/title/$imdbId/mediaindex"
                    val mediaHtml = fetchUrl(mediaUrl)
                    if (mediaHtml != null) {
                        var m = Pattern.compile("""/video/(vi\d+)""").matcher(mediaHtml)
                        if (m.find()) videoId = m.group(1)
                        else {
                            m = Pattern.compile("""data-video-id="(vi\d+)"""").matcher(mediaHtml)
                            if (m.find()) videoId = m.group(1)
                        }
                    }
                }

                if (videoId == null) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // 2. Fetch Embed
                val embedUrl = "https://www.imdb.com/videoembed/$videoId"
                val embedHtml = fetchUrl(embedUrl)
                if (embedHtml == null) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // 3. Find Streams
                val map = Arguments.createMap()
                
                // Try HLS first
                val hlsM = Pattern.compile("""https:[^"' ]+\.m3u8[^"' ]*""").matcher(embedHtml)
                if (hlsM.find()) {
                    map.putString("url", hlsM.group())
                    map.putString("type", "hls")
                    resolveOnUi(promise, map)
                    return@thread
                }

                // Try MP4
                val mp4M = Pattern.compile("""https:[^"' ]+\.mp4[^"' ]*""").matcher(embedHtml)
                if (mp4M.find()) {
                    map.putString("url", mp4M.group())
                    map.putString("type", "mp4")
                    resolveOnUi(promise, map)
                    return@thread
                }

                resolveOnUi(promise, null)

            } catch (e: Exception) {
                resolveOnUi(promise, null)
            }
        }
    }

    @ReactMethod
    fun resolveHeroTrailer(apiKey: String, baseUrl: String, tmdbId: String, mediaType: String, imdbId: String?, promise: Promise) {
        thread {
            try {
                var resolvedImdbId: String? = imdbId
                if (resolvedImdbId.isNullOrEmpty() && tmdbId.isNotEmpty()) {
                    val type = if (mediaType == "tv") "tv" else "movie"
                    val url = "$baseUrl/$type/$tmdbId/external_ids?api_key=$apiKey"
                    val json = fetchUrl(url)
                    if (json != null) {
                        try {
                            val obj = JSONObject(json)
                            resolvedImdbId = obj.optString("imdb_id", null)
                        } catch (_: Exception) {
                            resolvedImdbId = null
                        }
                    }
                }

                if (resolvedImdbId.isNullOrEmpty()) {
                    resolveOnUi(promise, null)
                    return@thread
                }

                // Reuse existing native IMDB scraper
                val trailer = fetchImdbTrailerInternal(resolvedImdbId)
                resolveOnUi(promise, trailer)
            } catch (e: Exception) {
                resolveOnUi(promise, null)
            }
        }
    }

    @ReactMethod
    fun searchContent(apiKey: String, baseUrl: String, query: String, promise: Promise) {
        thread {
            try {
                val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
                
                // Fetch both concurrently
                var movieJsonStr: String? = null
                var tvJsonStr: String? = null
                
                val t1 = thread {
                    val url = "$baseUrl/search/movie?api_key=$apiKey&query=$encodedQuery&include_adult=false&language=en-US&page=1"
                    movieJsonStr = fetchUrl(url)
                }
                val t2 = thread {
                    val url = "$baseUrl/search/tv?api_key=$apiKey&query=$encodedQuery&include_adult=false&language=en-US&page=1"
                    tvJsonStr = fetchUrl(url)
                }
                
                t1.join()
                t2.join()

                val movies = ArrayList<JSONObject>()
                val shows = ArrayList<JSONObject>()

                if (movieJsonStr != null) {
                    val root = JSONObject(movieJsonStr)
                    val results = root.optJSONArray("results")
                    if (results != null) {
                        for (i in 0 until results.length()) {
                            val item = results.optJSONObject(i) ?: continue
                            // Normalize
                            item.put("media_type", "movie")
                            if (!item.has("title")) item.put("title", item.optString("original_title"))
                            movies.add(item)
                        }
                    }
                }

                if (tvJsonStr != null) {
                    val root = JSONObject(tvJsonStr)
                    val results = root.optJSONArray("results")
                    if (results != null) {
                        for (i in 0 until results.length()) {
                            val item = results.optJSONObject(i) ?: continue
                            // Normalize
                            item.put("media_type", "tv")
                            item.put("title", item.optString("name", item.optString("original_name")))
                            if (!item.has("release_date")) item.put("release_date", item.optString("first_air_date"))
                            shows.add(item)
                        }
                    }
                }

                // Sort by popularity desc
                val comparator = Comparator<JSONObject> { o1, o2 ->
                    val p1 = o1.optDouble("popularity", 0.0)
                    val p2 = o2.optDouble("popularity", 0.0)
                    p2.compareTo(p1)
                }
                Collections.sort(movies, comparator)
                Collections.sort(shows, comparator)

                // Interleave
                val combined = JSONArray()
                val max = Math.max(movies.size, shows.size)
                for (i in 0 until max) {
                    if (i < movies.size) combined.put(movies[i])
                    if (i < shows.size) combined.put(shows[i])
                }

                resolveOnUi(promise, combined.toString())

            } catch (e: Exception) {
                rejectOnUi(promise, "SEARCH_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun fetchDiscoverMovies(apiKey: String, baseUrl: String, genreId: Double, isKids: Boolean, promise: Promise) {
        thread {
            try {
                val urlString = "$baseUrl/discover/movie?api_key=$apiKey&with_genres=${genreId.toInt()}" + 
                    (if (isKids) "&include_adult=false&certification_country=US&certification.lte=G" else "")
                
                val jsonStr = fetchUrl(urlString)
                if (jsonStr == null) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                val root = JSONObject(jsonStr)
                val results = root.optJSONArray("results")
                if (results == null) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                val filtered = JSONArray()

                for (i in 0 until results.length()) {
                    val item = results.getJSONObject(i)
                    if (isKids) {
                        val adult = item.optBoolean("adult", false)
                        if (adult) continue
                        
                        val genreIds = item.optJSONArray("genre_ids")
                        var hasKidsGenre = false
                        if (genreIds != null) {
                            for (j in 0 until genreIds.length()) {
                                if (kidsGenres.contains(genreIds.getInt(j))) {
                                    hasKidsGenre = true
                                    break
                                }
                            }
                        }
                        if (!hasKidsGenre) continue
                    }
                    filtered.put(item)
                }
                resolveOnUi(promise, filtered.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "FETCH_DISCOVER_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun fetchGenres(apiKey: String, baseUrl: String, isKids: Boolean, promise: Promise) {
        thread {
            try {
                val urlString = "$baseUrl/genre/movie/list?api_key=$apiKey"
                val jsonStr = fetchUrl(urlString)
                if (jsonStr == null) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                val root = JSONObject(jsonStr)
                val genres = root.optJSONArray("genres")
                if (genres == null) {
                    resolveOnUi(promise, "[]")
                    return@thread
                }

                val filtered = JSONArray()

                for (i in 0 until genres.length()) {
                    val g = genres.getJSONObject(i)
                    if (isKids) {
                        if (kidsGenres.contains(g.getInt("id"))) {
                            filtered.put(g)
                        }
                    } else {
                        filtered.put(g)
                    }
                }
                resolveOnUi(promise, filtered.toString())
            } catch (e: Exception) {
                rejectOnUi(promise, "FETCH_GENRES_ERROR", e.message, e)
            }
        }
    }

    private fun fetchImdbTrailerInternal(imdbId: String): WritableMap? {
        return try {
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

            val map = Arguments.createMap()
            val hlsM = Pattern.compile("""https:[^"' ]+\.m3u8[^"' ]*""").matcher(embedHtml)
            if (hlsM.find()) {
                map.putString("url", hlsM.group())
                map.putString("type", "hls")
                return map
            }

            val mp4M = Pattern.compile("""https:[^"' ]+\.mp4[^"' ]*""").matcher(embedHtml)
            if (mp4M.find()) {
                map.putString("url", mp4M.group())
                map.putString("type", "mp4")
                return map
            }

            null
        } catch (_: Exception) {
            null
        }
    }

    private fun fetchUrl(urlString: String): String? {
        var conn: HttpURLConnection? = null
        try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.readTimeout = 8000
            conn.connectTimeout = 8000
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

            val responseCode = conn.responseCode
            if (responseCode !in 200..299) return null

            val reader = BufferedReader(InputStreamReader(conn.inputStream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line)
            }
            reader.close()
            return sb.toString()
        } catch (e: Exception) {
            return null
        } finally {
            conn?.disconnect()
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

    @ReactMethod
    fun deriveHomeFeedState(payloadJson: String, isKids: Boolean, imageBaseUrl: String, promise: Promise) {
        thread {
            try {
                val payload = JSONObject(payloadJson)

                val movieStories = payload.optJSONObject("movieStoriesData")?.optJSONArray("results") ?: JSONArray()
                val tvStories = payload.optJSONObject("tvStoriesData")?.optJSONArray("results") ?: JSONArray()
                val trendingRaw = payload.optJSONObject("trendingData")?.optJSONArray("results") ?: JSONArray()
                val songsRaw = payload.optJSONObject("songsData")?.optJSONArray("results") ?: JSONArray()
                val reelsRaw = payload.optJSONObject("movieReelsData")?.optJSONArray("results") ?: JSONArray()
                val recommendedRaw = payload.optJSONObject("recommendedData")?.optJSONArray("results") ?: JSONArray()
                val genresList = payload.optJSONObject("genresData")?.optJSONArray("genres") ?: JSONArray()

                val netflixRaw = payload.optJSONArray("netflix") ?: JSONArray()
                val amazonRaw = payload.optJSONArray("amazon") ?: JSONArray()
                val hboRaw = payload.optJSONArray("hbo") ?: JSONArray()

                val movieStoriesList = filterForKids(movieStories, isKids)
                val tvStoriesList = filterForKids(tvStories, isKids)

                val combinedStories = JSONArray()
                for (i in 0 until movieStoriesList.length()) {
                    val item = movieStoriesList.optJSONObject(i) ?: continue
                    val mapped = mapStoryItem(item, imageBaseUrl)
                    if (mapped != null) combinedStories.put(mapped)
                }
                for (i in 0 until tvStoriesList.length()) {
                    val item = tvStoriesList.optJSONObject(i) ?: continue
                    val mapped = mapStoryItem(item, imageBaseUrl)
                    if (mapped != null) combinedStories.put(mapped)
                }

                val trendingResults = filterForKids(trendingRaw, isKids)
                val netflixSafe = filterForKids(netflixRaw, isKids)
                val amazonSafe = filterForKids(amazonRaw, isKids)
                val songsSafe = filterForKids(songsRaw, isKids)
                val movieReelsSafe = filterForKids(reelsRaw, isKids)
                val recommendedSafe = filterForKids(recommendedRaw, isKids)

                val hboSource = if (hboRaw.length() > 0) hboRaw else filterByMediaType(trendingRaw, "tv")
                val hboSafe = filterForKids(hboSource, isKids)

                val result = Arguments.createMap()
                result.putString("netflixSafe", netflixSafe.toString())
                result.putString("amazonSafe", amazonSafe.toString())
                result.putString("hboSafe", hboSafe.toString())
                result.putString("combinedStories", combinedStories.toString())
                result.putString("movieStoriesList", movieStoriesList.toString())
                result.putString("tvStoriesList", tvStoriesList.toString())
                result.putString("trendingResults", trendingResults.toString())
                result.putString("trendingRaw", trendingRaw.toString())
                result.putString("songsSafe", songsSafe.toString())
                result.putString("movieReelsSafe", movieReelsSafe.toString())
                result.putString("recommendedSafe", recommendedSafe.toString())
                result.putString("genresList", genresList.toString())

                resolveOnUi(promise, result)
            } catch (e: Exception) {
                rejectOnUi(promise, "DERIVE_HOME_FEED_ERROR", e.message, e)
            }
        }
    }

    private fun filterForKids(input: JSONArray, isKids: Boolean): JSONArray {
        if (!isKids) return input
        val result = JSONArray()
        for (i in 0 until input.length()) {
            val item = input.optJSONObject(i) ?: continue
            val adult = item.optBoolean("adult", false)
            if (adult) continue
            val genreIds = item.optJSONArray("genre_ids")
            var hasKidsGenre = false
            if (genreIds != null) {
                for (j in 0 until genreIds.length()) {
                    if (kidsGenres.contains(genreIds.optInt(j))) {
                        hasKidsGenre = true
                        break
                    }
                }
            }
            if (!hasKidsGenre) continue
            result.put(item)
        }
        return result
    }

    private fun filterByMediaType(input: JSONArray, wantType: String): JSONArray {
        val result = JSONArray()
        for (i in 0 until input.length()) {
            val item = input.optJSONObject(i) ?: continue
            var itemType = item.optString("media_type")
            if (itemType.isEmpty() || itemType == "null") {
                itemType = if (item.has("title")) "movie" else if (item.has("name")) "tv" else "movie"
            }
            if (itemType == wantType) result.put(item)
        }
        return result
    }

    private fun mapStoryItem(item: JSONObject, imageBaseUrl: String): JSONObject? {
        val poster = item.optString("poster_path")
        if (poster.isEmpty()) return null
        val image = imageBaseUrl + poster
        val title = item.optString("title").ifEmpty { item.optString("name").ifEmpty { "Untitled" } }
        val id = item.opt("id")

        val out = JSONObject()
        out.put("id", id)
        out.put("title", title)
        out.put("image", image)
        out.put("avatar", image)
        if (item.has("media_type")) out.put("media_type", item.optString("media_type"))

        val mediaArr = JSONArray()
        val mediaObj = JSONObject()
        mediaObj.put("type", "image")
        mediaObj.put("uri", image)
        mediaObj.put("storyId", id)
        mediaArr.put(mediaObj)
        out.put("media", mediaArr)
        return out
    }
}