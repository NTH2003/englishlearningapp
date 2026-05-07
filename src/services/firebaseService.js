/**
 * Firebase service - lưu tiến độ học tập lên Firestore.
 * Dùng Anonymous Auth để mỗi thiết bị có 1 user, dữ liệu lưu tại users/{uid}.
 * Cần cấu hình Firebase (google-services.json / GoogleService-Info.plist) trước khi dùng.
 */
import auth from '@react-native-firebase/auth';
import {getApp} from '@react-native-firebase/app';
import {
  getFirestore,
  runTransaction,
  serverTimestamp,
  waitForPendingWrites,
} from '@react-native-firebase/firestore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {GOOGLE_WEB_CLIENT_ID} from '../constants';
import {
  DATA_FIELD,
  LEARNING_PROGRESS_KEY,
  VOCABULARY_PROGRESS_KEY,
  USER_DATA_KEY,
  ENABLE_LEGACY_PROGRESS_RECOVERY,
} from './firebase/constants';
import {
  stripUndefinedDeep,
  splitLearningProgressForFirestore,
  mergeProgressForWrite,
  combineLearningProgressFromFirestore,
  hasMeaningfulProgress,
  mergeProgressConservative,
  buildLegacyProgressCleanupPatch,
} from './firebase/progressMerge';
import {
  ensureInit,
  ensureFirestoreAuthReady,
  waitForAuthRestore,
  withOpTimeout,
  getFirebaseUid,
  refreshSessionUid,
  syncUidFromCurrentAuth,
} from './firebase/sessionCore';
import {
  getCurrentUser,
  isAdminEmail,
  isTeacherEmail,
  isCurrentUserAdmin,
  getCurrentUserRole,
  canAccessAdminPanel,
  canManageUsers,
} from './firebase/authRoles';
export {
  getCurrentUser,
  isAdminEmail,
  isTeacherEmail,
  isCurrentUserAdmin,
  getCurrentUserRole,
  canAccessAdminPanel,
  canManageUsers,
} from './firebase/authRoles';

import {userDoc, userProgressDoc} from './firebase/userRefs';
import {tryRecoverProgressByEmail, tryRecoverProgressByIdentity} from './firebase/progressRecovery';
import {syncCurrentUserToPublicLeaderboard} from './firebase/leaderboardPublic';
export {listPublicLeaderboard, gameLevelFromTotalXP, parseLevelLabelToNumber} from './firebase/leaderboardPublic';

import {
  getTopics,
  saveTopics,
  getVocabulary,
  saveVocabulary,
  getVideos,
  saveVideos,
  getDialogueConfig,
  saveDialogueConfig,
  saveWordMedia,
  getWordMedia,
} from './firebase/remoteConfigOps';
export {
  getTopics,
  saveTopics,
  getVocabulary,
  saveVocabulary,
  getVideos,
  saveVideos,
  getDialogueConfig,
  saveDialogueConfig,
  saveWordMedia,
  getWordMedia,
} from './firebase/remoteConfigOps';

export {ensureInit, ensureFirestoreAuthReady};
const db = getFirestore(getApp());
let _saveLearningProgressChain = Promise.resolve(true);

function snapshotExists(snap) {
  if (!snap) return false;
  if (typeof snap.exists === 'function') return snap.exists();
  return Boolean(snap.exists);
}

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



/** Cache tiến độ theo UID để tránh UI nhảy về 0 khi mạng/auth chập chờn. */
const _learningProgressCacheByUid = new Map();
const _learningProgressLastResolvedAtByUid = new Map();
const _learningProgressCacheMeaningfulByUid = new Map();
const _defaultLearningProgress = () => ({
  wordsLearned: [],
  lessonsCompleted: [],
  videosWatched: [],
  dialoguesCompleted: [],
  videosNeedPractice: [],
  reviewWrongWordIds: [],
  weakWordIds: [],
  videoViewCounts: {},
  flashcardSelfReport: {},
  wordStats: {},
  totalXP: 0,
  level: 'Mới bắt đầu',
});

export const SUSPENDED_SIGN_OUT_MESSAGE =
  'Tài khoản này đã bị khóa. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.';

async function readUserSuspendedFlagFromFirestore() {
  // Đường vào app: không được chờ Firestore quá lâu (UX reload treo màn trắng).
  try {
    await ensureFirestoreAuthReady({
      restoreTimeoutMs: 3500,
      tokenTimeoutMs: 2800,
      networkTimeoutMs: 2000,
      initTimeoutMs: 3500,
    });
  } catch (_) {}
  if (!getFirebaseUid()) return false;
  try {
    const snap = await withOpTimeout(userDoc().get(), 6500, 'readSuspendedFlag.get');
    if (!snapshotExists(snap)) return false;
    const root = snap.data();
    return Boolean(root?.[DATA_FIELD]?.[USER_DATA_KEY]?.isSuspended);
  } catch (e) {
    console.warn('readUserSuspendedFlagFromFirestore', e?.message);
    return false;
  }
}

/**
 * Nếu admin đã đánh dấu khóa trong Firestore → đăng xuất khỏi Firebase Auth.
 * @returns {Promise<{blocked: boolean}>}
 */
export async function enforceNotSuspendedOrSignOut() {
  const suspended = await readUserSuspendedFlagFromFirestore();
  if (!suspended) return {blocked: false};
  try {
    await auth().signOut();
    refreshSessionUid();
  } catch (_) {}
  return {blocked: true};
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
    refreshSessionUid();
    const suspendCheck = await enforceNotSuspendedOrSignOut();
    if (suspendCheck.blocked) {
      return {ok: false, error: SUSPENDED_SIGN_OUT_MESSAGE};
    }
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
    refreshSessionUid();
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
    refreshSessionUid();
    const suspendCheck = await enforceNotSuspendedOrSignOut();
    if (suspendCheck.blocked) {
      return {ok: false, error: SUSPENDED_SIGN_OUT_MESSAGE};
    }
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
    refreshSessionUid();
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error?.message || 'Lỗi đăng xuất'};
  }
}

/**
 * Lấy toàn bộ data của user (learningProgress, vocabularyProgress, userData, settings).
 */
export async function getData() {
  await ensureFirestoreAuthReady();
  if (!getFirebaseUid()) return {[DATA_FIELD]: {}};
  try {
    const snap = await userDoc().get();
    return snapshotExists(snap) ? snap.data() : {[DATA_FIELD]: {}};
  } catch (error) {
    console.warn('Firebase getData error:', error?.message);
    return {[DATA_FIELD]: {}};
  }
}

/**
 * Lưu tiến độ học tập lên Firestore (transaction: đọc mới nhất rồi gộp — tránh ghi đè do đọc stale/cache).
 * Phần từ vựng → data.vocabularyProgress.
 */
export async function saveLearningProgress(progress) {
  const runSave = async () => {
    await ensureInit();
    if (!getFirebaseUid()) return false;
    const uid = getFirebaseUid();
    const ref = userDoc();
    if (__DEV__) {
      console.log('[firebaseService] saveLearningProgress:start', {
        uid,
        docPath: `users/${uid}`,
        topicId: progress?.topicId ?? progress?.topicID ?? null,
        keys: progress && typeof progress === 'object' ? Object.keys(progress).slice(0, 12) : [],
      });
    }
    const writeMergedProgressDirect = async () => {
      const snap = await userDoc().get();
      const root = snapshotExists(snap) ? snap.data() : {};
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
      const {core, vocabularyProgress} = splitLearningProgressForFirestore(merged);
      await userDoc().set(
        {
          [DATA_FIELD]: {
            ...inner,
            [LEARNING_PROGRESS_KEY]: stripUndefinedDeep(core),
            [VOCABULARY_PROGRESS_KEY]: stripUndefinedDeep(vocabularyProgress),
          },
          updatedAt: serverTimestamp(),
        },
        {merge: true},
      );
      const cleanupPatch = buildLegacyProgressCleanupPatch(root);
      if (Object.keys(cleanupPatch).length > 0) {
        await userDoc().set(cleanupPatch, {merge: true});
      }
    };
    try {
      await withOpTimeout(
        runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          const root = snapshotExists(snap) ? snap.data() : {};
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
          const {core, vocabularyProgress} = splitLearningProgressForFirestore(merged);
          transaction.set(
            ref,
            {
              [DATA_FIELD]: {
                ...inner,
                [LEARNING_PROGRESS_KEY]: stripUndefinedDeep(core),
                [VOCABULARY_PROGRESS_KEY]: stripUndefinedDeep(vocabularyProgress),
              },
              updatedAt: serverTimestamp(),
            },
            {merge: true},
          );
          const cleanupPatch = buildLegacyProgressCleanupPatch(root);
          if (Object.keys(cleanupPatch).length > 0) {
            transaction.set(ref, cleanupPatch, {merge: true});
          }
        }),
        6000,
        'saveLearningProgress.transaction',
      );
    } catch (transactionError) {
      console.warn(
        'saveLearningProgress transaction failed, fallback to direct write:',
        transactionError?.message,
      );
      try {
        await withOpTimeout(
          writeMergedProgressDirect(),
          5000,
          'saveLearningProgress.fallbackDirect',
        );
      } catch (fallbackError) {
        console.warn('Firebase saveLearningProgress fallback error:', fallbackError?.message);
        return false;
      }
    }
    try {
      try {
        await withOpTimeout(waitForPendingWrites(db), 900, 'pendingWrites');
      } catch (_) {}
      void syncCurrentUserToPublicLeaderboard({
        learningProgress: progress,
        touchLastLogin: false,
      }).catch(() => {});
      try {
        const prevCached = _learningProgressCacheByUid.get(uid);
        const incoming = progress && typeof progress === 'object' ? progress : null;
        const cached = incoming
          ? (prevCached && typeof prevCached === 'object'
              ? mergeProgressConservative(prevCached, incoming)
              : {
                  ..._defaultLearningProgress(),
                  ...incoming,
                })
          : prevCached;
        if (cached && typeof cached === 'object') {
          _learningProgressCacheByUid.set(uid, cached);
          _learningProgressCacheMeaningfulByUid.set(uid, hasMeaningfulProgress(cached));
          _learningProgressLastResolvedAtByUid.set(uid, Date.now());
        }
      } catch (_) {}
      if (__DEV__) {
        console.log('[firebaseService] saveLearningProgress:done', {
          uid,
          docPath: `users/${uid}`,
        });
      }
      return true;
    } catch (postWriteError) {
      console.warn('Firebase saveLearningProgress post-write error:', postWriteError?.message);
      if (__DEV__) {
        console.log('[firebaseService] saveLearningProgress:done', {
          uid,
          docPath: `users/${uid}`,
          ok: false,
          error: postWriteError?.message || 'post-write-error',
        });
      }
      return false;
    }
  };
  _saveLearningProgressChain = _saveLearningProgressChain.then(runSave, runSave);
  return _saveLearningProgressChain;
}

/**
 * Lấy tiến độ học tập từ Firestore (đã gộp vocabularyProgress + learningProgress).
 * @param {{ source?: 'default' | 'server' | 'cache', forceRefresh?: boolean }} [options] — dùng `source: 'server'` sau khi học để tránh cache cũ.
 */
export async function getLearningProgress(options = {}) {
  try {
    await ensureFirestoreAuthReady({
      restoreTimeoutMs: 2500,
      tokenTimeoutMs: 2800,
      networkTimeoutMs: 1800,
      initTimeoutMs: 2500,
    });
  } catch (_) {
    // Không fail sớm: vẫn cố đọc từ cache/default để UI người dùng không rỗng.
  }
  if (!getFirebaseUid()) {
    syncUidFromCurrentAuth();
  }
  if (!getFirebaseUid()) {
    try {
      await waitForAuthRestore(5000);
      syncUidFromCurrentAuth();
    } catch (_) {}
  }
  if (!getFirebaseUid()) return _defaultLearningProgress();
  const uid = getFirebaseUid();
  if (__DEV__) {
    console.log('[firebaseService] getLearningProgress:start', {
      uid,
      docPath: `users/${uid}`,
      source: options?.source || 'default',
      forceRefresh: Boolean(options?.forceRefresh),
    });
  }
  const source = options?.source;
  const cachedProgress = _learningProgressCacheByUid.get(uid);
  const cachedMeaningful = _learningProgressCacheMeaningfulByUid.get(uid) === true;
  const lastResolvedAt = _learningProgressLastResolvedAtByUid.get(uid) || 0;
  const now = Date.now();
  if (
    cachedProgress &&
    cachedMeaningful &&
    !options?.forceRefresh &&
    now - lastResolvedAt < 2500 &&
    source !== 'server'
  ) {
    return cachedProgress;
  }
  const getDocBySource = async (ref, src, label) => {
    const opts = src ? {source: src} : undefined;
    const timeoutMs = src === 'cache' ? 2600 : src === 'server' ? 12000 : 9000;
    try {
      return await withOpTimeout(ref.get(opts), timeoutMs, `${label}.get`);
    } catch (e) {
      const msg = String(e?.message || '');
      if ((src == null || src === 'server') && msg.includes('timeout')) {
        return withOpTimeout(ref.get({source: 'cache'}), 1800, `${label}.cache.get`);
      }
      throw e;
    }
  };
  const readLegacyBySource = async (src) => {
    const snap = await getDocBySource(userDoc(), src, 'users.current');
    const data = snapshotExists(snap) ? snap.data() : null;
    return combineLearningProgressFromFirestore(data);
  };
  const readProgressBySource = async (src) => {
    const snap = await getDocBySource(
      userProgressDoc(),
      src,
      'userProgress.current',
    );
    const data = snapshotExists(snap) ? snap.data() : null;
    return combineLearningProgressFromFirestore(data);
  };
  const readMergedBySource = async (src) => {
    // Luôn ưu tiên users/{uid} vì saveLearningProgress ghi vào path này.
    const l = await readLegacyBySource(src).catch(() => null);
    if (l && hasMeaningfulProgress(l)) return l;
    const p = await readProgressBySource(src).catch(() => null);
    if (l && p) return mergeProgressConservative(l, p);
    return l || p || _defaultLearningProgress();
  };
  try {
    let progress = await readMergedBySource(source);
    if (progress && typeof progress === 'object' && hasMeaningfulProgress(progress)) {
      _learningProgressCacheByUid.set(uid, progress);
      _learningProgressCacheMeaningfulByUid.set(uid, true);
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return progress;
    }

    if (source === 'server') {
      progress = await readMergedBySource('cache').catch(() => null);
    } else if (source === 'cache') {
      progress = await readMergedBySource('server').catch(() => null);
    } else {
      progress = await readMergedBySource('cache').catch(() => null);
      if (!(progress && typeof progress === 'object')) {
        progress = await readMergedBySource('server').catch(() => null);
      }
    }
    if (progress && typeof progress === 'object' && hasMeaningfulProgress(progress)) {
      _learningProgressCacheByUid.set(uid, progress);
      _learningProgressCacheMeaningfulByUid.set(uid, true);
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return progress;
    }

    await waitForAuthRestore(2500);
    await ensureFirestoreAuthReady();
    progress = await readMergedBySource('server').catch(() => null);
    if (progress && typeof progress === 'object' && hasMeaningfulProgress(progress)) {
      _learningProgressCacheByUid.set(uid, progress);
      _learningProgressCacheMeaningfulByUid.set(uid, true);
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return progress;
    }

    progress = await readMergedBySource(undefined).catch(() => null);
    if (progress && typeof progress === 'object' && hasMeaningfulProgress(progress)) {
      _learningProgressCacheByUid.set(uid, progress);
      _learningProgressCacheMeaningfulByUid.set(uid, true);
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return progress;
    }

    const directReadMerged = await (async () => {
      try {
        const [legacySnap, progressSnap] = await Promise.all([
          withOpTimeout(userDoc().get(), 12000, 'users.current.direct.get'),
          withOpTimeout(userProgressDoc().get(), 12000, 'userProgress.current.direct.get'),
        ]);
        const legacyData = snapshotExists(legacySnap) ? legacySnap.data() : null;
        const progressData = snapshotExists(progressSnap) ? progressSnap.data() : null;
        const legacyMerged = combineLearningProgressFromFirestore(legacyData);
        const progressMerged = combineLearningProgressFromFirestore(progressData);
        if (legacyMerged && progressMerged) {
          return mergeProgressConservative(legacyMerged, progressMerged);
        }
        return legacyMerged || progressMerged || null;
      } catch (e) {
        return null;
      }
    })();
    if (
      directReadMerged &&
      typeof directReadMerged === 'object' &&
      hasMeaningfulProgress(directReadMerged)
    ) {
      _learningProgressCacheByUid.set(uid, directReadMerged);
      _learningProgressCacheMeaningfulByUid.set(uid, true);
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return directReadMerged;
    }

    if (ENABLE_LEGACY_PROGRESS_RECOVERY) {
      const recovered =
        (await tryRecoverProgressByEmail(uid, source).catch(() => null)) ||
        (await tryRecoverProgressByEmail(uid, 'server').catch(() => null)) ||
        (await tryRecoverProgressByEmail(uid, 'cache').catch(() => null)) ||
        (await tryRecoverProgressByIdentity(uid, source).catch(() => null)) ||
        (await tryRecoverProgressByIdentity(uid, 'server').catch(() => null)) ||
        (await tryRecoverProgressByIdentity(uid, 'cache').catch(() => null));
      if (recovered && typeof recovered === 'object' && hasMeaningfulProgress(recovered)) {
        _learningProgressCacheByUid.set(uid, recovered);
        _learningProgressCacheMeaningfulByUid.set(uid, true);
        _learningProgressLastResolvedAtByUid.set(uid, Date.now());
        void saveLearningProgress(recovered).catch(() => {});
        return recovered;
      }
    }

    if (_learningProgressCacheByUid.has(uid) && cachedMeaningful) {
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return _learningProgressCacheByUid.get(uid);
    }
    if (progress && typeof progress === 'object') {
      const normalized = {
        ..._defaultLearningProgress(),
        ...progress,
      };
      return normalized;
    }
    return _defaultLearningProgress();
  } catch (error) {
    console.warn('Firebase getLearningProgress error:', error?.message);
    if (_learningProgressCacheByUid.has(uid) && cachedMeaningful) {
      _learningProgressLastResolvedAtByUid.set(uid, Date.now());
      return _learningProgressCacheByUid.get(uid);
    }
    return _defaultLearningProgress();
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
  if (!getFirebaseUid()) return false;
  try {
    const data = await getData();
    const current = data?.[DATA_FIELD] || {};
    await userDoc().set(
      {[DATA_FIELD]: {...current, [USER_DATA_KEY]: userData}},
      {merge: true},
    );
    void syncCurrentUserToPublicLeaderboard({
      userData,
      touchLastLogin: false,
    }).catch(() => {});
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
  return data?.[DATA_FIELD]?.[USER_DATA_KEY] ?? {};
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
  if (!getFirebaseUid()) return;
  const user = getCurrentUser();
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
      lastLoginAt: serverTimestamp(),
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
      next.createdAt = serverTimestamp();
    }
    inner[USER_DATA_KEY] = next;
    await userDoc().set({[DATA_FIELD]: inner}, {merge: true});
    void syncCurrentUserToPublicLeaderboard({
      rootData: {[DATA_FIELD]: inner},
      userData: next,
      touchLastLogin: true,
    }).catch(() => {});
  } catch (e) {
    console.warn('syncAuthProfileToUserData', e?.message);
  }
}

/**
 * Xóa toàn bộ dữ liệu user (đăng xuất / reset).
 */
export async function clearAllData() {
  await ensureInit();
  if (!getFirebaseUid()) return true;
  try {
    await Promise.all([userDoc().delete(), userProgressDoc().delete()]);
    return true;
  } catch (error) {
    console.warn('Firebase clearAllData error:', error?.message);
    return false;
  }
}
