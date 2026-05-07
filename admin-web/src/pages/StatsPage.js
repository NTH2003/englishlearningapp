import {useEffect, useState} from 'react';
import {getAdminDashboardStats} from '../firestoreAdmin';

const sx = {
  wrap: {padding: '0 24px 32px', maxWidth: 1400, margin: '0 auto'},
  hero: {
    borderRadius: 20,
    padding: '22px 22px 20px',
    marginBottom: 20,
    background: 'linear-gradient(135deg, #0f172a 0%, #312e81 42%, #5b21b6 100%)',
    color: '#fff',
    boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
  },
  heroTop: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroKicker: {
    margin: 0,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  heroTitle: {margin: '6px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em'},
  heroDesc: {margin: '8px 0 0', fontSize: 13, opacity: 0.88, maxWidth: 520, lineHeight: 1.5},
  refreshBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    cursor: 'pointer',
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 14,
    marginBottom: 14,
  },
  kpiCard: (accent) => ({
    borderRadius: 16,
    padding: '18px 18px 16px',
    background: '#fff',
    border: '1px solid #EEF2F7',
    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
    position: 'relative',
    overflow: 'hidden',
    ...(accent
      ? {
          background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
          color: '#fff',
          border: '1px solid transparent',
          boxShadow: `0 12px 28px ${accent.shadow}`,
        }
      : {}),
  }),
  kpiLabel: (onDark) => ({
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: onDark ? 'rgba(255,255,255,0.82)' : '#64748B',
    marginBottom: 8,
  }),
  kpiValue: (onDark) => ({
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: onDark ? '#fff' : '#0F172A',
    lineHeight: 1.1,
  }),
  kpiHint: (onDark) => ({
    marginTop: 6,
    fontSize: 12,
    color: onDark ? 'rgba(255,255,255,0.75)' : '#94A3B8',
  }),
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  miniCard: {
    borderRadius: 14,
    padding: '14px 14px 12px',
    background: '#FAFBFC',
    border: '1px solid #EEF2F7',
    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: '0.04em',
  },
  miniValue: {fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em'},
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 16,
    marginBottom: 20,
  },
  chartShell: {
    borderRadius: 18,
    padding: '20px 18px 18px',
    background: '#fff',
    border: '1px solid #E8ECF3',
    boxShadow: '0 8px 28px rgba(15, 23, 42, 0.07)',
  },
  chartHead: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #F1F5F9',
  },
  chartTitle: {margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em'},
  chartSubtitle: {margin: '4px 0 0', fontSize: 12, color: '#64748B'},
  barRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#475569',
    marginBottom: 8,
    gap: 10,
  },
  barTrack: {
    height: 11,
    borderRadius: 999,
    background: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 14,
    boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
  },
  barFill: (gradient) => ({
    height: '100%',
    borderRadius: 999,
    background: gradient,
    transition: 'width 0.35s ease',
  }),
  leaderboard: {
    borderRadius: 18,
    padding: '20px 18px 16px',
    background: '#fff',
    border: '1px solid #E8ECF3',
    boxShadow: '0 8px 28px rgba(15, 23, 42, 0.07)',
  },
  lbHead: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: '1px solid #F1F5F9',
  },
  lbTitle: {margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A'},
  lbSub: {margin: '4px 0 0', fontSize: 12, color: '#64748B'},
  lbRow: (rank) => ({
    display: 'grid',
    gridTemplateColumns: '44px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '12px 12px',
    marginBottom: 10,
    borderRadius: 14,
    background:
      rank === 1
        ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
        : rank === 2
          ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          : rank === 3
            ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)'
            : '#FAFBFC',
    border:
      rank === 1
        ? '1px solid #fde68a'
        : rank === 2
          ? '1px solid #e2e8f0'
          : rank === 3
            ? '1px solid #fed7aa'
            : '1px solid #EEF2F7',
  }),
  rankBadge: (rank) => ({
    width: 36,
    height: 36,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    fontSize: 14,
    color: '#fff',
    background:
      rank === 1
        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
        : rank === 2
          ? 'linear-gradient(135deg, #94a3b8, #64748b)'
          : rank === 3
            ? 'linear-gradient(135deg, #fb923c, #c2410c)'
            : 'linear-gradient(135deg, #6366f1, #4f46e5)',
  }),
  lbName: {fontWeight: 700, fontSize: 14, color: '#0F172A'},
  lbEmail: {fontSize: 12, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
  lbMeta: {fontSize: 11, color: '#94A3B8', marginTop: 4},
  lbXp: {fontWeight: 800, fontSize: 15, color: '#4F46E5', textAlign: 'right'},
  lbBarWrap: {gridColumn: '1 / -1', marginTop: 2},
  empty: {textAlign: 'center', color: '#64748B', padding: '24px 12px', fontSize: 14},
};

const grad = {
  blue: 'linear-gradient(90deg, #3B82F6, #6366F1)',
  green: 'linear-gradient(90deg, #10B981, #22C55E)',
  amber: 'linear-gradient(90deg, #F59E0B, #EA580C)',
  violet: 'linear-gradient(90deg, #8B5CF6, #6366F1)',
  rose: 'linear-gradient(90deg, #EC4899, #D946EF)',
};

const percent = (value, total) => {
  const t = Math.max(0, Number(total) || 0);
  if (!t) return 0;
  const raw = (Math.max(0, Number(value) || 0) / t) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
};

export default function StatsPage({styles}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    active30d: 0,
    suspendedUsers: 0,
    topicCount: 0,
    vocabularyCount: 0,
    videoCount: 0,
    dialogueCount: 0,
    totalXP: 0,
    topLearners: [],
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminDashboardStats();
      if (!result?.ok) {
        setError(result?.error || 'Không tải được thống kê');
        return;
      }
      setStats(result.stats || stats);
    } catch (e) {
      setError(e?.message || 'Không tải được thống kê');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activeTodayPercent = percent(stats.activeToday, stats.totalUsers);
  const active30dPercent = percent(stats.active30d, stats.totalUsers);
  const suspendedPercent = percent(stats.suspendedUsers, stats.totalUsers);
  const contentTotal = Math.max(
    1,
    stats.topicCount + stats.vocabularyCount + stats.videoCount + (stats.dialogueCount || 0),
  );
  const topicsPercent = percent(stats.topicCount, contentTotal);
  const vocabPercent = percent(stats.vocabularyCount, contentTotal);
  const videosPercent = percent(stats.videoCount, contentTotal);
  const dialoguesPercent = percent(stats.dialogueCount || 0, contentTotal);
  const topLearners = Array.isArray(stats.topLearners) ? stats.topLearners : [];
  const maxTopXP = Math.max(1, ...topLearners.map((u) => Number(u.totalXP) || 0));

  const contentPieces =
    stats.topicCount + stats.vocabularyCount + stats.videoCount + (stats.dialogueCount || 0);

  return (
    <div style={sx.wrap}>
      <div style={sx.hero}>
        <div style={sx.heroTop}>
          <div>
            <p style={sx.heroKicker}>EnglishApp Admin</p>
            <h2 style={sx.heroTitle}>Thống kê tổng quan</h2>
            <p style={sx.heroDesc}>
              Theo dõi người học, nội dung và mức độ tương tác trên hệ thống — cập nhật khi tải trang hoặc nhấn làm mới.
            </p>
          </div>
          <button type="button" style={sx.refreshBtn} onClick={load} disabled={loading}>
            {loading ? 'Đang tải…' : '⟳  Làm mới'}
          </button>
        </div>
      </div>

      {error ? <p style={{...styles.error, marginBottom: 16}}>{error}</p> : null}

      {loading && !error ? (
        <p style={{color: '#64748B', marginBottom: 16}}>Đang tải số liệu…</p>
      ) : null}

      <div style={sx.kpiRow}>
        <div style={sx.kpiCard({from: '#4f46e5', to: '#7c3aed', shadow: 'rgba(79, 70, 229, 0.35)'})}>
          <div style={sx.kpiLabel(true)}>Người dùng</div>
          <div style={sx.kpiValue(true)}>{stats.totalUsers}</div>
          <div style={sx.kpiHint(true)}>Tài khoản trong hệ thống</div>
        </div>
        <div style={sx.kpiCard({from: '#059669', to: '#10b981', shadow: 'rgba(16, 185, 129, 0.28)'})}>
          <div style={sx.kpiLabel(true)}>Hoạt động 24 giờ</div>
          <div style={sx.kpiValue(true)}>{stats.activeToday}</div>
          <div style={sx.kpiHint(true)}>Đăng nhập trong ngày</div>
        </div>
        <div style={sx.kpiCard({from: '#d97706', to: '#ea580c', shadow: 'rgba(234, 88, 12, 0.28)'})}>
          <div style={sx.kpiLabel(true)}>Tổng XP</div>
          <div style={sx.kpiValue(true)}>{stats.totalXP.toLocaleString('vi-VN')}</div>
          <div style={sx.kpiHint(true)}>Điểm tích lũy toàn cụm</div>
        </div>
        <div style={sx.kpiCard(null)}>
          <div style={sx.kpiLabel(false)}>Nội dung (mục)</div>
          <div style={sx.kpiValue(false)}>{contentPieces}</div>
          <div style={sx.kpiHint(false)}>Bộ từ + từ vựng + video + hội thoại</div>
        </div>
      </div>

      <div style={sx.grid}>
        {[
          ['Hoạt động 30 ngày', stats.active30d],
          ['Tài khoản tạm khóa', stats.suspendedUsers],
          ['Bộ từ', stats.topicCount],
          ['Mục từ vựng', stats.vocabularyCount],
          ['Video', stats.videoCount],
          ['Hội thoại', stats.dialogueCount ?? 0],
        ].map(([label, val]) => (
          <div key={label} style={sx.miniCard}>
            <div style={sx.miniLabel}>{label}</div>
            <div style={sx.miniValue}>{val}</div>
          </div>
        ))}
      </div>

      <div style={sx.chartsGrid}>
        <div style={sx.chartShell}>
          <div style={sx.chartHead}>
            <h3 style={sx.chartTitle}>Hoạt động người dùng</h3>
            <p style={sx.chartSubtitle}>So với tổng số tài khoản</p>
          </div>
          <div style={sx.barRow}>
            <span>Hoạt động 24h</span>
            <strong style={{color: '#1e293b'}}>
              {activeTodayPercent}% · {stats.activeToday}/{stats.totalUsers}
            </strong>
          </div>
          <div style={sx.barTrack}>
            <div style={{...sx.barFill(grad.blue), width: `${activeTodayPercent}%`}} />
          </div>
          <div style={sx.barRow}>
            <span>Hoạt động 30 ngày</span>
            <strong style={{color: '#1e293b'}}>
              {active30dPercent}% · {stats.active30d}/{stats.totalUsers}
            </strong>
          </div>
          <div style={sx.barTrack}>
            <div style={{...sx.barFill(grad.green), width: `${active30dPercent}%`}} />
          </div>
          <div style={sx.barRow}>
            <span>Tài khoản tạm khóa</span>
            <strong style={{color: '#1e293b'}}>
              {suspendedPercent}% · {stats.suspendedUsers}/{stats.totalUsers}
            </strong>
          </div>
          <div style={{...sx.barTrack, marginBottom: 0}}>
            <div style={{...sx.barFill(grad.amber), width: `${suspendedPercent}%`}} />
          </div>
        </div>

        <div style={sx.chartShell}>
          <div style={sx.chartHead}>
            <h3 style={sx.chartTitle}>Phân bổ nội dung</h3>
            <p style={sx.chartSubtitle}>Tỷ lệ giữa bộ từ, từ vựng, video và hội thoại</p>
          </div>
          <div style={sx.barRow}>
            <span>Bộ từ</span>
            <strong style={{color: '#1e293b'}}>
              {topicsPercent}% · {stats.topicCount}
            </strong>
          </div>
          <div style={sx.barTrack}>
            <div style={{...sx.barFill(grad.blue), width: `${topicsPercent}%`}} />
          </div>
          <div style={sx.barRow}>
            <span>Từ vựng</span>
            <strong style={{color: '#1e293b'}}>
              {vocabPercent}% · {stats.vocabularyCount}
            </strong>
          </div>
          <div style={sx.barTrack}>
            <div style={{...sx.barFill(grad.green), width: `${vocabPercent}%`}} />
          </div>
          <div style={sx.barRow}>
            <span>Video</span>
            <strong style={{color: '#1e293b'}}>
              {videosPercent}% · {stats.videoCount}
            </strong>
          </div>
          <div style={sx.barTrack}>
            <div style={{...sx.barFill(grad.amber), width: `${videosPercent}%`}} />
          </div>
          <div style={sx.barRow}>
            <span>Hội thoại</span>
            <strong style={{color: '#1e293b'}}>
              {dialoguesPercent}% · {stats.dialogueCount ?? 0}
            </strong>
          </div>
          <div style={{...sx.barTrack, marginBottom: 0}}>
            <div style={{...sx.barFill(grad.rose), width: `${dialoguesPercent}%`}} />
          </div>
        </div>
      </div>

      <div style={sx.leaderboard}>
        <div style={sx.lbHead}>
          <h3 style={sx.lbTitle}>Top 5 người học theo XP</h3>
          <p style={sx.lbSub}>Xếp hạng nội bộ — thanh tiến độ tương đối với người dẫn đầu</p>
        </div>
        {topLearners.map((u, idx) => {
          const rank = idx + 1;
          const w = percent(u.totalXP, maxTopXP);
          return (
            <div key={String(u.id || idx)} style={sx.lbRow(rank)}>
              <div style={sx.rankBadge(rank)}>{rank}</div>
              <div style={{minWidth: 0}}>
                <div style={sx.lbName}>{u.name}</div>
                <div style={sx.lbEmail}>{u.email}</div>
                <div style={sx.lbMeta}>Cấp {u.level}</div>
              </div>
              <div style={sx.lbXp}>{Number(u.totalXP) || 0} XP</div>
              <div style={sx.lbBarWrap}>
                <div style={sx.barTrack}>
                  <div style={{...sx.barFill(grad.violet), width: `${w}%`}} />
                </div>
              </div>
            </div>
          );
        })}
        {!loading && topLearners.length === 0 ? <div style={sx.empty}>Chưa có dữ liệu xếp hạng.</div> : null}
      </div>
    </div>
  );
}
