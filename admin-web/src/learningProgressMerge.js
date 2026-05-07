/**
 * Bản rút gọn từ app mobile (`progressMerge.js`) — gộp tiến độ trong document users/{uid}.
 */

export const DATA_FIELD = 'data';
export const LEARNING_PROGRESS_KEY = 'learningProgress';
export const VOCABULARY_PROGRESS_KEY = 'vocabularyProgress';

function normalizeIdListLike(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x)).filter(Boolean))];
  }
  if (raw && typeof raw === 'object') {
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
      if (v === false || v == null) continue;
      const id = String(k).trim();
      if (id) out.push(id);
    }
    return [...new Set(out)];
  }
  return [];
}

function deriveWordsLearnedBackup(base) {
  const out = new Set();
  if (!base || typeof base !== 'object') return [];
  const wl = normalizeIdListLike(base.wordsLearned);
  wl.forEach((id) => out.add(String(id)));
  const fsr =
    base.flashcardSelfReport && typeof base.flashcardSelfReport === 'object'
      ? base.flashcardSelfReport
      : {};
  for (const [k, v] of Object.entries(fsr)) {
    if (v === true) out.add(String(k));
  }
  const ws = base.wordStats && typeof base.wordStats === 'object' ? base.wordStats : {};
  for (const k of Object.keys(ws)) {
    out.add(String(k));
  }
  return [...out];
}

/**
 * @param {object|null|undefined} userDoc - document Firestore users/{uid}
 * @returns {object|null}
 */
export function combineLearningProgressFromFirestore(userDoc) {
  const root = userDoc && typeof userDoc === 'object' ? userDoc : {};
  const inner = root?.[DATA_FIELD];
  const dataObj = inner && typeof inner === 'object' ? inner : null;
  const lp =
    dataObj?.[LEARNING_PROGRESS_KEY] ?? root?.[LEARNING_PROGRESS_KEY] ?? null;
  const vp =
    dataObj?.[VOCABULARY_PROGRESS_KEY] ?? root?.[VOCABULARY_PROGRESS_KEY] ?? null;

  const lpLegacyRootLike =
    lp == null &&
    vp == null &&
    (Array.isArray(root?.wordsLearned) ||
      Array.isArray(root?.lessonsCompleted) ||
      Array.isArray(root?.videosWatched) ||
      Array.isArray(root?.dialoguesCompleted) ||
      String(root?.level || '').trim() !== '' ||
      Number(root?.totalXP) > 0 ||
      (root?.wordStats && typeof root.wordStats === 'object'));

  const lpLegacyDataFieldLike =
    lp == null &&
    vp == null &&
    !!dataObj &&
    (Array.isArray(dataObj?.wordsLearned) ||
      Array.isArray(dataObj?.lessonsCompleted) ||
      Array.isArray(dataObj?.videosWatched) ||
      Array.isArray(dataObj?.dialoguesCompleted) ||
      String(dataObj?.level || '').trim() !== '' ||
      Number(dataObj?.totalXP) > 0 ||
      (dataObj?.wordStats && typeof dataObj.wordStats === 'object'));

  const lpFinal = lpLegacyRootLike ? root : lpLegacyDataFieldLike ? dataObj : lp;
  const vpFinal = vp;
  if (lpFinal == null && vpFinal == null) return null;

  const baseLp = lpFinal && typeof lpFinal === 'object' ? lpFinal : {};
  const baseVpRaw = vpFinal && typeof vpFinal === 'object' ? vpFinal : null;
  const baseVp =
    baseVpRaw && Object.keys(baseVpRaw).length > 0 ? baseVpRaw : null;

  if (!baseVp) {
    if (!Object.keys(baseLp).length) return null;
    const out = {...baseLp};
    out.wordsLearned = deriveWordsLearnedBackup(out);
    out.lessonsCompleted = normalizeIdListLike(out.lessonsCompleted);
    out.videosWatched = normalizeIdListLike(out.videosWatched);
    out.dialoguesCompleted = normalizeIdListLike(out.dialoguesCompleted);
    out.reviewWrongWordIds = normalizeIdListLike(out.reviewWrongWordIds);
    out.weakWordIds = normalizeIdListLike(out.weakWordIds);
    out.totalXP = Math.max(
      0,
      Number(out.totalXP) || Number(out.totalXp) || Number(out.xp) || 0,
    );
    if ('dialogueProgress' in out) delete out.dialogueProgress;
    return out;
  }

  const core = {...baseLp};
  delete core.wordsLearned;
  delete core.wordStats;
  delete core.flashcardSelfReport;
  delete core.daily;
  delete core.reviewWrongWordIds;
  delete core.weakWordIds;

  const out = {
    ...core,
    wordsLearned:
      normalizeIdListLike(baseVp.wordsLearned).length > 0
        ? normalizeIdListLike(baseVp.wordsLearned)
        : normalizeIdListLike(baseLp.wordsLearned),
    wordStats:
      baseVp.wordStats !== undefined
        ? baseVp.wordStats && typeof baseVp.wordStats === 'object'
          ? baseVp.wordStats
          : {}
        : baseLp.wordStats && typeof baseLp.wordStats === 'object'
          ? baseLp.wordStats
          : {},
    flashcardSelfReport:
      baseVp.flashcardSelfReport !== undefined
        ? baseVp.flashcardSelfReport &&
          typeof baseVp.flashcardSelfReport === 'object'
          ? baseVp.flashcardSelfReport
          : {}
        : baseLp.flashcardSelfReport &&
            typeof baseLp.flashcardSelfReport === 'object'
          ? baseLp.flashcardSelfReport
          : {},
    daily:
      baseVp.daily !== undefined
        ? baseVp.daily && typeof baseVp.daily === 'object'
          ? baseVp.daily
          : {}
        : baseLp.daily && typeof baseLp.daily === 'object'
          ? baseLp.daily
          : {},
    reviewWrongWordIds:
      baseVp.reviewWrongWordIds !== undefined
        ? normalizeIdListLike(baseVp.reviewWrongWordIds)
        : normalizeIdListLike(baseLp.reviewWrongWordIds),
    weakWordIds:
      baseVp.weakWordIds !== undefined
        ? normalizeIdListLike(baseVp.weakWordIds)
        : normalizeIdListLike(baseLp.weakWordIds),
  };
  const derivedWords = deriveWordsLearnedBackup({
    ...baseLp,
    ...baseVp,
    wordsLearned:
      normalizeIdListLike(baseVp.wordsLearned).length > 0
        ? normalizeIdListLike(baseVp.wordsLearned)
        : normalizeIdListLike(baseLp.wordsLearned),
  });
  out.wordsLearned = derivedWords;
  out.lessonsCompleted = normalizeIdListLike(out.lessonsCompleted);
  out.videosWatched = normalizeIdListLike(out.videosWatched);
  out.dialoguesCompleted = normalizeIdListLike(out.dialoguesCompleted);
  out.totalXP = Math.max(
    0,
    Number(out.totalXP) || Number(baseLp.totalXp) || Number(baseLp.xp) || 0,
  );
  if ('dialogueProgress' in out) delete out.dialogueProgress;
  return out;
}
