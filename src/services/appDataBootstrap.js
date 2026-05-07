import {ensureFirestoreAuthReady} from './firebaseService';
import {loadVocabularyFromFirebase} from './vocabularyService';
import {loadVideosFromFirebase} from './videoService';
import {loadDialoguesFromFirebase} from './dialogueService';
import {getTopics, getLearningProgress} from './storageService';

let _bootstrapPromise = null;
const BOOTSTRAP_TIMEOUT_MS = 6500;

function withTimeout(promise, ms, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

/**
 * Preload dữ liệu quan trọng khi app mở:
 * - vocabulary
 * - topics
 * - videos
 * - dialogues
 * - learning progress
 *
 * Dùng singleton promise để tránh nhiều màn preload chồng nhau.
 */
export async function preloadEssentialData(options = {}) {
  const {force = false} = options;

  if (!force && _bootstrapPromise) {
    return _bootstrapPromise;
  }

  _bootstrapPromise = (async () => {
    try {
      // Không throw nếu auth/network chậm; các loader vẫn đọc cache local.
      try {
        await ensureFirestoreAuthReady();
      } catch (_) {}

      await Promise.allSettled([
        withTimeout(loadVocabularyFromFirebase().catch(() => null), BOOTSTRAP_TIMEOUT_MS, null),
        withTimeout(loadVideosFromFirebase().catch(() => null), BOOTSTRAP_TIMEOUT_MS, null),
        withTimeout(loadDialoguesFromFirebase().catch(() => null), BOOTSTRAP_TIMEOUT_MS, null),
        withTimeout(getTopics([]).catch(() => []), BOOTSTRAP_TIMEOUT_MS, []),
        withTimeout(getLearningProgress().catch(() => null), BOOTSTRAP_TIMEOUT_MS, null),
      ]);

      return {ok: true};
    } catch (e) {
      return {ok: false, error: e?.message || 'bootstrap_failed'};
    } finally {
      _bootstrapPromise = null;
    }
  })();

  return _bootstrapPromise;
}

