import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../constants';

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
 * Gộp tiến độ local và remote (trùng thì giữ cả hai, dùng Set để bỏ trùng).
 */
function _mergeProgress(local, remote) {
  const arr = (key) => [
    ...new Set([
      ...(Array.isArray(remote?.[key]) ? remote[key] : []),
      ...(Array.isArray(local?.[key]) ? local[key] : []),
    ]),
  ];
  return {
    wordsLearned: arr('wordsLearned'),
    lessonsCompleted: arr('lessonsCompleted'),
    videosWatched: arr('videosWatched'),
    favoriteWords: arr('favoriteWords'),
  };
}

/**
 * Migration một lần: đọc tiến độ từ AsyncStorage, gộp với Firestore, lưu lên Firebase rồi xóa bản local.
 * Gọi khi app mở và Firebase đã init thành công.
 */
async function _migrateLocalProgressToFirebase() {
  const fb = _getFirebase();
  if (!fb) return;
  try {
    const uid = await fb.ensureInit();
    if (!uid) return;
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LEARNING_PROGRESS);
    if (!raw) return;
    const local = JSON.parse(raw);
    const remote = await fb.getLearningProgress();
    const merged = _mergeProgress(local, remote);
    await fb.saveLearningProgress(merged);
    await AsyncStorage.removeItem(STORAGE_KEYS.LEARNING_PROGRESS);
  } catch (_) {}
}

/**
 * Khởi tạo đồng bộ Firebase: đăng nhập ẩn danh + migration dữ liệu local lên Firestore.
 * Nên gọi 1 lần khi app mở (ví dụ trong App.js).
 */
export async function initStorageSync() {
  const fb = _getFirebase();
  if (fb) {
    try {
      await fb.ensureInit();
      await _migrateLocalProgressToFirebase();
    } catch (_) {}
  }
}

// Lưu dữ liệu người dùng
export const saveUserData = async (userData) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.saveUserData(userData)) return true;
    } catch (_) {}
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    return false;
  }
};

// Lấy dữ liệu người dùng
export const getUserData = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      const data = await fb.getUserData();
      if (data !== undefined && data !== null) return data;
    } catch (_) {}
  }
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

// Lưu tiến độ học tập
export const saveLearningProgress = async (progress) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.saveLearningProgress(progress)) return true;
    } catch (_) {}
  }
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.LEARNING_PROGRESS,
      JSON.stringify(progress),
    );
    return true;
  } catch (error) {
    console.error('Error saving learning progress:', error);
    return false;
  }
};

// Lấy tiến độ học tập
export const getLearningProgress = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      const data = await fb.getLearningProgress();
      if (data !== undefined && data !== null) return data;
    } catch (_) {}
  }
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LEARNING_PROGRESS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting learning progress:', error);
    return null;
  }
};

// Ghi nhận video đã xem
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
      favoriteWords: [],
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

// Thêm từ vào danh sách yêu thích
export const addFavoriteWord = async (wordId) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.addFavoriteWord(wordId)) return true;
    } catch (_) {}
  }
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      favoriteWords: [],
    };

    if (!Array.isArray(updated.favoriteWords)) {
      updated.favoriteWords = [];
    }

    if (!updated.favoriteWords.includes(wordId)) {
      updated.favoriteWords.push(wordId);
      await saveLearningProgress(updated);
    }
    return true;
  } catch (error) {
    console.error('Error adding favorite word:', error);
    return false;
  }
};

// Bỏ từ khỏi danh sách yêu thích
export const removeFavoriteWord = async (wordId) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      if (await fb.removeFavoriteWord(wordId)) return true;
    } catch (_) {}
  }
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      favoriteWords: [],
    };

    if (!Array.isArray(updated.favoriteWords)) {
      updated.favoriteWords = [];
    }

    updated.favoriteWords = updated.favoriteWords.filter(id => id !== wordId);
    await saveLearningProgress(updated);
    return true;
  } catch (error) {
    console.error('Error removing favorite word:', error);
    return false;
  }
};

// Lấy danh sách ID từ yêu thích
export const getFavoriteWords = async () => {
  try {
    const progress = await getLearningProgress();
    if (!progress || !Array.isArray(progress.favoriteWords)) {
      return [];
    }
    return progress.favoriteWords;
  } catch (error) {
    console.error('Error getting favorite words:', error);
    return [];
  }
};

// Kiểm tra 1 từ có nằm trong danh sách yêu thích không
export const isFavoriteWord = async (wordId) => {
  try {
    const favorites = await getFavoriteWords();
    return favorites.includes(wordId);
  } catch (error) {
    console.error('Error checking favorite word:', error);
    return false;
  }
};

/**
 * Lấy danh sách chủ đề học: ưu tiên Firebase, không có thì trả về defaultTopics.
 * @param {Array} defaultTopics - Danh sách chủ đề mặc định (dùng khi Firebase trống hoặc lỗi)
 * @returns {Promise<Array>}
 */
export const getTopics = async (defaultTopics = []) => {
  const fb = _getFirebase();
  if (fb) {
    try {
      const fromFb = await fb.getTopics();
      if (Array.isArray(fromFb) && fromFb.length > 0) return fromFb;
    } catch (_) {}
  }
  return Array.isArray(defaultTopics) ? defaultTopics : [];
};

/**
 * Lưu danh sách chủ đề học lên Firebase (nếu có Firebase).
 * @param {Array} topics
 * @returns {Promise<{ok: boolean, error?: string}>}
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

// Xóa tất cả dữ liệu (đăng xuất)
export const clearAllData = async () => {
  const fb = _getFirebase();
  if (fb) {
    try {
      await fb.clearAllData();
    } catch (_) {}
  }
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.LEARNING_PROGRESS,
      STORAGE_KEYS.SETTINGS,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
};
