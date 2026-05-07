import {useEffect, useMemo, useRef, useState} from 'react';
import {adminSplitChrome as chrome} from '../adminSplitChrome';

function parseSubtitleDraft(draft) {
  const lines = String(draft || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const subtitles = [];
  for (const line of lines) {
    const idx = line.indexOf('|');
    if (idx < 0) continue;
    const time = String(line.slice(0, idx)).trim();
    const text = String(line.slice(idx + 1)).trim();
    if (!time && !text) continue;
    subtitles.push({time: time || '00:00', text});
  }
  return subtitles;
}

function subtitlesToDraft(subtitles) {
  if (!Array.isArray(subtitles)) return '';
  return subtitles
    .map((s) => {
      const t = String(s?.time || '').trim();
      const text = String(s?.text || '').trim();
      if (!t && !text) return '';
      return `${t || '00:00'}|${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizePartOfSpeechForVideoWord(raw, wordTypes) {
  const s = String(raw || '').trim();
  if (!s) return 'Phrase';
  if (wordTypes.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('noun') || lower.includes('danh')) return 'Noun';
  if (lower.includes('verb') || lower.includes('động')) return 'Verb';
  if (lower.includes('adjective') || lower.includes('tính')) return 'Adjective';
  if (lower.includes('adverb') || lower.includes('trạng')) return 'Adverb';
  if (lower.includes('phrase') || lower.includes('cụm')) return 'Phrase';
  return 'Other';
}

function formatDurationHuman(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function toGeneratedWordsState(videoWords, wordTypes) {
  if (!Array.isArray(videoWords)) return [];
  return videoWords
    .map((row) => {
      const word = String(row?.word || '').trim();
      const meaning = String(row?.meaning || '').trim();
      if (!word || !meaning) return null;
      return {
        word,
        meaning,
        pronunciation: String(row?.pronunciation || '').trim(),
        partOfSpeech: normalizePartOfSpeechForVideoWord(
          row?.partOfSpeechVi || row?.partOfSpeech,
          wordTypes,
        ),
      };
    })
    .filter(Boolean);
}

function deriveCloudinaryThumbnailUrl(videoUrl) {
  const raw = String(videoUrl || '').trim();
  if (!raw) return '';
  // Cloudinary video URL -> poster frame URL from the same video resource.
  if (!raw.includes('/res.cloudinary.com/') || !raw.includes('/video/upload/')) {
    return '';
  }
  try {
    const withFrameTransform = raw.includes('/video/upload/so_')
      ? raw
      : raw.replace('/video/upload/', '/video/upload/so_1/');
    const withoutExt = withFrameTransform.replace(/\.[^/.?]+(?=($|\?))/, '');
    return `${withoutExt}.jpg`;
  } catch (_) {
    return '';
  }
}

function getBestThumbnailUrl(video) {
  const direct = String(video?.thumbnailUrl || '').trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const fromVideo = deriveCloudinaryThumbnailUrl(String(video?.videoUrl || '').trim());
  if (/^https?:\/\//i.test(fromVideo)) return fromVideo;
  return '';
}

function normalizeSubtitleKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksEnglishLike(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return /^[A-Za-z0-9\s.,!?;:'"()\-_/]+$/.test(s);
}

function sanitizeTranslatedText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const noTags = raw.replace(/<[^>]*>/g, ' ');
  const decoded = noTags
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return decoded
    .replace(/^\s*(?:[•●◦▪▫◆◇■□▶▷►▸▹▻\-*]+|\d+[\.)])\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function translateEnToVi(text) {
  const q = String(text || '').trim();
  if (!q) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      q,
    )}&langpair=en|vi`;
    const res = await fetch(url);
    const json = await res.json();
    const out = sanitizeTranslatedText(json?.responseData?.translatedText || '');
    return out && out.toLowerCase() !== q.toLowerCase() ? out : '';
  } catch (_) {
    return '';
  }
}

/** Token tiếng Anh trong một dòng phụ đề (hỗ trợ don't, I'm). */
function tokenizeEnglishWordsInSubtitle(text) {
  const s = String(text || '');
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/** Bỏ function word phổ biến — chỉ giữ từ “học” hơn là nguyên câu. */
const SUBTITLE_VOCAB_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'so',
  'than',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'done',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'there',
  'here',
  'very',
  'just',
  'too',
  'also',
  'only',
  'not',
  'no',
  'yes',
  'oh',
  'how',
  'when',
  'where',
  'why',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'any',
  'nor',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'am',
]);

/**
 * Danh sách từ độc nhất (thứ tự xuất hiện trong phụ đề), không trùng, không lấy nguyên câu.
 * Giới hạn 120 từ khớp server /video/subtitles/enrich.
 */
function uniqueVocabularyWordsFromSubtitleLines(lines) {
  const seen = new Set();
  const words = [];
  const rawLines = Array.isArray(lines)
    ? lines.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  for (const line of rawLines) {
    for (const tok of tokenizeEnglishWordsInSubtitle(line)) {
      const k = tok.toLowerCase();
      if (k.length < 2) {
        continue;
      }
      if (SUBTITLE_VOCAB_STOPWORDS.has(k)) {
        continue;
      }
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      words.push(tok);
      if (words.length >= 120) {
        return words;
      }
    }
  }
  return words;
}

export default function VideoManager({
  styles,
  getResourceList,
  saveResourceList,
  normalizeId,
  uploadVideoToCloudinary,
  friendlyFetchError,
  aiServerUrl,
  wordTypes,
  nextVocabularyNumericId,
  autofillWordFromEnglish,
}) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [autoSubtitleLoading, setAutoSubtitleLoading] = useState(false);
  const [genWordsLoading, setGenWordsLoading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [autofillingWordIndex, setAutofillingWordIndex] = useState(null);
  const [generatedWords, setGeneratedWords] = useState([]);
  const localVideoInputRef = useRef(null);
  const [form, setForm] = useState({
    title: '',
    thumbnail: '',
    thumbnailUrl: '',
    videoUrl: '',
    duration: '0:00',
    subtitleDraft: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getResourceList('videos');
      setVideos(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Không tải được video');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => JSON.stringify(v).toLowerCase().includes(q));
  }, [videos, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      thumbnail: '',
      thumbnailUrl: '',
      videoUrl: '',
      duration: '0:00',
      subtitleDraft: '',
    });
    setGeneratedWords([]);
    setMode('edit');
  };
  const openEdit = (v) => {
    setEditingId(v.id);
    setForm({
      title: String(v.title || ''),
      thumbnail: String(v.thumbnail || ''),
      thumbnailUrl: String(v.thumbnailUrl || ''),
      videoUrl: String(v.videoUrl || ''),
      duration: String(v.duration || '0:00'),
      subtitleDraft: subtitlesToDraft(v.subtitles),
    });
    setGeneratedWords(toGeneratedWordsState(v.videoWords, wordTypes));
    setMode('edit');
  };

  useEffect(() => {
    if (mode !== 'edit') return;
    const url = String(form.videoUrl || '').trim();
    if (!url) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = () => {
      if (cancelled) return;
      const secs = Number(v.duration || 0);
      if (secs > 0) {
        const d = formatDurationHuman(secs);
        setForm((prev) => {
          const cur = String(prev.duration || '').trim();
          if (!cur || cur === '0:00' || cur === '00:00') {
            return {...prev, duration: d};
          }
          return prev;
        });
      }
    };
    return () => {
      cancelled = true;
      v.onloadedmetadata = null;
      v.src = '';
    };
  }, [form.videoUrl, mode]);

  const fetchMp4AutoSubtitles = async (url) => {
    let resp;
    try {
      resp = await fetch(`${aiServerUrl}/video/subtitles/mp4-auto`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({videoUrl: url, lang: 'en'}),
      });
    } catch (_) {
      throw new Error(
        `Không kết nối được AI server (${aiServerUrl}). Hãy chạy server AI hoặc cấu hình VITE_AI_SERVER_URL.`,
      );
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || 'Không thể tạo phụ đề tự động.');
    const subtitles = Array.isArray(json?.subtitles) ? json.subtitles : [];
    if (!subtitles.length) throw new Error('Không trích xuất được lời thoại từ video.');
    return subtitles;
  };

  const enrichSubtitleRows = async (subtitles) => {
    const lines = Array.isArray(subtitles)
      ? subtitles.map((s) => String(s?.text || '').trim()).filter(Boolean)
      : [];
    if (!lines.length) return [];
    const words = uniqueVocabularyWordsFromSubtitleLines(lines);
    if (!words.length) {
      return [];
    }
    let resp;
    try {
      resp = await fetch(`${aiServerUrl}/video/subtitles/enrich`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lines: words}),
      });
    } catch (_) {
      throw new Error(
        `Không kết nối được AI server (${aiServerUrl}). Hãy chạy server AI hoặc cấu hình VITE_AI_SERVER_URL.`,
      );
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || 'Không thể tạo từ vựng từ phụ đề.');
    const items = Array.isArray(json?.items) ? json.items : [];
    const exactMap = new Map(
      items.map((it) => [
        String(it?.text || '').trim().toLowerCase(),
        {
          meaning: String(it?.meaning || '').trim(),
          pronunciation: String(it?.pronunciation || '').trim(),
          partOfSpeech: String(it?.partOfSpeechVi || '').trim() || 'Phrase',
        },
      ]),
    );
    const normalizedMap = new Map(
      items.map((it) => [
        normalizeSubtitleKey(it?.text),
        {
          meaning: String(it?.meaning || '').trim(),
          pronunciation: String(it?.pronunciation || '').trim(),
          partOfSpeech: String(it?.partOfSpeechVi || '').trim() || 'Phrase',
        },
      ]),
    );
    const translatedFallback = await Promise.all(words.map((w) => translateEnToVi(w)));
    const translatedMeanings = await Promise.all(
      items.map((it) => translateEnToVi(String(it?.meaning || '').trim())),
    );
    const meaningByNormalizedLine = new Map();
    items.forEach((it, idx) => {
      const key = normalizeSubtitleKey(it?.text);
      const rawMeaning = String(it?.meaning || '').trim();
      const translatedMeaning = String(translatedMeanings[idx] || '').trim();
      const resolved =
        !rawMeaning
          ? ''
          : looksEnglishLike(rawMeaning)
            ? translatedMeaning || rawMeaning
            : rawMeaning;
      if (key && resolved) {
        meaningByNormalizedLine.set(key, resolved);
      }
    });
    return words.map((word, idx) => {
      const wKey = word.toLowerCase();
      const row =
        exactMap.get(wKey) ||
        normalizedMap.get(normalizeSubtitleKey(word)) ||
        {};
      const byLineMeaning = meaningByNormalizedLine.get(normalizeSubtitleKey(word));
      const resolvedMeaning =
        byLineMeaning ||
        row.meaning ||
        String(translatedFallback[idx] || '').trim() ||
        '';
      return {
        word,
        meaning: resolvedMeaning || word,
        pronunciation: row.pronunciation || '',
        partOfSpeech: normalizePartOfSpeechForVideoWord(row.partOfSpeech, wordTypes),
      };
    });
  };

  const subtitleItems = useMemo(
    () => parseSubtitleDraft(form.subtitleDraft),
    [form.subtitleDraft],
  );

  const updateSubtitleItem = (index, field, value) => {
    const items = [...subtitleItems];
    if (!items[index]) return;
    if (field === 'time') items[index].time = String(value || '');
    else items[index].text = String(value || '');
    setForm((prev) => ({...prev, subtitleDraft: subtitlesToDraft(items)}));
  };
  const removeSubtitleItem = (index) => {
    const items = subtitleItems.filter((_, i) => i !== index);
    setForm((prev) => ({...prev, subtitleDraft: subtitlesToDraft(items)}));
  };
  const addSubtitleItem = () => {
    const items = [...subtitleItems, {time: '00:00', text: ''}];
    setForm((prev) => ({...prev, subtitleDraft: subtitlesToDraft(items)}));
  };

  return (
    <div className="users-manager-layout">
      <section style={chrome.leftPanel}>
        <div style={chrome.heroStrip}>
          <h2 style={chrome.heroTitle}>Quản lý video</h2>
          <div style={chrome.heroStats}>
            <span style={chrome.heroChip}>{videos.length} video</span>
            {search.trim() ? (
              <span style={chrome.heroChip}>{filtered.length} khớp tìm kiếm</span>
            ) : null}
          </div>
        </div>
        <div style={chrome.searchBlock}>
          <div style={chrome.searchWrap}>
            <span style={chrome.searchIcon} aria-hidden>
              ⌕
            </span>
            <input
              style={chrome.searchInput}
              placeholder="Tìm tiêu đề hoặc ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div style={chrome.toolbarBelowSearch}>
          <button style={styles.buttonPrimary} type="button" onClick={openCreate}>
            Thêm video mới
          </button>
          <button style={styles.buttonSecondary} type="button" onClick={loadAll} disabled={loading}>
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>
        {error && mode !== 'edit' ? (
          <p style={{...styles.error, margin: '0 14px 12px'}}>{error}</p>
        ) : null}
        <div style={chrome.listWrap}>
          {loading && videos.length === 0 ? (
            <p style={{padding: 8, color: '#64748B', fontSize: 14}}>Đang tải danh sách…</p>
          ) : null}
          {filtered.map((v, idx) => {
            const sel =
              mode === 'edit' &&
              editingId != null &&
              normalizeId(editingId) === normalizeId(v.id);
            const thumb = getBestThumbnailUrl(v);
            return (
              <div
                key={String(v.id || idx)}
                style={{
                  ...chrome.userRow(sel),
                  justifyContent: 'space-between',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onClick={() => openEdit(v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openEdit(v);
                }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1}}>
                  <div
                    style={{
                      width: 64,
                      height: 44,
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#EEF2FF',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      position: 'relative',
                    }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={String(v.title || 'Video thumbnail')}
                        style={{width: '100%', height: '100%', objectFit: 'cover'}}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.nextElementSibling;
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span
                      style={{
                        fontSize: 18,
                        position: thumb ? 'absolute' : 'static',
                        inset: 0,
                        display: thumb ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      🎬
                    </span>
                  </div>
                  <div style={chrome.rowMain}>
                    <div style={chrome.rowName}>{String(v.title || 'Video không tên')}</div>
                    <div style={chrome.rowEmail}>Thời lượng: {String(v.duration || '0:00')}</div>
                  </div>
                </div>
                <div style={{flexShrink: 0}}>
                  <button
                    type="button"
                    style={styles.buttonDanger}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Xóa video "${v.title}"?`)) return;
                      setSaving(true);
                      try {
                        const next = videos.filter((x) => normalizeId(x.id) !== normalizeId(v.id));
                        await saveResourceList('videos', next);
                        setVideos(next);
                      } catch (err) {
                        setError(err?.message || 'Không xóa được video');
                      } finally {
                        setSaving(false);
                      }
                    }}>
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 ? (
            <p style={{textAlign: 'center', color: '#64748B', padding: '20px 12px', fontSize: 14}}>
              Chưa có video hoặc không khớp tìm kiếm.
            </p>
          ) : null}
        </div>
      </section>

      <section style={chrome.rightPanel}>
        {mode !== 'edit' ? (
          <div style={chrome.emptyDetail}>
            <div style={chrome.emptyDetailInner}>
              <div style={chrome.emptyIcon} aria-hidden>
                <div style={chrome.emptyIconHead} />
                <div style={chrome.emptyIconBody} />
              </div>
              <p style={{margin: 0, fontSize: 16, fontWeight: 700, color: '#334155'}}>Chưa chọn video</p>
              <p style={{margin: '10px 0 0', fontSize: 14, maxWidth: 280, lineHeight: 1.55}}>
                Nhấn vào một dòng trong danh sách bên trái để sửa, hoặc dùng nút “Thêm video mới”.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={chrome.detailScroll}>
              <div style={chrome.detailHead}>
                <h3 style={chrome.detailHeadTitle}>
                  {editingId != null ? 'Sửa video' : 'Thêm video'}
                </h3>
                <p style={chrome.detailHeadSub}>
                  Upload video, chỉnh phụ đề và đồng bộ từ vựng liên quan.
                </p>
              </div>
              <div style={{padding: '16px 20px 20px'}}>
            <label>Tiêu đề *</label>
            <input style={styles.input} value={form.title} onChange={(e) => setForm((f) => ({...f, title: e.target.value}))} />
            <label>Video từ thiết bị *</label>
            {String(form.videoUrl || '').trim() ? (
              <div style={styles.videoInlinePreviewBox}>
                <video src={String(form.videoUrl || '').trim()} controls preload="metadata" style={styles.videoInlinePreviewPlayer} />
              </div>
            ) : null}
            <div style={styles.rowActions}>
              <button type="button" style={styles.buttonSecondary} disabled={uploadingVideo || saving} onClick={() => localVideoInputRef.current?.click()}>
                {uploadingVideo ? 'Đang upload video...' : 'Thêm video từ thiết bị'}
              </button>
              <input
                ref={localVideoInputRef}
                type="file"
                accept="video/*"
                style={{display: 'none'}}
                onChange={async (e) => {
                  const file = e.target?.files?.[0];
                  if (!file) return;
                  setUploadingVideo(true);
                  try {
                    const videoUrl = await uploadVideoToCloudinary(file);
                    const thumbAuto = deriveCloudinaryThumbnailUrl(videoUrl);
                    setForm((f) => ({
                      ...f,
                      videoUrl,
                      duration: '0:00',
                      thumbnailUrl: String(f.thumbnailUrl || '').trim() || thumbAuto,
                    }));
                  } catch (err) {
                    alert(friendlyFetchError(err, 'Không thể thêm video từ thiết bị'));
                  } finally {
                    setUploadingVideo(false);
                    if (localVideoInputRef.current) localVideoInputRef.current.value = '';
                  }
                }}
              />
            </div>
            <label>Phụ đề video</label>
            <div style={styles.subtitleEditorBox}>
              <div style={styles.subtitleEditorHead}>
                <small style={styles.listItemMeta}>
                  {subtitleItems.length > 0 ? `${subtitleItems.length} dong phu de` : 'Chua co dong phu de nao'}
                </small>
                <button type="button" style={styles.buttonSecondary} onClick={addSubtitleItem}>
                  + Them dong
                </button>
              </div>
              {subtitleItems.length === 0 ? (
                <div style={styles.subtitleEmpty}>Nhan "Tao phu de tu video" hoac "Them dong".</div>
              ) : (
                <div style={styles.subtitleRows}>
                  {subtitleItems.map((row, idx) => (
                    <div key={`sub-row-${idx}`} style={styles.subtitleRow}>
                      <input style={styles.subtitleTimeInput} placeholder="00:00" value={String(row.time || '')} onChange={(e) => updateSubtitleItem(idx, 'time', e.target.value)} />
                      <input style={styles.subtitleTextInput} placeholder="Noi dung phu de..." value={String(row.text || '')} onChange={(e) => updateSubtitleItem(idx, 'text', e.target.value)} />
                      <button type="button" style={styles.buttonDanger} onClick={() => removeSubtitleItem(idx)}>Xoa</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={styles.rowActions}>
              <button
                style={styles.buttonSecondary}
                disabled={autoSubtitleLoading || saving}
                onClick={async () => {
                  const url = String(form.videoUrl || '').trim();
                  if (!url) return alert('Chọn video từ thiết bị trước');
                  setAutoSubtitleLoading(true);
                  try {
                    const subtitles = await fetchMp4AutoSubtitles(url);
                    const draft = subtitles
                      .map((s) => `${String(s?.time || '').trim()}|${String(s?.text || '').trim()}`)
                      .filter((x) => x !== '|')
                      .join('\n');
                    setForm((f) => ({...f, subtitleDraft: draft}));
                  } catch (err) {
                    alert(friendlyFetchError(err, 'Không tạo được phụ đề tự động'));
                  } finally {
                    setAutoSubtitleLoading(false);
                  }
                }}>
                {autoSubtitleLoading ? 'Đang tạo phụ đề...' : 'Tạo phụ đề từ video'}
              </button>
              <button
                style={styles.buttonSecondary}
                disabled={genWordsLoading || saving}
                onClick={async () => {
                  const parsedSubs = parseSubtitleDraft(form.subtitleDraft);
                  if (!parsedSubs.length) return alert('Chưa có phụ đề hợp lệ để tạo từ vựng');
                  setGenWordsLoading(true);
                  try {
                    const rows = await enrichSubtitleRows(parsedSubs);
                    setGeneratedWords(rows);
                  } catch (err) {
                    alert(friendlyFetchError(err, 'Không tạo được từ vựng từ phụ đề'));
                  } finally {
                    setGenWordsLoading(false);
                  }
                }}>
                {genWordsLoading ? 'Đang tạo từ...' : 'Tạo từ vựng từ phụ đề'}
              </button>
              <button
                style={styles.buttonSecondary}
                disabled={saving}
                onClick={() => {
                  setGeneratedWords((prev) => [
                    ...prev,
                    {
                      word: '',
                      meaning: '',
                      pronunciation: '',
                      partOfSpeech: 'Phrase',
                    },
                  ]);
                }}>
                Thêm từ vựng
              </button>
            </div>
            {generatedWords.length > 0 ? (
              <div style={{...styles.panel, padding: 14}}>
                <h4 style={{margin: '0 0 8px 0'}}>Từ vựng gợi ý ({generatedWords.length})</h4>
                <div style={{...styles.listWrap, maxHeight: 360}}>
                  {generatedWords.map((row, idx) => (
                    <div key={`gen-word-${idx}`} style={{...styles.topicCard, padding: 14}}>
                      <input style={{...styles.input, minHeight: 44}} value={String(row.word || '')} onChange={(e) => setGeneratedWords((prev) => prev.map((x, i) => (i === idx ? {...x, word: e.target.value} : x)))} />
                      <input style={{...styles.input, minHeight: 44}} value={String(row.meaning || '')} onChange={(e) => setGeneratedWords((prev) => prev.map((x, i) => (i === idx ? {...x, meaning: e.target.value} : x)))} />
                      <div style={styles.rowActions}>
                        <button
                          type="button"
                          style={styles.buttonAutofill}
                          disabled={autofillingWordIndex === idx}
                          onClick={async () => {
                            const keyword = String(row.word || '').trim();
                            if (!keyword) {
                              alert('Nhập từ/cụm trước khi auto điền.');
                              return;
                            }
                            if (typeof autofillWordFromEnglish !== 'function') {
                              alert('Chức năng auto điền chưa sẵn sàng.');
                              return;
                            }
                            setAutofillingWordIndex(idx);
                            try {
                              const data = await autofillWordFromEnglish(keyword);
                              if (!data?.ok) {
                                alert(String(data?.error || 'Không auto điền được từ vựng.'));
                                return;
                              }
                              setGeneratedWords((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  return {
                                    ...x,
                                    meaning: String(data?.meaning || x.meaning || '').trim(),
                                    pronunciation: String(
                                      data?.pronunciation || x.pronunciation || '',
                                    ).trim(),
                                    partOfSpeech: normalizePartOfSpeechForVideoWord(
                                      data?.partOfSpeech || x.partOfSpeech,
                                      wordTypes,
                                    ),
                                  };
                                }),
                              );
                            } catch (e) {
                              alert(
                                friendlyFetchError(
                                  e,
                                  'Không auto điền được từ vựng',
                                ),
                              );
                            } finally {
                              setAutofillingWordIndex(null);
                            }
                          }}>
                          {autofillingWordIndex === idx ? 'Đang điền...' : 'Auto điền'}
                        </button>
                        <input style={{...styles.input, ...styles.inlineGrow, minHeight: 44}} placeholder="Phiên âm" value={String(row.pronunciation || '')} onChange={(e) => setGeneratedWords((prev) => prev.map((x, i) => (i === idx ? {...x, pronunciation: e.target.value} : x)))} />
                        <select style={{...styles.input, width: 130, minHeight: 44}} value={String(row.partOfSpeech || 'Phrase')} onChange={(e) => setGeneratedWords((prev) => prev.map((x, i) => (i === idx ? {...x, partOfSpeech: e.target.value} : x)))}>
                          {wordTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button style={styles.buttonDanger} onClick={() => setGeneratedWords((prev) => prev.filter((_, i) => i !== idx))}>Xóa</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{...styles.rowActions, ...styles.rowActionsFinal}}>
              <button style={styles.buttonSecondary} onClick={() => setMode('list')}>Hủy</button>
              <button
                style={styles.buttonPrimary}
                disabled={saving}
                onClick={async () => {
                  if (!String(form.title || '').trim() || !String(form.videoUrl || '').trim()) {
                    return alert('Nhập tiêu đề và chọn video từ thiết bị');
                  }
                  setSaving(true);
                  setError('');
                  try {
                    let subtitleDraftNext = String(form.subtitleDraft || '').trim();
                    if (!subtitleDraftNext) {
                      try {
                        const autoSubtitles = await fetchMp4AutoSubtitles(String(form.videoUrl || '').trim());
                        subtitleDraftNext = autoSubtitles
                          .map((s) => `${String(s?.time || '').trim()}|${String(s?.text || '').trim()}`)
                          .filter((x) => x !== '|')
                          .join('\n');
                      } catch (_) {}
                    }
                    const parsedSubtitles = parseSubtitleDraft(subtitleDraftNext);
                    if (subtitleDraftNext && parsedSubtitles.length === 0) {
                      alert('Phụ đề chưa đúng định dạng `mm:ss|text`.');
                      setSaving(false);
                      return;
                    }

                    const manualWords = Array.isArray(generatedWords)
                      ? generatedWords
                          .map((w) => ({
                            word: String(w.word || '').trim(),
                            meaning: String(w.meaning || '').trim(),
                            pronunciation: String(w.pronunciation || '').trim(),
                            partOfSpeech: normalizePartOfSpeechForVideoWord(w.partOfSpeech, wordTypes),
                          }))
                          .filter((w) => w.word && w.meaning)
                      : [];
                    const autoWords = manualWords.length > 0 ? manualWords : await enrichSubtitleRows(parsedSubtitles);
                    const videoWordsPayload = autoWords.map((w) => ({
                      word: w.word,
                      meaning: w.meaning,
                      pronunciation: w.pronunciation || '',
                      partOfSpeechVi: normalizePartOfSpeechForVideoWord(w.partOfSpeech, wordTypes),
                      example: '',
                      exampleMeaning: '',
                      level: '',
                    }));

                    const vidUrl = String(form.videoUrl || '').trim();
                    const payload = {
                      id: editingId ?? `video_${Date.now()}`,
                      title: String(form.title || '').trim(),
                      thumbnail: String(form.thumbnail || '').trim(),
                      thumbnailUrl:
                        String(form.thumbnailUrl || '').trim() ||
                        deriveCloudinaryThumbnailUrl(vidUrl),
                      videoUrl: vidUrl,
                      duration: String(form.duration || '0:00').trim() || '0:00',
                      ...(parsedSubtitles.length > 0 ? {subtitles: parsedSubtitles} : {}),
                      ...(videoWordsPayload.length > 0 ? {videoWords: videoWordsPayload} : {}),
                    };
                    const next = editingId == null
                      ? [payload, ...videos]
                      : videos.map((v) => normalizeId(v.id) === normalizeId(editingId) ? {...v, ...payload, id: v.id} : v);
                    await saveResourceList('videos', next);

                    if (videoWordsPayload.length > 0) {
                      const vocab = await getResourceList('vocabulary');
                      const base = Array.isArray(vocab) ? [...vocab] : [];
                      const existing = new Set(base.map((x) => String(x?.word || '').trim().toLowerCase()));
                      let nextId = nextVocabularyNumericId(base);
                      let vocabAdded = 0;
                      let vocabSkippedDuplicate = 0;
                      for (const row of videoWordsPayload) {
                        const wordKey = String(row.word || '').trim().toLowerCase();
                        if (!wordKey) {
                          continue;
                        }
                        if (existing.has(wordKey)) {
                          vocabSkippedDuplicate += 1;
                          continue;
                        }
                        base.push({
                          id: nextId++,
                          word: String(row.word || '').trim(),
                          meaning: String(row.meaning || '').trim(),
                          pronunciation: String(row.pronunciation || '').trim(),
                          partOfSpeech: normalizePartOfSpeechForVideoWord(row.partOfSpeechVi, wordTypes),
                          example: '',
                          exampleVi: '',
                          exampleMeaning: '',
                          category: '',
                          learned: false,
                          source: 'video',
                          sourceVideoId: String(payload.id || ''),
                          sourceVideoTitle: String(payload.title || '').trim(),
                        });
                        existing.add(wordKey);
                        vocabAdded += 1;
                      }
                      await saveResourceList('vocabulary', base);
                      if (vocabSkippedDuplicate > 0) {
                        alert(
                          `Đồng bộ từ vựng chung: thêm ${vocabAdded} từ mới; ${vocabSkippedDuplicate} từ trùng từ đã có (bỏ qua, không ghi đè). Video vẫn lưu đủ ${videoWordsPayload.length} mục trong videoWords.`,
                        );
                      }
                    }

                    setVideos(next);
                    setMode('list');
                    setEditingId(null);
                    setGeneratedWords([]);
                    setForm((prev) => ({...prev, subtitleDraft: subtitleDraftNext}));
                  } catch (err) {
                    setError(err?.message || 'Không lưu được video');
                  } finally {
                    setSaving(false);
                  }
                }}>
                {saving ? 'Đang lưu...' : editingId != null ? 'Lưu thay đổi' : 'Thêm video'}
              </button>
            </div>
              </div>
            </div>
            {error ? (
              <p style={{...styles.error, margin: '0 16px 16px'}}>{error}</p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
