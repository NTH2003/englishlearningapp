export const XP = {
  NEW_WORD: 10,
  REVIEW_HARD: 1,
  REVIEW_GOOD: 2,
  REVIEW_EASY: 3,
  VIDEO_WATCH_COMPLETE: 12,
  VIDEO_PRACTICE_START: 6,
  VIDEO_WORD_INTERACTION: 2,
  QUICK_CHALLENGE_FINISH: 8,
};

// Hệ thống level tối đa 10 cấp.
export const LEVELS = [
  {name: 'Cấp 1', minXP: 0, nextMinXP: 50, allowedWordLevels: ['Beginner'], allowedTopicMainLevels: ['Beginner']},
  {name: 'Cấp 2', minXP: 50, nextMinXP: 120, allowedWordLevels: ['Beginner'], allowedTopicMainLevels: ['Beginner']},
  {name: 'Cấp 3', minXP: 120, nextMinXP: 200, allowedWordLevels: ['Beginner'], allowedTopicMainLevels: ['Beginner']},
  {name: 'Cấp 4', minXP: 200, nextMinXP: 300, allowedWordLevels: ['Beginner'], allowedTopicMainLevels: ['Beginner']},
  {name: 'Cấp 5', minXP: 300, nextMinXP: 420, allowedWordLevels: ['Intermediate'], allowedTopicMainLevels: ['Intermediate']},
  {name: 'Cấp 6', minXP: 420, nextMinXP: 560, allowedWordLevels: ['Intermediate'], allowedTopicMainLevels: ['Intermediate']},
  {name: 'Cấp 7', minXP: 560, nextMinXP: 720, allowedWordLevels: ['Intermediate'], allowedTopicMainLevels: ['Intermediate']},
  // Từ cấp 8 trở đi mở toàn bộ để tránh lọc rỗng nội dung.
  {name: 'Cấp 8', minXP: 720, nextMinXP: 900, allowedWordLevels: ['Beginner', 'Intermediate'], allowedTopicMainLevels: ['Beginner', 'Intermediate']},
  {name: 'Cấp 9', minXP: 900, nextMinXP: 1100, allowedWordLevels: ['Beginner', 'Intermediate'], allowedTopicMainLevels: ['Beginner', 'Intermediate']},
  {name: 'Cấp 10', minXP: 1100, nextMinXP: null, allowedWordLevels: ['Beginner', 'Intermediate'], allowedTopicMainLevels: ['Beginner', 'Intermediate']},
];

export function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(Math.max(x, min), max);
}

export function getLevelInfo(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  let levelIndex = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) {
      levelIndex = i;
      break;
    }
  }
  const cur = LEVELS[levelIndex];
  const next = levelIndex + 1 < LEVELS.length ? LEVELS[levelIndex + 1] : null;

  const minXP = cur.minXP;
  const maxXP = cur.nextMinXP ?? (next ? next.minXP : minXP + 300);
  const range = Math.max(1, (maxXP - minXP) || 1);
  const inLevelXP = clamp(xp - minXP, 0, range);
  const progressPercent = clamp(Math.round((inLevelXP / range) * 100), 0, 100);
  const toNextXP = next ? Math.max(0, next.minXP - xp) : 0;

  return {
    totalXP: xp,
    levelName: cur.name,
    levelIndex,
    minXP,
    maxXP,
    nextLevelName: next?.name || null,
    nextMinXP: next?.minXP ?? null,
    inLevelXP,
    progressPercent,
    toNextXP,
    allowedWordLevels: cur.allowedWordLevels,
    allowedTopicMainLevels: cur.allowedTopicMainLevels,
    isMaxLevel: !next,
  };
}

export function computeLevelName(totalXP) {
  return getLevelInfo(totalXP).levelName;
}

export function getAllowedWordLevelsForUserLevel(userLevelName) {
  const name = String(userLevelName || '').trim();
  const found = LEVELS.find((l) => l.name === name);
  return found ? found.allowedWordLevels : null;
}

export function getAllowedTopicMainLevelsForUserLevel(userLevelName) {
  const name = String(userLevelName || '').trim();
  const found = LEVELS.find((l) => l.name === name);
  return found ? found.allowedTopicMainLevels : null;
}

