import {useEffect, useMemo, useState} from 'react';
import {adminSplitChrome as chrome} from '../adminSplitChrome';
import {
  EmojiIconField,
  displayCmsEmoji,
  normalizeCmsEmojiForSave,
} from '../cmsEmojiIconField';

const DIALOGUE_ICON_FALLBACK = '💬';

export default function DialogueManager({
  styles,
  getResourceList,
  saveResourceList,
  normalizeId,
  difficultyOptions,
  normalizeDifficultyVi,
}) {
  const [dialogues, setDialogues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    icon: '💬',
    difficultyVi: 'Dễ',
    speaker: 'Nhân vật',
    goal: '',
    starterText: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getResourceList('dialogues');
      setDialogues(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Không tải được hội thoại');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dialogues;
    return dialogues.filter((d) => JSON.stringify(d).toLowerCase().includes(q));
  }, [dialogues, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      icon: '💬',
      difficultyVi: 'Dễ',
      speaker: 'Nhân vật',
      goal: '',
      starterText: '',
    });
    setMode('edit');
  };
  const openEdit = (d) => {
    setEditingId(d.id);
    setForm({
      title: String(d.title || ''),
      icon: displayCmsEmoji(d.icon, DIALOGUE_ICON_FALLBACK),
      difficultyVi: normalizeDifficultyVi(d.difficultyVi),
      speaker: String(d?.turns?.[0]?.speaker || 'Nhân vật'),
      goal: String(d.goal || ''),
      starterText: String(d?.turns?.[0]?.text || ''),
    });
    setMode('edit');
  };

  return (
    <div className="users-manager-layout">
      <section style={chrome.leftPanel}>
        <div style={chrome.heroStrip}>
          <h2 style={chrome.heroTitle}>Quản lý hội thoại</h2>
          <div style={chrome.heroStats}>
            <span style={chrome.heroChip}>{dialogues.length} hội thoại</span>
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
          <button type="button" style={styles.buttonPrimary} onClick={openCreate}>
            Thêm hội thoại mới
          </button>
          <button type="button" style={styles.buttonSecondary} onClick={loadAll} disabled={loading}>
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>
        {error && mode !== 'edit' ? (
          <p style={{...styles.error, margin: '0 14px 12px'}}>{error}</p>
        ) : null}
        <div style={chrome.listWrap}>
          {loading && dialogues.length === 0 ? (
            <p style={{padding: 8, color: '#64748B', fontSize: 14}}>Đang tải danh sách…</p>
          ) : null}
          {filtered.map((d, idx) => {
            const sel =
              mode === 'edit' &&
              editingId != null &&
              normalizeId(editingId) === normalizeId(d.id);
            return (
              <div
                key={String(d.id || idx)}
                style={{
                  ...chrome.userRow(sel),
                  justifyContent: 'space-between',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onClick={() => openEdit(d)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openEdit(d);
                }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1}}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 22,
                      background: 'linear-gradient(145deg, #f8fafc 0%, #eef2ff 100%)',
                      border: '1px solid #E2E8F0',
                    }}>
                    {displayCmsEmoji(d.icon, DIALOGUE_ICON_FALLBACK)}
                  </div>
                  <div style={chrome.rowMain}>
                    <div style={chrome.rowName}>{String(d.title || 'Hội thoại không tên')}</div>
                    <div style={chrome.rowEmail}>Độ khó: {String(d.difficultyVi || 'Dễ')}</div>
                  </div>
                </div>
                <div style={{flexShrink: 0}}>
                  <button
                    type="button"
                    style={styles.buttonDanger}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Xóa hội thoại "${d.title}"?`)) return;
                      setSaving(true);
                      try {
                        const next = dialogues.filter((x) => normalizeId(x.id) !== normalizeId(d.id));
                        await saveResourceList('dialogues', next);
                        setDialogues(next);
                      } catch (err) {
                        setError(err?.message || 'Không xóa được hội thoại');
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
              Chưa có hội thoại hoặc không khớp tìm kiếm.
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
              <p style={{margin: 0, fontSize: 16, fontWeight: 700, color: '#334155'}}>Chưa chọn hội thoại</p>
              <p style={{margin: '10px 0 0', fontSize: 14, maxWidth: 280, lineHeight: 1.55}}>
                Nhấn vào một dòng trong danh sách bên trái để sửa, hoặc dùng nút “Thêm hội thoại mới”.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={chrome.detailScroll}>
              <div style={chrome.detailHead}>
                <h3 style={chrome.detailHeadTitle}>
                  {editingId != null ? 'Sửa hội thoại' : 'Thêm hội thoại'}
                </h3>
                <p style={chrome.detailHeadSub}>
                  Tiêu đề, độ khó và câu mở đầu; các lượt chi tiết có thể chỉnh sau trong JSON nếu cần.
                </p>
              </div>
              <div style={{padding: '16px 20px 20px'}}>
            <label>Tiêu đề *</label>
            <input
              style={{...styles.input, marginBottom: 14}}
              value={form.title}
              onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
            />
            <div style={{marginBottom: 14}}>
              <EmojiIconField
                key={String(editingId ?? 'new-dialogue')}
                styles={styles}
                value={form.icon}
                onChange={(icon) => setForm((f) => ({...f, icon}))}
                fallbackEmoji={DIALOGUE_ICON_FALLBACK}
                inputId="dialogue-icon-input"
              />
            </div>
            <label>Độ khó</label>
            <div style={styles.chipsWrap}>
              {difficultyOptions.map((opt) => (
                <button key={opt} style={{...styles.chip, ...(normalizeDifficultyVi(form.difficultyVi) === opt ? styles.chipActive : {})}} onClick={() => setForm((f) => ({...f, difficultyVi: opt}))}>{opt}</button>
              ))}
            </div>
            <label>Người nói mở đầu</label>
            <input style={styles.input} value={form.speaker} onChange={(e) => setForm((f) => ({...f, speaker: e.target.value}))} />
            <label>Mục tiêu luyện tập</label>
            <textarea
              style={styles.textarea}
              value={form.goal}
              onChange={(e) => setForm((f) => ({...f, goal: e.target.value}))}
              placeholder="VD: Hỏi phòng trống, xác nhận thông tin đặt phòng..."
            />
            <label>Câu mở đầu (English, tuỳ chọn)</label>
            <textarea
              style={styles.textarea}
              value={form.starterText}
              onChange={(e) => setForm((f) => ({...f, starterText: e.target.value}))}
              placeholder="Nếu để trống sẽ tự sinh từ tiêu đề..."
            />
            <div style={{...styles.rowActions, ...styles.rowActionsFinal}}>
              <button style={styles.buttonSecondary} onClick={() => setMode('list')}>Hủy</button>
              <button style={styles.buttonPrimary} disabled={saving} onClick={async () => {
                const title = String(form.title || '').trim();
                if (!title) return alert('Nhập tiêu đề hội thoại');
                const id = normalizeId(title);
                if (!id) return alert('Tiêu đề chưa hợp lệ để tạo ID');
                const duplicate = dialogues.some((x) => normalizeId(x.id) === id && normalizeId(x.id) !== normalizeId(editingId));
                if (duplicate) return alert('ID hội thoại đã tồn tại');
                setSaving(true);
                setError('');
                try {
                  const prev = dialogues.find((x) => normalizeId(x.id) === normalizeId(editingId));
                  const payload = {
                    id,
                    topicId: 'general',
                    topicName: 'Hội thoại',
                    title,
                    icon: normalizeCmsEmojiForSave(form.icon, DIALOGUE_ICON_FALLBACK),
                    difficultyVi: normalizeDifficultyVi(form.difficultyVi),
                    goal: String(form.goal || '').trim(),
                    accentColor: String(prev?.accentColor || '#2563EB'),
                    turns: [
                      {
                        id: 1,
                        speaker: String(form.speaker || '').trim() || String(prev?.turns?.[0]?.speaker || 'Nhân vật'),
                        text:
                          String(form.starterText || '').trim() ||
                          `Let's practice this scenario: ${title}`,
                        translation: String(prev?.turns?.[0]?.translation || '').trim(),
                      },
                    ],
                    suggestions: Array.isArray(prev?.suggestions) ? prev.suggestions : [],
                    completed: Boolean(prev?.completed),
                  };
                  const next = editingId == null
                    ? [payload, ...dialogues]
                    : dialogues.map((d) => normalizeId(d.id) === normalizeId(editingId) ? {...d, ...payload} : d);
                  await saveResourceList('dialogues', next);
                  setDialogues(next);
                  setMode('list');
                  setEditingId(null);
                } catch (err) {
                  setError(err?.message || 'Không lưu được hội thoại');
                } finally {
                  setSaving(false);
                }
              }}>{saving ? 'Đang lưu...' : editingId != null ? 'Lưu thay đổi' : 'Thêm hội thoại'}</button>
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
