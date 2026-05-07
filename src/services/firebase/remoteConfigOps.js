/**
 * Đọc/ghi cấu hình `config/*` (chủ đề, từ vựng, video, hội thoại) và wordMedia.
 */
import {getApp} from '@react-native-firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import {
  CONFIG_COLLECTION,
  TOPICS_DOC_ID,
  VOCABULARY_DOC_ID,
  VIDEOS_DOC_ID,
  DIALOGUES_DOC_ID,
  WORD_MEDIA_COLLECTION,
} from './constants';
import {fetchConfigList} from './configFetch';
import {
  ensureInit,
  waitForAuthRestore,
  hasSignedInUser,
} from './sessionCore';

const db = getFirestore(getApp());

function snapshotExists(snap) {
  if (!snap) return false;
  if (typeof snap.exists === 'function') return snap.exists();
  return Boolean(snap.exists);
}

export async function getTopics(options = {}) {
  try {
    return await fetchConfigList({
      docId: TOPICS_DOC_ID,
      field: 'topics',
      options,
      retryAuthMs: 2500,
      // Không chặn cứng theo auth để tránh "rỗng giả" lúc app vừa mở.
      requireSignedInUser: false,
    });
  } catch (error) {
    console.warn('Firebase getTopics error:', error?.code, error?.message);
    return null;
  }
}

export async function saveTopics(topics) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(topics)) {
      return {ok: false, error: 'Dữ liệu chủ đề không hợp lệ.'};
    }
    await setDoc(doc(collection(db, CONFIG_COLLECTION), TOPICS_DOC_ID), {topics}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi không xác định';
    console.warn('Firebase saveTopics error:', msg);
    return {ok: false, error: msg};
  }
}

export async function getVocabulary(options = {}) {
  try {
    return await fetchConfigList({
      docId: VOCABULARY_DOC_ID,
      field: 'words',
      options,
      retryAuthMs: 2500,
      // Không chặn cứng theo auth để tránh "rỗng giả" lúc app vừa mở.
      requireSignedInUser: false,
    });
  } catch (error) {
    console.warn('Firebase getVocabulary error:', error?.code, error?.message);
    return null;
  }
}

export async function saveVocabulary(words) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(words)) {
      return {ok: false, error: 'Dữ liệu từ vựng không hợp lệ.'};
    }
    await setDoc(doc(collection(db, CONFIG_COLLECTION), VOCABULARY_DOC_ID), {words}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi lưu từ vựng';
    console.warn('Firebase saveVocabulary error:', msg);
    return {ok: false, error: msg};
  }
}

export async function getVideos(options = {}) {
  try {
    return await fetchConfigList({
      docId: VIDEOS_DOC_ID,
      field: 'videos',
      options,
      retryAuthMs: 2500,
      // Không chặn cứng theo auth để tránh "rỗng giả" lúc app vừa mở.
      requireSignedInUser: false,
    });
  } catch (error) {
    console.warn('Firebase getVideos error:', error?.code, error?.message);
    return null;
  }
}

export async function saveVideos(videos) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    if (!Array.isArray(videos)) {
      return {ok: false, error: 'Dữ liệu video không hợp lệ.'};
    }
    await setDoc(doc(collection(db, CONFIG_COLLECTION), VIDEOS_DOC_ID), {videos}, {merge: true});
    return {ok: true};
  } catch (error) {
    const msg = error?.message || 'Lỗi lưu video';
    console.warn('Firebase saveVideos error:', msg);
    return {ok: false, error: msg};
  }
}

export async function getDialogueConfig(options = {}) {
  try {
    // Không chặn cứng theo auth ở đây: fetchConfigList đã có cơ chế tự retry auth/cache.
    try {
      let allowed = await hasSignedInUser();
      if (!allowed) {
        await waitForAuthRestore(5500);
        allowed = await hasSignedInUser();
      }
      // Nếu vẫn chưa có user thì vẫn tiếp tục đọc cache/server thay vì trả rỗng ngay.
    } catch (_) {}
    const [topics, dialogues] = await Promise.all([
      fetchConfigList({
        docId: DIALOGUES_DOC_ID,
        field: 'topics',
        options,
        retryAuthMs: 2500,
        timeoutMs: 5000,
        requireSignedInUser: false,
      }),
      fetchConfigList({
        docId: DIALOGUES_DOC_ID,
        field: 'dialogues',
        options,
        retryAuthMs: 2500,
        timeoutMs: 5000,
        requireSignedInUser: false,
      }),
    ]);
    return {
      topics: Array.isArray(topics) ? topics : [],
      dialogues: Array.isArray(dialogues) ? dialogues : [],
    };
  } catch (error) {
    console.warn('Firebase getDialogueConfig error:', error?.code, error?.message);
    return {topics: [], dialogues: []};
  }
}

export async function saveDialogueConfig({topics = [], dialogues = []}) {
  try {
    const uid = await ensureInit();
    if (!uid) {
      return {ok: false, error: 'Firebase chưa khởi tạo. Kiểm tra Authentication (Anonymous) đã bật.'};
    }
    await setDoc(
      doc(collection(db, CONFIG_COLLECTION), DIALOGUES_DOC_ID),
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

export async function saveWordMedia(wordId, media = {}) {
  try {
    const uid = await ensureInit();
    if (!uid) return {ok: false, error: 'Firebase chưa khởi tạo.'};
    if (wordId === undefined || wordId === null) {
      return {ok: false, error: 'wordId không hợp lệ.'};
    }

    await setDoc(
      doc(collection(db, WORD_MEDIA_COLLECTION), String(wordId)),
      {
        ...media,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      },
      {merge: true},
    );
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error?.message || 'Lỗi lưu media từ vựng.'};
  }
}

export async function getWordMedia(wordId) {
  try {
    await ensureInit();
    if (wordId === undefined || wordId === null) return null;
    const snap = await getDoc(doc(collection(db, WORD_MEDIA_COLLECTION), String(wordId)));
    return snapshotExists(snap) ? snap.data() : null;
  } catch (_) {
    return null;
  }
}
