import {useEffect, useMemo, useState} from 'react';
import {adminSplitChrome as chrome} from '../adminSplitChrome';
import {
  EmojiIconField,
  displayCmsEmoji,
  normalizeCmsEmojiForSave,
} from '../cmsEmojiIconField';

const TOPIC_ICON_FALLBACK = '📘';

const tm = {
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#475569',
    marginBottom: 6,
    letterSpacing: '0.02em',
  },
  btnGradient: {
    padding: '11px 18px',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    boxShadow: '0 8px 22px rgba(79, 70, 229, 0.35)',
  },
  topicIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    fontSize: 22,
    background: 'linear-gradient(145deg, #f8fafc 0%, #eef2ff 100%)',
    border: '1px solid #E2E8F0',
    flexShrink: 0,
  },
  btnDeleteOutline: {
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 10,
    border: '1px solid #FECACA',
    background: '#FEF2F2',
    color: '#B91C1C',
    cursor: 'pointer',
    flexShrink: 0,
  },
  searchIcon: {fontSize: 14, opacity: 0.45, flexShrink: 0},
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    padding: '11px 0',
    fontSize: 14,
    background: 'transparent',
  },
  formSection: {
    marginBottom: 22,
    padding: 16,
    borderRadius: 14,
    border: '1px solid #F1F5F9',
    background: '#FAFBFC',
  },
  formSectionTitle: {
    margin: '0 0 14px',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#64748B',
  },
  chipRemove: {
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: '1px solid #C4B5FD',
    background: '#EDE9FE',
    color: '#5B21B6',
    cursor: 'pointer',
  },
  wordPickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 280,
    overflowY: 'auto',
    paddingRight: 4,
    marginTop: 10,
  },
  wordPickRow: (active) => ({
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: active ? '1px solid #818CF8' : '1px solid #EEF2F7',
    background: active ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' : '#fff',
    cursor: 'pointer',
    font: 'inherit',
    boxShadow: active ? '0 4px 14px rgba(99, 102, 241, 0.15)' : '0 1px 3px rgba(15, 23, 42, 0.04)',
    transition: 'border-color 0.12s, background 0.12s',
  }),
};

export default function TopicsManager({
  styles,
  getResourceList,
  saveResourceList,
  normalizeId,
  buildAutoTopicId,
  wordBelongsToTopic,
  emptyTopicForm,
}) {
  const [topics, setTopics] = useState([]);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('list');
  const [search, setSearch] = useState('');
  const [wordQuery, setWordQuery] = useState('');
  const [form, setForm] = useState(emptyTopicForm);
  const [selectedWordIds, setSelectedWordIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [topicList, wordList] = await Promise.all([
        getResourceList('topics'),
        getResourceList('vocabulary'),
      ]);
      setTopics(Array.isArray(topicList) ? topicList : []);
      setWords(Array.isArray(wordList) ? wordList : []);
    } catch (e) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadAll();
  }, []);

  const currentTopicId = normalizeId(editingId);
  const selectableWords = useMemo(() => {
    const q = wordQuery.trim().toLowerCase();
    return words.filter((w) => {
      const wid = normalizeId(w.id);
      const assignedToOther = topics.some((t) => {
        const tid = normalizeId(t.id);
        if (!tid || tid === currentTopicId) return false;
        return (
          Array.isArray(t.wordIds) && t.wordIds.map(normalizeId).includes(wid)
        );
      });
      if (assignedToOther) return false;
      if (!q) return true;
      return (
        String(w.word || '').toLowerCase().includes(q) ||
        String(w.meaning || '').toLowerCase().includes(q)
      );
    });
  }, [words, topics, wordQuery, currentTopicId, normalizeId]);
  const selectedWords = useMemo(() => {
    const set = new Set(selectedWordIds.map(normalizeId));
    return words.filter((w) => set.has(normalizeId(w.id)));
  }, [selectedWordIds, words, normalizeId]);
  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => JSON.stringify(t).toLowerCase().includes(q));
  }, [topics, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyTopicForm);
    setWordQuery('');
    setSelectedWordIds([]);
    setMode('create');
  };
  const openEdit = (topic) => {
    setEditingId(topic.id);
    setForm({
      name: String(topic.name || ''),
      icon: displayCmsEmoji(topic.icon, TOPIC_ICON_FALLBACK),
    });
    const fromIds = Array.isArray(topic.wordIds)
      ? topic.wordIds.map(normalizeId)
      : [];
    const fromLegacy = words
      .filter((w) => normalizeId(w.category) === normalizeId(topic.id))
      .map((w) => normalizeId(w.id));
    setSelectedWordIds([...new Set([...fromIds, ...fromLegacy])]);
    setWordQuery('');
    setMode('create');
  };
  const persistTopicList = async (nextTopics, nextWords = words) => {
    setSaving(true);
    setError('');
    try {
      await saveResourceList('topics', nextTopics);
      if (nextWords !== words) await saveResourceList('vocabulary', nextWords);
      setTopics(nextTopics);
      setWords(nextWords);
    } catch (e) {
      setError(e?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const inputBase = {
    ...styles.input,
    borderRadius: 12,
    border: '1px solid #E2E8F0',
    padding: '12px 14px',
  };

  return (
    <div className="users-manager-layout topics-manager-root">
      <section style={chrome.leftPanel}>
        <div style={chrome.heroStrip}>
          <h2 style={chrome.heroTitle}>Quản lý bộ từ</h2>
          <div style={chrome.heroStats}>
            <span style={chrome.heroChip}>{topics.length} bộ</span>
            {search.trim() ? (
              <span style={chrome.heroChip}>{filteredTopics.length} khớp tìm kiếm</span>
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
              placeholder="Tìm theo tên bộ hoặc ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div style={chrome.toolbarBelowSearch}>
          <button type="button" style={tm.btnGradient} onClick={openCreate}>
            + Thêm bộ mới
          </button>
          <button
            type="button"
            style={styles.buttonSecondary}
            onClick={loadAll}
            disabled={loading}>
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>
        <div style={chrome.listWrap}>
          {loading && topics.length === 0 ? (
            <p style={{padding: 8, color: '#64748B', fontSize: 14}}>Đang tải danh sách…</p>
          ) : null}
          {filteredTopics.map((t, idx) => {
            const count = words.filter((w) =>
              wordBelongsToTopic(w, t.id, topics),
            ).length;
            const sel =
              mode === 'create' &&
              editingId != null &&
              normalizeId(editingId) === normalizeId(t.id);
            return (
              <div
                key={String(t.id || idx)}
                className="topics-list-card"
                style={{
                  ...chrome.userRow(sel),
                  justifyContent: 'space-between',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onClick={() => openEdit(t)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openEdit(t);
                }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1}}>
                  <div style={tm.topicIconBox}>{displayCmsEmoji(t.icon, TOPIC_ICON_FALLBACK)}</div>
                  <div style={chrome.rowMain}>
                    <div style={chrome.rowName}>{String(t.name || 'Không tên')}</div>
                    <div style={chrome.rowMeta}>
                      <span style={chrome.tinyBadge}>{count} từ</span>
                    </div>
                  </div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                  <button
                    type="button"
                    style={tm.btnDeleteOutline}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Xóa bộ "${t.name}"?`)) return;
                      const nextTopics = topics.filter(
                        (x) => normalizeId(x.id) !== normalizeId(t.id),
                      );
                      const nextWords = words.map((w) =>
                        normalizeId(w.category) === normalizeId(t.id)
                          ? {...w, category: ''}
                          : w,
                      );
                      await persistTopicList(nextTopics, nextWords);
                    }}>
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && filteredTopics.length === 0 ? (
            <p style={{textAlign: 'center', color: '#64748B', padding: '20px 12px', fontSize: 14}}>
              Chưa có bộ từ hoặc không khớp tìm kiếm.
            </p>
          ) : null}
        </div>
      </section>

      <section style={chrome.rightPanel}>
        {mode !== 'create' ? (
          <div style={chrome.emptyDetail}>
            <div style={chrome.emptyDetailInner}>
              <div style={chrome.emptyIcon} aria-hidden>
                <div style={chrome.emptyIconHead} />
                <div style={chrome.emptyIconBody} />
              </div>
              <p style={{margin: 0, fontSize: 16, fontWeight: 700, color: '#334155'}}>Chưa chọn bộ từ</p>
              <p style={{margin: '10px 0 0', fontSize: 14, maxWidth: 280, lineHeight: 1.55}}>
                Nhấn vào một dòng trong danh sách bên trái để sửa, hoặc dùng nút “Thêm bộ mới”.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={chrome.detailScroll}>
              <div style={chrome.detailHead}>
                <h3 style={chrome.detailHeadTitle}>
                  {editingId != null ? 'Chỉnh sửa bộ từ' : 'Tạo bộ từ mới'}
                </h3>
                <p style={chrome.detailHeadSub}>
                  Đặt tên, icon và gán các mục từ vựng chưa thuộc bộ khác.
                </p>
              </div>
              <div style={{padding: '0 20px 20px'}}>
            <div style={tm.formSection}>
              <p style={tm.formSectionTitle}>Thông tin bộ</p>
              <label style={tm.label}>Tên bộ *</label>
              <input
                style={{...inputBase, width: '100%', boxSizing: 'border-box', marginBottom: 14}}
                value={form.name}
                onChange={(e) => setForm((f) => ({...f, name: e.target.value}))}
              />
              <EmojiIconField
                key={String(editingId ?? 'new-topic')}
                styles={styles}
                value={form.icon}
                onChange={(icon) => setForm((f) => ({...f, icon}))}
                fallbackEmoji={TOPIC_ICON_FALLBACK}
                inputId="topic-icon-input"
              />
            </div>

            <div style={{...tm.formSection, background: '#fff', borderColor: '#EEF2F7'}}>
              <p style={tm.formSectionTitle}>Từ trong bộ · {selectedWords.length} đã chọn</p>
              <label style={tm.label}>Tìm từ để thêm</label>
              <div style={{...chrome.searchWrap, marginBottom: selectedWords.length ? 12 : 10}}>
                <span style={chrome.searchIcon} aria-hidden>
                  ⌕
                </span>
                <input
                  style={tm.searchInput}
                  placeholder="Theo từ hoặc nghĩa..."
                  value={wordQuery}
                  onChange={(e) => setWordQuery(e.target.value)}
                />
              </div>
              {selectedWords.length > 0 ? (
                <div style={{...styles.chipsWrap, marginBottom: 12}}>
                  {selectedWords.map((w) => (
                    <button
                      key={String(w.id)}
                      type="button"
                      style={tm.chipRemove}
                      onClick={() =>
                        setSelectedWordIds((prev) =>
                          prev.filter((id) => normalizeId(id) !== normalizeId(w.id)),
                        )
                      }>
                      {String(w.word || '—')} ×
                    </button>
                  ))}
                </div>
              ) : null}
              <div style={tm.wordPickerList}>
                {selectableWords.map((w, idx) => {
                  const on = selectedWordIds.map(normalizeId).includes(normalizeId(w.id));
                  return (
                    <button
                      key={String(w.id || idx)}
                      type="button"
                      style={tm.wordPickRow(on)}
                      onClick={() => {
                        const sid = normalizeId(w.id);
                        setSelectedWordIds((prev) =>
                          prev.map(normalizeId).includes(sid)
                            ? prev.filter((x) => normalizeId(x) !== sid)
                            : [...prev, sid],
                        );
                      }}>
                      <span style={{...styles.listItemTitle, fontSize: 14}}>
                        {String(w.word || '—')}
                      </span>
                      <small style={{...styles.listItemMeta, display: 'block', marginTop: 4}}>
                        {String(w.meaning || '—')}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{...styles.rowActions, ...styles.rowActionsFinal, marginTop: 8}}>
              <button
                type="button"
                style={styles.buttonSecondary}
                onClick={() => setMode('list')}>
                Hủy
              </button>
              <button
                type="button"
                style={{
                  ...tm.btnGradient,
                  opacity: saving ? 0.65 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
                disabled={saving}
                onClick={async () => {
                  if (!String(form.name || '').trim()) return alert('Nhập tên bộ');
                  const newTopic = {
                    id: editingId ?? buildAutoTopicId(form.name, topics),
                    name: String(form.name || '').trim(),
                    icon: normalizeCmsEmojiForSave(form.icon, TOPIC_ICON_FALLBACK),
                    color: '#3B82F6',
                    wordIds: words
                      .filter((w) =>
                        selectedWordIds.map(normalizeId).includes(normalizeId(w.id)),
                      )
                      .map((w) => w.id),
                  };
                  const nextTopics =
                    editingId == null
                      ? [...topics, newTopic]
                      : topics.map((t) =>
                          normalizeId(t.id) === normalizeId(editingId)
                            ? {...t, ...newTopic}
                            : t,
                        );
                  await persistTopicList(nextTopics);
                  setMode('list');
                }}>
                {saving ? 'Đang lưu…' : 'Lưu bộ từ'}
              </button>
            </div>
              </div>
            </div>
          </>
        )}
        {error ? (
          <p style={{...styles.error, margin: '0 16px 16px'}}>{error}</p>
        ) : null}
      </section>
    </div>
  );
}
