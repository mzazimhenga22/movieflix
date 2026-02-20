import { Timestamp } from 'firebase/firestore';

export type BadgeId =
    | 'first_watch'
    | 'movie_buff'
    | 'binge_master'
    | 'genre_explorer'
    | 'night_owl'
    | 'weekend_warrior'
    | 'marathon_runner'
    | 'completionist'
    | 'streak_champion'
    | 'movie_legend';

export interface Badge {
    id: BadgeId;
    name: string;
    description: string;
    icon: string;
    xp: number;
    requirement: number;
    requirementType: 'count' | 'streak' | 'time' | 'genres' | 'special';
}

export interface BadgeProgress {
    earnedAt?: Timestamp | null;
    progress: number; // 0-100
    currentValue: number;
}

export interface AchievementProgress {
    totalMoviesWatched: number;
    totalWatchTimeMinutes: number;
    genresWatched: string[];
    nightMoviesCount: number;
    weekendMoviesCount: number;
    longestStreak: number;
    currentStreak: number;
    lastWatchDate: string;
    weeklyWatchDates: string[];
    updatedAt?: Timestamp;
}

export interface EarnedBadges {
    earnedBadges: Record<BadgeId, BadgeProgress>;
    totalXP: number;
    level: number;
    updatedAt?: Timestamp;
}

export interface WatchEvent {
    tmdbId: number;
    title: string;
    mediaType: 'movie' | 'tv';
    durationMinutes: number;
    watchedMinutes: number;
    genres: string[];
    completedAt: Date;
}

export const BADGES: Badge[] = [
    {
        id: 'first_watch',
        name: 'First Watch',
        description: 'Watch your first movie',
        icon: '🎬',
        xp: 10,
        requirement: 1,
        requirementType: 'count',
    },
    {
        id: 'movie_buff',
        name: 'Movie Buff',
        description: 'Watch 10 movies',
        icon: '🎥',
        xp: 50,
        requirement: 10,
        requirementType: 'count',
    },
    {
        id: 'binge_master',
        name: 'Binge Master',
        description: 'Watch 5 movies in one week',
        icon: '🔥',
        xp: 75,
        requirement: 5,
        requirementType: 'count',
    },
    {
        id: 'genre_explorer',
        name: 'Genre Explorer',
        description: 'Watch movies from 5 different genres',
        icon: '🎭',
        xp: 60,
        requirement: 5,
        requirementType: 'genres',
    },
    {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Watch 10 movies after 10pm',
        icon: '🦉',
        xp: 40,
        requirement: 10,
        requirementType: 'count',
    },
    {
        id: 'weekend_warrior',
        name: 'Weekend Warrior',
        description: 'Watch 10 movies on weekends',
        icon: '🏆',
        xp: 40,
        requirement: 10,
        requirementType: 'count',
    },
    {
        id: 'marathon_runner',
        name: 'Marathon Runner',
        description: 'Watch 3+ hours in one day',
        icon: '🏃',
        xp: 80,
        requirement: 180,
        requirementType: 'time',
    },
    {
        id: 'completionist',
        name: 'Completionist',
        description: 'Finish 10 movies (watched >90%)',
        icon: '✅',
        xp: 50,
        requirement: 10,
        requirementType: 'count',
    },
    {
        id: 'streak_champion',
        name: 'Streak Champion',
        description: 'Maintain a 7-day watching streak',
        icon: '🔥',
        xp: 100,
        requirement: 7,
        requirementType: 'streak',
    },
    {
        id: 'movie_legend',
        name: 'Movie Legend',
        description: 'Earn all other badges',
        icon: '👑',
        xp: 200,
        requirement: 9,
        requirementType: 'special',
    },
];

export const XP_PER_LEVEL = 100;

export const calculateLevel = (xp: number): number => {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
};

export const xpForNextLevel = (currentXp: number): { current: number; needed: number } => {
    const level = calculateLevel(currentXp);
    const xpForCurrentLevel = (level - 1) * XP_PER_LEVEL;
    const xpIntoCurrentLevel = currentXp - xpForCurrentLevel;
    return { current: xpIntoCurrentLevel, needed: XP_PER_LEVEL };
};
