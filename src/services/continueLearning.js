import {getLearningProgress, saveLearningProgress, getTopics} from './storageService';
import {getAllVocabulary, wordBelongsToTopic} from './vocabularyService';

export const CONTINUE_KIND = {
  VOCAB_TOPIC: 'vocabulary_topic',
  VOCAB_FLASHCARD: 'vocabulary_flashcard',
  VIDEO: 'video',
  DIALOGUE: 'dialogue',
};

const VALID_KINDS = new Set(Object.values(CONTINUE_KIND));

const DEFAULT_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * Ghi snapshot «tiếp tục học» (thay thế toàn bộ object — tránh sót field kind cũ).
 */
export async function saveContinueLearning(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const lp = (await getLearningProgress().catch(() => null)) || {};
  await saveLearningProgress({
    ...lp,
    continueLearning: {
      ...payload,
      updatedAt: Date.now(),
    },
  });
  return true;
}

export function pickFreshContinueLearning(rawProgress, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cl = rawProgress?.continueLearning;
  if (!cl || typeof cl !== 'object') return null;
  const kind = String(cl.kind || '').trim();
  if (!VALID_KINDS.has(kind)) return null;
  const t = Number(cl.updatedAt);
  if (!Number.isFinite(t) || Date.now() - t > maxAgeMs) return null;
  if (
    kind === CONTINUE_KIND.VOCAB_TOPIC ||
    kind === CONTINUE_KIND.VOCAB_FLASHCARD
  ) {
    if (!String(cl.topicId || '').trim()) return null;
    return cl;
  }
  if (kind === CONTINUE_KIND.VIDEO) {
    if (!String(cl.videoId || '').trim()) return null;
    return cl;
  }
  if (kind === CONTINUE_KIND.DIALOGUE) {
    if (!String(cl.scenarioId || '').trim()) return null;
    return cl;
  }
  return null;
}

/**
 * Tham số navigate tới VocabularyTopicDetail (giống TopicSelectionScreen).
 */
export async function buildVocabularyTopicDetailResume(topicId) {
  const tid = String(topicId || '').trim();
  if (!tid) return null;
  let topics = [];
  try {
    topics = await getTopics();
  } catch (_) {}
  if (!Array.isArray(topics) || topics.length === 0) return null;
  const topic = topics.find((t) => String(t?.id) === tid);
  if (!topic) return null;
  let allWords = [];
  try {
    allWords = getAllVocabulary();
  } catch (_) {}
  const topicWords = allWords.filter((w) =>
    wordBelongsToTopic(w, tid, topics),
  );
  if (!topicWords.length) return null;

  let lp = {};
  try {
    lp = (await getLearningProgress().catch(() => null)) || {};
  } catch (_) {}
  const learnedIds = new Set(
    Array.isArray(lp.wordsLearned) ? lp.wordsLearned.map((id) => String(id)) : [],
  );
  const learnedCount = topicWords.filter((w) =>
    learnedIds.has(String(w.id)),
  ).length;
  const total = topicWords.length;
  const percentage =
    total > 0 ? Math.min(100, Math.round((learnedCount / total) * 100)) : 0;
  const beginnerCount = topicWords.filter((w) => w.level === 'Beginner').length;
  const intermediateCount = topicWords.filter((w) => w.level === 'Intermediate')
    .length;
  const mainLevel =
    beginnerCount >= intermediateCount ? 'Beginner' : 'Intermediate';
  const levelName = mainLevel === 'Beginner' ? 'Sơ cấp' : 'Trung cấp';

  return {
    topic,
    words: topicWords,
    progress: {
      total,
      learned: learnedCount,
      percentage,
      level: levelName,
      mainLevel,
    },
  };
}
