import {collection, doc, getDoc, getDocs, serverTimestamp, setDoc} from 'firebase/firestore';
import {db} from './firebase';
import {combineLearningProgressFromFirestore} from './learningProgressMerge.js';

const CONFIG_COLLECTION = 'config';

export const RESOURCES = {
  topics: {docId: 'topics', field: 'topics'},
  vocabulary: {docId: 'vocabulary', field: 'words'},
  videos: {docId: 'videos', field: 'videos'},
  dialogues: {docId: 'dialogues', field: 'dialogues'},
};

function stripDescriptionDeep(value) {
  if (Array.isArray(value)) {
    return value.map(stripDescriptionDeep);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'description') continue;
      out[k] = stripDescriptionDeep(v);
    }
    return out;
  }
  return value;
}

export async function getResourceList(resourceKey) {
  const meta = RESOURCES[resourceKey];
  if (!meta) throw new Error(`Unknown resource: ${resourceKey}`);
  const ref = doc(db, CONFIG_COLLECTION, meta.docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  const data = snap.data();
  return Array.isArray(data?.[meta.field]) ? data[meta.field] : [];
}

export async function saveResourceList(resourceKey, list) {
  const meta = RESOURCES[resourceKey];
  if (!meta) throw new Error(`Unknown resource: ${resourceKey}`);
  if (!Array.isArray(list)) throw new Error('List must be an array');
  const ref = doc(db, CONFIG_COLLECTION, meta.docId);
  await setDoc(ref, {[meta.field]: stripDescriptionDeep(list)}, {merge: true});
}

const USERS_COLLECTION = 'users';
const DATA_FIELD = 'data';
const USER_DATA_KEY = 'userData';
const ADMIN_ACTIVE_TODAY_WITHIN_MS = 24 * 60 * 60 * 1000;
const ADMIN_ACTIVE_LOGIN_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_AVATAR_COLORS = [
  '#DBEAFE',
  '#FCE7F3',
  '#EDE9FE',
  '#DCFCE7',
  '#FEF3C7',
  '#FEE2E2',
];

function gameLevelFromTotalXP(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  return Math.max(1, Math.min(99, Math.floor(xp / 250) + 1));
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

function formatFirestoreDateTimeMaybe(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'});
  } catch (_) {
    return '—';
  }
}

function formatDailySummary(daily) {
  if (!daily || typeof daily !== 'object') return '—';
  const keys = Object.keys(daily);
  if (!keys.length) return '—';
  return `${keys.length} ngày có ghi nhận hoạt động`;
}

function countMapKeys(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}

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

function avatarColorForUid(uid) {
  const s = String(uid || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ADMIN_AVATAR_COLORS[Math.abs(h) % ADMIN_AVATAR_COLORS.length];
}

function mapUserDocToAdminRow(uid, userDoc) {
  const lpRaw = combineLearningProgressFromFirestore(userDoc);
  const lp = lpRaw && typeof lpRaw === 'object' ? lpRaw : {};
  const wordsLearned = Array.isArray(lp.wordsLearned) ? lp.wordsLearned.length : 0;
  const totalXP = Math.max(0, Number(lp.totalXP) || Number(lp.totalXp) || Number(lp.xp) || 0);
  const levelGame = gameLevelFromTotalXP(totalXP);
  const levelNameVi = String(lp.level || '').trim();
  const ud = userDoc?.[DATA_FIELD]?.[USER_DATA_KEY];
  const udObj = ud && typeof ud === 'object' ? ud : {};
  const email = udObj.email ? String(udObj.email) : '—';
  const name =
    String(udObj.displayName || udObj.name || '').trim() ||
    (email !== '—' ? email.split('@')[0] : String(uid).slice(0, 8));
  const videosWatched = Array.isArray(lp.videosWatched) ? lp.videosWatched.length : 0;
  const lessonsCompleted = Array.isArray(lp.lessonsCompleted) ? lp.lessonsCompleted.length : 0;
  const dialoguesCompleted = Array.isArray(lp.dialoguesCompleted) ? lp.dialoguesCompleted.length : 0;
  const weakWordIds = Array.isArray(lp.weakWordIds) ? lp.weakWordIds.length : 0;
  const reviewWrongWordIds = Array.isArray(lp.reviewWrongWordIds) ? lp.reviewWrongWordIds.length : 0;
  const videoViewDistinct = countMapKeys(lp.videoViewCounts);
  const dialogueTopicStats = countMapKeys(lp.dialogueStats);
  const topicPracticeTopics = countMapKeys(lp.topicPracticeStats);
  const xpFlags = countMapKeys(lp.xpEventFlags);

  return {
    id: uid,
    name,
    email,
    photoURL: udObj.photoURL ? String(udObj.photoURL).trim() : '',
    level: levelGame,
    levelNameVi: levelNameVi || '—',
    words: wordsLearned,
    totalXP,
    videosWatched,
    lessonsCompleted,
    dialoguesCompleted,
    weakWordIds,
    reviewWrongWordIds,
    videoViewDistinct,
    dialogueTopicStats,
    topicPracticeTopics,
    xpFlags,
    dailySummary: formatDailySummary(lp.daily),
    joined: formatFirestoreDateTimeMaybe(udObj.createdAt),
    lastLoginLabel: formatFirestoreDateTimeMaybe(udObj.lastLoginAt),
    docUpdatedLabel: formatFirestoreDateTimeMaybe(userDoc?.updatedAt),
    active: isActiveByLastLogin(udObj),
    isSuspended: Boolean(udObj.isSuspended),
    suspendedAtLabel: formatFirestoreDateTimeMaybe(udObj.suspendedAt),
    avatarColor: avatarColorForUid(uid),
  };
}

export async function listUsersForAdmin() {
  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    const users = [];
    snap.forEach((d) => {
      if (d.exists()) users.push(mapUserDocToAdminRow(d.id, d.data()));
    });
    users.sort((a, b) => b.words - a.words || String(a.name).localeCompare(String(b.name), 'vi'));
    return {ok: true, users};
  } catch (e) {
    return {ok: false, users: [], error: e?.message || 'Không tải được danh sách người dùng.'};
  }
}

export async function getAdminDashboardStats() {
  try {
    const [usersSnap, topicsList, vocabList, videoList, dialogueList] = await Promise.all([
      getDocs(collection(db, USERS_COLLECTION)),
      getResourceList('topics'),
      getResourceList('vocabulary'),
      getResourceList('videos'),
      getResourceList('dialogues'),
    ]);
    let activeToday = 0;
    let active30d = 0;
    let suspendedUsers = 0;
    let totalXP = 0;
    const topLearners = [];
    usersSnap.forEach((d) => {
      const data = d.data();
      const row = mapUserDocToAdminRow(d.id, data);
      const udObj = data?.[DATA_FIELD]?.[USER_DATA_KEY];
      if (udObj && typeof udObj === 'object' && isActiveTodayByLastLogin(udObj)) activeToday += 1;
      if (row.active) active30d += 1;
      if (row.isSuspended) suspendedUsers += 1;
      totalXP += Math.max(0, Number(row.totalXP) || 0);
      topLearners.push({
        id: row.id,
        name: row.name,
        email: row.email,
        totalXP: row.totalXP,
        words: row.words,
        level: row.level,
      });
    });
    topLearners.sort((a, b) => b.totalXP - a.totalXP || b.words - a.words || String(a.name).localeCompare(String(b.name), 'vi'));
    const totalUsers = usersSnap.size || 0;
    return {
      ok: true,
      stats: {
        totalUsers,
        activeToday,
        active30d,
        suspendedUsers,
        topicCount: Array.isArray(topicsList) ? topicsList.length : 0,
        vocabularyCount: Array.isArray(vocabList) ? vocabList.length : 0,
        videoCount: Array.isArray(videoList) ? videoList.length : 0,
        dialogueCount: Array.isArray(dialogueList) ? dialogueList.length : 0,
        totalXP,
        topLearners: topLearners.slice(0, 5),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || 'Không tải được thống kê.',
      stats: {
        totalUsers: 0,
        activeToday: 0,
        active30d: 0,
        suspendedUsers: 0,
        topicCount: 0,
        vocabularyCount: 0,
        videoCount: 0,
        dialogueCount: 0,
        totalXP: 0,
        topLearners: [],
      },
    };
  }
}

export async function setUserSuspendedForAdmin(uid, suspended) {
  const id = String(uid || '').trim();
  if (!id) return {ok: false, error: 'UID không hợp lệ.'};
  try {
    const payload = {
      [DATA_FIELD]: {
        [USER_DATA_KEY]: {
          isSuspended: Boolean(suspended),
          suspendedAt: suspended ? serverTimestamp() : null,
        },
      },
    };
    await setDoc(doc(db, USERS_COLLECTION, id), payload, {merge: true});
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e?.message || 'Không cập nhật được trạng thái người dùng.'};
  }
}
