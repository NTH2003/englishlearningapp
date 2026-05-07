import {mergeTopicPracticeStatsForWrite} from './firebase/progressMerge';
import {emitLearningProgressUpdated} from './learningProgressEvents';
import {computeLevelName} from './levelService';
import {createStorageProgressOps} from './storageProgressOps';
import {createStorageTopicsOps} from './storageTopicsOps';

/** Khi không có Firebase: tiến độ chỉ trong phiên (mất khi tắt app). */
let _sessionLearningProgress = null;
let _sessionLearningProgressUid = null;
/** UID đã hoàn tất ít nhất một vòng đọc tiến độ (Firestore/cache) trong phiên — tránh ghim mãi snapshot rỗng do timeout/lỗi ban đầu. */
let _learningProgressHydratedUid = null;
let _sessionUserData = null;
let _sessionTopics = null;
let _inflightLearningProgressPromise = null;
let _authReadyGatePromise = null;
let _authReadyGateLastAt = 0;
let _progressTimeoutStreak = 0;
let _progressDegradedUntilMs = 0;

function _withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}-timeout`)), ms)),
  ]);
}

function _isTimeoutError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('timeout');
}

function _markProgressTimeout() {
  _progressTimeoutStreak += 1;
  if (_progressTimeoutStreak >= 2) {
    // Timeout liên tiếp: tạm ưu tiên cache/session trong một khoảng ngắn.
    _progressDegradedUntilMs = Date.now() + 15000;
  }
}

function _markProgressHealthy() {
  _progressTimeoutStreak = 0;
  _progressDegradedUntilMs = 0;
}

async function _ensureAuthReadyGate(fb) {
  if (!fb || typeof fb.ensureFirestoreAuthReady !== 'function') return;
  const now = Date.now();
  // Tránh gọi gate dồn dập giữa nhiều màn khi app vừa mount/focus.
  if (now - _authReadyGateLastAt < 2200) return;
  if (_authReadyGatePromise) {
    await _authReadyGatePromise;
    return;
  }
  _authReadyGatePromise = (async () => {
    try {
      await _withTimeout(
        fb.ensureFirestoreAuthReady({
          restoreTimeoutMs: 9000,
          tokenTimeoutMs: 3200,
          networkTimeoutMs: 2200,
          initTimeoutMs: 3200,
        }),
        10000,
        'storage.ensureFirestoreAuthReady',
      );
    } catch (_) {
      // Không ném lỗi để UI vẫn có thể fallback cache/session.
    } finally {
      _authReadyGateLastAt = Date.now();
      _authReadyGatePromise = null;
    }
  })();
  await _authReadyGatePromise;
}

function _currentFirebaseUid() {
  try {
    const fb = _getFirebase();
    const stableUid = fb?.getFirebaseUid?.();
    if (stableUid) return String(stableUid);
    const u = fb?.getCurrentUser?.();
    return u?.uid ? String(u.uid) : null;
  } catch (_) {
    return null;
  }
}

function _resetSessionCaches() {
  _sessionLearningProgress = null;
  _sessionLearningProgressUid = null;
  _learningProgressHydratedUid = null;
  _sessionUserData = null;
}

function _ensureSessionScopedByUid() {
  const uid = _currentFirebaseUid();
  if (!uid) {
    // Auth có thể trả null thoáng qua khi app vừa mở / đổi trạng thái mạng.
    // Không reset cache ngay để tránh mất optimistic progress vừa học.
    return;
  }
  if (_sessionLearningProgressUid && _sessionLearningProgressUid !== uid) {
    _resetSessionCaches();
  }
  _sessionLearningProgressUid = uid;
}

/** Lọc chủ đề có id + name hợp lệ (tránh Firebase/cache hỏng → màn Từ vựng trống). */
function _normalizeTopicsList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const out = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const id = String(t.id ?? '').trim();
    const name = String(t.name ?? '').trim();
    if (!id || !name) continue;
    out.push({
      ...t,
      id,
      name,
      description: String(t.description ?? '').trim(),
      icon: String(t.icon ?? '📘').trim() || '📘',
      color: String(t.color ?? '#3B82F6').trim() || '#3B82F6',
    });
  }
  return out;
}

function _defaultLearningProgress() {
  return {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    dialoguesCompleted: [],
    videosNeedPractice: [],
    reviewWrongWordIds: [],
    /** Từ đánh dấu yếu (flashcard «Chưa biết» / quiz sai chủ đề). */
    weakWordIds: [],
    videoViewCounts: {},
    flashcardSelfReport: {},
    wordStats: {},
    totalXP: 0,
    level: computeLevelName(0),
  };
}

function _normalizeIdListLike(raw) {
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

function _normalizeLearningProgressForUI(raw) {
  const base = _defaultLearningProgress();
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {...base, ...src};
  out.wordsLearned = _normalizeIdListLike(src.wordsLearned);
  out.lessonsCompleted = _normalizeIdListLike(src.lessonsCompleted);
  out.videosWatched = _normalizeIdListLike(src.videosWatched);
  out.dialoguesCompleted = _normalizeIdListLike(src.dialoguesCompleted);
  out.videosNeedPractice = _normalizeIdListLike(src.videosNeedPractice);
  out.reviewWrongWordIds = _normalizeIdListLike(src.reviewWrongWordIds);
  out.weakWordIds = _normalizeIdListLike(src.weakWordIds);
  out.videoViewCounts =
    src.videoViewCounts && typeof src.videoViewCounts === 'object'
      ? src.videoViewCounts
      : {};
  out.flashcardSelfReport =
    src.flashcardSelfReport && typeof src.flashcardSelfReport === 'object'
      ? src.flashcardSelfReport
      : {};
  out.wordStats = src.wordStats && typeof src.wordStats === 'object' ? src.wordStats : {};
  out.dialogueStats =
    src.dialogueStats && typeof src.dialogueStats === 'object'
      ? src.dialogueStats
      : {};
  out.topicPracticeStats =
    src.topicPracticeStats && typeof src.topicPracticeStats === 'object'
      ? src.topicPracticeStats
      : {};
  out.xpEventFlags =
    src.xpEventFlags && typeof src.xpEventFlags === 'object'
      ? src.xpEventFlags
      : {};
  out.daily = src.daily && typeof src.daily === 'object' ? src.daily : {};
  out.totalXP = Math.max(
    0,
    Number(src.totalXP) || Number(src.totalXp) || Number(src.xp) || 0,
  );
  out.level = String(src.level || computeLevelName(out.totalXP));
  return out;
}

function _hasMeaningfulProgressLocal(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const hasDialogueStats =
    obj.dialogueStats && typeof obj.dialogueStats === 'object'
      ? Object.keys(obj.dialogueStats).length > 0
      : false;
  const hasTopicPracticeStats =
    obj.topicPracticeStats && typeof obj.topicPracticeStats === 'object'
      ? Object.keys(obj.topicPracticeStats).length > 0
      : false;
  const hasWordStats =
    obj.wordStats && typeof obj.wordStats === 'object'
      ? Object.keys(obj.wordStats).length > 0
      : false;
  const hasVideoViews =
    obj.videoViewCounts && typeof obj.videoViewCounts === 'object'
      ? Object.keys(obj.videoViewCounts).length > 0
      : false;
  const hasXpFlags =
    obj.xpEventFlags && typeof obj.xpEventFlags === 'object'
      ? Object.keys(obj.xpEventFlags).length > 0
      : false;
  const hasDaily =
    obj.daily && typeof obj.daily === 'object'
      ? Object.keys(obj.daily).length > 0
      : false;
  return (
    (Array.isArray(obj.wordsLearned) && obj.wordsLearned.length > 0) ||
    (Array.isArray(obj.lessonsCompleted) && obj.lessonsCompleted.length > 0) ||
    (Array.isArray(obj.videosWatched) && obj.videosWatched.length > 0) ||
    (Array.isArray(obj.dialoguesCompleted) && obj.dialoguesCompleted.length > 0) ||
    Math.max(0, Number(obj.totalXP) || Number(obj.totalXp) || Number(obj.xp) || 0) > 0 ||
    hasDialogueStats ||
    hasTopicPracticeStats ||
    hasWordStats ||
    hasVideoViews ||
    hasXpFlags ||
    hasDaily
  );
}

/**
 * Lấy firebaseService nếu Firebase đã cài và cấu hình. Trả về null nếu không dùng được.
 */
function _getFirebase() {
  try {
    return require('./firebaseService');
  } catch (_) {
    return null;
  }
}

/**
 * Khởi tạo Firebase (đăng nhập ẩn danh).
 * Không dùng AsyncStorage — tránh lỗi NativeModule null khi package đã gỡ khỏi dự án.
 */
export async function initStorageSync() {
  const fb = _getFirebase();
  if (fb) {
    try {
      await fb.ensureInit();
      if (typeof fb.ensureFirestoreAuthReady === 'function') {
        void fb.ensureFirestoreAuthReady().catch(() => {});
      }
      // Không chặn màn chờ vô hạn nếu ghi Firestore treo — vẫn chạy sync nền.
      if (typeof fb.syncAuthProfileToFirestore === 'function') {
        void Promise.race([
          fb.syncAuthProfileToFirestore(),
          new Promise((r) => setTimeout(r, 12000)),
        ]).catch(() => {});
      }
    } catch (_) {}
  }
}

export const saveUserData = async (userData) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.saveUserData(userData)) return true;
    } catch (_) {}
    return false;
  }
  _sessionUserData = userData;
  return true;
};

export const getUserData = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      const data = await fb.getUserData();
      if (data !== undefined && data !== null) return data;
    } catch (_) {}
    return null;
  }
  return _sessionUserData;
};

/**
 * Gộp tiến độ cho bản chỉ lưu trong phiên (không Firebase).
 */
async function _mergeLearningProgressSession(incoming) {
  const inc = incoming && typeof incoming === 'object' ? incoming : {};
  const base = _sessionLearningProgress;
  const defaults = {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    videosNeedPractice: [],
  };
  const merged = {...defaults, ...(base || {}), ...inc};
  if (merged && typeof merged === 'object' && 'favoriteWords' in merged) {
    delete merged.favoriteWords;
  }
  const bfs =
    base?.flashcardSelfReport && typeof base.flashcardSelfReport === 'object'
      ? base.flashcardSelfReport
      : {};
  const ifs =
    inc?.flashcardSelfReport && typeof inc.flashcardSelfReport === 'object'
      ? inc.flashcardSelfReport
      : {};
  delete merged.flashcardSelfReport;
  if (Object.keys({...bfs, ...ifs}).length) {
    merged.flashcardSelfReport = {...bfs, ...ifs};
  }
  const bvc =
    base?.videoViewCounts && typeof base.videoViewCounts === 'object'
      ? base.videoViewCounts
      : {};
  const ivc =
    inc?.videoViewCounts && typeof inc.videoViewCounts === 'object'
      ? inc.videoViewCounts
      : {};
  merged.videoViewCounts = {...bvc, ...ivc};
  merged.topicPracticeStats = mergeTopicPracticeStatsForWrite(
    base?.topicPracticeStats,
    inc.topicPracticeStats,
  );
  if (Array.isArray(inc.reviewWrongWordIds)) {
    merged.reviewWrongWordIds = inc.reviewWrongWordIds;
  } else if (Array.isArray(base?.reviewWrongWordIds)) {
    merged.reviewWrongWordIds = base.reviewWrongWordIds;
  } else {
    merged.reviewWrongWordIds = [];
  }
  const rawNeedPractice = Array.isArray(merged.videosNeedPractice)
    ? merged.videosNeedPractice
    : [];
  merged.videosNeedPractice = [...new Set(rawNeedPractice.map((id) => String(id)))];
  return merged;
}

/**
 * Ghi tiến độ: Firestore dùng transaction gộp với bản mới nhất trên server (không đọc-get rồi set riêng).
 */
export const saveLearningProgress = async (progress) => {
  const fb = _getFirebase();
  if (fb) {
    _ensureSessionScopedByUid();
    // Optimistic update: cập nhật ngay UI người học, đồng bộ Firebase chạy nền.
    _sessionLearningProgress = _normalizeLearningProgressForUI(
      await _mergeLearningProgressSession(progress),
    );
    emitLearningProgressUpdated();
    const uid = _currentFirebaseUid();
    const topicId = progress?.topicId ?? progress?.topicID ?? null;
    if (__DEV__) {
      console.log('[storageService] saveLearningProgress:start', {
        uid: uid || null,
        topicId,
        keys: progress && typeof progress === 'object' ? Object.keys(progress).slice(0, 12) : [],
      });
    }
    try {
      const ok = await fb.saveLearningProgress(progress);
      if (__DEV__) {
        console.log('[storageService] saveLearningProgress:done', {
          uid: uid || null,
          topicId,
          ok: Boolean(ok),
        });
      }
      if (ok) return true;
    } catch (e) {
      if (__DEV__) {
        console.log('[storageService] saveLearningProgress:error', {
          uid: uid || null,
          topicId,
          message: e?.message || 'unknown',
        });
      }
    }
    // Retry nhẹ 1 nhịp cho lỗi mạng/token tạm thời.
    try {
      await new Promise((r) => setTimeout(r, 900));
      const retryOk = await fb.saveLearningProgress(progress);
      if (__DEV__) {
        console.log('[storageService] saveLearningProgress:retry', {
          uid: uid || null,
          topicId,
          ok: Boolean(retryOk),
        });
      }
      return Boolean(retryOk);
    } catch (_) {
      return false;
    }
  }
  const merged = _normalizeLearningProgressForUI(
    await _mergeLearningProgressSession(progress),
  );
  _sessionLearningProgress = merged;
  emitLearningProgressUpdated();
  return true;
};

/**
 * @param {{ source?: 'default' | 'server' | 'cache', forceRefresh?: boolean }} [options]
 */
export const getLearningProgress = async (options) => {
  if (_inflightLearningProgressPromise) {
    try {
      return await _withTimeout(
        _inflightLearningProgressPromise,
        4500,
        'learning-progress-inflight',
      );
    } catch (_) {
      // Nếu promise cũ lỗi/treo thì rơi xuống nhánh gọi mới bên dưới.
    }
  }
  const fb = _getFirebase();
  if (fb) {
    _inflightLearningProgressPromise = (async () => {
      await _ensureAuthReadyGate(fb);
      _ensureSessionScopedByUid();
      const requested = options || {};
      const markHydrated = () => {
        const u = _currentFirebaseUid();
        if (u) _learningProgressHydratedUid = u;
      };
      const tryReadRawLearningProgress = async () => {
        try {
          if (typeof fb.getData !== 'function') return null;
          const root = await _withTimeout(
            fb.getData(),
            6500,
            'learning-progress-raw-getData',
          );
          const raw =
            (root?.data && typeof root.data === 'object' ? root.data.learningProgress : null) ||
            (root?.learningProgress && typeof root.learningProgress === 'object'
              ? root.learningProgress
              : null);
          if (!raw || typeof raw !== 'object') return null;
          const normalized = _normalizeLearningProgressForUI(raw);
          if (_hasMeaningfulProgressLocal(normalized)) {
            return normalized;
          }
          return null;
        } catch (_) {
          return null;
        }
      };
      const uidSnap = _currentFirebaseUid();
      const hydrated =
        uidSnap &&
        _learningProgressHydratedUid &&
        _learningProgressHydratedUid === uidSnap;
      if (
        !requested?.source &&
        !requested?.forceRefresh &&
        _sessionLearningProgress &&
        typeof _sessionLearningProgress === 'object'
      ) {
        if (_hasMeaningfulProgressLocal(_sessionLearningProgress) || hydrated) {
          return _sessionLearningProgress;
        }
      }
      const isDegradedMode = Date.now() < _progressDegradedUntilMs;
      if (
        isDegradedMode &&
        _sessionLearningProgress &&
        _hasMeaningfulProgressLocal(_sessionLearningProgress) &&
        !requested?.forceRefresh
      ) {
        return _sessionLearningProgress;
      }
      try {
        const first = await _withTimeout(
          fb.getLearningProgress(requested),
          3800,
          'learning-progress-first',
        );
        if (first && typeof first === 'object') {
          _markProgressHealthy();
          const normalizedFirst = _normalizeLearningProgressForUI(first);
          const hasFirst = _hasMeaningfulProgressLocal(normalizedFirst);
          const hasSession = _hasMeaningfulProgressLocal(_sessionLearningProgress);
          if (hasFirst || !hasSession) {
            _sessionLearningProgress = normalizedFirst;
            markHydrated();
            return _sessionLearningProgress;
          }
          markHydrated();
          return _sessionLearningProgress;
        }
        if (requested?.source === 'server') {
          try {
            const fallbackDefault = await _withTimeout(
              fb.getLearningProgress(),
              3200,
              'learning-progress-fallback-default',
            );
            if (fallbackDefault && typeof fallbackDefault === 'object') {
              _markProgressHealthy();
              const normalizedFallbackDefault =
                _normalizeLearningProgressForUI(fallbackDefault);
              const hasFallbackDefault =
                _hasMeaningfulProgressLocal(normalizedFallbackDefault);
              const hasSession = _hasMeaningfulProgressLocal(_sessionLearningProgress);
              if (hasFallbackDefault || !hasSession) {
                _sessionLearningProgress = normalizedFallbackDefault;
              }
              markHydrated();
              return _sessionLearningProgress;
            }
          } catch (e) {
            if (_isTimeoutError(e)) _markProgressTimeout();
          }
          try {
            const fallbackCache = await _withTimeout(
              fb.getLearningProgress({source: 'cache'}),
              2200,
              'learning-progress-fallback-cache',
            );
            if (fallbackCache && typeof fallbackCache === 'object') {
              _markProgressHealthy();
              const normalizedFallbackCache = _normalizeLearningProgressForUI(fallbackCache);
              const hasFallbackCache =
                _hasMeaningfulProgressLocal(normalizedFallbackCache);
              const hasSession = _hasMeaningfulProgressLocal(_sessionLearningProgress);
              if (hasFallbackCache || !hasSession) {
                _sessionLearningProgress = normalizedFallbackCache;
              }
              markHydrated();
              return _sessionLearningProgress;
            }
          } catch (e) {
            if (_isTimeoutError(e)) _markProgressTimeout();
          }
        }
        await new Promise((r) => setTimeout(r, 350));
        const second = await _withTimeout(
          fb.getLearningProgress(requested),
          2600,
          'learning-progress-second',
        );
        if (second && typeof second === 'object') {
          _markProgressHealthy();
          const normalizedSecond = _normalizeLearningProgressForUI(second);
          const hasSecond = _hasMeaningfulProgressLocal(normalizedSecond);
          const hasSession = _hasMeaningfulProgressLocal(_sessionLearningProgress);
          if (hasSecond || !hasSession) {
            _sessionLearningProgress = normalizedSecond;
            markHydrated();
            return _sessionLearningProgress;
          }
          markHydrated();
          return _sessionLearningProgress;
        }
        const rawFallback = await tryReadRawLearningProgress();
        if (rawFallback) {
          _markProgressHealthy();
          _sessionLearningProgress = rawFallback;
          markHydrated();
          return _sessionLearningProgress;
        }
        if (!_sessionLearningProgress) {
          _sessionLearningProgress = _defaultLearningProgress();
        }
        return _sessionLearningProgress;
      } catch (e) {
        if (_isTimeoutError(e)) _markProgressTimeout();
        const rawFallback = await tryReadRawLearningProgress();
        if (rawFallback) {
          _markProgressHealthy();
          _sessionLearningProgress = rawFallback;
          markHydrated();
          return _sessionLearningProgress;
        }
        if (!_sessionLearningProgress) {
          _sessionLearningProgress = _defaultLearningProgress();
        }
        return _sessionLearningProgress;
      }
    })();
    try {
      return await _inflightLearningProgressPromise;
    } finally {
      _inflightLearningProgressPromise = null;
    }
  }
  if (!_sessionLearningProgress) {
    _sessionLearningProgress = _defaultLearningProgress();
  }
  return _sessionLearningProgress;
};

const _progressOps = createStorageProgressOps({
  getFirebase: _getFirebase,
  getLearningProgress,
  saveLearningProgress,
  defaultLearningProgress: _defaultLearningProgress,
  computeLevelName,
});

export const addVideoWatched = _progressOps.addVideoWatched;
export const setVideoNeedsPractice = _progressOps.setVideoNeedsPractice;
export const formatVideoViewCount = _progressOps.formatVideoViewCount;
export const incrementVideoViewCount = _progressOps.incrementVideoViewCount;
export const completeVideoAndAwardXP = _progressOps.completeVideoAndAwardXP;
export const awardXPIfFirst = _progressOps.awardXPIfFirst;
export const awardXPRepeatable = _progressOps.awardXPRepeatable;
export const saveDialoguePracticeResult = _progressOps.saveDialoguePracticeResult;

const _topicsOps = createStorageTopicsOps({
  getFirebase: _getFirebase,
  normalizeTopicsList: _normalizeTopicsList,
  getSessionTopics: () => _sessionTopics,
  setSessionTopics: (next) => {
    _sessionTopics = next;
  },
});

export const getTopics = _topicsOps.getTopics;
export const saveTopics = _topicsOps.saveTopics;

export const clearAllData = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      await fb.clearAllData();
    } catch (_) {}
  }
  _resetSessionCaches();
  return true;
};
