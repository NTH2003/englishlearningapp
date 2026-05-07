/**
 * Thử khôi phục tiến độ legacy theo email / danh tính (khi bật ENABLE_LEGACY_PROGRESS_RECOVERY).
 */
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {USERS_COLLECTION, USER_PROGRESS_COLLECTION, DATA_FIELD, USER_DATA_KEY} from './constants';
import {
  combineLearningProgressFromFirestore,
  hasMeaningfulProgress,
  mergeProgressConservative,
} from './progressMerge';

export async function tryRecoverProgressByEmail(currentUid, source) {
  const user = auth().currentUser;
  const email = user?.email ? String(user.email).trim() : '';
  if (!email) return null;
  try {
    const snap = await firestore()
      .collection(USERS_COLLECTION)
      .where(`${DATA_FIELD}.${USER_DATA_KEY}.email`, '==', email)
      .get(source ? {source} : undefined);
    if (snap.empty) return null;
    let best = null;
    snap.forEach((doc) => {
      if (!doc.exists) return;
      if (doc.id === currentUid) return;
      const p = combineLearningProgressFromFirestore(doc.data());
      if (!p || typeof p !== 'object' || !hasMeaningfulProgress(p)) return;
      if (!best) {
        best = p;
        return;
      }
      const curScore = Math.max(0, Number(best.totalXP) || 0);
      const nextScore = Math.max(0, Number(p.totalXP) || 0);
      if (nextScore >= curScore) {
        best = mergeProgressConservative(best, p);
      } else {
        best = mergeProgressConservative(p, best);
      }
    });
    return best;
  } catch (_) {
    return null;
  }
}

function buildIdentityNeedles(user) {
  const out = new Set();
  const email = user?.email ? String(user.email).trim().toLowerCase() : '';
  if (email) {
    out.add(email);
    const local = email.split('@')[0]?.trim();
    if (local) out.add(local.toLowerCase());
  }
  const dn = user?.displayName ? String(user.displayName).trim().toLowerCase() : '';
  if (dn) out.add(dn);
  return out;
}

function pickLegacyIdentityLabel(udObj) {
  if (!udObj || typeof udObj !== 'object') return '';
  const raw =
    String(udObj.displayName || udObj.name || '').trim() ||
    (typeof udObj.fullName === 'string' ? udObj.fullName.trim() : '') ||
    String(udObj.nickname || udObj.username || udObj.profileName || '').trim() ||
    String(udObj.email || '').trim();
  return raw.toLowerCase();
}

export async function tryRecoverProgressByIdentity(currentUid, source) {
  const user = auth().currentUser;
  const needles = buildIdentityNeedles(user);
  if (!needles.size) return null;
  try {
    const usersSnap = await firestore()
      .collection(USERS_COLLECTION)
      .get(source ? {source} : undefined);
    let best = null;
    const candidateUids = [];
    usersSnap.forEach((doc) => {
      if (!doc.exists || doc.id === currentUid) return;
      const raw = doc.data();
      const ud = raw?.[DATA_FIELD]?.[USER_DATA_KEY];
      const label = pickLegacyIdentityLabel(ud);
      if (!label) return;
      if (!needles.has(label)) return;
      candidateUids.push(doc.id);
      const p = combineLearningProgressFromFirestore(raw);
      if (!p || typeof p !== 'object' || !hasMeaningfulProgress(p)) return;
      best = best ? mergeProgressConservative(best, p) : p;
    });
    if (!candidateUids.length) return best;
    const progressSnaps = await Promise.all(
      candidateUids.map((uid) =>
        firestore()
          .collection(USER_PROGRESS_COLLECTION)
          .doc(uid)
          .get(source ? {source} : undefined)
          .catch(() => null),
      ),
    );
    progressSnaps.forEach((snap) => {
      const raw = snap?.exists ? snap.data() : null;
      const p = combineLearningProgressFromFirestore(raw);
      if (!p || typeof p !== 'object' || !hasMeaningfulProgress(p)) return;
      best = best ? mergeProgressConservative(best, p) : p;
    });
    return best;
  } catch (_) {
    return null;
  }
}
