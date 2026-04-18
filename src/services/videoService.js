import {getVideos, ensureFirestoreAuthReady} from './firebaseService';

let _videoCache = [];
let _videosLoadedFromRemote = false;
let _videoLoadPromise = null;

/**
 * id trong Firestore có thể là số (admin app) hoặc chuỗi (nhập tay trên Console).
 * Trước đây chỉ chấp nhận số → mọi video id kiểu "v1", UUID đều bị bỏ qua → danh sách rỗng.
 */
function normalizeVideoId(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : s;
  }
  return s;
}

/**
 * Một dòng từ vựng chỉ thuộc video (không trùng id với kho từ theo chủ đề).
 * id ổn định: vw_{videoId}_{index}.
 */
export function normalizeVideoWordFromRaw(raw, videoId, displayIndex) {
  const word = String(raw?.word ?? '').trim();
  const meaning = String(raw?.meaning ?? '').trim();
  if (!word || !meaning) {
    return null;
  }
  return {
    id: `vw_${videoId}_${displayIndex}`,
    word,
    meaning,
    pronunciation: String(raw?.pronunciation ?? '').trim(),
    example: String(raw?.example ?? '').trim(),
    exampleMeaning: String(raw?.exampleMeaning ?? '').trim(),
    partOfSpeechVi: String(raw?.partOfSpeechVi ?? '').trim(),
    level: String(raw?.level ?? '').trim(),
    learned: false,
    category: '__video__',
  };
}

/** Chuẩn hóa 1 video từ Firestore (không lưu watched — lấy từ tiến độ học). */
export function normalizeVideoFromFirestore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = normalizeVideoId(raw.id);
  if (id == null) return null;
  const videoUrl = String(
    raw.videoUrl ?? raw.url ?? raw.mp4Url ?? raw.video ?? '',
  ).trim();
  if (!videoUrl) return null;

  const level = String(raw.level ?? '').trim();
  const out = {
    id,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    thumbnail: String(raw.thumbnail ?? '📹'),
    videoUrl,
    duration: String(raw.duration ?? '0:00'),
    views: String(raw.views ?? '0'),
  };
  if (level) {
    out.level = level;
  }
  const thumbUrl = String(raw.thumbnailUrl ?? '').trim();
  if (thumbUrl) {
    out.thumbnailUrl = thumbUrl;
  }
  if (Array.isArray(raw.subtitles) && raw.subtitles.length > 0) {
    const subs = raw.subtitles
      .map((s) => ({
        time: String(s?.time ?? '00:00').trim(),
        text: String(s?.text ?? '').trim(),
      }))
      .filter((s) => s.time.length > 0 || s.text.length > 0);
    if (subs.length > 0) {
      out.subtitles = subs;
    }
  }
  const cp = String(raw.cloudinaryPublicId ?? '').trim();
  if (cp) {
    out.cloudinaryPublicId = cp;
  }
  if (Array.isArray(raw.videoWords) && raw.videoWords.length > 0) {
    const list = [];
    for (const row of raw.videoWords) {
      const n = normalizeVideoWordFromRaw(row, id, list.length);
      if (n) {
        list.push(n);
      }
    }
    if (list.length > 0) {
      out.videoWords = list;
    }
  }
  return out;
}

function setCacheFromRemoteList(list) {
  const out = [];
  for (const item of list) {
    const v = normalizeVideoFromFirestore(item);
    if (v) out.push(v);
  }
  _videoCache = out;
  _videosLoadedFromRemote = true;
}

function clearVideoCache() {
  _videoCache = [];
  _videosLoadedFromRemote = true;
}

/**
 * Tải video từ Firestore (config/videos → videos).
 * @param {{ force?: boolean }} options
 */
export async function loadVideosFromFirebase(options = {}) {
  const {force = false} = options;
  if (force) {
    _videoLoadPromise = null;
  }
  if (_videoLoadPromise) {
    return _videoLoadPromise;
  }
  if (!force && _videosLoadedFromRemote && _videoCache.length > 0) {
    return {
      ok: true,
      fromRemote: true,
      count: _videoCache.length,
    };
  }

  _videoLoadPromise = (async () => {
    try {
      // Ưu tiên cache local của Firestore để UI hiện ngay sau lần tải đầu tiên.
      const cached = await getVideos({source: 'cache'});
      if (cached !== null && cached.length > 0) {
        setCacheFromRemoteList(cached);
      }

      const remote = await getVideos({source: 'server'});
      if (remote !== null && remote.length > 0) {
        setCacheFromRemoteList(remote);
        if (_videoCache.length > 0) {
          return {ok: true, fromRemote: true, count: _videoCache.length};
        }
        // Có phần tử nhưng không normalize được → coi như rỗng.
        clearVideoCache();
      } else if (remote !== null && Array.isArray(remote) && remote.length === 0) {
        // Server xác nhận danh sách rỗng (document tồn tại, videos: []).
        clearVideoCache();
      }
      // Không clear khi remote === null (lỗi mạng / doc chưa đọc được): giữ cache từ `source: 'cache'`.

      if (_videoCache.length === 0) {
        try {
          await new Promise((r) => setTimeout(r, 800));
          await ensureFirestoreAuthReady();
          const retry = await getVideos({source: 'server'});
          if (retry !== null && Array.isArray(retry) && retry.length > 0) {
            setCacheFromRemoteList(retry);
            if (_videoCache.length > 0) {
              return {ok: true, fromRemote: true, count: _videoCache.length};
            }
            clearVideoCache();
          }
        } catch (_) {}
      }

      if (_videoCache.length > 0) {
        return {ok: true, fromRemote: true, count: _videoCache.length};
      }
      return {
        ok: true,
        fromRemote: false,
        count: _videoCache.length,
      };
    } catch (error) {
      const msg = error?.message || 'Lỗi tải video';
      return {
        ok: false,
        fromRemote: false,
        count: 0,
        error: msg,
      };
    } finally {
      _videoLoadPromise = null;
    }
  })();

  return _videoLoadPromise;
}

/** Danh sách video (cache sau loadVideosFromFirebase). */
export function getAllVideos() {
  return _videoCache;
}

/**
 * Ghi đè cache video ngay lập tức (dùng cho thao tác admin mutate nhanh như xóa/sửa).
 * Không gọi mạng, chỉ cập nhật bộ nhớ hiện tại.
 */
export function replaceVideoCache(nextList) {
  const normalized = Array.isArray(nextList)
    ? nextList.filter((v) => v && v.id != null)
    : [];
  _videoCache = normalized;
  _videosLoadedFromRemote = true;
}
