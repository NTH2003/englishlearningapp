import {useEffect, useMemo, useState} from 'react';
import {adminSplitChrome as chrome} from '../adminSplitChrome';

function toSafeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function isVocabFromVideo(w) {
  return String(w?.source || '').toLowerCase() === 'video';
}

export default function VocabularyManager({
  styles,
  getResourceList,
  saveResourceList,
  normalizeId,
  wordBelongsToTopic,
  emptyWordForm,
  wordTypes,
  nextVocabularyNumericId,
  autofillWordFromEnglish,
  aiServerUrl,
}) {
  const [words, setWords] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyWordForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('list');
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsResults, setPexelsResults] = useState([]);
  const [pexelsError, setPexelsError] = useState('');
  /** all | video | manual — tách từ thêm từ video khỏi từ chủ đề/thủ công */
  const [sourceFilter, setSourceFilter] = useState('all');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [wordList, topicList] = await Promise.all([
        getResourceList('vocabulary'),
        getResourceList('topics'),
      ]);
      setWords(Array.isArray(wordList) ? wordList : []);
      setTopics(Array.isArray(topicList) ? topicList : []);
    } catch (e) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadAll();
  }, []);

  const sourceCounts = useMemo(() => {
    let video = 0;
    for (const w of words) {
      if (isVocabFromVideo(w)) {
        video += 1;
      }
    }
    return {video, manual: words.length - video, total: words.length};
  }, [words]);

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = words;
    if (sourceFilter === 'video') {
      list = list.filter(isVocabFromVideo);
    } else if (sourceFilter === 'manual') {
      list = list.filter((w) => !isVocabFromVideo(w));
    }
    if (q) {
      list = list.filter((w) => JSON.stringify(w).toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  }, [words, search, sourceFilter]);
  const topicLabels = (word) => {
    const labels = topics
      .filter((t) => wordBelongsToTopic(word, t.id, topics))
      .map((t) => String(t.name || t.id));
    return labels.length ? labels.join(', ') : 'Chưa gán bộ';
  };

  return (
    <div className="users-manager-layout">
      <section style={chrome.leftPanel}>
        <div style={chrome.heroStrip}>
          <h2 style={chrome.heroTitle}>Quản lý từ vựng</h2>
          <div style={chrome.heroStats}>
            <span style={chrome.heroChip}>{sourceCounts.total} từ</span>
            <span style={chrome.heroChip}>{sourceCounts.video} từ video</span>
            <span style={chrome.heroChip}>{sourceCounts.manual} chủ đề &amp; thủ công</span>
          </div>
        </div>
        <div style={chrome.searchBlock}>
          <div style={chrome.searchWrap}>
            <span style={chrome.searchIcon} aria-hidden>
              ⌕
            </span>
            <input
              style={chrome.searchInput}
              placeholder="Tìm theo từ/nghĩa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div style={chrome.toolbarBelowSearch}>
          <button
            style={styles.buttonPrimary}
            onClick={() => {
              setForm(emptyWordForm);
              setEditingId(null);
              setPexelsResults([]);
              setPexelsError('');
              setMode('edit');
            }}>
            Thêm từ mới
          </button>
          <button style={styles.buttonSecondary} onClick={loadAll} disabled={loading}>
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
          {[
            {key: 'all', label: 'Tất cả', count: sourceCounts.total},
            {key: 'video', label: 'Từ video', count: sourceCounts.video},
            {
              key: 'manual',
              label: 'Chủ đề & thủ công',
              count: sourceCounts.manual,
            },
          ].map(({key, label, count}) => (
            <button
              key={key}
              type="button"
              style={{
                ...styles.buttonSecondary,
                opacity: sourceFilter === key ? 1 : 0.82,
                border:
                  sourceFilter === key ? '1px solid #A78BFA' : '1px solid #E5E7EB',
                boxShadow:
                  sourceFilter === key ? '0 2px 10px rgba(124, 58, 237, 0.12)' : 'none',
                fontWeight: sourceFilter === key ? 700 : 500,
              }}
              onClick={() => setSourceFilter(key)}>
              {label} ({count})
            </button>
          ))}
        </div>
        {error && mode !== 'edit' ? (
          <p style={{...styles.error, margin: '0 14px 12px'}}>{error}</p>
        ) : null}
        <div style={chrome.listWrap}>
          {loading && words.length === 0 ? (
            <p style={{padding: 8, color: '#64748B', fontSize: 14}}>Đang tải danh sách…</p>
          ) : null}
          {filteredWords.map((w, idx) => {
            const sel =
              mode === 'edit' &&
              editingId != null &&
              normalizeId(editingId) === normalizeId(w.id);
            const openWord = () => {
              setEditingId(w.id);
              setForm({
                word: String(w.word || ''),
                meaning: String(w.meaning || ''),
                pronunciation: String(w.pronunciation || ''),
                partOfSpeech: String(w.partOfSpeech || 'Noun'),
                example: String(w.example || ''),
                exampleVi: String(w.exampleVi || w.exampleMeaning || ''),
                imageUrl: String(w.imageUrl || w.thumbnailUrl || w.photoUrl || ''),
                imageQuery: String(w.imageQuery || ''),
              });
              setPexelsResults([]);
              setPexelsError('');
              setMode('edit');
            };
            return (
              <div
                key={String(w.id || idx)}
                style={{
                  ...chrome.userRow(sel),
                  justifyContent: 'space-between',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onClick={openWord}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openWord();
                }}>
                <div style={chrome.rowMain}>
                  <div style={chrome.rowName}>{String(w.word || '—')}</div>
                  <div style={chrome.rowEmail}>{String(w.meaning || '—')}</div>
                  <div style={chrome.rowMeta}>
                    {isVocabFromVideo(w) ? (
                      <span style={{...chrome.tinyBadge, color: '#4338CA', background: '#EEF2FF'}}>
                        Video
                      </span>
                    ) : null}
                    {toSafeHttpUrl(w.imageUrl || w.thumbnailUrl || w.photoUrl) ? (
                      <span style={chrome.tinyBadge}>Ảnh</span>
                    ) : null}
                    <span style={chrome.tinyBadge}>{topicLabels(w)}</span>
                  </div>
                </div>
                <div style={{flexShrink: 0}}>
                  <button
                    style={styles.buttonDanger}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Xóa từ "${w.word}"?`)) return;
                      setSaving(true);
                      try {
                        const next = words.filter(
                          (x) => normalizeId(x.id) !== normalizeId(w.id),
                        );
                        await saveResourceList('vocabulary', next);
                        setWords(next);
                      } catch (err) {
                        setError(err?.message || 'Không xóa được');
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
          {!loading && filteredWords.length === 0 ? (
            <p style={{textAlign: 'center', color: '#64748B', padding: '20px 12px', fontSize: 14}}>
              Chưa có từ hoặc không khớp bộ lọc/tìm kiếm.
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
              <p style={{margin: 0, fontSize: 16, fontWeight: 700, color: '#334155'}}>
                Chưa chọn từ vựng
              </p>
              <p style={{margin: '10px 0 0', fontSize: 14, maxWidth: 280, lineHeight: 1.55}}>
                Nhấn vào một dòng trong danh sách bên trái để sửa, hoặc dùng nút “Thêm từ mới”.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={chrome.detailScroll}>
              <div style={chrome.detailHead}>
                <h3 style={chrome.detailHeadTitle}>
                  {editingId != null ? 'Sửa từ vựng' : 'Thêm từ mới'}
                </h3>
                <p style={chrome.detailHeadSub}>
                  Điền từ tiếng Anh, nghĩa và có thể điền tự động từ từ điển.
                </p>
              </div>
              <div style={{padding: '16px 20px 20px'}}>
            <label>Từ tiếng Anh *</label>
            <div style={styles.inlineRow}>
              <input
                style={{...styles.input, ...styles.inlineGrow, marginBottom: 0}}
                value={form.word}
                onChange={(e) => setForm((f) => ({...f, word: e.target.value}))}
              />
              <button
                style={styles.buttonAutofill}
                disabled={autofillLoading || saving}
                onClick={async () => {
                  const w = String(form.word || '').trim();
                  if (!w) return alert('Nhập từ tiếng Anh trước');
                  setAutofillLoading(true);
                  try {
                    const r = await autofillWordFromEnglish(w);
                    if (!r?.ok) {
                      alert(r?.error || 'Không điền tự động được');
                      return;
                    }
                    setForm((f) => ({
                      ...f,
                      pronunciation:
                        String(r.pronunciation || '').trim() || f.pronunciation,
                      partOfSpeech:
                        String(r.partOfSpeech || '').trim() || f.partOfSpeech,
                      meaning: String(r.meaning || '').trim() || f.meaning,
                      example: String(r.example || '').trim() || f.example,
                      exampleVi: String(r.exampleVi || '').trim() || f.exampleVi,
                    }));
                  } finally {
                    setAutofillLoading(false);
                  }
                }}>
                {autofillLoading ? 'Đang điền...' : 'Điền tự động'}
              </button>
            </div>
            <label>Nghĩa tiếng Việt *</label>
            <textarea
              style={styles.textarea}
              value={form.meaning}
              onChange={(e) => setForm((f) => ({...f, meaning: e.target.value}))}
            />
            <label>Phát âm</label>
            <input
              style={styles.input}
              value={form.pronunciation}
              onChange={(e) =>
                setForm((f) => ({...f, pronunciation: e.target.value}))
              }
            />
            <label>Loại từ</label>
            <div style={styles.chipsWrap}>
              {wordTypes.map((t) => (
                <button
                  key={t}
                  style={{
                    ...styles.chip,
                    ...(form.partOfSpeech === t ? styles.chipActive : {}),
                  }}
                  onClick={() => setForm((f) => ({...f, partOfSpeech: t}))}>
                  {t}
                </button>
              ))}
            </div>
            <label>Ví dụ (Anh)</label>
            <textarea
              style={styles.textarea}
              value={form.example}
              onChange={(e) => setForm((f) => ({...f, example: e.target.value}))}
            />
            <label>Ví dụ (Việt)</label>
            <textarea
              style={styles.textarea}
              value={form.exampleVi}
              onChange={(e) =>
                setForm((f) => ({...f, exampleVi: e.target.value}))
              }
            />
            <label>Từ khóa ảnh</label>
            <div style={styles.inlineRow}>
              <input
                style={{...styles.input, ...styles.inlineGrow, marginBottom: 0}}
                placeholder="vd: restaurant menu, paying bill..."
                value={form.imageQuery || ''}
                onChange={(e) =>
                  setForm((f) => ({...f, imageQuery: e.target.value}))
                }
              />
              <button
                style={styles.buttonAutofill}
                disabled={pexelsLoading || saving}
                onClick={async () => {
                  const q = String(form.imageQuery || form.word || '')
                    .trim()
                    .replace(/\s+/g, ' ')
                    .slice(0, 120);
                  if (!q) return alert('Nhập từ khóa ảnh hoặc từ tiếng Anh trước');
                  setPexelsLoading(true);
                  setPexelsError('');
                  try {
                    const base = String(aiServerUrl || '').trim();
                    if (!base) throw new Error('Thiếu AI server URL');
                    const resp = await fetch(
                      `${base}/media/pexels/search?query=${encodeURIComponent(
                        q,
                      )}&perPage=5`,
                    );
                    const json = await resp.json().catch(() => ({}));
                    if (!resp.ok) {
                      throw new Error(
                        json?.error || `Pexels request failed (${resp.status})`,
                      );
                    }
                    const photos = Array.isArray(json?.photos)
                      ? json.photos
                      : [];
                    setPexelsResults(photos);
                    if (!photos.length) {
                      setPexelsError('Không tìm thấy ảnh phù hợp.');
                    }
                  } catch (e) {
                    setPexelsResults([]);
                    setPexelsError(e?.message || 'Không tải được ảnh Pexels');
                  } finally {
                    setPexelsLoading(false);
                  }
                }}>
                {pexelsLoading ? 'Đang tìm...' : 'Tìm ảnh Pexels'}
              </button>
            </div>
            {pexelsError ? (
              <small style={{...styles.listItemMeta, color: '#B91C1C'}}>
                {pexelsError}
              </small>
            ) : null}
            {pexelsResults.length ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))',
                  gap: 8,
                  marginTop: 6,
                  marginBottom: 8,
                }}>
                {pexelsResults.map((p, idx) => {
                  const image = String(
                    p?.src?.medium || p?.src?.large || p?.src?.original || '',
                  ).trim();
                  if (!image) return null;
                  const selected = toSafeHttpUrl(form.imageUrl) === image;
                  return (
                    <button
                      key={String(p?.id || idx)}
                      style={{
                        border: selected
                          ? '2px solid #3B82F6'
                          : '1px solid #E5E7EB',
                        borderRadius: 10,
                        padding: 4,
                        background: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          imageUrl: image,
                          imageQuery: String(
                            f.imageQuery || f.word || '',
                          ).trim(),
                        }))
                      }>
                      <img
                        src={image}
                        alt={String(p?.photographer || 'pexels')}
                        style={{
                          width: '100%',
                          height: 82,
                          objectFit: 'cover',
                          borderRadius: 8,
                          display: 'block',
                        }}
                      />
                      <small
                        style={{
                          ...styles.listItemMeta,
                          marginTop: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                        {String(p?.photographer || 'Pexels')}
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {toSafeHttpUrl(form.imageUrl) ? (
              <div style={styles.subtitleEditorBox}>
                <div style={styles.subtitleEditorHead}>
                  <strong>Xem trước ảnh</strong>
                </div>
                <img
                  src={toSafeHttpUrl(form.imageUrl)}
                  alt={`preview-${String(form.word || 'word')}`}
                  style={{
                    width: '100%',
                    maxHeight: 180,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid #E5E7EB',
                  }}
                />
              </div>
            ) : null}
            <div style={{...styles.rowActions, ...styles.rowActionsFinal}}>
              <button
                style={styles.buttonSecondary}
                onClick={() => setMode('list')}>
                Hủy
              </button>
              <button
                style={styles.buttonPrimary}
                disabled={saving}
                onClick={async () => {
                  if (
                    !String(form.word || '').trim() ||
                    !String(form.meaning || '').trim()
                  ) {
                    return alert('Nhập đủ từ và nghĩa');
                  }
                  setSaving(true);
                  setError('');
                  try {
                    const payload = {
                      word: String(form.word || '').trim(),
                      meaning: String(form.meaning || '').trim(),
                      pronunciation: String(form.pronunciation || '').trim(),
                      partOfSpeech: wordTypes.includes(form.partOfSpeech)
                        ? form.partOfSpeech
                        : 'Other',
                      example: String(form.example || '').trim(),
                      exampleVi: String(form.exampleVi || '').trim(),
                      exampleMeaning: String(form.exampleVi || '').trim(),
                      imageUrl: toSafeHttpUrl(form.imageUrl),
                      imageQuery: String(form.imageQuery || '').trim(),
                      category: '',
                      learned: false,
                    };
                    const next =
                      editingId == null
                        ? [
                            ...words,
                            {id: nextVocabularyNumericId(words), ...payload},
                          ]
                        : words.map((w) =>
                            normalizeId(w.id) === normalizeId(editingId)
                              ? {
                                  ...w,
                                  ...payload,
                                  id: w.id,
                                  learned: Boolean(w.learned),
                                }
                              : w,
                          );
                    await saveResourceList('vocabulary', next);
                    setWords(next);
                    setForm(emptyWordForm);
                    setEditingId(null);
                    setMode('list');
                  } catch (err) {
                    setError(err?.message || 'Lưu thất bại');
                  } finally {
                    setSaving(false);
                  }
                }}>
                {saving
                  ? 'Đang lưu...'
                  : editingId != null
                    ? 'Lưu thay đổi'
                    : 'Thêm từ'}
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
