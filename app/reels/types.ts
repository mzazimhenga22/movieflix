export type FeedReelItem = {
    id: string
    mediaType?: string
    title: string
    docId?: string | null
    videoUrl?: string | null
    coverUrl?: string | null
    liveStreamId?: string | null
    avatar?: string | null
    userId?: string | null
    username?: string | null
    user?: string | null // legacy: some callers still pass username here
    likes?: number
    comments?: any[]
    commentsCount?: number
    likerAvatars?: string[]
    music?: string | null
    musicTrack?: {
        videoId: string
        title: string
        artist: string
        thumbnail: string
        startTime?: number
        duration?: number
    } | null
    headers?: Record<string, string>
    meta?: any
}

export type ReelItem = FeedReelItem | { type: 'ad'; id: string; productId: string }
