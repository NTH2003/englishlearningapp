import {useEffect, useMemo, useState} from 'react';
import {adminSplitChrome as cx} from '../adminSplitChrome';
import {listUsersForAdmin, setUserSuspendedForAdmin} from '../firestoreAdmin';

function hueFromString(str) {
  let h = 0;
  const s = String(str || 'x');
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % 360;
  return h;
}

function initials(name, email) {
  const n = String(name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = String(email || '').trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return '?';
}

export default function UsersPage({styles}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listUsersForAdmin();
      if (!result?.ok) {
        setError(result?.error || 'Không tải được danh sách người dùng');
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(result.users) ? result.users : []);
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, query]);

  const summary = useMemo(() => {
    const total = users.length;
    const suspended = users.filter((u) => u.isSuspended).length;
    return {total, suspended};
  }, [users]);

  return (
    <div className="users-manager-layout">
      <section style={cx.leftPanel}>
        <div style={cx.heroStrip}>
          <h2 style={cx.heroTitle}>Quản lý người dùng</h2>
          <div style={cx.heroStats}>
            <span style={cx.heroChip}>{summary.total} tài khoản</span>
            {summary.suspended > 0 ? (
              <span style={{...cx.heroChip, background: 'rgba(254,202,202,0.25)', borderColor: 'rgba(252,165,165,0.5)'}}>
                {summary.suspended} đang khóa
              </span>
            ) : null}
          </div>
        </div>
        <div style={cx.searchBlock}>
          <div style={cx.searchWrap}>
            <span style={cx.searchIcon} aria-hidden>⌕</span>
            <input
              style={cx.searchInput}
              placeholder="Tìm theo tên hoặc email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        {error ? <p style={{...styles.error, margin: '0 14px 12px'}}>{error}</p> : null}
        <div style={cx.listWrap}>
          {loading && users.length === 0 ? (
            <p style={{padding: 16, color: '#64748B', fontSize: 14}}>Đang tải danh sách…</p>
          ) : null}
          {filtered.map((u) => {
            const id = String(u.id);
            const sel = selected && String(selected.id) === id;
            const h = hueFromString(id + (u.email || ''));
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(u)}
                style={{
                  ...cx.userRow(sel),
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                }}>
                <div style={cx.avatar(h)}>{initials(u.name, u.email)}</div>
                <div style={cx.rowMain}>
                  <div style={cx.rowName}>{u.name || '—'}</div>
                  <div style={cx.rowEmail}>{u.email || '—'}</div>
                  <div style={cx.rowMeta}>
                    <span style={cx.tinyBadge}>
                      {u.levelNameVi && u.levelNameVi !== '—' ? u.levelNameVi : `Lv ${u.level ?? '—'}`}
                    </span>
                    <span style={cx.tinyBadge}>{u.totalXP ?? 0} XP</span>
                    {u.isSuspended ? <span style={cx.suspendedBadge}>Khóa</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
          {!loading && filtered.length === 0 ? (
            <p style={{padding: 12, color: '#64748B', fontSize: 14, textAlign: 'center'}}>
              Chưa có người dùng hoặc không khớp tìm kiếm.
            </p>
          ) : null}
        </div>
      </section>

      <section style={cx.rightPanel}>
        {!selected ? (
          <div style={cx.emptyDetail}>
            <div style={cx.emptyDetailInner}>
              <div style={cx.emptyIcon} aria-hidden>
                <div style={cx.emptyIconHead} />
                <div style={cx.emptyIconBody} />
              </div>
              <p style={{margin: 0, fontSize: 16, fontWeight: 700, color: '#334155'}}>Chọn một học viên</p>
              <p style={{margin: '10px 0 0', fontSize: 14, maxWidth: 280, lineHeight: 1.55}}>
                Nhấn vào dòng trong danh sách bên trái để xem chi tiết tiến độ và quản lý tài khoản.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={cx.detailScroll}>
              <div style={cx.profileHero}>
                <div style={cx.profileTop}>
                  {selected.photoURL ? (
                    <img
                      src={selected.photoURL}
                      alt=""
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 20,
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '2px solid rgba(255,255,255,0.35)',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
                      }}
                    />
                  ) : (
                    <div style={cx.avatarLg(hueFromString(String(selected.id) + (selected.email || '')))}>
                      {initials(selected.name, selected.email)}
                    </div>
                  )}
                  <div style={{minWidth: 0}}>
                    <h2 style={cx.profileName}>{selected.name || '—'}</h2>
                    <p style={cx.profileEmail}>{selected.email || '—'}</p>
                    <div style={cx.badgeRow}>
                      <span style={cx.badge(selected.isSuspended ? 'danger' : 'ok')}>
                        {selected.isSuspended ? 'Đang ngừng hoạt động' : 'Tài khoản bình thường'}
                      </span>
                      <span style={cx.badge(selected.active ? 'ok' : 'muted')}>
                        {selected.active ? 'Hoạt động gần đây' : 'Ít hoạt động'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={cx.statGrid}>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Tổng XP</div>
                  <div style={cx.statValue}>{Number(selected.totalXP) || 0}</div>
                  <div style={cx.statHint}>Điểm tích lũy</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Từ đã học</div>
                  <div style={cx.statValue}>{Number(selected.words) || 0}</div>
                  <div style={cx.statHint}>Sau gộp từ vựng</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Cấp (ứng dụng)</div>
                  <div style={{...cx.statValue, fontSize: 18}}>
                    {selected.levelNameVi && selected.levelNameVi !== '—' ? selected.levelNameVi : '—'}
                  </div>
                  <div style={cx.statHint}>Nhãn trong app</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Video đã xem</div>
                  <div style={cx.statValue}>{Number(selected.videosWatched) || 0}</div>
                  <div style={cx.statHint}>Số video trong danh sách</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Hội thoại</div>
                  <div style={cx.statValue}>{Number(selected.dialoguesCompleted) || 0}</div>
                  <div style={cx.statHint}>Đã hoàn thành</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Từ yếu</div>
                  <div style={cx.statValue}>{Number(selected.weakWordIds) || 0}</div>
                  <div style={cx.statHint}>Từ cần củng cố</div>
                </div>
                <div style={cx.statCard}>
                  <div style={cx.statLabel}>Ôn sai</div>
                  <div style={cx.statValue}>{Number(selected.reviewWrongWordIds) || 0}</div>
                  <div style={cx.statHint}>Hàng đợi ôn lại</div>
                </div>
              </div>
              <div style={cx.section}>
                <h3 style={cx.sectionTitle}>Hoạt động &amp; hệ thống</h3>
                <div style={cx.infoGrid}>
                  {[
                    ['Tham gia', selected.joined],
                    ['Đăng nhập gần nhất', selected.lastLoginLabel],
                  ].map(([label, val], i) => (
                    <div key={label} style={cx.infoRow(i)}>
                      <div style={cx.infoLabel}>{label}</div>
                      <div style={cx.infoValue}>{val != null && val !== '' ? String(val) : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={cx.section}>
                <h3 style={cx.sectionTitle}>Tài khoản</h3>
                <div style={cx.infoGrid}>
                  {[
                    ['Trạng thái khóa', selected.isSuspended ? 'Đang khóa' : 'Không'],
                    ['Thời điểm khóa', selected.suspendedAtLabel || '—'],
                  ].map(([label, val], i) => (
                    <div key={label} style={cx.infoRow(i)}>
                      <div style={cx.infoLabel}>{label}</div>
                      <div style={cx.infoValue}>{val != null && val !== '' ? String(val) : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={cx.dangerZone}>
              <p style={cx.dangerTitle}>Kiểm soát truy cập</p>
              <p style={cx.dangerText}>
                {selected.isSuspended
                  ? 'Mở lại để người dùng đăng nhập và học bình thường trên ứng dụng.'
                  : 'Ngừng hoạt động sẽ chặn tài khoản đăng nhập cho đến khi bạn mở lại.'}
              </p>
              <button
                type="button"
                style={
                  selected.isSuspended
                    ? {...styles.buttonSecondary, padding: '12px 18px', fontWeight: 700, width: '100%' }
                    : {...styles.buttonDanger, padding: '12px 18px', fontWeight: 700, width: '100%', background: 'linear-gradient(135deg, #EF4444, #DC2626)', color: '#fff', border: 'none' }
                }
                disabled={updatingStatus}
                onClick={async () => {
                  const nextSuspended = !Boolean(selected.isSuspended);
                  const confirmText = nextSuspended
                    ? `Ngừng hoạt động tài khoản ${selected.email || selected.name}?`
                    : `Mở lại hoạt động tài khoản ${selected.email || selected.name}?`;
                  if (!confirm(confirmText)) return;
                  setUpdatingStatus(true);
                  try {
                    const res = await setUserSuspendedForAdmin(selected.id, nextSuspended);
                    if (!res?.ok) {
                      alert(res?.error || 'Không cập nhật được trạng thái người dùng');
                      return;
                    }
                    await load();
                    setSelected((prev) => (prev ? {...prev, isSuspended: nextSuspended} : prev));
                  } finally {
                    setUpdatingStatus(false);
                  }
                }}>
                {updatingStatus
                  ? 'Đang cập nhật…'
                  : selected.isSuspended
                    ? 'Mở lại hoạt động'
                    : 'Ngừng hoạt động tài khoản'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
