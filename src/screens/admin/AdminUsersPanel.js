import React, {useMemo, useState, useCallback, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Pressable} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

function getFirebaseService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

function initialsOf(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) return words[0][0].toUpperCase();
  return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
}

function UserStatusBadge({active}) {
  return active ? (
    <View style={styles.onlineDotWrap}>
      <View style={styles.onlineDot} />
    </View>
  ) : (
    <View style={styles.statusInactive}>
      <Text style={styles.statusInactiveText}>Không hoạt động</Text>
    </View>
  );
}

function DetailRow({label, value}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function UserDetailModal({visible, item, onClose}) {
  if (!item) return null;
  const xp = Math.max(0, Number(item.totalXP) || 0);
  const statusText = item.active ? 'Hoạt động' : 'Không hoạt động';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Thông tin người dùng</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Feather name="x" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <DetailRow label="UID" value={String(item.id)} />
            <DetailRow label="Tên hiển thị" value={String(item.name || '—')} />
            <DetailRow label="Email" value={String(item.email || '—')} />
            <DetailRow label="Level (game)" value={String(item.level ?? '—')} />
            <DetailRow label="Tổng XP" value={xp.toLocaleString('vi-VN')} />
            <DetailRow label="Số từ đã học" value={String(item.words ?? 0)} />
            <DetailRow label="Ngày tham gia (ước lượng)" value={String(item.joined || '—')} />
            <DetailRow label="Đăng nhập gần nhất" value={String(item.lastLoginLabel || '—')} />
            <DetailRow label="Trạng thái" value={statusText} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function UserCard({item, onView}) {
  return (
    <View style={styles.card}>
      <View style={[styles.avatarWrap, {backgroundColor: item.avatarColor}]}>
        <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
        {item.active ? (
          <View style={styles.avatarOnlineBadge}>
            <View style={styles.avatarOnlineDot} />
          </View>
        ) : null}
      </View>

      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {!item.active ? <UserStatusBadge active={item.active} /> : null}
        </View>
        <Text style={styles.email} numberOfLines={1}>
          {item.email}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Level {item.level}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{item.words} từ</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{item.joined}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
          onPress={() => onView?.(item)}>
          <Feather name="eye" size={18} color="#111827" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminUsersPanel() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(() => AdminUsersPanel._cache || []);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [detailUser, setDetailUser] = useState(null);

  const loadUsers = useCallback(async () => {
    const fb = getFirebaseService();
    if (!fb?.listUsersForAdmin) {
      setError('Firebase chưa khả dụng.');
      setRows([]);
      setSyncing(false);
      return;
    }
    // Không chặn UI bằng spinner: luôn cố gắng đổ cache trước (source: cache),
    // rồi mới sync server ở nền.
    const hasRows = Array.isArray(AdminUsersPanel._cache) && AdminUsersPanel._cache.length > 0;
    setSyncing(true);
    setError('');
    try {
      // 1) đọc cache Firestore trước để hiện ngay (nếu đã từng tải).
      const cached = await fb.listUsersForAdmin({source: 'cache'});
      if (cached?.ok && Array.isArray(cached.users) && cached.users.length > 0) {
        AdminUsersPanel._cache = cached.users;
        setRows(cached.users);
      }

      // 2) đồng bộ server
      const result = await fb.listUsersForAdmin({source: 'server'});
      if (result.ok) {
        const next = Array.isArray(result.users) ? result.users : [];
        AdminUsersPanel._cache = next;
        setRows(next);
      } else {
        setError(result.error || 'Không tải được danh sách.');
        // Giữ cache nếu có, tránh “trống” khi mạng chậm.
        if (!hasRows) setRows([]);
      }
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách.');
      if (!hasRows) setRows([]);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Tab "Người dùng" mount sau khi màn Admin đã focus — chỉ dùng useEffect (useFocusEffect có thể không chạy lần đầu → xoay mãi).
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const q = query.trim().toLowerCase();

  const users = useMemo(() => {
    if (!q) return rows;
    return rows.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const id = String(u.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [q, rows]);

  const openDetail = useCallback((item) => {
    setDetailUser(item);
  }, []);
  const closeDetail = useCallback(() => setDetailUser(null), []);

  return (
    <View>
      <UserDetailModal visible={!!detailUser} item={detailUser} onClose={closeDetail} />
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm người dùng..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      {error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.hintText}>
            {syncing ? 'Đang đồng bộ…' : 'Chưa có người dùng hoặc không tìm thấy.'}
          </Text>
        </View>
      ) : (
        <View>
          {syncing ? <Text style={styles.syncText}>Đang đồng bộ…</Text> : null}
          {users.map((u) => <UserCard key={u.id} item={u} onView={openDetail} />)}
        </View>
      )}
    </View>
  );
}

// Cache trong phiên để vào tab thấy ngay.
AdminUsersPanel._cache = AdminUsersPanel._cache || [];

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  syncText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 10,
  },
  centerBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  avatarWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0ECFF',
    marginRight: 10,
  },
  avatarOnlineBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  avatarOnlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  onlineDotWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  statusInactive: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusInactiveText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
  },
  email: {
    marginTop: 2,
    fontSize: 14,
    color: '#4B5563',
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  metaDot: {
    fontSize: 12,
    color: '#D1D5DB',
    marginHorizontal: 2,
  },
  actions: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  iconBtn: {
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: '88%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalScroll: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 22,
  },
});
