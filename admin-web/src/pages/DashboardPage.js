import {useCallback, useEffect, useState} from 'react';
import {getAdminDashboardStats} from '../firestoreAdmin';

const wrap = {
  padding: '0 24px 36px',
  maxWidth: 1280,
  margin: '0 auto',
};

const hero = {
  borderRadius: 20,
  padding: '24px 24px 22px',
  marginBottom: 22,
  background: 'linear-gradient(125deg, #0f172a 0%, #1e3a5f 38%, #4c1d95 100%)',
  color: '#fff',
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
};

const heroTop = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};

const kicker = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  opacity: 0.78,
};

const title = {
  margin: '8px 0 0',
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: '-0.03em',
  lineHeight: 1.2,
};

const sub = {
  margin: '10px 0 0',
  fontSize: 14,
  opacity: 0.88,
  maxWidth: 520,
  lineHeight: 1.55,
};

const refreshBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  cursor: 'pointer',
};

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 14,
  marginBottom: 22,
};

const kpiCard = (accent) => ({
  borderRadius: 16,
  padding: '18px 16px',
  background: '#fff',
  border: '1px solid #e8ecf3',
  boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
  ...(accent
    ? {
        background: `linear-gradient(145deg, ${accent.from} 0%, ${accent.to} 100%)`,
        color: '#fff',
        border: '1px solid transparent',
        boxShadow: `0 12px 28px ${accent.shadow}`,
      }
    : {}),
});

const kpiLabel = (onDark) => ({
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: onDark ? 'rgba(255,255,255,0.85)' : '#64748b',
  marginBottom: 6,
});

const kpiValue = (onDark) => ({
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: '-0.03em',
  color: onDark ? '#fff' : '#0f172a',
  lineHeight: 1.1,
});

const sectionTitle = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748b',
  margin: '0 0 12px',
};

const actionsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
  marginBottom: 26,
};

const actionBtn = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
  padding: '16px 18px',
  borderRadius: 16,
  border: '1px solid #e8ecf3',
  background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
  cursor: 'pointer',
  textAlign: 'left',
  boxShadow: '0 2px 12px rgba(15, 23, 42, 0.05)',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

const actionIcon = {
  fontSize: 28,
  lineHeight: 1,
};

const actionLabel = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: '#0f172a',
  letterSpacing: '-0.02em',
};

const actionHint = {
  margin: '4px 0 0',
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.4,
};

const panel = {
  borderRadius: 18,
  padding: '20px 20px 18px',
  background: '#fff',
  border: '1px solid #e8ecf3',
  boxShadow: '0 8px 28px rgba(15, 23, 42, 0.06)',
};

const learnerRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
};

const linkBtn = {
  marginTop: 14,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 12,
  border: '1px solid #c7d2fe',
  background: '#eef2ff',
  color: '#4338ca',
  cursor: 'pointer',
};

const loadingBox = {padding: 48, textAlign: 'center', color: '#64748b'};
const errBox = {
  padding: 14,
  borderRadius: 12,
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  fontSize: 13,
  marginBottom: 16,
};

export default function DashboardPage({onNavigate, userEmail, role}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await getAdminDashboardStats();
    if (res.ok) {
      setStats(res.stats);
    } else {
      setError(res.error || 'Không tải được dữ liệu.');
      setStats(res.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const s = stats || {};
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : '';

  return (
    <div style={wrap}>
      <div style={hero}>
        <div style={heroTop}>
          <div>
            <p style={kicker}>EnglishApp</p>
            <h2 style={title}>Dashboard</h2>
            <p style={sub}>
              Tổng quan nội dung và người học.
            </p>
            {userEmail ? (
              <p style={{...sub, marginTop: 8, fontSize: 12, opacity: 0.75}}>
                {roleLabel ? `${roleLabel} · ` : ''}
                {userEmail}
              </p>
            ) : null}
          </div>
          <button type="button" style={refreshBtn} onClick={() => void load()} disabled={loading}>
            {loading ? 'Đang tải…' : 'Làm mới dữ liệu'}
          </button>
        </div>
      </div>

      {error ? <div style={errBox}>{error}</div> : null}

      {loading && !stats ? (
        <div style={loadingBox}>Đang tải dashboard…</div>
      ) : (
        <>
          <div style={kpiGrid}>
            <div style={kpiCard({from: '#4f46e5', to: '#6366f1', shadow: 'rgba(79, 70, 229, 0.35)'})}>
              <div style={kpiLabel(true)}>Bộ chủ đề</div>
              <div style={kpiValue(true)}>{s.topicCount ?? 0}</div>
            </div>
            <div style={kpiCard({from: '#0d9488', to: '#14b8a6', shadow: 'rgba(13, 148, 136, 0.3)'})}>
              <div style={kpiLabel(true)}>Từ vựng</div>
              <div style={kpiValue(true)}>{s.vocabularyCount ?? 0}</div>
            </div>
            <div style={kpiCard({from: '#c026d3', to: '#d946ef', shadow: 'rgba(192, 38, 211, 0.28)'})}>
              <div style={kpiLabel(true)}>Video</div>
              <div style={kpiValue(true)}>{s.videoCount ?? 0}</div>
            </div>
            <div style={kpiCard({from: '#ca8a04', to: '#eab308', shadow: 'rgba(202, 138, 4, 0.28)'})}>
              <div style={kpiLabel(true)}>Hội thoại</div>
              <div style={kpiValue(true)}>{s.dialogueCount ?? 0}</div>
            </div>
            <div style={kpiCard()}>
              <div style={kpiLabel(false)}>Người dùng</div>
              <div style={kpiValue(false)}>{s.totalUsers ?? 0}</div>
            </div>
            <div style={kpiCard()}>
              <div style={kpiLabel(false)}>Hoạt động 24h</div>
              <div style={kpiValue(false)}>{s.activeToday ?? 0}</div>
            </div>
          </div>

          <h3 style={sectionTitle}>Truy cập nhanh</h3>
          <div style={actionsGrid}>
            <button type="button" style={actionBtn} onClick={() => onNavigate('topics')}>
              <span style={actionIcon}>📚</span>
              <div>
                <p style={actionLabel}>Bộ từ</p>
                <p style={actionHint}>Tạo và gán từ cho chủ đề</p>
              </div>
            </button>
            <button type="button" style={actionBtn} onClick={() => onNavigate('vocabulary')}>
              <span style={actionIcon}>📝</span>
              <div>
                <p style={actionLabel}>Từ vựng</p>
                <p style={actionHint}>Kho từ, autofill, hình ảnh</p>
              </div>
            </button>
            <button type="button" style={actionBtn} onClick={() => onNavigate('videos')}>
              <span style={actionIcon}>🎬</span>
              <div>
                <p style={actionLabel}>Video</p>
                <p style={actionHint}>Upload, phụ đề, từ khoá</p>
              </div>
            </button>
            <button type="button" style={actionBtn} onClick={() => onNavigate('dialogues')}>
              <span style={actionIcon}>💬</span>
              <div>
                <p style={actionLabel}>Hội thoại</p>
                <p style={actionHint}>Kịch bản AI, độ khó</p>
              </div>
            </button>
            <button type="button" style={actionBtn} onClick={() => onNavigate('users')}>
              <span style={actionIcon}>👥</span>
              <div>
                <p style={actionLabel}>Người dùng</p>
                <p style={actionHint}>Tài khoản, khóa/mở</p>
              </div>
            </button>
            <button type="button" style={actionBtn} onClick={() => onNavigate('stats')}>
              <span style={actionIcon}>📊</span>
              <div>
                <p style={actionLabel}>Thống kê chi tiết</p>
                <p style={actionHint}>Biểu đồ, XP, hoạt động</p>
              </div>
            </button>
          </div>

          <h3 style={sectionTitle}>Top XP (5)</h3>
          <div style={panel}>
            {Array.isArray(s.topLearners) && s.topLearners.length > 0 ? (
              s.topLearners.map((u, i) => (
                <div
                  key={u.id || i}
                  style={{
                    ...learnerRow,
                    borderBottom: i === s.topLearners.length - 1 ? 'none' : learnerRow.borderBottom,
                  }}>
                  <span style={{fontWeight: 700, color: '#0f172a'}}>
                    {i + 1}. {u.name || u.email || u.id}
                  </span>
                  <span style={{fontWeight: 800, color: '#4f46e5', fontVariantNumeric: 'tabular-nums'}}>
                    {Math.max(0, Number(u.totalXP) || 0)} XP
                  </span>
                </div>
              ))
            ) : (
              <p style={{margin: 0, color: '#94a3b8', fontSize: 14}}>Chưa có dữ liệu xếp hạng.</p>
            )}
            <button type="button" style={linkBtn} onClick={() => onNavigate('stats')}>
              Xem đầy đủ thống kê →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
