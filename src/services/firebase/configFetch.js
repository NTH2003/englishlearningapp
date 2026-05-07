/**
 * Lấy list từ config/{docId}.{field}
 * Ưu tiên: cache → server → retry
 */
import {getApp} from '@react-native-firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocFromCache,
  getDocFromServer,
} from '@react-native-firebase/firestore';
import {CONFIG_COLLECTION} from './constants';
import {
  ensureFirestoreAuthReady,
  waitForAuthRestore,
  hasSignedInUser,
} from './sessionCore';

const _inFlight = new Map();
const db = getFirestore(getApp());

function snapshotExists(snap) {
  if (!snap) return false;
  if (typeof snap.exists === 'function') return snap.exists();
  return Boolean(snap.exists);
}

function timeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

async function read(ref, field, source, ms) {
  try {
    const readPromise =
      source === 'cache' ? getDocFromCache(ref) : getDocFromServer(ref);
    const snap = await timeout(readPromise, ms);
    if (!snapshotExists(snap)) return null;
    const data = snap.data();
    return Array.isArray(data?.[field]) ? data[field] : null;
  } catch {
    return null;
  }
}

export async function fetchConfigList({
  docId,
  field,
  requireSignedInUser = true,
  timeoutMs = 8000,
}) {
  const key = `${docId}:${field}`;
  if (_inFlight.has(key)) return _inFlight.get(key);

  const run = (async () => {
    const ref = doc(collection(db, CONFIG_COLLECTION), docId);

    // 1. Đảm bảo user đã login
    if (requireSignedInUser) {
      let ok = await hasSignedInUser();
      if (!ok) {
        try {
          await waitForAuthRestore(3000);
        } catch {}
      }
      ok = await hasSignedInUser();
      if (!ok) return null;
    }

    // 2. Đọc cache trước
    const cached = await read(ref, field, 'cache', 2000);
    if (Array.isArray(cached) && cached.length > 0) {
      // sync ngầm server (không block UI)
      ensureFirestoreAuthReady().then(() =>
        getDocFromServer(ref).catch(() => {}),
      );
      return cached;
    }

    // 3. Đọc server
    // Với dữ liệu config dùng chung (requireSignedInUser=false), ưu tiên đọc thẳng
    // để không bị block bởi auth restore sau reload (r,r).
    try {
      if (!requireSignedInUser) {
        const serverDirect = await read(ref, field, 'server', timeoutMs);
        if (Array.isArray(serverDirect)) return serverDirect;
      } else {
        await ensureFirestoreAuthReady();
      }
      const server = await read(ref, field, 'server', timeoutMs);
      if (Array.isArray(server)) return server;
    } catch {}

    // 4. Retry lần cuối
    try {
      // Chỉ chờ auth khi thực sự cần user.
      if (requireSignedInUser) {
        await waitForAuthRestore(3000);
        await ensureFirestoreAuthReady();
      }
      const retry = await read(ref, field, 'server', timeoutMs);
      if (Array.isArray(retry)) return retry;
    } catch {}

    return cached || null;
  })();

  _inFlight.set(key, run);

  try {
    return await run;
  } finally {
    _inFlight.delete(key);
  }
}