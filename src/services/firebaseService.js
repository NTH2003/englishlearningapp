/**
 * Firebase service - lưu tiến độ học tập và từ yêu thích lên Firestore.
 * Dùng Anonymous Auth để mỗi thiết bị có 1 user, dữ liệu lưu tại users/{uid}.
 * Cần cấu hình Firebase (google-services.json / GoogleService-Info.plist) trước khi dùng.
 */
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const USERS_COLLECTION = 'users';
const CONFIG_COLLECTION = 'config';
const TOPICS_DOC_ID = 'topics';
const WORD_MEDIA_COLLECTION = 'wordMedia';
// Danh sách email có quyền truy cập màn quản trị.
const ADMIN_EMAILS = ['admin@gmail.com'];
const DATA_FIELD = 'data';
const LEARNING_PROGRESS_KEY = 'learningProgress';
const USER_DATA_KEY = 'userData';
const SETTINGS_KEY = 'settings';

let _uid = null;
let _initPromise = null;

function _updateUid() {
  const user = auth().currentUser;
  _uid = user ? user.uid : null;
  _initPromise = null;
}

/**
 * Khởi tạo Firebase (đăng nhập ẩn danh), trả về uid. Gọi 1 lần khi app mở.
 * @returns {Promise<string|null>} uid hoặc null nếu lỗi
 */
export async function ensureInit() {
  if (_uid) return _uid;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      let user = auth().currentUser;
      if (!user) {
        const {user: newUser} = await auth().signInAnonymously();
        user = newUser;
      }
      _uid = user.uid;
      return _uid;
    } catch (error) {
      console.warn('Firebase init failed:', error?.message);
      _initPromise = null;
      return null;
    }
  })();
  return _initPromise;
}

/**
 * Lấy user hiện tại (để kiểm tra đã đăng nhập email chưa).
 * @returns {FirebaseAuthTypes.User|null}
 */
export function getCurrentUser() {
  return auth().currentUser;
}

/**
 * Kiểm tra email có phải admin không.
 * @param {string} email
 * @returns {boolean}
 */
export function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

/**
 * Kiểm tra user hiện tại có quyền admin không.
 * @returns {boolean}
 */
export function isCurrentUserAdmin() {
  const user = getCurrentUser();
  if (!user || user.isAnonymous || !user.email) return false;
  return isAdminEmail(user.email);
}

/**
 * Đăng nhập bằng email/mật khẩu. Nếu đang dùng tài khoản ẩn danh thì sẽ thử liên kết (giữ nguyên dữ liệu);
 * nếu email đã tồn tại thì đăng xuất ẩn danh rồi đăng nhập bằng email.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function signInWithEmail(email, password) {
  try {
    const user = auth().currentUser;
    if (user?.isAnonymous) {
      try {
        const credential = auth.EmailAuthProvider.credential(email, password);
        await user.linkWithCredential(credential);
      } catch (linkError) {
        const code = linkError?.code;
        if (
          code === 'auth/credential-already-in-use' ||
          code === 'auth/email-already-in-use'
        ) {
          await auth().signOut();
          await auth().signInWithEmailAndPassword(email, password);
        } else {
          throw linkError;
        }
      }
    } else {
      await auth().signInWithEmailAndPassword(email, password);
    }
    _updateUid();
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi đăng nhập';
    return {ok: false, error: msg};
  }
}

/**
 * Đăng ký tài khoản mới bằng email/mật khẩu. Nếu đang dùng tài khoản ẩn danh thì sẽ liên kết (giữ nguyên dữ liệu).
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function signUpWithEmail(email, password) {
  try {
    const user = auth().currentUser;
    if (user?.isAnonymous) {
      const credential = auth.EmailAuthProvider.credential(email, password);
      await user.linkWithCredential(credential);
    } else {
      await auth().createUserWithEmailAndPassword(email, password);
    }
    _updateUid();
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi đăng ký';
    return {ok: false, error: msg};
  }
}

/**
 * Đăng xuất. Sau đó app sẽ đăng nhập ẩn danh lại (tài khoản mới, dữ liệu cũ không còn trên thiết bị này).
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function signOut() {
  try {
    await auth().signOut();
    await auth().signInAnonymously();
    _updateUid();
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error?.message || 'Lỗi đăng xuất'};
  }
}

function _userDoc() {
  if (!_uid) throw new Error('Firebase not initialized');
  return firestore().collection(USERS_COLLECTION).doc(_uid);
}

/**
 * Lấy toàn bộ data của user (learningProgress, userData, settings).
 */
export async function getData() {
  await ensureInit();
  if (!_uid) return null;
  try {
    const snap = await _userDoc().get();
    return snap.exists ? snap.data() : null;
  } catch (error) {
    console.warn('Firebase getData error:', error?.message);
    return null;
  }
}

/**
 * Lưu tiến độ học tập lên Firestore (merge với data hiện có).
 */
export async function saveLearningProgress(progress) {
  await ensureInit();
  if (!_uid) return false;
  try {
    const data = await getData();
    const current = data?.[DATA_FIELD] || {};
    await _userDoc().set(
      {[DATA_FIELD]: {...current, [LEARNING_PROGRESS_KEY]: progress}},
      {merge: true},
    );
    return true;
  } catch (error) {
    console.warn('Firebase saveLearningProgress error:', error?.message);
    return false;
  }
}

/**
 * Lấy tiến độ học tập từ Firestore.
 */
export async function getLearningProgress() {
  const data = await getData();
  const nested = data?.[DATA_FIELD]?.[LEARNING_PROGRESS_KEY];
  return nested ?? null;
}

/**
 * Ghi nhận video đã xem.
 */
export async function addVideoWatched(videoId) {
  const progress = await getLearningProgress();
  const updated = progress || {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    favoriteWords: [],
  };
  if (!Array.isArray(updated.videosWatched)) updated.videosWatched = [];
  if (!updated.videosWatched.includes(videoId)) {
    updated.videosWatched.push(videoId);
    return saveLearningProgress(updated);
  }
  return true;
}

/**
 * Thêm từ yêu thích.
 */
export async function addFavoriteWord(wordId) {
  const progress = await getLearningProgress();
  const updated = progress || {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    favoriteWords: [],
  };
  if (!Array.isArray(updated.favoriteWords)) updated.favoriteWords = [];
  if (!updated.favoriteWords.includes(wordId)) {
    updated.favoriteWords.push(wordId);
    return saveLearningProgress(updated);
  }
  return true;
}

/**
 * Bỏ từ yêu thích.
 */
export async function removeFavoriteWord(wordId) {
  const progress = await getLearningProgress();
  const updated = progress || {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    favoriteWords: [],
  };
  if (!Array.isArray(updated.favoriteWords)) updated.favoriteWords = [];
  updated.favoriteWords = updated.favoriteWords.filter(id => id !== wordId);
  return saveLearningProgress(updated);
}

/**
 * Lấy danh sách ID từ yêu thích.
 */
export async function getFavoriteWords() {
  const progress = await getLearningProgress();
  return progress && Array.isArray(progress.favoriteWords)
    ? progress.favoriteWords
    : [];
}

/**
 * Kiểm tra 1 từ có trong danh sách yêu thích không.
 */
export async function isFavoriteWord(wordId) {
  const list = await getFavoriteWords();
  return list.includes(wordId);
}

/**
 * Lưu user data (profile...) - tùy chọn.
 */
export async function saveUserData(userData) {
  await ensureInit();
  if (!_uid) return false;
  try {
    const data = await getData();
    const current = data?.[DATA_FIELD] || {};
    await _userDoc().set(
      {[DATA_FIELD]: {...current, [USER_DATA_KEY]: userData}},
      {merge: true},
    );
    return true;
  } catch (error) {
    console.warn('Firebase saveUserData error:', error?.message);
    return false;
  }
}

/**
 * Lấy user data.
 */
export async function getUserData() {
  const data = await getData();
  return data?.[DATA_FIELD]?.[USER_DATA_KEY] ?? null;
}

/**
 * Xóa toàn bộ dữ liệu user (đăng xuất / reset).
 */
export async function clearAllData() {
  await ensureInit();
  if (!_uid) return true;
  try {
    await _userDoc().delete();
    return true;
  } catch (error) {
    console.warn('Firebase clearAllData error:', error?.message);
    return false;
  }
}

/**
 * Lấy danh sách chủ đề học từ Firestore (config/topics).
 * @returns {Promise<Array<{id, name, icon, color, description}>|null>}
 */
export async function getTopics() {
  try {
    await ensureInit();
    const snap = await firestore()
      .collection(CONFIG_COLLECTION)
      .doc(TOPICS_DOC_ID)
      .get();
    const data = snap.exists ? snap.data() : null;
    const list = data?.topics;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch (error) {
    console.warn('Firebase getTopics error:', error?.message);
    return null;
  }
}

/**
 * Lưu danh sách chủ đề học lên Firestore (config/topics).
 * @param {Array<{id, name, icon, color, description}>} topics
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveTopics(topics) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(topics)) {
      return {ok: false, error: 'Dữ liệu chủ đề không hợp lệ.'};
    }
    await firestore()
      .collection(CONFIG_COLLECTION)
      .doc(TOPICS_DOC_ID)
      .set({topics}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi không xác định';
    console.warn('Firebase saveTopics error:', msg);
    return {ok: false, error: msg};
  }
}

/**
 * Lưu media cho 1 từ vựng (ảnh/video URL từ Cloudinary).
 * @param {number|string} wordId
 * @param {{imageUrl?: string, videoUrl?: string, thumbnailUrl?: string, cloudinaryPublicId?: string}} media
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveWordMedia(wordId, media = {}) {
  try {
    const uid = await ensureInit();
    if (!uid) return {ok: false, error: 'Firebase chưa khởi tạo.'};
    if (wordId === undefined || wordId === null) {
      return {ok: false, error: 'wordId không hợp lệ.'};
    }

    await firestore()
      .collection(WORD_MEDIA_COLLECTION)
      .doc(String(wordId))
      .set(
        {
          ...media,
          updatedBy: uid,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error?.message || 'Lỗi lưu media từ vựng.'};
  }
}

/**
 * Lấy media (ảnh/video) cho 1 từ vựng.
 * @param {number|string} wordId
 * @returns {Promise<{imageUrl?: string, videoUrl?: string, thumbnailUrl?: string}|null>}
 */
export async function getWordMedia(wordId) {
  try {
    await ensureInit();
    if (wordId === undefined || wordId === null) return null;
    const snap = await firestore()
      .collection(WORD_MEDIA_COLLECTION)
      .doc(String(wordId))
      .get();
    return snap.exists ? snap.data() : null;
  } catch (_) {
    return null;
  }
}
