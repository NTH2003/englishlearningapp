import {getLearningProgress, saveLearningProgress} from './storageService';
import {getAllVocabulary} from './vocabularyService';

const DEFAULT_GOAL_WORDS = 10;
const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

function _dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _ensureProgressShape(progress) {
  const p = progress && typeof progress === 'object' ? {...progress} : {};
  if (!Array.isArray(p.wordsLearned)) p.wordsLearned = [];
  if (!Array.isArray(p.lessonsCompleted)) p.lessonsCompleted = [];
  if (!Array.isArray(p.videosWatched)) p.videosWatched = [];
  if (!Array.isArray(p.favoriteWords)) p.favoriteWords = [];
  if (!p.wordStats || typeof p.wordStats !== 'object') p.wordStats = {};
  if (!p.daily || typeof p.daily !== 'object') {
    p.daily = {dateKey: _dateKey(), goalWords: DEFAULT_GOAL_WORDS, doneWords: 0};
  }
  return p;
}

function _ensureTodayDaily(p) {
  const today = _dateKey();
  const daily = p.daily || {};
  const goalWords = Number(daily.goalWords) > 0 ? Number(daily.goalWords) : DEFAULT_GOAL_WORDS;
  if (daily.dateKey !== today) {
    p.daily = {dateKey: today, goalWords, doneWords: 0};
  } else {
    p.daily = {
      dateKey: today,
      goalWords,
      doneWords: Math.max(0, Number(daily.doneWords) || 0),
    };
  }
}

function _defaultWordStat(nowMs) {
  return {
    ease: 2.5,
    intervalDays: 1,
    dueAt: nowMs,
    lastReviewedAt: null,
    correctStreak: 0,
    wrongCount: 0,
  };
}

function _hydrateWordStatsForLearned(p) {
  const now = Date.now();
  const wordStats = p.wordStats || {};
  for (const id of p.wordsLearned) {
    const key = String(id);
    if (!wordStats[key]) {
      wordStats[key] = _defaultWordStat(now);
    }
  }
  p.wordStats = wordStats;
}

function _isDue(stat, nowMs) {
  const dueAt = Number(stat?.dueAt);
  if (!Number.isFinite(dueAt)) return false;
  return dueAt <= nowMs;
}

function _computeNextStat(prev, rating, nowMs) {
  const cur = prev && typeof prev === 'object' ? {...prev} : _defaultWordStat(nowMs);
  const ease0 = Number(cur.ease) || 2.5;
  const int0 = Math.max(1, Number(cur.intervalDays) || 1);

  if (rating === 'hard') {
    const ease = Math.max(1.3, ease0 - 0.2);
    return {
      ...cur,
      ease,
      intervalDays: 1,
      dueAt: nowMs + 2 * MS_HOUR,
      lastReviewedAt: nowMs,
      correctStreak: 0,
      wrongCount: (Number(cur.wrongCount) || 0) + 1,
    };
  }

  if (rating === 'easy') {
    const ease = Math.min(3.0, ease0 + 0.15);
    const intervalDays = Math.max(2, Math.round(int0 * ease + 1));
    return {
      ...cur,
      ease,
      intervalDays,
      dueAt: nowMs + intervalDays * MS_DAY,
      lastReviewedAt: nowMs,
      correctStreak: (Number(cur.correctStreak) || 0) + 1,
    };
  }

  // good
  const ease = ease0;
  const intervalDays = Math.max(2, Math.round(int0 * ease));
  return {
    ...cur,
    ease,
    intervalDays,
    dueAt: nowMs + intervalDays * MS_DAY,
    lastReviewedAt: nowMs,
    correctStreak: (Number(cur.correctStreak) || 0) + 1,
  };
}

export async function getReviewDashboard() {
  const raw = await getLearningProgress();
  const p = _ensureProgressShape(raw);
  _ensureTodayDaily(p);
  _hydrateWordStatsForLearned(p);

  const now = Date.now();
  const stats = p.wordStats || {};
  let dueCount = 0;
  for (const id of p.wordsLearned) {
    const s = stats[String(id)];
    if (_isDue(s, now)) dueCount++;
  }

  return {
    dueCount,
    goalWords: p.daily.goalWords || DEFAULT_GOAL_WORDS,
    doneWords: p.daily.doneWords || 0,
  };
}

export async function getDueWordsForToday({limit} = {}) {
  const raw = await getLearningProgress();
  const p = _ensureProgressShape(raw);
  _ensureTodayDaily(p);
  _hydrateWordStatsForLearned(p);

  const now = Date.now();
  const stats = p.wordStats || {};
  const learnedIds = (p.wordsLearned || []).map(x => String(x));

  const dueIds = learnedIds.filter(id => _isDue(stats[id], now));
  const dueCount = dueIds.length;

  const goalWords = p.daily.goalWords || DEFAULT_GOAL_WORDS;
  const doneWords = p.daily.doneWords || 0;
  const remaining = Math.max(0, goalWords - doneWords);
  const take = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : Math.max(5, remaining || 5);

  const idsToUse = dueIds.slice(0, take);
  const vocab = getAllVocabulary();
  const byId = new Map(vocab.map(w => [String(w.id), w]));
  const words = idsToUse.map(id => byId.get(id)).filter(Boolean);

  return {words, dueCount, goalWords, doneWords};
}

export async function recordWordReview(wordId, rating = 'good') {
  const id = String(wordId);
  const raw = await getLearningProgress();
  const p = _ensureProgressShape(raw);
  _ensureTodayDaily(p);

  const now = Date.now();
  if (!p.wordStats[id]) {
    p.wordStats[id] = _defaultWordStat(now);
  }
  p.wordStats[id] = _computeNextStat(p.wordStats[id], rating, now);

  p.daily.doneWords = Math.max(0, Number(p.daily.doneWords) || 0) + 1;

  await saveLearningProgress(p);
  return {ok: true};
}

