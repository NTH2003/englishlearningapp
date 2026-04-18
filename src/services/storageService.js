import {emitLearningProgressUpdated} from './learningProgressEvents';
import {computeLevelName} from './levelService';

/** Khi không có Firebase: tiến độ chỉ trong phiên (mất khi tắt app). */
let _sessionLearningProgress = null;
let _sessionUserData = null;

/** Lọc chủ đề có id + name hợp lệ (tránh Firebase/cache hỏng → màn Từ vựng trống). */
function _normalizeTopicsList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(
    (t) =>
      t &&
      typeof t.id === 'string' &&
      String(t.id).trim().length > 0 &&
      t.name != null &&
      String(t.name).trim().length > 0,
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
    try {
      const ok = await fb.saveLearningProgress(progress);
      if (ok) {
        emitLearningProgressUpdated();
        return true;
      }
    } catch (_) {}
    return false;
  }
  const merged = await _mergeLearningProgressSession(progress);
  _sessionLearningProgress = merged;
  emitLearningProgressUpdated();
  return true;
};

/**
 * @param {{ source?: 'default' | 'server' | 'cache' }} [options]
 */
export const getLearningProgress = async (options) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      return await fb.getLearningProgress(options || {});
    } catch (_) {
      return null;
    }
  }
  return _sessionLearningProgress;
};

export const addVideoWatched = async (videoId) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.addVideoWatched(videoId)) return true;
    } catch (_) {}
  }
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
    };

    if (!Array.isArray(updated.videosWatched)) {
      updated.videosWatched = [];
    }

    if (!updated.videosWatched.includes(videoId)) {
      updated.videosWatched.push(videoId);
      await saveLearningProgress(updated);
    }
    return true;
  } catch (error) {
    console.error('Error adding video watched:', error);
    return false;
  }
};

/**
 * Đánh dấu video cần luyện tập thêm khi người học "chưa hiểu".
 * needsPractice=false sẽ gỡ video khỏi danh sách cần luyện tập.
 */
export const setVideoNeedsPractice = async (videoId, needsPractice = true) => {
  if (videoId == null) return false;
  const key = String(videoId);
  try {
    const progress = (await getLearningProgress()) || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      videosNeedPractice: [],
    };
    const current = Array.isArray(progress.videosNeedPractice)
      ? progress.videosNeedPractice.map((id) => String(id))
      : [];
    const set = new Set(current);
    if (needsPractice) {
      set.add(key);
    } else {
      set.delete(key);
    }
    return await saveLearningProgress({
      ...progress,
      videosNeedPractice: [...set],
    });
  } catch (e) {
    console.warn('setVideoNeedsPractice', e?.message);
    return false;
  }
};

/** Hiển thị số lượt xem (đếm trên thiết bị / tài khoản hiện tại). */
export function formatVideoViewCount(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) {
    const v = x / 1_000_000;
    return `${v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (x >= 1_000) {
    const v = x / 1_000;
    return `${v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(x);
}

/**
 * Tăng lượt xem khi người dùng mở màn xem video (theo tiến độ, không nhập tay trong admin).
 */
export const incrementVideoViewCount = async (videoId) => {
  if (videoId == null) return false;
  const key = String(videoId);
  try {
    const progress = (await getLearningProgress()) || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
    };
    const prev =
      progress.videoViewCounts && typeof progress.videoViewCounts === 'object'
        ? progress.videoViewCounts
        : {};
    const nextCount = (Number(prev[key]) || 0) + 1;
    return await saveLearningProgress({
      ...progress,
      videoViewCounts: {...prev, [key]: nextCount},
    });
  } catch (e) {
    console.warn('incrementVideoViewCount', e?.message);
    return false;
  }
};

/**
 * Cộng XP theo từng sự kiện duy nhất (không cộng lặp khi đã nhận thưởng trước đó).
 * @param {string} eventKey khóa định danh duy nhất cho sự kiện XP
 * @param {number} points số XP cần cộng
 * @returns {Promise<boolean>} true nếu vừa cộng, false nếu đã cộng trước đó hoặc lỗi
 */
export const awardXPIfFirst = async (eventKey, points) => {
  const key = String(eventKey || '').trim();
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  if (!key || pts <= 0) return false;
  try {
    const progress = (await getLearningProgress()) || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
    };
    const flags =
      progress.xpEventFlags && typeof progress.xpEventFlags === 'object'
        ? {...progress.xpEventFlags}
        : {};
    if (flags[key]) {
      return false;
    }
    flags[key] = Date.now();
    const totalXP = Math.max(0, Number(progress.totalXP) || 0) + pts;
    const ok = await saveLearningProgress({
      ...progress,
      totalXP,
      level: computeLevelName(totalXP),
      xpEventFlags: flags,
    });
    return Boolean(ok);
  } catch (_) {
    return false;
  }
};

/**
 * Chủ đề: Firestore (config/topics) hoặc seed trong code.
 */
export const getTopics = async (defaultTopics = []) => {
  const normalizedDefault = _normalizeTopicsList(
    Array.isArray(defaultTopics) ? defaultTopics : [],
  );
  const fallback = normalizedDefault;

  const fb = _getFirebase();
  if (fb) {
    try {
      // Ưu tiên cache để phản hồi nhanh; chỉ gọi server 1 lần khi cần.
      const fromCache = await fb.getTopics({source: 'cache'});
      const normalizedCache = _normalizeTopicsList(fromCache);
      if (normalizedCache.length > 0) return normalizedCache;

      const fromServer = await fb.getTopics({source: 'server'});
      const normalizedServer = _normalizeTopicsList(fromServer);
      if (normalizedServer.length > 0) return normalizedServer;
    } catch (_) {}
    return fallback;
  }
  return fallback;
};

/**
 * Lưu danh sách chủ đề lên Firebase.
 */
export const saveTopics = async (topics) => {
  const fb = _getFirebase();
  if (!fb) {
    return {ok: false, error: 'Firebase chưa cấu hình. Thêm google-services.json và bật Auth + Firestore.'};
  }
  try {
    return await fb.saveTopics(topics);
  } catch (e) {
    return {ok: false, error: e?.message || 'Lỗi khi lưu.'};
  }
};

export const clearAllData = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      await fb.clearAllData();
    } catch (_) {}
  }
  _sessionLearningProgress = null;
  _sessionUserData = null;
  return true;
};
