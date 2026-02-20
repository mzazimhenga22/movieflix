# Supabase Edge Functions Setup for MovieFlix Streaming

This guide explains how to deploy the scraping functionality to Supabase Edge Functions instead of running it in the React Native client.

## 🚀 Why Supabase Edge Functions?

- **Server-side execution**: Scraping runs securely on the server, not in the mobile app
- **Native Node.js**: Full access to Node.js modules like Cheerio, Undici, etc.
- **Better performance**: No client-side scraping delays
- **Clean architecture**: Clear separation between client and server
- **Scalability**: Easy to scale and maintain

## 📋 Prerequisites

1. **Supabase CLI** installed: `npm install -g supabase`
2. **Supabase project** created at https://supabase.com
3. **Environment variables** configured

## 🛠️ Setup Steps

### 1. Initialize Supabase (if not already done)

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Initialize functions (if not already done)
supabase functions new scrape-stream
```

### 2. Deploy the Edge Function

The edge function is already created at `supabase/functions/scrape-stream/index.ts`.

```bash
# Deploy the function
supabase functions deploy scrape-stream

# Or deploy all functions
supabase functions deploy
```

### 3. Configure Environment Variables

Set the M3U8 proxy URL in your Supabase project settings:

```bash
# In Supabase Dashboard > Project Settings > Edge Functions
# Add environment variable:
M3U8_PROXY_URL=https://your-proxy-domain.com/api/proxy
```

Or set it directly in the function code.

### 4. Update Client Environment Variables

Make sure your `.env` file has:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 🔧 Client Code Changes

The `usePStream.ts` has been updated to call the Supabase Edge Function instead of running scraping locally. The key changes:

- Removed all local scraping logic
- Added `callScrapeFunction()` that calls the Supabase Edge Function
- Simplified the scrape flow to just make API calls
- Kept manual overrides for fallback

## 🎯 Architecture Overview

```
┌─────────────────┐    HTTP POST     ┌──────────────────────┐
│   React Native  │ ───────────────► │  Supabase Edge Func  │
│     Client      │                  │    (Deno runtime)    │
│                 │ ◄─────────────── │                      │
└─────────────────┘    JSON Response  │  • Full Node.js     │
                                      │  • Cheerio/Undici   │
                                      │  • All providers    │
                                      │  • Server-side      │
                                      └──────────────────────┘
                                               │
                                               ▼
                                      ┌──────────────────────┐
                                      │   Streaming Sources   │
                                      │  • cuevana3, etc.    │
                                      └──────────────────────┘
```

## 🚀 Testing the Setup

### Test the Edge Function directly:

```bash
# Test the function
supabase functions invoke scrape-stream --data '{
  "media": {
    "type": "movie",
    "title": "The Matrix",
    "tmdbId": "603",
    "releaseYear": 1999
  }
}'
```

### Test from the app:

The app will automatically use the edge function when calling `scrape()` from `usePStream()`.

## 🔒 Security Considerations

- **API Keys**: The anon key is public, but edge functions can validate requests
- **Rate Limiting**: Consider adding rate limits to prevent abuse
- **Logging**: Edge functions log to Supabase dashboard
- **CORS**: Already configured for your app's origin

## 🐛 Troubleshooting

### Function fails with "providers-temp not found"
- The edge function imports `@p-stream/providers@3.2.0` from esm.sh
- If the version changes, update the import_map.json file
- Check that the package is still available on npm

### Function times out
- Increase timeout in Supabase dashboard
- Check if scraping sources are responding

### Client gets "Supabase configuration missing"
- Verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set

## 📈 Performance Benefits

- **Faster app startup**: No heavy scraping libraries loaded
- **Better UX**: No client-side scraping delays
- **Server optimization**: Scraping can be cached and optimized
- **Mobile friendly**: Lighter app bundle

## 🎉 Migration Complete!

You've successfully moved from client-side polyfills to a proper server-side architecture. The app will now:

1. ✅ Build without Metro/polyfill issues
2. ✅ Run scraping securely on the server
3. ✅ Provide full functionality across all platforms
4. ✅ Scale better and be easier to maintain
