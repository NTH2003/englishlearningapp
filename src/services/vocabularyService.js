import {lessonsData} from '../data/vocabularyData';
import {getVocabulary, saveVocabulary, ensureFirestoreAuthReady} from './firebaseService';
import {getLearningProgress, saveLearningProgress} from './storageService';
import {loadVideosFromFirebase, getAllVideos} from './videoService';

import {XP, computeLevelName} from './levelService';

/** Bộ nhớ đệm — chỉ từ Firestore (config/vocabulary.words). */
let _vocabularyCache = [];
let _vocabularyLoadedFromRemote = false;
let _vocabularyLoadPromise = null;

/**
 * Id từ Firestore: số hoặc chuỗi (UUID / custom). Trước đây chỉ chấp nhận số → toàn bộ từ bị bỏ → cache rỗng.
 */
function normalizeWordId(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  return s;
}

/** Chuẩn hóa một phần tử từ Firestore (không gộp dữ liệu tĩnh trong app). */
function normalizeWordFromFirestore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = normalizeWordId(raw.id);
  if (id == null) return null;
  const catRaw =
    raw.category != null && raw.category !== ''
      ? raw.category
      : raw.topicId != null && raw.topicId !== ''
        ? raw.topicId
        : raw.topic != null && raw.topic !== ''
          ? raw.topic
          : '';
  return {
    ...raw,
    id,
    category: String(catRaw).trim(),
    word: raw.word != null ? String(raw.word) : '',
    meaning: raw.meaning != null ? String(raw.meaning) : '',
    // Tương thích dữ liệu cũ: một số bản lưu `exampleVi` thay vì `exampleMeaning`.
    exampleMeaning:
      raw.exampleMeaning != null && String(raw.exampleMeaning).trim() !== ''
        ? String(raw.exampleMeaning)
        : raw.exampleVi != null
          ? String(raw.exampleVi)
          : '',
    learned: Boolean(raw.learned),
  };
}

/** Khớp từ với chủ đề (id chủ đề trên Firestore/seed = category của từ). */
export function wordBelongsToTopic(word, topicId) {
  if (!word || topicId == null) return false;
  const tid = String(topicId).trim();
  const c = String(word.category ?? word.topicId ?? word.topic ?? '').trim();
  return c === tid && tid.length > 0;
}

function setCacheFromRemoteList(list) {
  const out = [];
  for (const item of list) {
    const w = normalizeWordFromFirestore(item);
    if (w) out.push(w);
  }
  if (__DEV__ && Array.isArray(list) && list.length > 0 && out.length === 0) {
    console.warn(
      '[vocabulary] Firestore có',
      list.length,
      'mục nhưng sau chuẩn hóa không còn mục nào — kiểm tra field `words`, mỗi phần tử cần `id` và `word`/`meaning`.',
    );
  }
  _vocabularyCache = out;
  _vocabularyLoadedFromRemote = true;
}

function clearVocabularyCache() {
  _vocabularyCache = [];
  _vocabularyLoadedFromRemote = true;
}

/**
 * Tải từ vựng từ Firestore (config/vocabulary, field words).
 * @param {{ force?: boolean }} options
 */
export async function loadVocabularyFromFirebase(options = {}) {
  const {force = false} = options;
  if (force) {
    _vocabularyLoadPromise = null;
  }
  if (_vocabularyLoadPromise) {
    return _vocabularyLoadPromise;
  }
  /** Cache rỗng nhưng đã «loaded» = lần trước parse hỏng hoặc lỗi — phải tải lại. */
  if (!force && _vocabularyLoadedFromRemote && _vocabularyCache.length > 0) {
    return {
      ok: true,
      fromRemote: true,
      count: _vocabularyCache.length,
    };
  }

  _vocabularyLoadPromise = (async () => {
    try {
      // Ưu tiên cache local của Firestore để UI hiện ngay sau lần tải đầu tiên.
      const cached = await getVocabulary({source: 'cache'});
      if (cached && cached.length > 0) {
        setCacheFromRemoteList(cached);
      }

      const remote = await getVocabulary({source: 'server'});
      if (remote && remote.length > 0) {
        setCacheFromRemoteList(remote);
        if (_vocabularyCache.length > 0) {
          return {ok: true, fromRemote: true, count: _vocabularyCache.length};
        }
        // Firestore có `words` nhưng không khớp schema (vd. id không phải số) → coi như rỗng.
        clearVocabularyCache();
      }
      // Không clear khi remote null: getVocabulary(server) trả null cả khi lỗi mạng/chưa auth —
      // tránh xóa cache đã nạp từ bước `source: 'cache'` ở trên.

      if (_vocabularyCache.length === 0) {
        try {
          await new Promise((r) => setTimeout(r, 800));
          await ensureFirestoreAuthReady();
          const remote2 = await getVocabulary({source: 'server'});
          if (remote2 && remote2.length > 0) {
            setCacheFromRemoteList(remote2);
            if (_vocabularyCache.length > 0) {
              return {ok: true, fromRemote: true, count: _vocabularyCache.length};
            }
            clearVocabularyCache();
          }
        } catch (_) {}
      }

      if (_vocabularyCache.length > 0) {
        return {ok: true, fromRemote: true, count: _vocabularyCache.length};
      }
      return {
        ok: true,
        fromRemote: false,
        count: _vocabularyCache.length,
      };
    } catch (error) {
      const msg = error?.message || 'Lỗi tải từ vựng';
      return {
        ok: false,
        fromRemote: false,
        count: 0,
        error: msg,
      };
    } finally {
      _vocabularyLoadPromise = null;
    }
  })();

  return _vocabularyLoadPromise;
}

// Lấy tất cả từ vựng (từ cache — đã nạp sau loadVocabularyFromFirebase).
export const getAllVocabulary = () => _vocabularyCache;

/** Id số tiếp theo cho từ mới (theo max id hiện có trong cache). */
export function getNextVocabularyNumericId() {
  let max = 0;
  for (const w of _vocabularyCache) {
    if (Number.isFinite(w.id) && w.id > max) {
      max = w.id;
    }
  }
  return max + 1;
}

/**
 * Ghi đè toàn bộ `words` lên Firestore (config/vocabulary) và nạp lại cache.
 */
export async function persistFullVocabulary(words) {
  if (!Array.isArray(words)) {
    return {ok: false, error: 'Danh sách từ không hợp lệ.'};
  }
  const result = await saveVocabulary(words);
  if (!result.ok) {
    return result;
  }
  await loadVocabularyFromFirebase({force: true});
  return {ok: true};
}

// Lấy từ vựng theo ID (số hoặc chuỗi — khớp với normalizeWordId)
export const getVocabularyById = (id) => {
  if (id == null) return undefined;
  const sid = String(id);
  return _vocabularyCache.find((word) => String(word.id) === sid);
};

// Lấy từ vựng theo chủ đề
export const getVocabularyByCategory = (category) => {
  return _vocabularyCache.filter((word) => wordBelongsToTopic(word, category));
};

/** Lấy danh sách từ theo thứ tự id (bỏ qua id không tồn tại). */
export const getVocabularyByIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const sid = String(raw);
    if (!sid || seen.has(sid)) {
      continue;
    }
    const w = getVocabularyById(raw);
    if (w) {
      out.push(w);
      seen.add(sid);
    }
  }
  return out;
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Nội dung để gợi từ: tiêu đề + mô tả + script (subtitles).
 */
export function buildVideoTranscriptText(video) {
  if (!video || typeof video !== 'object') {
    return '';
  }
  const parts = [];
  const t = String(video.title ?? '').trim();
  const d = String(video.description ?? '').trim();
  if (t) {
    parts.push(t);
  }
  if (d) {
    parts.push(d);
  }
  if (Array.isArray(video.subtitles)) {
    for (const line of video.subtitles) {
      const tx = String(line?.text ?? '').trim();
      if (tx) {
        parts.push(tx);
      }
    }
  }
  return parts.join('\n').trim();
}

/**
 * Các mục trong kho từ khớp từ tiếng Anh (ranh giới từ) trong transcript.
 * Thứ tự theo lần xuất hiện đầu trong transcript.
 */
export function getVocabularyMentionedInVideo(video) {
  const corpus = buildVideoTranscriptText(video);
  if (!corpus) {
    return [];
  }
  const all = getAllVocabulary();
  const hits = [];
  for (const w of all) {
    const term = String(w.word ?? '').trim();
    if (term.length < 2) {
      continue;
    }
    const escaped = escapeRegExp(term);
    let re;
    try {
      re = new RegExp(`\\b${escaped}\\b`, 'i');
    } catch {
      continue;
    }
    const found = corpus.match(re);
    if (!found || found.index == null) {
      continue;
    }
    hits.push({w, index: found.index});
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set();
  const out = [];
  for (const {w} of hits) {
    if (seen.has(w.id)) {
      continue;
    }
    seen.add(w.id);
    out.push(w);
  }
  return out;
}

/**
 * Chuỗi hàng để lưu `videoWords` khi admin chỉ nhập video (gợi từ từ nội dung).
 */
export function suggestVideoWordRowsFromVideoContent(videoLike) {
  const subtitleWords = getSubtitleRowsAsVideoWords(videoLike);
  if (subtitleWords.length > 0) {
    return subtitleWords.map((w) => ({
      word: w.word,
      meaning: w.meaning,
      partOfSpeechVi: 'phrase',
      example: '',
      exampleMeaning: '',
      pronunciation: '',
      level: '',
    }));
  }
  const mentioned = getVocabularyMentionedInVideo(videoLike);
  return mentioned.map((w) => ({
    word: w.word,
    meaning: w.meaning,
    example: String(w.example || '').trim(),
    exampleMeaning: String(w.exampleMeaning || '').trim(),
    partOfSpeechVi: String(w.partOfSpeechVi || '').trim(),
    pronunciation: String(w.pronunciation || '').trim(),
    level: String(w.level || '').trim(),
  }));
}

function normalizeSubtitleTextKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanSubtitleLearningText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const isQuestion = /\?\s*$/.test(text);
  let out = text
    .replace(/^[\s"'“”‘’.,!?;:()\-]+/, '')
    .replace(/[\s"'“”‘’.,!;:()\-]+$/, '')
    .trim();
  if (!out) return '';
  if (isQuestion && !out.endsWith('?')) {
    out = `${out}?`;
  }
  return out;
}

/**
 * Chuyển từng dòng phụ đề thành item học trong video.
 * Mỗi dòng phụ đề là 1 "từ vựng/câu" để người dùng đánh dấu đã học.
 */
export function getSubtitleRowsAsVideoWords(video) {
  if (!video || !Array.isArray(video.subtitles) || video.subtitles.length === 0) {
    return [];
  }
  const enrichByText = new Map();
  if (Array.isArray(video.videoWords)) {
    for (const row of video.videoWords) {
      const key = normalizeSubtitleTextKey(cleanSubtitleLearningText(row?.word));
      if (!key) continue;
      enrichByText.set(key, {
        meaning: String(row?.meaning || '').trim(),
        pronunciation: String(row?.pronunciation || '').trim(),
        partOfSpeechVi: String(row?.partOfSpeechVi || '').trim(),
      });
    }
  }
  const vid = String(video.id ?? '0');
  const out = [];
  const seen = new Set();
  for (const line of video.subtitles) {
    const text = cleanSubtitleLearningText(line?.text);
    if (!text) continue;
    const key = normalizeSubtitleTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const enriched = enrichByText.get(key) || {};
    out.push({
      id: `vws_${vid}_${out.length}`,
      word: text,
      meaning: enriched.meaning || text,
      partOfSpeechVi: enriched.partOfSpeechVi || 'phrase',
      example: '',
      exampleMeaning: '',
      pronunciation: enriched.pronunciation || '',
      level: '',
      learned: false,
      category: '__video_subtitle__',
    });
  }
  return out;
}

/**
 * Chuỗi tuần tự — tránh nhiều lần bấm "Đã biết" liên tiếp ghi đè lẫn nhau
 * (mỗi lần đọc getLearningProgress trước khi lần trước save xong → chỉ còn 1 id).
 */
let _markLearnedChain = Promise.resolve();

async function _markWordAsLearnedImpl(wordId, learned) {
  const sid = String(wordId);
  const progress = await getLearningProgress();
  const updatedProgress = progress || {
    wordsLearned: [],
    lessonsCompleted: [],
  };

  if (!Array.isArray(updatedProgress.wordsLearned)) {
    updatedProgress.wordsLearned = [];
  }

  const wl = updatedProgress.wordsLearned.map((x) => String(x));
  const alreadyLearned = wl.includes(sid);

  if (learned) {
    if (!alreadyLearned) {
      updatedProgress.wordsLearned = [...new Set([...wl, sid])];
    }
  } else {
    updatedProgress.wordsLearned = wl.filter((id) => id !== sid);
    if (updatedProgress.wordStats && updatedProgress.wordStats[sid]) {
      const next = {...updatedProgress.wordStats};
      delete next[sid];
      updatedProgress.wordStats = next;
    }
  }

  if (!updatedProgress.flashcardSelfReport || typeof updatedProgress.flashcardSelfReport !== 'object') {
    updatedProgress.flashcardSelfReport = {};
  }
  updatedProgress.flashcardSelfReport[sid] = learned;

  let totalXP = Number(updatedProgress.totalXP) || 0;
  if (learned && !alreadyLearned) {
    totalXP += XP.NEW_WORD;
  }
  updatedProgress.totalXP = totalXP;
  updatedProgress.level = computeLevelName(totalXP);

  const saved = await saveLearningProgress(updatedProgress);
  if (!saved) {
    console.warn('saveLearningProgress failed — tiến độ từ vựng có thể không lưu lên Firestore (rules/mạng).');
  }
  return true;
}

// Đánh dấu từ đã học
export const markWordAsLearned = async (wordId, learned = true) => {
  const run = () =>
    _markWordAsLearnedImpl(wordId, learned).catch((error) => {
      console.error('Error marking word as learned:', error);
      return false;
    });
  _markLearnedChain = _markLearnedChain.then(run, run);
  return _markLearnedChain;
};

/**
 * Kết thúc phiên flashcard: ghi **một lần** wordsLearned + XP (tránh nhiều lần lưu tuần tự
 * bị cắt khi thoát app → chỉ còn 1/tổng trên chủ đề).
 * @param {Array<{id: number|string}>} sessionWords - từ trong phiên
 * @param {string[]} explicitChuaBietIds - id user đã bấm "Chưa biết"
 */
export const commitFlashcardSessionWords = (sessionWords, explicitChuaBietIds) => {
  const run = async () => {
    try {
      if (!Array.isArray(sessionWords) || !sessionWords.length) return true;
      const chuaSet = new Set(
        (explicitChuaBietIds || []).map((id) => String(id)),
      );
      const progress = await getLearningProgress();
      const updated = {
        wordsLearned: [],
        lessonsCompleted: [],
        ...(progress || {}),
      };
      if (!Array.isArray(updated.wordsLearned)) {
        updated.wordsLearned = [];
      }
      const prevSet = new Set(updated.wordsLearned.map((x) => String(x)));
      const wl = new Set(prevSet);

      for (const w of sessionWords) {
        const sid = String(w.id);
        if (chuaSet.has(sid)) {
          wl.delete(sid);
          if (updated.wordStats && updated.wordStats[sid]) {
            const next = {...updated.wordStats};
            delete next[sid];
            updated.wordStats = next;
          }
        } else {
          wl.add(sid);
        }
      }
      updated.wordsLearned = [...wl];

      if (!updated.flashcardSelfReport || typeof updated.flashcardSelfReport !== 'object') {
        updated.flashcardSelfReport = {};
      }
      const fsr = {...updated.flashcardSelfReport};
      for (const w of sessionWords) {
        const sid = String(w.id);
        fsr[sid] = !chuaSet.has(sid);
      }
      updated.flashcardSelfReport = fsr;

      let xpAdd = 0;
      for (const w of sessionWords) {
        const sid = String(w.id);
        if (chuaSet.has(sid)) continue;
        if (!prevSet.has(sid)) {
          xpAdd += XP.NEW_WORD;
        }
      }
      let totalXP = Math.max(0, Number(updated.totalXP) || 0);
      totalXP += xpAdd;
      updated.totalXP = totalXP;
      updated.level = computeLevelName(totalXP);

      const ok = await saveLearningProgress(updated);
      if (!ok) {
        console.warn('commitFlashcardSessionWords: không ghi được Firestore — tiến độ phiên có thể mất.');
      }
      return ok;
    } catch (error) {
      console.error('Error commitFlashcardSessionWords:', error);
      return false;
    }
  };
  _markLearnedChain = _markLearnedChain.then(run, run);
  return _markLearnedChain;
};

/**
 * Phiên flashcard tab Ôn tập (topicId === 'review'): cập nhật danh sách từ làm sai khi ôn,
 * không gỡ từ khỏi wordsLearned.
 */
export const commitReviewFlashcardSession = (sessionWords, explicitChuaBietIds) => {
  const run = async () => {
    try {
      if (!Array.isArray(sessionWords) || !sessionWords.length) return true;
      const chuaSet = new Set(
        (explicitChuaBietIds || []).map((id) => String(id)),
      );
      const progress = await getLearningProgress();
      const prev = Array.isArray(progress?.reviewWrongWordIds)
        ? progress.reviewWrongWordIds.map(String)
        : [];
      const set = new Set(prev);
      for (const w of sessionWords) {
        const sid = String(w.id);
        if (chuaSet.has(sid)) set.add(sid);
        else set.delete(sid);
      }
      const updated = {
        ...(progress || {}),
        reviewWrongWordIds: [...set],
      };
      const ok = await saveLearningProgress(updated);
      return ok;
    } catch (error) {
      console.error('Error commitReviewFlashcardSession:', error);
      return false;
    }
  };
  _markLearnedChain = _markLearnedChain.then(run, run);
  return _markLearnedChain;
};

/** Trắc nghiệm / ôn tập: ghi nhận đúng/sai (chỉ dùng khi topicId === 'review'). */
export const recordReviewQuizAnswer = (wordId, correct) => {
  const run = async () => {
    try {
      const sid = String(wordId);
      const progress = await getLearningProgress();
      const arr = Array.isArray(progress?.reviewWrongWordIds)
        ? progress.reviewWrongWordIds.map(String)
        : [];
      const set = new Set(arr);
      if (correct) {
        set.delete(sid);
      } else {
        set.add(sid);
      }
      return saveLearningProgress({
        ...(progress || {}),
        reviewWrongWordIds: [...set],
      });
    } catch (error) {
      console.error('Error recordReviewQuizAnswer:', error);
      return false;
    }
  };
  _markLearnedChain = _markLearnedChain.then(run, run);
  return _markLearnedChain;
};

/** Khởi tập nút Chưa biết cho phiên ôn tập từ reviewWrongWordIds. */
export const buildExplicitChuaBietSetFromReviewWrong = async (sessionWords) => {
  const next = new Set();
  if (!Array.isArray(sessionWords) || !sessionWords.length) return next;
  try {
    const progress = await getLearningProgress();
    const wrong = new Set(
      Array.isArray(progress?.reviewWrongWordIds)
        ? progress.reviewWrongWordIds.map(String)
        : [],
    );
    for (const w of sessionWords) {
      const sid = String(w.id);
      if (wrong.has(sid)) next.add(sid);
    }
  } catch (_) {}
  return next;
};

/** Lựa chọn flashcard lần gần nhất: true = Đã biết, false = Chưa biết, undefined = chưa lưu. */
export const getFlashcardSelfReport = async (wordId) => {
  try {
    const progress = await getLearningProgress();
    const sid = String(wordId);
    const v = progress?.flashcardSelfReport?.[sid];
    if (v === true || v === false) return v;
    return undefined;
  } catch (error) {
    console.error('Error getFlashcardSelfReport:', error);
    return undefined;
  }
};

/** Khởi tập explicitChuaBiet cho phiên từ dữ liệu đã lưu (xem lại sau). */
export const buildExplicitChuaBietSetFromStored = async (sessionWords) => {
  const next = new Set();
  if (!Array.isArray(sessionWords) || !sessionWords.length) return next;
  try {
    const progress = await getLearningProgress();
    const fsr = progress?.flashcardSelfReport;
    if (!fsr || typeof fsr !== 'object') return next;
    for (const w of sessionWords) {
      const sid = String(w.id);
      if (fsr[sid] === false) next.add(sid);
    }
  } catch (_) {}
  return next;
};

// Kiểm tra từ đã học chưa
export const isWordLearned = async (wordId) => {
  try {
    const progress = await getLearningProgress();
    if (!progress || !Array.isArray(progress.wordsLearned)) {
      return false;
    }
    const sid = String(wordId);
    return progress.wordsLearned.some((id) => String(id) === sid);
  } catch (error) {
    console.error('Error checking word learned status:', error);
    return false;
  }
};

/**
 * Chờ mọi markWordAsLearned / commitFlashcardSessionWords trong hàng đợi xong (đã ghi local).
 * Gọi trước khi rời màn tổng kết để x/5 trên danh sách chủ đề khớp dữ liệu.
 */
export const flushLearningProgressWrites = () => _markLearnedChain;

// Lấy số từ đã học (không tính id mồ côi — đồng bộ {@link getResolvableLearnedWordsCount})
export const getLearnedWordsCount = async () => {
  try {
    return await getResolvableLearnedWordsCount();
  } catch (error) {
    console.error('Error getting learned words count:', error);
    return 0;
  }
};

/** Danh sách object từ vựng đã đánh dấu đã học (dùng ôn tập theo từ đã học). */
export const getLearnedWordsVocabulary = async () => {
  try {
    const progress = await getLearningProgress();
    const ids = new Set(
      Array.isArray(progress?.wordsLearned)
        ? progress.wordsLearned.map((id) => String(id))
        : [],
    );
    if (ids.size === 0) return [];
    return _vocabularyCache.filter((w) => ids.has(String(w.id)));
  } catch (error) {
    console.error('Error getting learned vocabulary words:', error);
    return [];
  }
};

function normalizeEnglishWordKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Mỗi id từ trong video: true nếu đã có trong `wordsLearned` (theo id)
 * hoặc trùng từ tiếng Anh với một từ chủ đề đã đánh dấu đã học.
 */
export async function getVideoWordsLearnedMap(videoWords) {
  const out = {};
  if (!Array.isArray(videoWords) || videoWords.length === 0) {
    return out;
  }
  try {
    const progress = await getLearningProgress();
    const learnedIds = new Set(
      Array.isArray(progress?.wordsLearned)
        ? progress.wordsLearned.map((x) => String(x))
        : [],
    );
    const learnedEnglishFromTopics = new Set();
    for (const w of _vocabularyCache) {
      if (!w || w.id == null) continue;
      if (!learnedIds.has(String(w.id))) continue;
      const k = normalizeEnglishWordKey(w.word);
      if (k) {
        learnedEnglishFromTopics.add(k);
      }
    }
    for (const vw of videoWords) {
      if (!vw || vw.id == null) continue;
      const sid = String(vw.id);
      let known = learnedIds.has(sid);
      if (!known) {
        const k = normalizeEnglishWordKey(vw.word);
        if (k && learnedEnglishFromTopics.has(k)) {
          known = true;
        }
      }
      out[sid] = known;
    }
  } catch (e) {
    console.warn('getVideoWordsLearnedMap', e);
  }
  return out;
}

/**
 * Danh sách từ cho màn video (videoWords hoặc suy từ script — cùng logic VideoLearningScreen).
 */
export function getVideoWordsListForVideo(video) {
  if (!video || typeof video !== 'object') {
    return [];
  }
  const subtitleWords = getSubtitleRowsAsVideoWords(video);
  if (subtitleWords.length > 0) {
    return subtitleWords;
  }
  if (Array.isArray(video.videoWords) && video.videoWords.length > 0) {
    return video.videoWords;
  }
  return getVocabularyMentionedInVideo(video);
}

/**
 * Đếm từ đã thuộc / tổng từ cho từng video (đồng bộ {@link getVideoWordsLearnedMap}).
 * Gọi sau {@link loadVocabularyFromFirebase}.
 */
export async function getVideoVocabLearnedStatsBatch(videos) {
  if (!Array.isArray(videos) || videos.length === 0) {
    return [];
  }
  try {
    const progress = await getLearningProgress();
    const learnedIds = new Set(
      Array.isArray(progress?.wordsLearned)
        ? progress.wordsLearned.map((x) => String(x))
        : [],
    );
    const learnedEnglishFromTopics = new Set();
    for (const w of _vocabularyCache) {
      if (!w || w.id == null) continue;
      if (!learnedIds.has(String(w.id))) continue;
      const k = normalizeEnglishWordKey(w.word);
      if (k) {
        learnedEnglishFromTopics.add(k);
      }
    }
    return videos.map((video) => {
      const words = getVideoWordsListForVideo(video);
      let learned = 0;
      for (const vw of words) {
        if (!vw || vw.id == null) continue;
        const sid = String(vw.id);
        let known = learnedIds.has(sid);
        if (!known) {
          const k = normalizeEnglishWordKey(vw.word);
          if (k && learnedEnglishFromTopics.has(k)) {
            known = true;
          }
        }
        if (known) {
          learned++;
        }
      }
      return {videoId: video.id, total: words.length, learned};
    });
  } catch (e) {
    console.warn('getVideoVocabLearnedStatsBatch', e);
    return videos.map((video) => ({
      videoId: video.id,
      total: getVideoWordsListForVideo(video).length,
      learned: 0,
    }));
  }
}

function tryGetTopicWordFromLearnedId(raw) {
  if (raw == null) return null;
  return getVocabularyById(raw) || null;
}

function pickWordPronunciationMeta(w) {
  if (!w || typeof w !== 'object') {
    return {pronunciation: '', partOfSpeechVi: '', audioUrl: ''};
  }
  const pronunciation = String(w.pronunciation ?? '').trim();
  const partOfSpeechVi = String(w.partOfSpeechVi ?? '').trim();
  const audioUrl = String(w.audioUrl ?? w.soundUrl ?? '').trim();
  return {pronunciation, partOfSpeechVi, audioUrl};
}

function buildVideoWordLookupMap() {
  const videoWordById = new Map();
  for (const video of getAllVideos()) {
    const title = String(video?.title ?? '').trim() || 'Video';
    const list = getVideoWordsListForVideo(video);
    for (const vw of list) {
      if (vw && vw.id != null) {
        videoWordById.set(String(vw.id), {vw, videoTitle: title});
      }
    }
  }
  return videoWordById;
}

/**
 * Chỉ các id trong `wordsLearned` còn khớp bộ từ hoặc danh sách từ video hiện tại.
 * Id mồ côi (video đổi id, xóa từ, v.v.) bỏ qua — không hiển thị, không tính số.
 */
function buildResolvedLearnedWordsList(rawIds, videoWordById) {
  const out = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const sid = String(raw);
    if (seen.has(sid)) {
      continue;
    }
    seen.add(sid);

    const topicW = tryGetTopicWordFromLearnedId(raw);
    if (topicW) {
      const meta = pickWordPronunciationMeta(topicW);
      out.push({
        id: sid,
        word: String(topicW.word ?? '').trim() || '—',
        meaning: String(topicW.meaning ?? '').trim() || '—',
        source: 'topic',
        ...meta,
      });
      continue;
    }

    const hit = videoWordById.get(sid);
    if (hit) {
      const vw = hit.vw;
      const meta = pickWordPronunciationMeta(vw);
      out.push({
        id: sid,
        word: String(vw.word ?? '').trim() || '—',
        meaning: String(vw.meaning ?? '').trim() || '—',
        source: 'video',
        ...meta,
      });
    }
  }
  return out;
}

async function loadLearningProgressForLearnedWords() {
  let lp = await getLearningProgress({source: 'server'});
  if (lp == null) {
    lp = await getLearningProgress();
  }
  return lp;
}

async function ensureCachesForLearnedWordsResolution() {
  await loadVocabularyFromFirebase({force: false});
  try {
    await loadVideosFromFirebase({force: false});
  } catch (_) {}
}

/**
 * Số từ đã học thực tế (không tính id không còn khớp dữ liệu).
 */
export async function getResolvableLearnedWordsCount() {
  await ensureCachesForLearnedWordsResolution();
  const lp = await loadLearningProgressForLearnedWords();
  const rawIds = Array.isArray(lp?.wordsLearned) ? lp.wordsLearned : [];
  const videoWordById = buildVideoWordLookupMap();
  return buildResolvedLearnedWordsList(rawIds, videoWordById).length;
}

/**
 * Danh sách từ đã học để hiển thị: từ bộ chủ đề (id số) và từ gắn video (id vw_/vws_/…).
 * Gọi sau {@link loadVocabularyFromFirebase}; tự thử {@link loadVideosFromFirebase}.
 */
export async function getLearnedWordsForDisplay() {
  await ensureCachesForLearnedWordsResolution();
  const lp = await loadLearningProgressForLearnedWords();
  const rawIds = Array.isArray(lp?.wordsLearned) ? lp.wordsLearned : [];
  const videoWordById = buildVideoWordLookupMap();
  return buildResolvedLearnedWordsList(rawIds, videoWordById);
}

// Lấy tất cả bài học
export const getAllLessons = () => {
  return lessonsData;
};

// Lấy bài học theo ID
export const getLessonById = (id) => {
  return lessonsData.find(lesson => lesson.id === id);
};
