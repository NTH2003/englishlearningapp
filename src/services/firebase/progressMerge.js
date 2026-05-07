import firestore from '@react-native-firebase/firestore';
import {DATA_FIELD, LEARNING_PROGRESS_KEY, VOCABULARY_PROGRESS_KEY} from './constants';

/**
 * @param {object|null|undefined} full
 * @returns {{ core: object, vocabularyProgress: object }}
 */
/** Firestore / RN Firebase không chấp nhận giá trị undefined trong object — gây lỗi ghi, tiến độ không lưu. */
function stripUndefinedDeep(val) {
  if (val === undefined) {
    return undefined;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .map((x) => stripUndefinedDeep(x))
      .filter((x) => x !== undefined);
  }
  const o = {};
  for (const k of Object.keys(val)) {
    const v = stripUndefinedDeep(val[k]);
    if (v !== undefined) {
      o[k] = v;
    }
  }
  return o;
}

function splitLearningProgressForFirestore(full) {
  const f = full && typeof full === 'object' ? full : {};
  const {
    wordsLearned,
    wordStats,
    flashcardSelfReport,
    daily,
    reviewWrongWordIds,
    weakWordIds,
    ...core
  } = f;
  return {
    core,
    vocabularyProgress: {
      wordsLearned: Array.isArray(wordsLearned) ? wordsLearned : [],
      wordStats: wordStats && typeof wordStats === 'object' ? wordStats : {},
      flashcardSelfReport:
        flashcardSelfReport && typeof flashcardSelfReport === 'object'
          ? flashcardSelfReport
          : {},
      daily: daily && typeof daily === 'object' ? daily : {},
      reviewWrongWordIds: Array.isArray(reviewWrongWordIds)
        ? reviewWrongWordIds
        : [],
      weakWordIds: Array.isArray(weakWordIds) ? weakWordIds : [],
    },
  };
}

function normalizeIdListLike(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x)).filter(Boolean))];
  }
  if (raw && typeof raw === 'object') {
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
      // Legacy map style: { "<id>": true } hoặc { "<id>": { ... } }
      if (v === false || v == null) continue;
      const id = String(k).trim();
      if (id) out.push(id);
    }
    return [...new Set(out)];
  }
  return [];
}

/**
 * Gộp topicPracticeStats khi nhiều lần save xen kẽ (XP vs hoàn thành mode) — tránh payload stale xoá modesCompleted.
 */
function mergeTopicPracticeStatsForWrite(exRaw, incRaw) {
  const ex = exRaw && typeof exRaw === 'object' ? exRaw : {};
  const inc = incRaw && typeof incRaw === 'object' ? incRaw : {};
  const keys = new Set([...Object.keys(ex), ...Object.keys(inc)]);
  const out = {};
  for (const tid of keys) {
    const er = ex[tid] && typeof ex[tid] === 'object' ? ex[tid] : {};
    const ir = inc[tid] && typeof inc[tid] === 'object' ? inc[tid] : {};
    const modes = [
      ...(Array.isArray(er.modesCompleted) ? er.modesCompleted : []),
      ...(Array.isArray(ir.modesCompleted) ? ir.modesCompleted : []),
    ];
    const modeSet = new Set(
      modes.map((m) => String(m || '').trim().toLowerCase()).filter(Boolean),
    );
    const updatedAt = Math.max(
      Number(er.updatedAt) || 0,
      Number(ir.updatedAt) || 0,
    );
    out[tid] = {
      ...er,
      ...ir,
      modesCompleted: [...modeSet],
      ...(updatedAt > 0 ? {updatedAt} : {}),
    };
  }
  return out;
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
 * Gộp bản trên server (existing) với bản client gửi lên (incoming) trong transaction.
 * Không dùng `undefined` từ incoming để ghi đè wordsLearned (tránh mất từ đã học khi save partial).
 */
function mergeProgressForWrite(existing, incoming) {
  const ex = existing && typeof existing === 'object' ? existing : {};
  const inc = incoming && typeof incoming === 'object' ? incoming : {};
  const incomingLooksBlank =
    !hasMeaningfulProgress(inc) &&
    Array.isArray(inc.wordsLearned) &&
    Array.isArray(inc.lessonsCompleted) &&
    Array.isArray(inc.videosWatched);
  if (incomingLooksBlank && hasMeaningfulProgress(ex)) {
    // Tránh ghi đè dữ liệu thật bằng payload rỗng khi client đọc lỗi/race rồi save defaults.
    console.warn(
      '[progressMerge] Skip overwrite due to blank incoming progress payload',
    );
    return {...ex};
  }
  const defaults = {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    dialoguesCompleted: [],
  };
  const merged = {...defaults, ...ex, ...inc};
  // Không giữ lịch sử chat dài trong learningProgress (được tách sang subcollection riêng).
  if (merged && typeof merged === 'object' && 'dialogueProgress' in merged) {
    delete merged.dialogueProgress;
  }
  if (merged && typeof merged === 'object' && 'favoriteWords' in merged) {
    delete merged.favoriteWords;
  }

  const efs =
    ex.flashcardSelfReport && typeof ex.flashcardSelfReport === 'object'
      ? ex.flashcardSelfReport
      : {};
  const ifs =
    inc.flashcardSelfReport && typeof inc.flashcardSelfReport === 'object'
      ? inc.flashcardSelfReport
      : {};
  delete merged.flashcardSelfReport;
  merged.flashcardSelfReport = {...efs, ...ifs};

  merged.wordStats = {
    ...(typeof ex.wordStats === 'object' ? ex.wordStats : {}),
    ...(typeof inc.wordStats === 'object' ? inc.wordStats : {}),
  };

  if (Array.isArray(inc.wordsLearned)) {
    merged.wordsLearned = inc.wordsLearned;
  } else {
    merged.wordsLearned = Array.isArray(ex.wordsLearned) ? ex.wordsLearned : [];
  }

  if (Array.isArray(inc.reviewWrongWordIds)) {
    merged.reviewWrongWordIds = inc.reviewWrongWordIds;
  } else {
    merged.reviewWrongWordIds = Array.isArray(ex.reviewWrongWordIds)
      ? ex.reviewWrongWordIds
      : [];
  }

  if (Array.isArray(inc.weakWordIds)) {
    merged.weakWordIds = inc.weakWordIds;
  } else {
    merged.weakWordIds = Array.isArray(ex.weakWordIds) ? ex.weakWordIds : [];
  }

  if (
    inc.daily &&
    typeof inc.daily === 'object' &&
    Object.keys(inc.daily).length > 0
  ) {
    merged.daily = inc.daily;
  } else if (ex.daily && typeof ex.daily === 'object') {
    merged.daily = ex.daily;
  }

  merged.videoViewCounts = {
    ...(typeof ex.videoViewCounts === 'object' ? ex.videoViewCounts : {}),
    ...(typeof inc.videoViewCounts === 'object' ? inc.videoViewCounts : {}),
  };

  merged.topicPracticeStats = mergeTopicPracticeStatsForWrite(
    ex.topicPracticeStats,
    inc.topicPracticeStats,
  );

  return merged;
}

/**
 * Gộp learningProgress + vocabularyProgress (tương thích bản cũ: mọi thứ nằm trong learningProgress).
 * @param {object|null|undefined} userDoc - toàn bộ document users/{uid}
 */
function combineLearningProgressFromFirestore(userDoc) {
  const root = userDoc && typeof userDoc === 'object' ? userDoc : {};
  const inner = root?.[DATA_FIELD];
  const dataObj = inner && typeof inner === 'object' ? inner : null;
  const lp =
    dataObj?.[LEARNING_PROGRESS_KEY] ??
    root?.[LEARNING_PROGRESS_KEY] ??
    null;
  const vp =
    dataObj?.[VOCABULARY_PROGRESS_KEY] ??
    root?.[VOCABULARY_PROGRESS_KEY] ??
    null;
  // Legacy very old shape: fields nằm thẳng ở root document.
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
  // Legacy shape #2: fields progress nằm trực tiếp trong `data` (không có `learningProgress` wrapper).
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
  /** `{}` trên Firestore không phải “đã tách vp” — nếu xử lý như có vp sẽ mất wordsLearned trong learningProgress cũ. */
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
    const legacyXp = Math.max(
      0,
      Number(out.totalXP) || Number(out.totalXp) || Number(out.xp) || 0,
    );
    out.totalXP = legacyXp;
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

function hasMeaningfulProgress(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const wordsLearnedLen = Array.isArray(obj.wordsLearned) ? obj.wordsLearned.length : 0;
  const lessonsLen = Array.isArray(obj.lessonsCompleted) ? obj.lessonsCompleted.length : 0;
  const videosLen = Array.isArray(obj.videosWatched) ? obj.videosWatched.length : 0;
  const dialoguesLen = Array.isArray(obj.dialoguesCompleted)
    ? obj.dialoguesCompleted.length
    : 0;
  const wrongLen = Array.isArray(obj.reviewWrongWordIds)
    ? obj.reviewWrongWordIds.length
    : 0;
  const weakLen = Array.isArray(obj.weakWordIds) ? obj.weakWordIds.length : 0;
  const xp = Math.max(0, Number(obj.totalXP) || Number(obj.totalXp) || Number(obj.xp) || 0);
  const hasWordStats =
    obj.wordStats && typeof obj.wordStats === 'object'
      ? Object.keys(obj.wordStats).length > 0
      : false;
  const hasFlashcard =
    obj.flashcardSelfReport && typeof obj.flashcardSelfReport === 'object'
      ? Object.keys(obj.flashcardSelfReport).length > 0
      : false;
  const hasVideoViews =
    obj.videoViewCounts && typeof obj.videoViewCounts === 'object'
      ? Object.keys(obj.videoViewCounts).length > 0
      : false;
  const hasDialogueStats =
    obj.dialogueStats && typeof obj.dialogueStats === 'object'
      ? Object.keys(obj.dialogueStats).length > 0
      : false;
  const hasXpFlags =
    obj.xpEventFlags && typeof obj.xpEventFlags === 'object'
      ? Object.keys(obj.xpEventFlags).length > 0
      : false;
  const hasDailyProgress =
    obj.daily && typeof obj.daily === 'object'
      ? Object.keys(obj.daily).length > 0
      : false;
  const levelLabel = String(obj.level || '').trim().toLowerCase();
  const parsedLevelNumMatch = levelLabel.match(/(\d+)/);
  const parsedLevelNum = parsedLevelNumMatch ? Number(parsedLevelNumMatch[1]) || 0 : 0;
  const hasLegacyLevelOnly =
    levelLabel.length > 0 &&
    levelLabel !== 'sơ cấp' &&
    levelLabel !== 'so cap' &&
    parsedLevelNum > 1;
  return (
    wordsLearnedLen > 0 ||
    lessonsLen > 0 ||
    videosLen > 0 ||
    dialoguesLen > 0 ||
    wrongLen > 0 ||
    weakLen > 0 ||
    xp > 0 ||
    hasWordStats ||
    hasFlashcard ||
    hasVideoViews ||
    hasDialogueStats ||
    hasXpFlags ||
    hasDailyProgress ||
    hasLegacyLevelOnly
  );
}

function uniqStringArray(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x)))];
}

function mergeProgressConservative(a, b) {
  const x = a && typeof a === 'object' ? a : {};
  const y = b && typeof b === 'object' ? b : {};
  const out = {
    ...x,
    ...y,
    wordsLearned: uniqStringArray([...(x.wordsLearned || []), ...(y.wordsLearned || [])]),
    lessonsCompleted: uniqStringArray([
      ...(x.lessonsCompleted || []),
      ...(y.lessonsCompleted || []),
    ]),
    videosWatched: uniqStringArray([...(x.videosWatched || []), ...(y.videosWatched || [])]),
    dialoguesCompleted: uniqStringArray([
      ...(x.dialoguesCompleted || []),
      ...(y.dialoguesCompleted || []),
    ]),
    reviewWrongWordIds: uniqStringArray([
      ...(x.reviewWrongWordIds || []),
      ...(y.reviewWrongWordIds || []),
    ]),
    weakWordIds: uniqStringArray([...(x.weakWordIds || []), ...(y.weakWordIds || [])]),
    wordStats: {
      ...(x.wordStats && typeof x.wordStats === 'object' ? x.wordStats : {}),
      ...(y.wordStats && typeof y.wordStats === 'object' ? y.wordStats : {}),
    },
    flashcardSelfReport: {
      ...(x.flashcardSelfReport && typeof x.flashcardSelfReport === 'object'
        ? x.flashcardSelfReport
        : {}),
      ...(y.flashcardSelfReport && typeof y.flashcardSelfReport === 'object'
        ? y.flashcardSelfReport
        : {}),
    },
    videoViewCounts: {
      ...(x.videoViewCounts && typeof x.videoViewCounts === 'object'
        ? x.videoViewCounts
        : {}),
      ...(y.videoViewCounts && typeof y.videoViewCounts === 'object'
        ? y.videoViewCounts
        : {}),
    },
    topicPracticeStats: mergeTopicPracticeStatsForWrite(
      x.topicPracticeStats,
      y.topicPracticeStats,
    ),
  };
  const xpX = Math.max(0, Number(x.totalXP) || 0);
  const xpY = Math.max(0, Number(y.totalXP) || 0);
  out.totalXP = Math.max(xpX, xpY);
  if (!String(out.level || '').trim()) {
    out.level = xpY >= xpX ? y.level : x.level;
  }
  return out;
}

function buildLegacyProgressCleanupPatch(root) {
  const patch = {};
  const lp = root?.[DATA_FIELD]?.[LEARNING_PROGRESS_KEY];
  if (lp && typeof lp === 'object') {
    if ('dialogueProgress' in lp) {
      patch[`${DATA_FIELD}.${LEARNING_PROGRESS_KEY}.dialogueProgress`] =
        firestore.FieldValue.delete();
    }
    if ('messages' in lp) {
      patch[`${DATA_FIELD}.${LEARNING_PROGRESS_KEY}.messages`] =
        firestore.FieldValue.delete();
    }
  }
  const dataObj = root?.[DATA_FIELD];
  if (dataObj && typeof dataObj === 'object') {
    if ('dialogueProgress' in dataObj) {
      patch[`${DATA_FIELD}.dialogueProgress`] = firestore.FieldValue.delete();
    }
  }
  if (root && typeof root === 'object') {
    if ('dialogueProgress' in root) {
      patch.dialogueProgress = firestore.FieldValue.delete();
    }
  }
  return patch;
}

function buildUserProgressFieldsCleanupPatch(root) {
  const patch = {};
  const hasSafeShape =
    !!root &&
    typeof root === 'object' &&
    !!root?.[DATA_FIELD] &&
    typeof root[DATA_FIELD] === 'object';
  if (!hasSafeShape) {
    return patch;
  }
  const dataObj = root?.[DATA_FIELD];
  if (dataObj && typeof dataObj === 'object') {
    if (LEARNING_PROGRESS_KEY in dataObj) {
      console.warn(
        '[progressMerge] Cleanup legacy data.learningProgress field',
      );
      patch[`${DATA_FIELD}.${LEARNING_PROGRESS_KEY}`] = firestore.FieldValue.delete();
    }
    if (VOCABULARY_PROGRESS_KEY in dataObj) {
      console.warn(
        '[progressMerge] Cleanup legacy data.vocabularyProgress field',
      );
      patch[`${DATA_FIELD}.${VOCABULARY_PROGRESS_KEY}`] = firestore.FieldValue.delete();
    }
  }
  if (root && typeof root === 'object') {
    if (LEARNING_PROGRESS_KEY in root) {
      console.warn('[progressMerge] Cleanup legacy root.learningProgress field');
      patch[LEARNING_PROGRESS_KEY] = firestore.FieldValue.delete();
    }
    if (VOCABULARY_PROGRESS_KEY in root) {
      console.warn('[progressMerge] Cleanup legacy root.vocabularyProgress field');
      patch[VOCABULARY_PROGRESS_KEY] = firestore.FieldValue.delete();
    }
  }
  return patch;
}

export {
  stripUndefinedDeep,
  splitLearningProgressForFirestore,
  normalizeIdListLike,
  deriveWordsLearnedBackup,
  mergeTopicPracticeStatsForWrite,
  mergeProgressForWrite,
  combineLearningProgressFromFirestore,
  hasMeaningfulProgress,
  uniqStringArray,
  mergeProgressConservative,
  buildLegacyProgressCleanupPatch,
  buildUserProgressFieldsCleanupPatch,
};
