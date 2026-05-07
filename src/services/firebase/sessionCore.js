/**
 * Phiên đăng nhập Firebase, đồng bộ token ↔ Firestore.
 */
import {getApp} from '@react-native-firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  getIdToken,
  signInAnonymously,
} from '@react-native-firebase/auth';
import {getFirestore, enableNetwork} from '@react-native-firebase/firestore';

const app = getApp();
const authInstance = getAuth(app);
const db = getFirestore(app);

let _uid = null;
let _initPromise = null;
/** Sau khi đổi user / đăng xuất: lần đọc Firestore tiếp theo buộc làm mới token. */
let _lastFirestoreSyncUid = null;
let _networkEnabled = false;
// Cho phép fallback anonymous để tránh app rỗng dữ liệu sau reload khi chưa có phiên.
// Lưu ý: chỉ fallback sau khi đã chờ restore đủ lâu để hạn chế tạo UID mới ngoài ý muốn.
const ALLOW_ANONYMOUS_FALLBACK = true;

export function getFirebaseUid() {
  return authInstance.currentUser?.uid || _uid;
}

/** Gọi sau đăng nhập/đăng xuất thủ công (signIn, signOut). */
export function refreshSessionUid() {
  const user = authInstance.currentUser;
  _uid = user ? user.uid : null;
  _initPromise = null;
}

/** Đồng bộ `_uid` khi đã có user trên Auth nhưng cache session chưa cập nhật. */
export function syncUidFromCurrentAuth() {
  const cu = authInstance.currentUser;
  if (cu?.uid) {
    _uid = cu.uid;
  }
}

/** Luôn khớp `_uid` với phiên đăng nhập hiện tại — tránh đọc/ghi nhầm `users/{uid}` sau khi đăng nhập/đăng xuất. */
try {
  onAuthStateChanged(authInstance, (user) => {
    _uid = user ? user.uid : null;
    _initPromise = null;
    if (!user) {
      _lastFirestoreSyncUid = null;
    }
  });
} catch (_) {}

/** Chờ Auth khôi phục phiên email/Google. Nếu không có phiên thì trả về null. */
async function waitForAuthOrAnonymous() {
  let user = authInstance.currentUser;
  if (user) return user;
  try {
    // Tăng thời gian chờ restore để giảm nguy cơ tạo anonymous mới trước khi
    // Firebase kịp khôi phục phiên cũ sau reload (r,r).
    const restored = await waitForAuthRestore(15000);
    if (restored) return restored;
  } catch (_) {}
  if (!ALLOW_ANONYMOUS_FALLBACK) {
    return authInstance.currentUser || null;
  }
  // Chỉ fallback anonymous khi được bật rõ ràng.
  try {
    // Double-check trước khi tạo anonymous mới.
    const restoredLate = await waitForAuthRestore(1200).catch(() => null);
    if (restoredLate) return restoredLate;
    const cred = await withOpTimeout(signInAnonymously(authInstance), 4500, 'signInAnonymously');
    return cred?.user || authInstance.currentUser || null;
  } catch (_) {
    return authInstance.currentUser || null;
  }
}

/**
 * Chờ thêm một nhịp để phiên đăng nhập được restore (không tạo anonymous mới).
 * Dùng cho các lần đọc config lúc app vừa mở để tránh nhận trạng thái "rỗng giả".
 */
export async function waitForAuthRestore(ms = 10000) {
  if (authInstance.currentUser) return authInstance.currentUser;
  return new Promise((resolve) => {
    let unsub = () => {};
    const t = setTimeout(() => {
      unsub();
      resolve(authInstance.currentUser || null);
    }, ms);
    unsub = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        clearTimeout(t);
        unsub();
        resolve(user);
      }
    });
  });
}

export async function withOpTimeout(promise, ms, label = 'operation') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}-timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Đồng bộ token Auth ↔ Firestore trước khi đọc `config/*`. Dùng sau khi đăng nhập / preload.
 */
export async function ensureFirestoreAuthReady(options = {}) {
  await withOpTimeout(
    ensureInit(),
    Math.max(1000, Number(options?.initTimeoutMs) || 4000),
    'ensureInit',
  );
  let u = authInstance.currentUser;
  const restoreTimeoutMs = Math.max(0, Number(options?.restoreTimeoutMs) || 15000);
  if (!u) {
    u = await withOpTimeout(
      waitForAuthRestore(restoreTimeoutMs),
      restoreTimeoutMs + 500,
      'waitForAuthRestore',
    );
  }
  if (u) {
    const uid = u.uid;
    const needFreshToken = _lastFirestoreSyncUid !== uid;
    try {
      if (needFreshToken) {
        await withOpTimeout(
          getIdToken(u, true),
          Math.max(1200, Number(options?.tokenTimeoutMs) || 4500),
          'getIdToken(force)',
        );
        _lastFirestoreSyncUid = uid;
      } else {
        await withOpTimeout(
          getIdToken(u, false),
          Math.max(1200, Number(options?.tokenTimeoutMs) || 4500),
          'getIdToken',
        );
      }
    } catch (_) {
      try {
        await withOpTimeout(
          getIdToken(u, false),
          Math.max(1200, Number(options?.tokenTimeoutMs) || 4500),
          'getIdToken(retry-nonforce)',
        );
      } catch (_) {}
    }
  } else {
    _lastFirestoreSyncUid = null;
  }
  try {
    if (!_networkEnabled) {
      await withOpTimeout(
        enableNetwork(db),
        Math.max(800, Number(options?.networkTimeoutMs) || 2500),
        'enableNetwork',
      );
      _networkEnabled = true;
    }
  } catch (_) {}
}

/**
 * Khởi tạo Firebase theo phiên hiện tại (không tự tạo anonymous), trả về uid.
 * @returns {Promise<string|null>} uid hoặc null nếu chưa có phiên/đang lỗi
 */
export async function ensureInit() {
  const cu = authInstance.currentUser;
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

export async function hasSignedInUser() {
  await ensureInit();
  return Boolean(authInstance.currentUser);
}
