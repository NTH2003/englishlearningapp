import {Fragment, useEffect, useMemo, useState} from 'react';
import {onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut} from 'firebase/auth';
import {auth, googleProvider} from './firebase';
import {
  getResourceList,
  saveResourceList,
} from './firestoreAdmin';
import DashboardPage from './pages/DashboardPage';
import StatsPage from './pages/StatsPage';
import UsersPage from './pages/UsersPage';
import TopicsManager from './pages/TopicsManager';
import VocabularyManager from './pages/VocabularyManager';
import VideoManager from './pages/VideoManager';
import DialogueManager from './pages/DialogueManager';
import styles from './styles';

const NAV_SECTIONS = [
  {id: 'overview', title: 'Tổng quan'},
  {id: 'content', title: 'Nội dung'},
  {id: 'ops', title: 'Vận hành'},
];
const TABS = [
  {key: 'dashboard', label: 'Dashboard', icon: '⚡', section: 'overview'},
  {key: 'topics', label: 'Bộ từ', icon: '📚', section: 'content'},
  {key: 'vocabulary', label: 'Từ vựng', icon: '📝', section: 'content'},
  {key: 'videos', label: 'Video', icon: '🎬', section: 'content'},
  {key: 'dialogues', label: 'Hội thoại', icon: '💬', section: 'content'},
  {key: 'users', label: 'Người dùng', icon: '👥', section: 'ops'},
  {key: 'stats', label: 'Thống kê', icon: '📊', section: 'ops'},
];
const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || 'http://127.0.0.1:3001';
const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dkblwkrw7';
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'english_app';
const WORD_TYPES = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Phrase', 'Other'];

async function uploadVideoToCloudinary(file) {
  if (!file) throw new Error('Chưa chọn file video.');
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  let res;
  try {
    res = await fetch(endpoint, {method: 'POST', body: form});
  } catch (e) {
    throw new Error(
      `Không kết nối được Cloudinary. Kiểm tra mạng hoặc cấu hình upload preset (${endpoint}).`,
    );
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error?.message || 'Upload video thất bại (Cloudinary).',
    );
  }
  const secureUrl = String(json?.secure_url || '').trim();
  if (!secureUrl) {
    throw new Error('Không nhận được URL video sau khi upload.');
  }
  return secureUrl;
}

function friendlyFetchError(err, fallback) {
  const msg = String(err?.message || '').trim();
  if (!msg) return fallback;
  if (msg.toLowerCase() === 'failed to fetch') {
    return `${fallback} (mất kết nối mạng hoặc endpoint chưa chạy).`;
  }
  return msg;
}

const DEFAULT_ROW_TEXT = {
  videos: '{"id":"video_1","title":"Video mới","videoUrl":"https://...","duration":"0:30"}',
  dialogues:
    '{"id":"dialogue_new","title":"Hội thoại mới","topicId":"general","topicName":"Hội thoại","icon":"💬","difficultyVi":"Dễ","turns":[],"suggestions":[]}',
};

const EMPTY_TOPIC_FORM = {name: '', icon: '📘'};
const EMPTY_WORD_FORM = {
  word: '',
  meaning: '',
  pronunciation: '',
  partOfSpeech: 'Noun',
  example: '',
  exampleVi: '',
  imageUrl: '',
  imageQuery: '',
};

function parseEmailList(raw) {
  return String(raw || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
const ADMIN_EMAILS = parseEmailList(import.meta.env.VITE_ADMIN_EMAILS || '');
const TEACHER_EMAILS = parseEmailList(import.meta.env.VITE_TEACHER_EMAILS || '');
const checkRole = (email) => {
  const e = String(email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.includes(e)) return 'admin';
  if (TEACHER_EMAILS.includes(e)) return 'teacher';
  return null;
};
const getWordLabel = (w, idx) => String(w?.word || w?.title || w?.name || w?.id || `#${idx + 1}`);
const normalizeId = (x) => String(x ?? '').trim();
const buildAutoTopicId = (name, topics) => {
  const base = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'topic';
  const exists = new Set(topics.map((t) => normalizeId(t.id)));
  if (!exists.has(base)) return base;
  let i = 2;
  while (exists.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
};
const nextVocabularyNumericId = (words) => {
  const max = words.reduce((m, w) => (Number.isFinite(Number(w?.id)) ? Math.max(m, Number(w.id)) : m), 0);
  return max + 1;
};
const mapApiPartOfSpeech = (api) => {
  const p = String(api || '').toLowerCase();
  const m = {
    noun: 'Noun',
    verb: 'Verb',
    adjective: 'Adjective',
    adverb: 'Adverb',
    'modal verb': 'Verb',
    auxiliary: 'Verb',
    phrase: 'Phrase',
  };
  return m[p] || 'Other';
};
const sanitizeTranslatedText = (value) => {
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
};
const translateEnToVi = async (text) => {
  const q = String(text || '').trim();
  if (!q) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|vi`;
    const res = await fetch(url);
    const json = await res.json();
    const out = sanitizeTranslatedText(json?.responseData?.translatedText || '');
    return out && out !== q ? out : '';
  } catch {
    return '';
  }
};
const normalizeSimpleText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const autofillWordFromEnglish = async (rawWord) => {
  const display = String(rawWord || '').trim().replace(/\s+/g, ' ');
  const lookup = display.replace(/[!?.]+$/g, '').toLowerCase();
  const isSingleWord = !lookup.includes(' ');
  if (lookup.length < 2) return {ok: false, error: 'Nhập từ/cụm tiếng Anh trước.'};
  let res;
  try {
    res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lookup)}`);
  } catch {
    return {ok: false, error: 'Không kết nối được từ điển.'};
  }
  if (res.status === 404) {
    const vi = await translateEnToVi(display);
    return {
      ok: true,
      pronunciation: '',
      partOfSpeech: lookup.includes(' ') ? 'Phrase' : 'Other',
      meaning: vi || display,
      // Không tự điền ví dụ bằng chính từ/cụm từ -> người dùng tự nhập ví dụ tự nhiên hơn.
      example: '',
      exampleVi: '',
    };
  }
  if (!res.ok) return {ok: false, error: 'Từ điển tạm thời không khả dụng.'};
  let data;
  try {
    data = await res.json();
  } catch {
    return {ok: false, error: 'Không đọc được dữ liệu từ điển.'};
  }
  const entry = Array.isArray(data) && data[0] ? data[0] : null;
  if (!entry) return {ok: false, error: 'Không có dữ liệu cho từ này.'};
  const pronunciation =
    Array.isArray(entry.phonetics) && entry.phonetics.find((x) => x?.text)?.text
      ? String(entry.phonetics.find((x) => x?.text).text).trim()
      : '';
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  let picked = null;
  for (const m of meanings) {
    const defs = Array.isArray(m?.definitions) ? m.definitions : [];
    const def = defs.find((d) => String(d?.definition || '').trim());
    if (def) {
      picked = {
        partOfSpeech: mapApiPartOfSpeech(m.partOfSpeech),
        gloss: String(def.definition || '').trim(),
        example: String(def.example || '').trim(),
      };
      break;
    }
  }
  const gloss = String(picked?.gloss || '').trim();
  const exampleRaw = String(picked?.example || '').trim();
  const exampleLooksLikeHeadword =
    normalizeSimpleText(exampleRaw) === normalizeSimpleText(display) ||
    normalizeSimpleText(exampleRaw) === normalizeSimpleText(lookup);
  const example = exampleLooksLikeHeadword ? '' : exampleRaw;
  // Ưu tiên dịch trực tiếp từ/cụm thay vì dịch định nghĩa dài.
  const directMeaning =
    (await translateEnToVi(lookup)) ||
    (await translateEnToVi(display)) ||
    (await translateEnToVi(String(entry?.word || '').trim()));
  const glossVi = gloss ? await translateEnToVi(gloss) : '';
  const resolvedMeaning = directMeaning || (!isSingleWord ? glossVi : '') || gloss || '';
  return {
    ok: true,
    pronunciation,
    partOfSpeech: picked?.partOfSpeech || 'Other',
    meaning: resolvedMeaning,
    example,
    exampleVi: example ? await translateEnToVi(example) : '',
  };
};
const wordBelongsToTopic = (word, topicId, topics) => {
  const wid = normalizeId(word?.id);
  const tid = normalizeId(topicId);
  const fromTopicWordIds = topics.some((t) => normalizeId(t?.id) === tid && Array.isArray(t?.wordIds) && t.wordIds.map(normalizeId).includes(wid));
  if (fromTopicWordIds) return true;
  return normalizeId(word?.category ?? word?.topicId ?? word?.topic) === tid;
};

function LoginCard({onLoginEmail, onLoginGoogle, loading, error}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="admin-login-page">
      <div className="admin-login-backdrop" aria-hidden />
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <div className="admin-login-logo" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <span className="admin-login-badge">CMS</span>
            <h1 className="admin-login-title">EnglishApp Admin</h1>
            <p className="admin-login-sub">Đăng nhập để quản lý nội dung ứng dụng học tiếng Anh.</p>
          </div>
        </div>

        <div className="admin-login-fields">
          <label className="admin-login-label" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            className="admin-login-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
          />
          <label className="admin-login-label" htmlFor="admin-password">
            Mật khẩu
          </label>
          <input
            id="admin-password"
            className="admin-login-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button
          type="button"
          className="admin-login-btn admin-login-btn-primary"
          disabled={loading}
          onClick={() => onLoginEmail(email, password)}>
          {loading ? 'Đang xử lý…' : 'Đăng nhập'}
        </button>

        <div className="admin-login-divider">
          <span>hoặc</span>
        </div>

        <button type="button" className="admin-login-btn admin-login-btn-google" disabled={loading} onClick={onLoginGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Tiếp tục với Google
        </button>

        {error ? <div className="admin-login-error" role="alert">{error}</div> : null}

        <p className="admin-login-foot">Chỉ tài khoản trong danh sách Admin / Giáo viên mới truy cập được.</p>
      </div>
    </div>
  );
}

function JsonResourceEditor({resourceKey}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [newRowText, setNewRowText] = useState(DEFAULT_ROW_TEXT[resourceKey]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getResourceList(resourceKey);
      setRows(data);
      if (data.length) {
        setSelectedIndex(0);
        setSelectedText(JSON.stringify(data[0], null, 2));
      } else {
        setSelectedIndex(null);
        setSelectedText('');
      }
    } catch (e) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setNewRowText(DEFAULT_ROW_TEXT[resourceKey]);
    void load();
  }, [resourceKey]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div style={styles.editorLayout}>
      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h3 style={styles.panelTitle}>Danh sách ({rows.length})</h3>
          <input placeholder="Tìm nhanh..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.input} />
        </div>
        <div style={styles.listWrap}>
          {loading ? <p>Đang tải...</p> : null}
          {filteredRows.map((row, idx) => {
            const originalIndex = rows.indexOf(row);
            return (
              <div
                key={`${resourceKey}-${idx}`}
                style={{...styles.topicCard, ...styles.topicCardClickable}}
                onClick={() => {
                  setSelectedIndex(originalIndex);
                  setSelectedText(JSON.stringify(row, null, 2));
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedIndex(originalIndex);
                    setSelectedText(JSON.stringify(row, null, 2));
                  }
                }}>
                <div>
                  <span style={styles.listItemTitle}>{getWordLabel(row, idx)}</span>
                  <small style={styles.listItemMeta}>{String(row?.id || '')}</small>
                </div>
                <div style={styles.rowActions}>
                  <button
                    style={styles.buttonDanger}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = rows.filter((_, i) => i !== originalIndex);
                      setRows(next);
                      if (selectedIndex === originalIndex) {
                        setSelectedIndex(null);
                        setSelectedText('');
                      }
                    }}>
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section style={styles.panel}>
        <h3 style={styles.panelTitle}>Chỉnh sửa</h3>
        <textarea style={styles.textarea} value={selectedText} onChange={(e) => setSelectedText(e.target.value)} />
        <div style={styles.rowActions}>
          <button style={styles.buttonSecondary} disabled={selectedIndex == null} onClick={() => {
            if (selectedIndex == null) return;
            try {
              const parsed = JSON.parse(selectedText);
              setRows((prev) => prev.map((x, i) => (i === selectedIndex ? parsed : x)));
            } catch (e) {
              setError(`JSON không hợp lệ: ${e?.message || ''}`);
            }
          }}>Cập nhật</button>
          <button style={styles.buttonDanger} disabled={selectedIndex == null} onClick={() => {
            if (selectedIndex == null) return;
            setRows((prev) => prev.filter((_, i) => i !== selectedIndex));
            setSelectedIndex(null);
            setSelectedText('');
          }}>Xóa</button>
        </div>
        <h3 style={styles.panelTitle}>Thêm mới</h3>
        <textarea style={styles.textarea} value={newRowText} onChange={(e) => setNewRowText(e.target.value)} />
        <div style={styles.rowActions}>
          <button style={styles.buttonSecondary} onClick={() => {
            try {
              const parsed = JSON.parse(newRowText);
              setRows((prev) => [...prev, parsed]);
            } catch (e) {
              setError(`JSON không hợp lệ: ${e?.message || ''}`);
            }
          }}>Thêm</button>
        </div>
        <div style={{...styles.rowActions, ...styles.rowActionsFinal}}>
          <button style={styles.buttonSecondary} onClick={load} disabled={loading || saving}>Tải lại</button>
          <button style={styles.buttonPrimary} onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await saveResourceList(resourceKey, rows);
            } catch (e) {
              setError(e?.message || 'Lưu thất bại');
            } finally {
              setSaving(false);
            }
          }} disabled={loading || saving}>{saving ? 'Đang lưu...' : 'Lưu toàn bộ'}</button>
        </div>
        {error ? <p style={styles.error}>{error}</p> : null}
      </section>
    </div>
  );
}

const DIFFICULTY_OPTIONS = ['Dễ', 'Trung bình', 'Khó'];
const normalizeDifficultyVi = (raw) => (DIFFICULTY_OPTIONS.includes(String(raw || '').trim()) ? String(raw).trim() : 'Dễ');

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dashboard');

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthReady(true);
  }), []);

  const role = user?.email ? checkRole(user.email) : null;
  const loginEmail = async (email, password) => {
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, String(email).trim(), password);
    } catch (e) {
      setError(e?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };
  const loginGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e?.message || 'Đăng nhập Google thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <div className="admin-login-page admin-login-page--center">
        <p className="admin-login-loading">Đang khởi tạo…</p>
      </div>
    );
  }
  if (!user) {
    return <LoginCard onLoginEmail={loginEmail} onLoginGoogle={loginGoogle} loading={loading} error={error} />;
  }
  if (!role) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-backdrop" aria-hidden />
        <div className="admin-login-card admin-login-card--narrow">
          <div className="admin-login-brand">
            <div className="admin-login-logo admin-login-logo--warn" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="admin-login-title">Không có quyền truy cập</h1>
              <p className="admin-login-sub">
                Tài khoản <strong>{user.email}</strong> chưa nằm trong danh sách Admin / Giáo viên (
                <code className="admin-login-code">VITE_ADMIN_EMAILS</code> / <code className="admin-login-code">VITE_TEACHER_EMAILS</code>
                ).
              </p>
            </div>
          </div>
          <button type="button" className="admin-login-btn admin-login-btn-secondary" onClick={() => signOut(auth)}>
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  let body = null;
  if (tab === 'dashboard') {
    body = <DashboardPage onNavigate={setTab} userEmail={user.email} role={role} />;
  }
  if (tab === 'topics') {
    body = (
      <TopicsManager
        styles={styles}
        getResourceList={getResourceList}
        saveResourceList={saveResourceList}
        normalizeId={normalizeId}
        buildAutoTopicId={buildAutoTopicId}
        wordBelongsToTopic={wordBelongsToTopic}
        emptyTopicForm={EMPTY_TOPIC_FORM}
      />
    );
  }
  if (tab === 'vocabulary') {
    body = (
      <VocabularyManager
        styles={styles}
        getResourceList={getResourceList}
        saveResourceList={saveResourceList}
        normalizeId={normalizeId}
        wordBelongsToTopic={wordBelongsToTopic}
        emptyWordForm={EMPTY_WORD_FORM}
        wordTypes={WORD_TYPES}
        nextVocabularyNumericId={nextVocabularyNumericId}
        autofillWordFromEnglish={autofillWordFromEnglish}
        aiServerUrl={AI_SERVER_URL}
      />
    );
  }
  if (tab === 'videos') {
    body = (
      <VideoManager
        styles={styles}
        getResourceList={getResourceList}
        saveResourceList={saveResourceList}
        normalizeId={normalizeId}
        uploadVideoToCloudinary={uploadVideoToCloudinary}
        friendlyFetchError={friendlyFetchError}
        aiServerUrl={AI_SERVER_URL}
        wordTypes={WORD_TYPES}
        nextVocabularyNumericId={nextVocabularyNumericId}
        autofillWordFromEnglish={autofillWordFromEnglish}
      />
    );
  }
  if (tab === 'dialogues') {
    body = (
      <DialogueManager
        styles={styles}
        getResourceList={getResourceList}
        saveResourceList={saveResourceList}
        normalizeId={normalizeId}
        difficultyOptions={DIFFICULTY_OPTIONS}
        normalizeDifficultyVi={normalizeDifficultyVi}
      />
    );
  }
  if (tab === 'stats') body = <StatsPage styles={styles} />;
  if (tab === 'users') body = <UsersPage styles={styles} />;
  if (body == null) {
    body = <JsonResourceEditor resourceKey={tab} />;
  }

  return (
    <div style={styles.appShell}>
      <aside style={styles.sidebar} className="admin-sidebar-shell">
        <div style={styles.sidebarHead}>
          <h2 style={styles.sidebarTitle}>EnglishApp Admin</h2>
          <div style={{marginBottom: 10}}>
            <span style={styles.sidebarRole}>
              {role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : role || '—'}
            </span>
          </div>
          <p style={styles.sidebarEmail}>{user.email}</p>
        </div>
        <nav className="admin-sidebar-nav" style={styles.nav}>
          {NAV_SECTIONS.map((sec) => (
            <Fragment key={sec.id}>
              <div className="admin-nav-section-label">{sec.title}</div>
              {TABS.filter((t) => t.section === sec.id).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-nav-btn${tab === item.key ? ' active' : ''}`}
                  onClick={() => setTab(item.key)}>
                  <span className="admin-nav-btn-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>
      </aside>
      <main style={styles.content} className="admin-main-shell">
        <header style={styles.contentHeader} className="admin-content-header">
          <div style={styles.contentHeaderToolbar}>
            <p style={styles.contentHeaderKicker}>Quản lý hệ thống</p>
            <button type="button" className="admin-logout-btn" onClick={() => signOut(auth)}>
              Đăng xuất
            </button>
          </div>
          <h1 style={styles.contentHeaderTitle}>{TABS.find((x) => x.key === tab)?.label}</h1>
        </header>
        {body}
      </main>
    </div>
  );
}
