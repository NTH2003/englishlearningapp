import React, {useCallback, useMemo, useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {getLearningProgress} from '../../services/storageService';

function withTimeout(promise, ms, fallbackValue = null) {
  const timeoutMs = Math.max(300, Number(ms) || 0);
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs)),
  ]);
}

const LearningPathScreen = () => {
  const isMountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const [boardRows, setBoardRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const beginLoadGuard = useCallback(() => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    return () => isMountedRef.current && loadSeqRef.current === seq;
  }, []);

  const buildFallbackBoard = useCallback(() => {
    if (!isMountedRef.current) return;
    setBoardRows(prev => (prev.length ? [] : prev));
    setMyRank(prev => (prev == null ? prev : null));
  }, []);

  const loadLeaderboard = useCallback(async () => {
      const canApply = beginLoadGuard();
      let usedRealBoard = false;
      try {
        if (canApply()) {
          setIsLoading(true);
        }
        let fb = null;
        try {
          fb = require('../../services/firebaseService');
        } catch (_) {
          fb = null;
        }
        if (fb?.listPublicLeaderboard) {
          const res = await withTimeout(
            fb.listPublicLeaderboard({limit: 100}),
            5500,
            {ok: false, error: 'leaderboard-timeout', users: []},
          );
          if (res?.ok && Array.isArray(res.users) && res.users.length > 0) {
            const myUid = fb?.getCurrentUser?.()?.uid || '';
            const rows = res.users
              .map((u) => ({
                id: String(u?.id || ''),
                name: String(u?.name || 'Người học').trim() || 'Người học',
                totalXP: Math.max(0, Number(u?.totalXP) || Number(u?.xp) || 0),
                xp: (() => {
                  const total = Math.max(0, Number(u?.totalXP) || Number(u?.xp) || 0);
                  const weeklyRaw = u?.weeklyXP;
                  if (weeklyRaw !== undefined && weeklyRaw !== null) {
                    const w = Number(weeklyRaw);
                    return Number.isFinite(w) ? Math.max(0, w) : total;
                  }
                  return total;
                })(),
                level: Math.max(1, Number(u?.level) || 1),
              }))
              .sort(
                (a, b) =>
                  b.xp - a.xp ||
                  b.totalXP - a.totalXP ||
                  b.level - a.level ||
                  String(a.name).localeCompare(String(b.name), 'vi'),
              );
            const ranked = rows.map((r, i) => ({...r, rank: i + 1}));
            if (!canApply()) return;
            setBoardRows(ranked);
            const indexInAll = rows.findIndex((r) => r.id && r.id === myUid);
            setMyRank(indexInAll >= 0 ? indexInAll + 1 : null);
            usedRealBoard = true;
            return;
          }
        }
      } catch (_) {
        // giữ bảng trống / fallback
      } finally {
        if (canApply()) {
          setIsLoading(false);
          if (!usedRealBoard) {
            buildFallbackBoard();
          }
        }
      }
    }, [beginLoadGuard, buildFallbackBoard]);

  const displayedRows = useMemo(() => {
    if (!boardRows.length) return [];
    return boardRows.slice(0, 30);
  }, [boardRows]);

  const load = useCallback(async () => {
    // Bật loading ngay khi bắt đầu để không hiển thị empty state tạm thời.
    if (isMountedRef.current) setIsLoading(true);
    try {
      await withTimeout(getLearningProgress({source: 'cache'}), 2500, null);
      await withTimeout(getLearningProgress(), 4500, null);
      await withTimeout(loadLeaderboard(), 6500, null);
    } catch (_) {
      buildFallbackBoard();
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [buildFallbackBoard, loadLeaderboard]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, THEME.shadow.soft]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconWrap}>
              <Feather name="award" size={28} color="#FFFFFF" />
            </View>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroKicker}>LEADERBOARD</Text>
              <Text style={styles.heroTitle}>Top XP tuần</Text>
            </View>
          </View>
          <Text style={styles.heroSubTitle}>
            Xếp hạng theo XP kiếm được trong tuần này.
          </Text>
        </View>

        <View style={[styles.boardCard, THEME.shadow.soft]}>
          {isLoading ? (
            <View style={styles.loadingBoard}>
              <Feather name="loader" size={20} color={COLORS.PRIMARY_DARK} />
              <Text style={styles.loadingBoardText}>Đang tải bảng xếp hạng...</Text>
            </View>
          ) : displayedRows.length > 0 ? (
            displayedRows.map((row) => (
              <View
                key={row.rank}
                style={[
                  styles.boardRow,
                  row.rank < displayedRows[displayedRows.length - 1]?.rank &&
                    styles.boardRowBorder,
                  row.rank === myRank && styles.boardRowMe,
                  row.rank <= 3 && styles.boardRowTop3,
                ]}>
                <View
                  style={[
                    styles.boardRankBubble,
                    row.rank === 1 && styles.boardRankBubbleGold,
                    row.rank === 2 && styles.boardRankBubbleSilver,
                    row.rank === 3 && styles.boardRankBubbleBronze,
                  ]}>
                  <Text style={styles.boardRank}>
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `${row.rank}`}
                  </Text>
                </View>
                <Text style={styles.boardName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.boardXp}>
                  {row.xp.toLocaleString('vi-VN')} XP
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyBoard}>
              <Feather name="award" size={20} color={COLORS.TEXT_SECONDARY} />
              <Text style={styles.emptyBoardTitle}>Chưa có người trên bảng xếp hạng</Text>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 0,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.8)',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 3,
    letterSpacing: -0.2,
  },
  heroSubTitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  boardCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8ECF2',
    marginBottom: 22,
    overflow: 'hidden',
  },
  emptyBoard: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyBoardTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 11,
  },
  boardRowMe: {
    backgroundColor: '#FFF7ED',
  },
  boardRowTop3: {
    backgroundColor: '#FFFBF5',
  },
  boardRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.BORDER,
  },
  boardRankBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  boardRankBubbleGold: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  boardRankBubbleSilver: {
    backgroundColor: '#E5E7EB',
    borderColor: '#CBD5E1',
  },
  boardRankBubbleBronze: {
    backgroundColor: '#FED7AA',
    borderColor: '#FDBA74',
  },
  boardRank: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  boardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  boardXp: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
    backgroundColor: COLORS.PRIMARY_SOFT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  loadingBoard: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  loadingBoardText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
});

export default LearningPathScreen;
