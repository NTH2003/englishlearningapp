/**
 * Firebase service - lưu tiến độ học tập lên Firestore.
 * Dùng Anonymous Auth để mỗi thiết bị có 1 user, dữ liệu lưu tại users/{uid}.
 * Cần cấu hình Firebase (google-services.json / GoogleService-Info.plist) trước khi dùng.
 */
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {GOOGLE_WEB_CLIENT_ID} from '../constants';

function _friendlyAuthError(error, fallback) {
  const code = error?.code;
  switch (code) {
    case 'auth/user-not-found':
      return 'Tài khoản không tồn tại. Vui lòng kiểm tra email hoặc đăng ký.';
    case 'auth/wrong-password':
      return 'Mật khẩu không đúng. Vui lòng thử lại.';
    case 'auth/invalid-email':
      return 'Email không hợp lệ.';
    case 'auth/too-many-requests':
      return 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.';
    case 'auth/email-already-in-use':
      return 'Email này đã được đăng ký. Vui lòng đăng nhập.';
    case 'auth/weak-password':
      return 'Mật khẩu quá yếu. Vui lòng đặt mật khẩu mạnh hơn.';
    default:
      return error?.message || fallback;
  }
}

const USERS_COLLECTION = 'users';
const CONFIG_COLLECTION = 'config';
const TOPICS_DOC_ID = 'topics';
/** Danh sách từ vựng toàn app — field `words` (mảng) trong document. */
const VOCABULARY_DOC_ID = 'vocabulary';
const VIDEOS_DOC_ID = 'videos';
const DIALOGUES_DOC_ID = 'dialogues';
const WORD_MEDIA_COLLECTION = 'wordMedia';
// Danh sách email có quyền truy cập màn quản trị.
const ADMIN_EMAILS = ['admin@gmail.com'];
const TEACHER_EMAILS = ['teacher@gmail.com'];
const DATA_FIELD = 'data';
const LEARNING_PROGRESS_KEY = 'learningProgress';
/** Từ vựng: wordsLearned, wordStats, flashcardSelfReport, daily — tách khỏi lesson/video. */
const VOCABULARY_PROGRESS_KEY = 'vocabularyProgress';
const USER_DATA_KEY = 'userData';
const SETTINGS_KEY = 'settings';

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
    },
  };
}

/**
 * Gộp bản trên server (existing) với bản client gửi lên (incoming) trong transaction.
 * Không dùng `undefined` từ incoming để ghi đè wordsLearned (tránh mất từ đã học khi save partial).
 */
function mergeProgressForWrite(existing, incoming) {
  const ex = existing && typeof existing === 'object' ? existing : {};
  const inc = incoming && typeof incoming === 'object' ? incoming : {};
  const defaults = {
    wordsLearned: [],
    lessonsCompleted: [],
    videosWatched: [],
    dialoguesCompleted: [],
  };
  const merged = {...defaults, ...ex, ...inc};
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

  return merged;
}

/**
 * Gộp learningProgress + vocabularyProgress (tương thích bản cũ: mọi thứ nằm trong learningProgress).
 * @param {object|null|undefined} userDoc - toàn bộ document users/{uid}
 */
function combineLearningProgressFromFirestore(userDoc) {
  const inner = userDoc?.[DATA_FIELD];
  if (!inner) return null;
  const lp = inner[LEARNING_PROGRESS_KEY];
  const vp = inner[VOCABULARY_PROGRESS_KEY];
  if (lp == null && vp == null) return null;
  const baseLp = lp && typeof lp === 'object' ? lp : {};
  /** `{}` trên Firestore không phải “đã tách vp” — nếu xử lý như có vp sẽ mất wordsLearned trong learningProgress cũ. */
  const baseVpRaw = vp && typeof vp === 'object' ? vp : null;
  const baseVp =
    baseVpRaw && Object.keys(baseVpRaw).length > 0 ? baseVpRaw : null;

  if (!baseVp) {
    return Object.keys(baseLp).length ? {...baseLp} : null;
  }

  const core = {...baseLp};
  delete core.wordsLearned;
  delete core.wordStats;
  delete core.flashcardSelfReport;
  delete core.daily;
  delete core.reviewWrongWordIds;

  return {
    ...core,
    wordsLearned: Array.isArray(baseVp.wordsLearned)
      ? baseVp.wordsLearned
      : Array.isArray(baseLp.wordsLearned)
        ? baseLp.wordsLearned
        : [],
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
        ? Array.isArray(baseVp.reviewWrongWordIds)
          ? baseVp.reviewWrongWordIds
          : []
        : Array.isArray(baseLp.reviewWrongWordIds)
          ? baseLp.reviewWrongWordIds
          : [],
  };
}

let _uid = null;
let _initPromise = null;
/** Sau khi đổi user / đăng xuất: lần đọc Firestore tiếp theo buộc làm mới token. */
let _lastFirestoreSyncUid = null;

function _updateUid() {
  const user = auth().currentUser;
  _uid = user ? user.uid : null;
  _initPromise = null;
}

/** Luôn khớp `_uid` với phiên đăng nhập hiện tại — tránh đọc/ghi nhầm `users/{uid}` sau khi đăng nhập/đăng xuất. */
try {
  auth().onAuthStateChanged((user) => {
    _uid = user ? user.uid : null;
    _initPromise = null;
    if (!user) {
      _lastFirestoreSyncUid = null;
    }
  });
} catch (_) {}

/** Chờ Auth khôi phục phiên email/Google. Nếu không có phiên thì trả về null. */
async function waitForAuthOrAnonymous() {
  let user = auth().currentUser;
  if (user) return user;
  await new Promise((r) => setTimeout(r, 600));
  user = auth().currentUser;
  if (user) return user;
  return new Promise((resolve) => {
    let unsub = () => {};
    const t = setTimeout(() => {
      unsub();
      resolve(auth().currentUser);
    }, 7000);
    unsub = auth().onAuthStateChanged(() => {
      if (auth().currentUser) {
        clearTimeout(t);
        unsub();
        resolve(auth().currentUser);
      }
    });
  });
}

/**
 * Chờ thêm một nhịp để phiên đăng nhập được restore (không tạo anonymous mới).
 * Dùng cho các lần đọc config lúc app vừa mở để tránh nhận trạng thái "rỗng giả".
 */
async function waitForAuthRestore(ms = 10000) {
  if (auth().currentUser) return auth().currentUser;
  return new Promise((resolve) => {
    let unsub = () => {};
    const t = setTimeout(() => {
      unsub();
      resolve(auth().currentUser || null);
    }, ms);
    unsub = auth().onAuthStateChanged((user) => {
      if (user) {
        clearTimeout(t);
        unsub();
        resolve(user);
      }
    });
  });
}

/**
 * Trước khi đọc `config/*`, rules thường yêu cầu request.auth.
 * Sau khi đăng nhập / restore phiên, token có thể chưa gắn kịp → get() bị từ chối hoặc trả rỗng.
 * Gọi getIdToken() để đồng bộ token với Firestore.
 */
/** Đồng bộ token Auth ↔ Firestore trước khi đọc `config/*`. Dùng sau khi đăng nhập / preload. */
export async function ensureFirestoreAuthReady() {
  await ensureInit();
  let u = auth().currentUser;
  if (!u) {
    u = await waitForAuthRestore(15000);
  }
  if (u) {
    const uid = u.uid;
    const needFreshToken = _lastFirestoreSyncUid !== uid;
    try {
      if (needFreshToken) {
        await u.getIdToken(true);
        _lastFirestoreSyncUid = uid;
      } else {
        await u.getIdToken(false);
      }
    } catch (_) {
      try {
        await u.getIdToken(true);
        _lastFirestoreSyncUid = uid;
      } catch (_) {}
    }
  } else {
    _lastFirestoreSyncUid = null;
  }
  try {
    firestore().enableNetwork();
  } catch (_) {}
}

/**
 * Khởi tạo Firebase (đăng nhập ẩn danh nếu chưa có phiên), trả về uid.
 * @returns {Promise<string|null>} uid hoặc null nếu lỗi
 */
export async function ensureInit() {
  const cu = auth().currentUser;
  if (cu) {
    _uid = cu.uid;
    return _uid;
  }
  if (_uid) return _uid;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      let user = await waitForAuthOrAnonymous();
      if (!user) {
        _uid = null;
        return null;
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
 * Kiểm tra email có phải giáo viên không.
 * @param {string} email
 * @returns {boolean}
 */
export function isTeacherEmail(email) {
  if (!email) return false;
  return TEACHER_EMAILS.includes(String(email).trim().toLowerCase());
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
 * Vai trò hiện tại của user đăng nhập.
 * @returns {'admin' | 'teacher' | 'learner'}
 */
export function getCurrentUserRole() {
  const user = getCurrentUser();
  if (!user || user.isAnonymous || !user.email) return 'learner';
  const email = String(user.email).trim().toLowerCase();
  if (isAdminEmail(email)) return 'admin';
  if (isTeacherEmail(email)) return 'teacher';
  return 'learner';
}

/**
 * Có quyền vào khu quản trị nội dung (admin + teacher).
 * @returns {boolean}
 */
export function canAccessAdminPanel() {
  const role = getCurrentUserRole();
  return role === 'admin' || role === 'teacher';
}

/**
 * Có quyền quản lý người dùng/chỉ số hệ thống (admin only).
 * @returns {boolean}
 */
export function canManageUsers() {
  return getCurrentUserRole() === 'admin';
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
    await syncAuthProfileToUserData();
    return {ok: true};
  } catch (error) {
    const msg = _friendlyAuthError(error, 'Lỗi đăng nhập');
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
    // Đăng ký xong: signOut để đưa người dùng về màn Auth.
    await auth().signOut();
    _updateUid();
    return {ok: true};
  } catch (error) {
    const msg = _friendlyAuthError(error, 'Lỗi đăng ký');
    return {ok: false, error: msg};
  }
}

/**
 * Đăng nhập bằng Google. Nếu đang dùng tài khoản ẩn danh thì sẽ liên kết (giữ nguyên dữ liệu).
 * Cần: bật Google Sign-In trong Firebase Console, thêm GOOGLE_WEB_CLIENT_ID vào constants.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function signInWithGoogle() {
  try {
    if (!GOOGLE_WEB_CLIENT_ID) {
      return {ok: false, error: 'Google Sign-In chưa được cấu hình. Thêm GOOGLE_WEB_CLIENT_ID vào constants.'};
    }
    GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});
    await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
    // Luôn signOut trước để mỗi lần bấm đều chọn lại tài khoản Google
    try {
      await GoogleSignin.signOut();
    } catch (_) {
      // ignore
    }
    const signInResult = await GoogleSignin.signIn();
    if (signInResult?.type === 'cancelled' || !signInResult?.data) {
      return {ok: false, error: 'Bạn đã hủy đăng nhập.'};
    }
    const idToken = signInResult.data?.idToken ?? signInResult.idToken;
    if (!idToken) {
      return {ok: false, error: 'Không nhận được token từ Google.'};
    }
    const credential = auth.GoogleAuthProvider.credential(idToken);
    const user = auth().currentUser;
    if (user?.isAnonymous) {
      try {
        await user.linkWithCredential(credential);
      } catch (linkError) {
        const code = linkError?.code;
        if (
          code === 'auth/credential-already-in-use' ||
          code === 'auth/email-already-in-use'
        ) {
          await auth().signOut();
          await auth().signInWithCredential(credential);
        } else {
          throw linkError;
        }
      }
    } else {
      await auth().signInWithCredential(credential);
    }
    _updateUid();
    await syncAuthProfileToUserData();
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Đăng nhập Google thất bại.';
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
 * Lấy toàn bộ data của user (learningProgress, vocabularyProgress, userData, settings).
 */
export async function getData() {
  await ensureFirestoreAuthReady();
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
 * Lưu tiến độ học tập lên Firestore (transaction: đọc mới nhất rồi gộp — tránh ghi đè do đọc stale/cache).
 * Phần từ vựng → data.vocabularyProgress.
 */
export async function saveLearningProgress(progress) {
  await ensureInit();
  if (!_uid) return false;
  const ref = _userDoc();
  try {
    await firestore().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const root = snap.exists ? snap.data() : {};
      const existing =
        combineLearningProgressFromFirestore(root) || {
          wordsLearned: [],
          lessonsCompleted: [],
          videosWatched: [],
          dialoguesCompleted: [],
        };
      const merged = mergeProgressForWrite(existing, progress);
      const inner =
        root[DATA_FIELD] && typeof root[DATA_FIELD] === 'object'
          ? {...root[DATA_FIELD]}
          : {};
      const {core, vocabularyProgress} =
        splitLearningProgressForFirestore(merged);
      transaction.set(
        ref,
        {
          [DATA_FIELD]: {
            ...inner,
            [LEARNING_PROGRESS_KEY]: stripUndefinedDeep(core),
            [VOCABULARY_PROGRESS_KEY]: stripUndefinedDeep(vocabularyProgress),
          },
        },
        {merge: true},
      );
    });
    try {
      await firestore().waitForPendingWrites();
    } catch (_) {}
    return true;
  } catch (error) {
    console.warn('Firebase saveLearningProgress error:', error?.message);
    return false;
  }
}

/**
 * Lấy tiến độ học tập từ Firestore (đã gộp vocabularyProgress + learningProgress).
 * @param {{ source?: 'default' | 'server' | 'cache' }} [options] — dùng `source: 'server'` sau khi học để tránh cache cũ.
 */
export async function getLearningProgress(options = {}) {
  await ensureFirestoreAuthReady();
  if (!_uid) return null;
  try {
    const snap = await _userDoc().get(
      options.source ? {source: options.source} : undefined,
    );
    const data = snap.exists ? snap.data() : null;
    return combineLearningProgressFromFirestore(data);
  } catch (error) {
    console.warn('Firebase getLearningProgress error:', error?.message);
    return null;
  }
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
  };
  if (!Array.isArray(updated.videosWatched)) updated.videosWatched = [];
  if (!updated.videosWatched.includes(videoId)) {
    updated.videosWatched.push(videoId);
    return saveLearningProgress(updated);
  }
  return true;
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
 * Gọi sau `ensureInit` (mỗi lần mở app) và sau đăng nhập — ghi email, displayName, lastLoginAt
 * từ Firebase Auth vào `data.userData` để Home, admin và Firestore thống nhất.
 */
export async function syncAuthProfileToFirestore() {
  await syncAuthProfileToUserData();
}

async function syncAuthProfileToUserData() {
  await ensureInit();
  if (!_uid) return;
  const user = auth().currentUser;
  if (!user || user.isAnonymous || !user.email) return;
  try {
    const data = await getData();
    const inner =
      data?.[DATA_FIELD] && typeof data[DATA_FIELD] === 'object'
        ? {...data[DATA_FIELD]}
        : {};
    const current =
      inner[USER_DATA_KEY] && typeof inner[USER_DATA_KEY] === 'object'
        ? {...inner[USER_DATA_KEY]}
        : {};
    const next = {
      ...current,
      email: user.email,
      lastLoginAt: firestore.FieldValue.serverTimestamp(),
    };
    if (user.displayName) {
      next.displayName = user.displayName;
    } else {
      const existing = String(next.displayName || '').trim();
      if (!existing && user.email) {
        const local = String(user.email).split('@')[0]?.trim();
        if (local) {
          next.displayName = local;
        }
      }
    }
    if (!current.createdAt) {
      next.createdAt = firestore.FieldValue.serverTimestamp();
    }
    inner[USER_DATA_KEY] = next;
    await _userDoc().set({[DATA_FIELD]: inner}, {merge: true});
  } catch (e) {
    console.warn('syncAuthProfileToUserData', e?.message);
  }
}

const ADMIN_AVATAR_COLORS = [
  '#FDE68A',
  '#BFDBFE',
  '#FBCFE8',
  '#C4B5FD',
  '#99F6E4',
];

function avatarColorForUid(uid) {
  let h = 0;
  const s = String(uid || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return ADMIN_AVATAR_COLORS[Math.abs(h) % ADMIN_AVATAR_COLORS.length];
}

function formatFirestoreDateMaybe(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN');
  } catch (_) {
    return '—';
  }
}

function gameLevelFromTotalXP(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  return Math.max(1, Math.min(99, Math.floor(xp / 250) + 1));
}

/** Có `lastLoginAt` trong khoảng này thì hiển thị Hoạt động trên màn admin. */
const ADMIN_ACTIVE_LOGIN_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_ACTIVE_TODAY_WITHIN_MS = 24 * 60 * 60 * 1000;

function isActiveByLastLogin(udObj) {
  const ts = udObj?.lastLoginAt;
  if (!ts) return false;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() <= ADMIN_ACTIVE_LOGIN_WITHIN_MS;
  } catch (_) {
    return false;
  }
}

function isActiveTodayByLastLogin(udObj) {
  const ts = udObj?.lastLoginAt;
  if (!ts) return false;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() <= ADMIN_ACTIVE_TODAY_WITHIN_MS;
  } catch (_) {
    return false;
  }
}

function pickDisplayNameFromUserData(udObj) {
  if (!udObj || typeof udObj !== 'object') return '';
  return (
    String(udObj.displayName || udObj.name || '').trim() ||
    (typeof udObj.fullName === 'string' ? udObj.fullName.trim() : '') ||
    String(udObj.nickname || udObj.username || udObj.profileName || '').trim()
  );
}

function mapUserDocToAdminRow(uid, userDoc) {
  const lp = combineLearningProgressFromFirestore(userDoc) || {};
  const wordsLearned = Array.isArray(lp.wordsLearned) ? lp.wordsLearned.length : 0;
  const totalXP = Math.max(0, Number(lp.totalXP) || 0);
  const level = gameLevelFromTotalXP(totalXP);
  const ud = userDoc?.[DATA_FIELD]?.[USER_DATA_KEY];
  const udObj = ud && typeof ud === 'object' ? ud : {};
  const fromProfile = pickDisplayNameFromUserData(udObj);
  const name =
    fromProfile ||
    (udObj.email ? String(udObj.email).split('@')[0] : '') ||
    String(uid).slice(0, 8);
  const email = udObj.email ? String(udObj.email) : '—';
  const joined = formatFirestoreDateMaybe(udObj.createdAt);
  const lastLoginLabel = formatFirestoreDateMaybe(udObj.lastLoginAt);
  return {
    id: uid,
    name,
    email,
    level,
    words: wordsLearned,
    totalXP,
    joined,
    lastLoginLabel,
    active: isActiveByLastLogin(udObj),
    avatarColor: avatarColorForUid(uid),
  };
}

/**
 * Danh sách người dùng (document `users/*`) cho màn quản trị.
 * Cần đăng nhập bằng tài khoản admin và Firestore rules cho phép admin đọc mọi `users/{userId}`
 * (ví dụ: `request.auth.token.email` trùng email admin).
 *
 * @returns {Promise<{ ok: boolean, users: Array<object>, error?: string }>}
 */
export async function listUsersForAdmin(options = {}) {
  await ensureInit();
  if (!isCurrentUserAdmin()) {
    return {
      ok: false,
      error: 'Bạn không có quyền quản trị.',
      users: [],
    };
  }
  try {
    const snap = await firestore()
      .collection(USERS_COLLECTION)
      .get(options?.source ? {source: options.source} : undefined);
    const users = [];
    snap.forEach((doc) => {
      if (doc.exists) {
        users.push(mapUserDocToAdminRow(doc.id, doc.data()));
      }
    });
    users.sort(
      (a, b) =>
        b.words - a.words || String(a.name).localeCompare(String(b.name), 'vi'),
    );
    return {ok: true, users};
  } catch (e) {
    const msg =
      e?.code === 'firestore/permission-denied'
        ? 'Không có quyền đọc danh sách người dùng. Cập nhật Firestore rules cho tài khoản admin.'
        : e?.message || 'Không tải được danh sách người dùng.';
    console.warn('listUsersForAdmin', msg);
    return {ok: false, error: msg, users: []};
  }
}

/**
 * Thống kê cho Admin Dashboard.
 * - totalUsers: số document trong `users/*`
 * - activeToday: số user có lastLoginAt trong 24h
 * - topicCount: số bộ từ vựng trong `config/topics.topics`
 * - vocabularyCount: số từ trong `config/vocabulary.words`
 * - videoCount: số video trong `config/videos.videos`
 */
export async function getAdminDashboardStats(options = {}) {
  await ensureInit();
  if (!isCurrentUserAdmin()) {
    return {
      ok: false,
      error: 'Bạn không có quyền quản trị.',
      stats: {
        totalUsers: 0,
        activeToday: 0,
        topicCount: 0,
        vocabularyCount: 0,
        videoCount: 0,
      },
    };
  }
  try {
    const [usersSnap, topicsList, vocabList, videoList] = await Promise.all([
      firestore()
        .collection(USERS_COLLECTION)
        .get(options?.source ? {source: options.source} : undefined),
      getTopics(options),
      getVocabulary(options),
      getVideos(options),
    ]);

    let activeToday = 0;
    usersSnap.forEach((doc) => {
      const d = doc.data();
      const udObj = d?.[DATA_FIELD]?.[USER_DATA_KEY];
      if (udObj && typeof udObj === 'object' && isActiveTodayByLastLogin(udObj)) {
        activeToday += 1;
      }
    });

    const topicCount = Array.isArray(topicsList) ? topicsList.length : 0;
    const vocabularyCount = Array.isArray(vocabList) ? vocabList.length : 0;
    const videoCount = Array.isArray(videoList) ? videoList.length : 0;

    return {
      ok: true,
      stats: {
        totalUsers: usersSnap.size || 0,
        activeToday,
        topicCount,
        vocabularyCount,
        videoCount,
      },
    };
  } catch (e) {
    const msg =
      e?.code === 'firestore/permission-denied'
        ? 'Không có quyền đọc dữ liệu thống kê. Cập nhật Firestore rules cho tài khoản admin.'
        : e?.message || 'Không tải được thống kê.';
    return {
      ok: false,
      error: msg,
      stats: {
        totalUsers: 0,
        activeToday: 0,
        topicCount: 0,
        vocabularyCount: 0,
        videoCount: 0,
      },
    };
  }
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
export async function getTopics(options = {}) {
  try {
    await ensureFirestoreAuthReady();
    const ref = firestore().collection(CONFIG_COLLECTION).doc(TOPICS_DOC_ID);
    const explicitSource = options?.source;
    if (explicitSource) {
      const snap = await ref.get({source: explicitSource});
      const data = snap.exists ? snap.data() : null;
      const list = data?.topics;
      return Array.isArray(list) && list.length > 0 ? list : null;
    }

    // Mặc định: đọc cache trước để hiện nhanh, rồi thử server để làm mới.
    let cachedList = null;
    try {
      const cachedSnap = await ref.get({source: 'cache'});
      const cachedData = cachedSnap.exists ? cachedSnap.data() : null;
      const maybeCached = cachedData?.topics;
      if (Array.isArray(maybeCached) && maybeCached.length > 0) {
        cachedList = maybeCached;
      }
    } catch (_) {}

    try {
      const serverSnap = await ref.get({source: 'server'});
      const serverData = serverSnap.exists ? serverSnap.data() : null;
      const serverList = serverData?.topics;
      if (Array.isArray(serverList) && serverList.length > 0) {
        return serverList;
      }
    } catch (e) {
      // Lần mở đầu có thể đang restore auth -> thử chờ rồi đọc lại 1 lần.
      if (!cachedList) {
        try {
          await waitForAuthRestore(10000);
          const retrySnap = await ref.get({source: 'server'});
          const retryData = retrySnap.exists ? retrySnap.data() : null;
          const retryList = retryData?.topics;
          if (Array.isArray(retryList) && retryList.length > 0) {
            return retryList;
          }
        } catch (_) {}
      }
      void e;
    }

    return cachedList;
  } catch (error) {
    console.warn('Firebase getTopics error:', error?.code, error?.message);
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
 * Lấy danh sách từ vựng từ Firestore (config/vocabulary, field words).
 * @returns {Promise<Array<object>|null>}
 */
export async function getVocabulary(options = {}) {
  try {
    await ensureFirestoreAuthReady();
    const ref = firestore().collection(CONFIG_COLLECTION).doc(VOCABULARY_DOC_ID);
    const explicitSource = options?.source;
    if (explicitSource) {
      const snap = await ref.get({source: explicitSource});
      const data = snap.exists ? snap.data() : null;
      const list = data?.words;
      return Array.isArray(list) && list.length > 0 ? list : null;
    }

    let cachedList = null;
    try {
      const cachedSnap = await ref.get({source: 'cache'});
      const cachedData = cachedSnap.exists ? cachedSnap.data() : null;
      const maybeCached = cachedData?.words;
      if (Array.isArray(maybeCached) && maybeCached.length > 0) {
        cachedList = maybeCached;
      }
    } catch (_) {}

    try {
      const serverSnap = await ref.get({source: 'server'});
      const serverData = serverSnap.exists ? serverSnap.data() : null;
      const serverList = serverData?.words;
      if (Array.isArray(serverList) && serverList.length > 0) {
        return serverList;
      }
    } catch (e) {
      if (e?.code === 'permission-denied') {
        console.warn(
          'Firebase getVocabulary: permission-denied — rules `config` cần allow read khi đã đăng nhập; kiểm tra deploy rules đúng project.',
        );
      }
      if (!cachedList) {
        try {
          await waitForAuthRestore(10000);
          await ensureFirestoreAuthReady();
          const retrySnap = await ref.get({source: 'server'});
          const retryData = retrySnap.exists ? retrySnap.data() : null;
          const retryList = retryData?.words;
          if (Array.isArray(retryList) && retryList.length > 0) {
            return retryList;
          }
        } catch (_) {}
      }
    }

    return cachedList;
  } catch (error) {
    console.warn('Firebase getVocabulary error:', error?.code, error?.message);
    return null;
  }
}

/**
 * Lưu toàn bộ từ vựng lên Firestore (config/vocabulary).
 * @param {Array<object>} words
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveVocabulary(words) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(words)) {
      return {ok: false, error: 'Dữ liệu từ vựng không hợp lệ.'};
    }
    await firestore()
      .collection(CONFIG_COLLECTION)
      .doc(VOCABULARY_DOC_ID)
      .set({words}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi lưu từ vựng';
    console.warn('Firebase saveVocabulary error:', msg);
    return {ok: false, error: msg};
  }
}

/**
 * Lấy danh sách video từ Firestore (config/videos, field videos).
 * @returns {Promise<Array<object>|null>} `null` chỉ khi chưa có document (lần đầu seed). `[]` = đã xóa hết, không seed lại.
 */
export async function getVideos(options = {}) {
  try {
    // Đồng bộ token với Firestore (giống getVocabulary/getTopics) — tránh đọc server khi chưa có auth → rỗng / permission-denied.
    await ensureFirestoreAuthReady();

    const ref = firestore().collection(CONFIG_COLLECTION).doc(VIDEOS_DOC_ID);
    const explicitSource = options?.source;

    if (explicitSource) {
      const snap = await ref.get({source: explicitSource});
      if (!snap.exists) return null;
      const list = snap.data()?.videos;
      return Array.isArray(list) ? list : [];
    }

    const [cacheSnap, serverSnap] = await Promise.allSettled([
      ref.get({source: 'cache'}),
      ref.get({source: 'server'}),
    ]);

    let cachedVideos = null;
    if (
      cacheSnap.status === 'fulfilled' &&
      cacheSnap.value.exists &&
      Array.isArray(cacheSnap.value.data()?.videos)
    ) {
      cachedVideos = cacheSnap.value.data().videos;
    }

    // Ưu tiên dữ liệu server khi đọc được và có field videos là mảng.
    if (
      serverSnap.status === 'fulfilled' &&
      serverSnap.value.exists &&
      Array.isArray(serverSnap.value.data()?.videos)
    ) {
      return serverSnap.value.data().videos;
    }

    if (serverSnap.status === 'rejected') {
      const err = serverSnap.reason;
      console.warn(
        'Firebase getVideos server:',
        err?.code,
        err?.message || err,
      );
      if (!cachedVideos) {
        try {
          await waitForAuthRestore(10000);
          await ensureFirestoreAuthReady();
          const retrySnap = await ref.get({source: 'server'});
          if (retrySnap.exists && Array.isArray(retrySnap.data()?.videos)) {
            return retrySnap.data().videos;
          }
        } catch (_) {}
      }
    }

    return cachedVideos;
  } catch (error) {
    console.warn('Firebase getVideos error:', error?.code, error?.message);
    return null;
  }
}

/**
 * Lưu toàn bộ video lên Firestore (config/videos).
 * @param {Array<object>} videos
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveVideos(videos) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(videos)) {
      return {ok: false, error: 'Dữ liệu video không hợp lệ.'};
    }
    await firestore()
      .collection(CONFIG_COLLECTION)
      .doc(VIDEOS_DOC_ID)
      .set({videos}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi lưu video';
    console.warn('Firebase saveVideos error:', msg);
    return {ok: false, error: msg};
  }
}

/**
 * Lấy cấu hình hội thoại từ Firestore (config/dialogues).
 * Shape: { topics: Array, dialogues: Array }
 */
export async function getDialogueConfig(options = {}) {
  try {
    await ensureFirestoreAuthReady();
    const ref = firestore().collection(CONFIG_COLLECTION).doc(DIALOGUES_DOC_ID);
    const explicitSource = options?.source;
    if (explicitSource) {
      const snap = await ref.get({source: explicitSource});
      const data = snap.exists ? snap.data() : null;
      return {
        topics: Array.isArray(data?.topics) ? data.topics : [],
        dialogues: Array.isArray(data?.dialogues) ? data.dialogues : [],
      };
    }

    let cached = null;
    try {
      const cachedSnap = await ref.get({source: 'cache'});
      const cd = cachedSnap.exists ? cachedSnap.data() : null;
      cached = {
        topics: Array.isArray(cd?.topics) ? cd.topics : [],
        dialogues: Array.isArray(cd?.dialogues) ? cd.dialogues : [],
      };
    } catch (_) {}

    try {
      const serverSnap = await ref.get({source: 'server'});
      const sd = serverSnap.exists ? serverSnap.data() : null;
      return {
        topics: Array.isArray(sd?.topics) ? sd.topics : [],
        dialogues: Array.isArray(sd?.dialogues) ? sd.dialogues : [],
      };
    } catch (_) {}

    return cached || {topics: [], dialogues: []};
  } catch (error) {
    console.warn('Firebase getDialogueConfig error:', error?.code, error?.message);
    return {topics: [], dialogues: []};
  }
}

/**
 * Lưu cấu hình hội thoại lên Firestore (config/dialogues).
 */
export async function saveDialogueConfig({topics = [], dialogues = []}) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    await firestore()
      .collection(CONFIG_COLLECTION)
      .doc(DIALOGUES_DOC_ID)
      .set(
        {
          topics: Array.isArray(topics) ? topics : [],
          dialogues: Array.isArray(dialogues) ? dialogues : [],
        },
        {merge: true},
      );
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi lưu hội thoại';
    console.warn('Firebase saveDialogueConfig error:', msg);
    return {ok: false, error: msg};
  }
}

/**
 * Lưu media cho 1 từ vựng (vd. audioUrl trên Firestore collection wordMedia). App không còn upload ảnh từ client.
 * @param {number|string} wordId
 * @param {{audioUrl?: string, soundUrl?: string, videoUrl?: string, thumbnailUrl?: string}} media
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
 * Lấy media cho 1 từ vựng (âm thanh / URL tùy dữ liệu Firestore wordMedia).
 * @param {number|string} wordId
 * @returns {Promise<Record<string, unknown>|null>}
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
