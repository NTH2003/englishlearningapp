/**
 * Tham chiếu Firestore cho user hiện tại.
 */
import {getApp} from '@react-native-firebase/app';
import {getFirestore, collection, doc} from '@react-native-firebase/firestore';
import {
  USERS_COLLECTION,
  USER_PROGRESS_COLLECTION,
  LEADERBOARD_PUBLIC_COLLECTION,
} from './constants';
import {getFirebaseUid} from './sessionCore';

const db = getFirestore(getApp());

function getSafeUid(rawUid) {
  const candidate = rawUid ?? getFirebaseUid();
  const uid = String(candidate || '').trim();
  return uid || null;
}

function userRef(collectionName, rawUid, {throwIfMissing = true} = {}) {
  const uid = getSafeUid(rawUid);
  if (!uid) {
    if (throwIfMissing) {
      throw new Error('Firebase not initialized');
    }
    return null;
  }
  return doc(collection(db, collectionName), uid);
}

export function userDoc() {
  return userRef(USERS_COLLECTION, null, {throwIfMissing: true});
}

export function userProgressDoc() {
  return userRef(USER_PROGRESS_COLLECTION, null, {throwIfMissing: true});
}

// Bản an toàn cho các luồng không muốn throw khi auth chưa sẵn sàng.
export function userDocSafe() {
  return userRef(USERS_COLLECTION, null, {throwIfMissing: false});
}

export function userProgressDocSafe() {
  return userRef(USER_PROGRESS_COLLECTION, null, {throwIfMissing: false});
}

export function leaderboardPublicDoc(uid) {
  return userRef(LEADERBOARD_PUBLIC_COLLECTION, uid, {throwIfMissing: true});
}

export function leaderboardPublicDocSafe(uid) {
  return userRef(LEADERBOARD_PUBLIC_COLLECTION, uid, {throwIfMissing: false});
}
