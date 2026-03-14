package com.movieflix.app.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import kotlin.concurrent.thread

class CacheModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val dbHelper = CacheDbHelper(reactContext)
    // Threshold for moving value from DB to File (500KB)
    private val LARGE_VALUE_THRESHOLD = 500 * 1024 

    override fun getName() = "CacheModule"

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        thread {
            try {
                val db = dbHelper.writableDatabase
                val values = ContentValues().apply {
                    put("key", key)
                    put("updated_at", System.currentTimeMillis())
                }

                if (value.toByteArray(Charsets.UTF_8).size > LARGE_VALUE_THRESHOLD) {
                    // Store in file
                    val file = getCacheFile(key)
                    file.writeText(value)
                    values.put("value", "") // Empty string indicates file storage might be used, or just flag
                    values.put("is_file", 1)
                } else {
                    values.put("value", value)
                    values.put("is_file", 0)
                    // Ensure file is deleted if it existed previously
                    getCacheFile(key).delete()
                }

                db.replace("cache_store", null, values)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", "Failed to set item: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        thread {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.query(
                    "cache_store",
                    arrayOf("value", "is_file"),
                    "key = ?",
                    arrayOf(key),
                    null, null, null
                )

                cursor.use {
                    if (it.moveToFirst()) {
                        val isFile = it.getInt(it.getColumnIndexOrThrow("is_file")) == 1
                        val value = if (isFile) {
                            try {
                                getCacheFile(key).readText()
                            } catch (e: Exception) {
                // File missing/corrupt -> clean up
                                deleteItemSync(key) 
                                null
                            }
                        } else {
                            it.getString(it.getColumnIndexOrThrow("value"))
                        }
                        promise.resolve(value)
                    } else {
                        promise.resolve(null)
                    }
                }
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", "Failed to get item: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        thread {
            try {
                deleteItemSync(key)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", "Failed to remove item: ${e.message}", e)
            }
        }
    }

    private fun deleteItemSync(key: String) {
        val db = dbHelper.writableDatabase
        db.delete("cache_store", "key = ?", arrayOf(key))
        getCacheFile(key).delete()
    }

    @ReactMethod
    fun getAllKeys(promise: Promise) {
        thread {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.query("cache_store", arrayOf("key"), null, null, null, null, null)
                val keys = Arguments.createArray()
                cursor.use {
                     while (it.moveToNext()) {
                        keys.pushString(it.getString(0))
                    }
                }
                promise.resolve(keys)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", "Failed to get keys: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        thread {
            try {
                val db = dbHelper.writableDatabase
                db.delete("cache_store", null, null)
                // Clear all cache files
                val dir = File(reactContext.filesDir, "native_cache_blobs")
                if (dir.exists()) {
                    dir.deleteRecursively()
                    dir.mkdirs()
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", "Failed to clear cache: ${e.message}", e)
            }
        }
    }

    private fun getCacheFile(key: String): File {
        val dir = File(reactContext.filesDir, "native_cache_blobs")
        if (!dir.exists()) dir.mkdirs()
        // Sanitize key for filename just in case
        val safeKey = key.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return File(dir, safeKey)
    }

    private class CacheDbHelper(context: Context) : SQLiteOpenHelper(context, "movieflix_cache.db", null, 2) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE cache_store (key TEXT PRIMARY KEY, value TEXT, is_file INTEGER DEFAULT 0, updated_at INTEGER)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if (oldVersion < 2) {
                // Add is_file column if upgrading from v1
                try {
                    db.execSQL("ALTER TABLE cache_store ADD COLUMN is_file INTEGER DEFAULT 0")
                } catch (e: Exception) {
                    // Column might already exist or table missing, recreate
                    db.execSQL("DROP TABLE IF EXISTS cache_store")
                    onCreate(db)
                }
            }
        }
    }
}
