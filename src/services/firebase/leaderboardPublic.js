/**
 * Bảng xếp hạng công khai (`leaderboardPublic`) và đồng bộ điểm tuần.
 * Phụ thuộc tới firebaseService chỉ qua require lazy trong vài chỗ để tránh vòng import.
 */
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  limit as limitQuery,
  writeBatch,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import {
  USERS_COLLECTION,
  LEADERBOARD_PUBLIC_COLLECTION,
  DATA_FIELD,
  USER_DATA_KEY,
} from './constants';
import {combineLearningProgressFromFirestore} from './progressMerge';
import {ensureInit, getFirebaseUid, withOpTimeout} from './sessionCore';
import {leaderboardPublicDoc} from './userRefs';

const authInstance = getAuth(getApp());
const db = getFirestore(getApp());

function svc() {
  return require('../firebaseService');
}

export function gameLevelFromTotalXP(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  return Math.max(1, Math.min(99, Math.floor(xp / 250) + 1));
}

export function parseLevelLabelToNumber(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const m = s.match(/(\d+)/);
  if (!m) return 0;
  return Math.max(1, Number(m[1]) || 1);
}

function sanitizeLeaderboardName(rawName, fallbackUid = getFirebaseUid()) {
  const s = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (s) return s.slice(0, 40);
  if (fallbackUid) return `User ${String(fallbackUid).slice(0, 6)}`;
  return 'Người học';
}

function computeLeaderboardLevel(progressObj, fallbackLabel) {
  const xp = Math.max(0, Number(progressObj?.totalXP) || 0);
  const byXp = gameLevelFromTotalXP(xp);
  const byLabel = parseLevelLabelToNumber(fallbackLabel || progressObj?.level);
  return Math.max(1, byXp, byLabel || 1);
}

export function getUtcWeekKey(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const date = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function getUtcWeekStartMs(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function parseFirestoreDateMs(value) {
  if (!value) return 0;
  try {
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
    }
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  } catch (_) {
    return 0;
  }
}

export async function syncCurrentUserToPublicLeaderboard(options = {}) {
  try {
    await ensureInit();
    if (!getFirebaseUid()) return false;
    const uid = getFirebaseUid();
    const user = authInstance.currentUser;
    const rootData =
      options?.rootData ??
      (await svc().getData().catch(() => null));
    const learningProgress =
      options?.learningProgress ||
      combineLearningProgressFromFirestore(rootData) ||
      {};
    const userData =
      options?.userData ||
      (rootData?.[DATA_FIELD]?.[USER_DATA_KEY] &&
      typeof rootData?.[DATA_FIELD]?.[USER_DATA_KEY] === 'object'
        ? rootData?.[DATA_FIELD]?.[USER_DATA_KEY]
        : {});
    const name =
      sanitizeLeaderboardName(
        userData?.displayName ||
          userData?.name ||
          user?.displayName ||
          (userData?.email ? String(userData.email).split('@')[0] : ''),
        uid,
      ) || `User ${String(uid).slice(0, 6)}`;
    const totalXP = Math.max(0, Number(learningProgress?.totalXP) || 0);
    const weekKey = getUtcWeekKey();
    // Lần đầu có doc leaderboard: baseline = totalXP hiện tại → weeklyXP = 0 (tránh coi cả XP tích lũy là XP tuần).
    let weekBaseTotalXP = totalXP;
    try {
      const lbSnap = await leaderboardPublicDoc(uid).get({source: 'server'});
      if (lbSnap?.exists) {
        const prev = lbSnap.data() || {};
        const prevWeekKey = String(prev?.weekKey || '');
        const prevBase = Math.max(0, Number(prev?.weekBaseTotalXP) || 0);
        if (prevWeekKey === weekKey) {
          weekBaseTotalXP = prevBase;
        } else {
          weekBaseTotalXP = totalXP;
        }
      }
    } catch (_) {}
    const weeklyXP = Math.max(0, totalXP - weekBaseTotalXP);
    const payload = {
      uid,
      name,
      totalXP,
      weeklyXP,
      weekKey,
      weekBaseTotalXP,
      level: computeLeaderboardLevel(learningProgress, userData?.level),
      updatedAt: serverTimestamp(),
      lastLoginAt:
        options?.touchLastLogin || userData?.lastLoginAt
          ? serverTimestamp()
          : null,
    };
    await leaderboardPublicDoc(uid).set(payload, {merge: true});
    return true;
  } catch (e) {
    console.warn('syncCurrentUserToPublicLeaderboard', e?.message || e);
    return false;
  }
}

export async function backfillWeeklyLeaderboardFromUsers(options = {}) {
  if (!svc().canManageUsers()) return {ok: true, touched: 0};
  const weekKey = String(options?.weekKey || getUtcWeekKey());
  const weekStartMs = Number(options?.weekStartMs) || getUtcWeekStartMs();
  try {
    const usersSnap = await withOpTimeout(
      getDocs(collection(db, USERS_COLLECTION)),
      7000,
      'backfill.users.get',
    );
    let touched = 0;
    const writes = [];
    usersSnap.forEach((doc) => {
      if (!doc.exists) return;
      const raw = doc.data() || {};
      const lp = combineLearningProgressFromFirestore(raw) || {};
      const totalXP = Math.max(0, Number(lp?.totalXP) || 0);
      if (totalXP <= 0) return;
      const updatedAtMs = parseFirestoreDateMs(raw?.updatedAt);
      if (updatedAtMs < weekStartMs) return;
      const ud =
        raw?.[DATA_FIELD]?.[USER_DATA_KEY] && typeof raw?.[DATA_FIELD]?.[USER_DATA_KEY] === 'object'
          ? raw[DATA_FIELD][USER_DATA_KEY]
          : {};
      const name = sanitizeLeaderboardName(
        ud?.displayName || ud?.name || ud?.email || '',
        doc.id,
      );
      writes.push({
        ref: doc(collection(db, LEADERBOARD_PUBLIC_COLLECTION), doc.id),
        data: {
          uid: doc.id,
          name,
          totalXP,
          weeklyXP: totalXP,
          weekKey,
          weekBaseTotalXP: 0,
          level: computeLeaderboardLevel(lp, ud?.level),
          updatedAt: serverTimestamp(),
        },
      });
    });
    for (let i = 0; i < writes.length; i += 300) {
      const batch = writeBatch(db);
      const chunk = writes.slice(i, i + 300);
      chunk.forEach((w) => batch.set(w.ref, w.data, {merge: true}));
      await batch.commit();
      touched += chunk.length;
    }
    return {ok: true, touched};
  } catch (e) {
    console.warn('backfillWeeklyLeaderboardFromUsers', e?.message || e);
    return {ok: false, touched: 0};
  }
}

export async function listPublicLeaderboard(options = {}) {
  await ensureInit();
  await svc().ensureFirestoreAuthReady({restoreTimeoutMs: 2500});
  const limit = Math.min(100, Math.max(5, Number(options?.limit) || 20));
  const weekKey = getUtcWeekKey();
  const weekStartMs = getUtcWeekStartMs();
  try {
    if (svc().canManageUsers()) {
      await backfillWeeklyLeaderboardFromUsers({weekKey, weekStartMs});
    }
    await syncCurrentUserToPublicLeaderboard({touchLastLogin: false}).catch(() => false);
    const ref = collection(db, LEADERBOARD_PUBLIC_COLLECTION);
    const snap = await withOpTimeout(
      getDocs(query(ref, orderBy('totalXP', 'desc'), limitQuery(limit * 5))),
      4200,
      'leaderboardPublic.get',
    );
    const users = [];
    snap.forEach((doc) => {
      if (!doc.exists) return;
      const row = doc.data() || {};
      const rowWeekKey = String(row?.weekKey || '');
      const updatedAtMs = parseFirestoreDateMs(row?.updatedAt);
      const inCurrentWeek =
        rowWeekKey === weekKey || (!rowWeekKey && updatedAtMs >= weekStartMs);
      if (!inCurrentWeek) return;
      const totalXP = Math.max(0, Number(row?.totalXP) || 0);
      const weeklyXPRaw = Number(row?.weeklyXP);
      const weeklyXP = Number.isFinite(weeklyXPRaw)
        ? Math.max(0, weeklyXPRaw)
        : totalXP;
      users.push({
        id: doc.id,
        name: sanitizeLeaderboardName(row?.name, doc.id),
        totalXP,
        weeklyXP,
        level: Math.max(1, Number(row?.level) || 1),
      });
    });
    users.sort(
      (a, b) =>
        b.weeklyXP - a.weeklyXP ||
        b.totalXP - a.totalXP ||
        b.level - a.level ||
        String(a.name).localeCompare(String(b.name), 'vi'),
    );
    if (users.length === 0) {
      const current = svc().getCurrentUser();
      if (current?.uid) {
        const lp =
          (await svc().getLearningProgress({source: 'server'}).catch(() => null)) || {};
        const ud = (await svc().getUserData().catch(() => null)) || {};
        users.push({
          id: String(current.uid),
          name: sanitizeLeaderboardName(
            ud?.displayName || ud?.name || current?.displayName || current?.email || '',
            current.uid,
          ),
          totalXP: Math.max(0, Number(lp?.totalXP) || 0),
          weeklyXP: Math.max(0, Number(lp?.weeklyXP) || 0),
          level: Math.max(1, Number(lp?.level) || gameLevelFromTotalXP(lp?.totalXP)),
        });
      }
    }
    return {ok: true, users};
  } catch (e) {
    const msg = e?.message || 'Không tải được bảng xếp hạng công khai.';
    console.warn('listPublicLeaderboard', msg);
    try {
      const current = svc().getCurrentUser();
      if (current?.uid) {
        const lp =
          (await svc().getLearningProgress({source: 'server'}).catch(() => null)) || {};
        const ud = (await svc().getUserData().catch(() => null)) || {};
        return {
          ok: true,
          users: [
            {
              id: String(current.uid),
              name: sanitizeLeaderboardName(
                ud?.displayName || ud?.name || current?.displayName || current?.email || '',
                current.uid,
              ),
              totalXP: Math.max(0, Number(lp?.totalXP) || 0),
              weeklyXP: Math.max(
                0,
                Number(lp?.weeklyXP) || Number(lp?.totalXP) || 0,
              ),
              level: Math.max(1, Number(lp?.level) || gameLevelFromTotalXP(lp?.totalXP)),
            },
          ],
        };
      }
    } catch (_) {}
    return {ok: false, error: msg, users: []};
  }
}
