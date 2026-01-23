import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { authPromise, firestore } from '../../constants/firebase';
import {
    AchievementProgress,
    BadgeId,
    BadgeProgress,
    BADGES,
    calculateLevel,
    EarnedBadges,
    WatchEvent,
} from './types';

const utcDayKey = (d: Date = new Date()) => d.toISOString().slice(0, 10);

const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
};

const isNightTime = (date: Date): boolean => {
    const hour = date.getHours();
    return hour >= 22 || hour < 5;
};

export const getAchievementProgress = async (uid: string): Promise<AchievementProgress | null> => {
    try {
        const progressRef = doc(firestore, 'users', uid, 'achievements', 'progress');
        const snap = await getDoc(progressRef);
        if (!snap.exists()) return null;
        return snap.data() as AchievementProgress;
    } catch (err) {
        console.error('[achievements] Failed to get progress', err);
        return null;
    }
};

export const getEarnedBadges = async (uid: string): Promise<EarnedBadges | null> => {
    try {
        const badgesRef = doc(firestore, 'users', uid, 'achievements', 'badges');
        const snap = await getDoc(badgesRef);
        if (!snap.exists()) {
            return {
                earnedBadges: {} as Record<BadgeId, BadgeProgress>,
                totalXP: 0,
                level: 1,
            };
        }
        return snap.data() as EarnedBadges;
    } catch (err) {
        console.error('[achievements] Failed to get badges', err);
        return null;
    }
};

const initializeProgress = (): AchievementProgress => ({
    totalMoviesWatched: 0,
    totalWatchTimeMinutes: 0,
    genresWatched: [],
    nightMoviesCount: 0,
    weekendMoviesCount: 0,
    longestStreak: 0,
    currentStreak: 0,
    lastWatchDate: '',
    weeklyWatchDates: [],
});

export const checkAndAwardBadges = async (
    uid: string,
    watchEvent: WatchEvent
): Promise<BadgeId[]> => {
    const newlyEarned: BadgeId[] = [];

    try {
        // Get or create progress document
        const progressRef = doc(firestore, 'users', uid, 'achievements', 'progress');
        const badgesRef = doc(firestore, 'users', uid, 'achievements', 'badges');

        let progress = await getAchievementProgress(uid);
        if (!progress) {
            progress = initializeProgress();
        }

        let badges = await getEarnedBadges(uid);
        if (!badges) {
            badges = {
                earnedBadges: {} as Record<BadgeId, BadgeProgress>,
                totalXP: 0,
                level: 1,
            };
        }

        const today = utcDayKey(watchEvent.completedAt);
        const yesterday = utcDayKey(new Date(watchEvent.completedAt.getTime() - 24 * 60 * 60 * 1000));
        const weekStart = getWeekStart(watchEvent.completedAt);
        const weekStartKey = utcDayKey(weekStart);

        // Check if movie was completed (>90%)
        const completionRate = watchEvent.watchedMinutes / watchEvent.durationMinutes;
        const isCompleted = completionRate >= 0.9;

        // Update progress
        if (isCompleted) {
            progress.totalMoviesWatched += 1;
        }
        progress.totalWatchTimeMinutes += watchEvent.watchedMinutes;

        // Update genres
        for (const genre of watchEvent.genres) {
            if (!progress.genresWatched.includes(genre)) {
                progress.genresWatched.push(genre);
            }
        }

        // Night owl tracking
        if (isNightTime(watchEvent.completedAt) && isCompleted) {
            progress.nightMoviesCount += 1;
        }

        // Weekend warrior tracking
        if (isWeekend(watchEvent.completedAt) && isCompleted) {
            progress.weekendMoviesCount += 1;
        }

        // Streak tracking
        if (progress.lastWatchDate === yesterday) {
            progress.currentStreak += 1;
        } else if (progress.lastWatchDate !== today) {
            progress.currentStreak = 1;
        }
        progress.longestStreak = Math.max(progress.longestStreak, progress.currentStreak);
        progress.lastWatchDate = today;

        // Weekly tracking (for binge master)
        const weeklyDates = progress.weeklyWatchDates.filter(d => d >= weekStartKey);
        if (!weeklyDates.includes(today)) {
            weeklyDates.push(today);
        }
        progress.weeklyWatchDates = weeklyDates;

        // Check each badge
        const checkBadge = (badgeId: BadgeId, currentValue: number, requirement: number): boolean => {
            if (badges!.earnedBadges[badgeId]?.earnedAt) return false; // Already earned
            return currentValue >= requirement;
        };

        // First Watch
        if (checkBadge('first_watch', progress.totalMoviesWatched, 1)) {
            newlyEarned.push('first_watch');
        }

        // Movie Buff
        if (checkBadge('movie_buff', progress.totalMoviesWatched, 10)) {
            newlyEarned.push('movie_buff');
        }

        // Binge Master (5 movies this week)
        const uniqueWatchDaysThisWeek = new Set(weeklyDates).size;
        if (checkBadge('binge_master', uniqueWatchDaysThisWeek, 5)) {
            newlyEarned.push('binge_master');
        }

        // Genre Explorer
        if (checkBadge('genre_explorer', progress.genresWatched.length, 5)) {
            newlyEarned.push('genre_explorer');
        }

        // Night Owl
        if (checkBadge('night_owl', progress.nightMoviesCount, 10)) {
            newlyEarned.push('night_owl');
        }

        // Weekend Warrior
        if (checkBadge('weekend_warrior', progress.weekendMoviesCount, 10)) {
            newlyEarned.push('weekend_warrior');
        }

        // Marathon Runner (3+ hours in one day) - simplified check
        if (checkBadge('marathon_runner', watchEvent.watchedMinutes, 180)) {
            newlyEarned.push('marathon_runner');
        }

        // Completionist
        if (isCompleted && checkBadge('completionist', progress.totalMoviesWatched, 10)) {
            newlyEarned.push('completionist');
        }

        // Streak Champion
        if (checkBadge('streak_champion', progress.currentStreak, 7)) {
            newlyEarned.push('streak_champion');
        }

        // Award new badges
        let xpGained = 0;
        for (const badgeId of newlyEarned) {
            const badge = BADGES.find(b => b.id === badgeId);
            if (badge) {
                xpGained += badge.xp;
                badges.earnedBadges[badgeId] = {
                    earnedAt: Timestamp.now(),
                    progress: 100,
                    currentValue: badge.requirement,
                };
            }
        }

        // Check for Movie Legend (all other badges earned)
        const otherBadgeIds = BADGES.filter(b => b.id !== 'movie_legend').map(b => b.id);
        const allOthersEarned = otherBadgeIds.every(id => badges!.earnedBadges[id]?.earnedAt);
        if (allOthersEarned && !badges.earnedBadges['movie_legend']?.earnedAt) {
            newlyEarned.push('movie_legend');
            const legendBadge = BADGES.find(b => b.id === 'movie_legend');
            if (legendBadge) {
                xpGained += legendBadge.xp;
                badges.earnedBadges['movie_legend'] = {
                    earnedAt: Timestamp.now(),
                    progress: 100,
                    currentValue: 9,
                };
            }
        }

        // Update totals
        badges.totalXP += xpGained;
        badges.level = calculateLevel(badges.totalXP);

        // Update badge progress for unearned badges
        for (const badge of BADGES) {
            if (badges.earnedBadges[badge.id]?.earnedAt) continue;

            let currentValue = 0;
            switch (badge.id) {
                case 'first_watch':
                case 'movie_buff':
                case 'completionist':
                    currentValue = progress.totalMoviesWatched;
                    break;
                case 'binge_master':
                    currentValue = uniqueWatchDaysThisWeek;
                    break;
                case 'genre_explorer':
                    currentValue = progress.genresWatched.length;
                    break;
                case 'night_owl':
                    currentValue = progress.nightMoviesCount;
                    break;
                case 'weekend_warrior':
                    currentValue = progress.weekendMoviesCount;
                    break;
                case 'marathon_runner':
                    currentValue = Math.min(watchEvent.watchedMinutes, 180);
                    break;
                case 'streak_champion':
                    currentValue = progress.currentStreak;
                    break;
                case 'movie_legend':
                    currentValue = otherBadgeIds.filter(id => badges!.earnedBadges[id]?.earnedAt).length;
                    break;
            }

            badges.earnedBadges[badge.id] = {
                earnedAt: null,
                progress: Math.min(100, Math.round((currentValue / badge.requirement) * 100)),
                currentValue,
            };
        }

        // Save to Firestore
        await setDoc(progressRef, { ...progress, updatedAt: serverTimestamp() }, { merge: true });
        await setDoc(badgesRef, { ...badges, updatedAt: serverTimestamp() }, { merge: true });

        return newlyEarned;
    } catch (err) {
        console.error('[achievements] Failed to check and award badges', err);
        return [];
    }
};

export const getCurrentUserId = async (): Promise<string | null> => {
    try {
        const auth = await authPromise;
        return auth.currentUser?.uid ?? null;
    } catch {
        return null;
    }
};
