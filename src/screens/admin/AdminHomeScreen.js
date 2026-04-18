import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {getAllVocabulary} from '../../services/vocabularyService';
import {getAllVideos} from '../../services/videoService';
import {canManageUsers} from '../../services/firebaseService';
import {adminStyles, ADMIN_DASHBOARD} from './adminStyles';
import AdminContentPanel from './AdminContentPanel';
import AdminUsersPanel from './AdminUsersPanel';

const ALL_TABS = [
  {id: 'overview', label: 'Thống kê', icon: 'bar-chart-2'},
  {id: 'users', label: 'Người dùng', icon: 'users'},
  {id: 'content', label: 'Nội dung', icon: 'book'},
];

/** Thao tác nhanh — Firestore: chủ đề, từ vựng, video, tài khoản. */
const ALL_QUICK_ACTIONS = [
  {
    route: 'AdminTopics',
    title: 'Bộ từ vựng',
    hint: '',
    icon: 'grid',
    color: ADMIN_DASHBOARD.BLUE,
  },
  {
    route: 'AdminVocabulary',
    title: 'Từ vựng',
    hint: '',
    icon: 'book-open',
    color: ADMIN_DASHBOARD.GREEN,
  },
  {
    route: 'AdminVideos',
    title: 'Video',
    hint: '',
    icon: 'video',
    color: ADMIN_DASHBOARD.PURPLE,
  },
  {
    route: 'AdminDialogues',
    title: 'Hội thoại',
    hint: '',
    icon: 'message-circle',
    color: '#0EA5A4',
  },
];

function StatBadge({text, positive}) {
  return (
    <View
      style={[
        adminStyles.dashStatBadge,
        {backgroundColor: positive ? 'rgba(0,183,74,0.12)' : 'rgba(239,68,68,0.12)'},
      ]}>
      <Text
        style={[
          adminStyles.dashStatBadgeText,
          {color: positive ? ADMIN_DASHBOARD.GREEN : COLORS.ERROR},
        ]}>
        {text}
      </Text>
    </View>
  );
}

function QuickActionTile({color, icon, title, hint, onPress}) {
  return (
    <TouchableOpacity
      style={[adminStyles.dashQuickBtn, {backgroundColor: color}]}
      onPress={onPress}
      activeOpacity={0.88}>
      <Feather name={icon} size={26} color="#FFFFFF" style={adminStyles.dashQuickIcon} />
      <Text style={adminStyles.dashQuickLabel} numberOfLines={2}>
        {title}
      </Text>
      {hint ? <Text style={adminStyles.dashQuickHint}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

function StatCard({iconName, iconColor, iconBg, badge, badgePositive, value, label}) {
  return (
    <View style={adminStyles.dashStatCard}>
      <View style={adminStyles.dashStatTop}>
        <View style={[adminStyles.dashStatIconBox, {backgroundColor: iconBg}]}>
          <Feather name={iconName} size={22} color={iconColor} />
        </View>
        {badge ? <StatBadge text={badge} positive={badgePositive} /> : null}
      </View>
      <Text style={adminStyles.dashStatValue}>{value}</Text>
      <Text style={adminStyles.dashStatLabel}>{label}</Text>
    </View>
  );
}

export default function AdminHomeScreen() {
  const navigation = useNavigation();
  const [tab, setTab] = useState(() => (canManageUsers() ? 'overview' : 'content'));
  const isAdmin = canManageUsers();
  const tabs = isAdmin
    ? ALL_TABS
    : ALL_TABS.filter(item => item.id === 'content');
  const quickActions = ALL_QUICK_ACTIONS;
  const quickActionRows = [];
  for (let i = 0; i < quickActions.length; i += 2) {
    quickActionRows.push(quickActions.slice(i, i + 2));
  }

  const [totalUsers, setTotalUsers] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  const [bundleCount, setBundleCount] = useState(0);
  const [vocabCount, setVocabCount] = useState(() => getAllVocabulary().length);
  const [videoCount, setVideoCount] = useState(() => getAllVideos().length);

  const loadDashboardStats = useCallback(async () => {
    const fb = (() => {
      try {
        return require('../../services/firebaseService');
      } catch (_) {
        return null;
      }
    })();

    if (fb?.getAdminDashboardStats) {
      try {
        const cached = await fb.getAdminDashboardStats({source: 'cache'});
        if (cached?.ok && cached.stats) {
          setTotalUsers(Number(cached.stats.totalUsers) || 0);
          setActiveToday(Number(cached.stats.activeToday) || 0);
          setBundleCount(Number(cached.stats.topicCount) || 0);
          setVocabCount(Number(cached.stats.vocabularyCount) || 0);
          setVideoCount(Number(cached.stats.videoCount) || 0);
        }
      } catch (_) {}

      try {
        const fresh = await fb.getAdminDashboardStats({source: 'server'});
        if (fresh?.ok && fresh.stats) {
          setTotalUsers(Number(fresh.stats.totalUsers) || 0);
          setActiveToday(Number(fresh.stats.activeToday) || 0);
          setBundleCount(Number(fresh.stats.topicCount) || 0);
          setVocabCount(Number(fresh.stats.vocabularyCount) || 0);
          setVideoCount(Number(fresh.stats.videoCount) || 0);
        }
      } catch (_) {}
    } else {
      setVocabCount(getAllVocabulary().length);
      setVideoCount(getAllVideos().length);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!canManageUsers()) {
          setTab('content');
        }
        await loadDashboardStats();
        if (cancelled) {
          return;
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadDashboardStats]),
  );

  useEffect(() => {
    // Trong cùng màn Admin, đổi sub-tab không trigger focus.
    // Khi quay lại tab "Thống kê", nạp lại để số liệu phản ánh thao tác xóa/thêm vừa làm.
    if (tab === 'overview' && canManageUsers()) {
      void loadDashboardStats();
    }
  }, [tab, loadDashboardStats]);

  return (
    <SafeAreaView style={adminStyles.dashRoot} edges={['left', 'right']}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <ScrollView
        style={adminStyles.scroll}
        contentContainerStyle={[adminStyles.scrollContent, {paddingBottom: 40}]}
        showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[
            ADMIN_DASHBOARD.GRADIENT_START,
            ADMIN_DASHBOARD.GRADIENT_MID,
            ADMIN_DASHBOARD.GRADIENT_END,
          ]}
          start={{x: 0, y: 0}}
          end={{x: 0, y: 1}}
          style={adminStyles.dashGradient}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Admin Dashboard
            </Text>
          </View>
          <Text style={adminStyles.dashSubtitle}>Quản lý hệ thống học tiếng Anh</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={adminStyles.dashTabScroll}
            contentContainerStyle={adminStyles.dashTabRow}>
            {tabs.map(t => {
              const active = tab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    adminStyles.dashTab,
                    active ? adminStyles.dashTabActive : adminStyles.dashTabInactive,
                  ]}
                  onPress={() => setTab(t.id)}
                  activeOpacity={0.85}>
                  <Feather
                    name={t.icon}
                    size={18}
                    color={active ? ADMIN_DASHBOARD.BLUE : '#FFFFFF'}
                  />
                  <Text style={active ? adminStyles.dashTabLabelActive : adminStyles.dashTabLabelInactive}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={adminStyles.dashScrollHint}>
            <Feather name="chevron-left" size={14} color="rgba(255,255,255,0.7)" />
            <View style={adminStyles.dashScrollTrack} />
            <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        </LinearGradient>

        {tab === 'overview' && isAdmin ? (
          <View style={adminStyles.dashBody}>
            <View style={adminStyles.dashStatsRow}>
              <StatCard
                iconName="users"
                iconColor={ADMIN_DASHBOARD.BLUE}
                iconBg={ADMIN_DASHBOARD.BLUE_SOFT}
                value={String(totalUsers)}
                label="Tổng người dùng"
              />
              <StatCard
                iconName="book"
                iconColor={ADMIN_DASHBOARD.GREEN}
                iconBg={ADMIN_DASHBOARD.GREEN_SOFT}
                value={String(bundleCount)}
                label="Bộ từ vựng"
              />
            </View>
            <View style={[adminStyles.dashStatsRow, {marginBottom: 0}]}>
              <StatCard
                iconName="video"
                iconColor={ADMIN_DASHBOARD.PURPLE}
                iconBg={ADMIN_DASHBOARD.PURPLE_SOFT}
                value={String(videoCount)}
                label="Video học tập"
              />
              <StatCard
                iconName="activity"
                iconColor={ADMIN_DASHBOARD.ORANGE}
                iconBg={ADMIN_DASHBOARD.ORANGE_SOFT}
                value={String(activeToday)}
                label="Hoạt động hôm nay"
              />
            </View>

            <View style={adminStyles.dashSectionCard}>
              <Text style={adminStyles.dashSectionTitle}>Thao tác nhanh</Text>
              {quickActionRows.map((row, idx) => (
                <View
                  key={`row-${idx}`}
                  style={[adminStyles.dashQuickRow, idx === quickActionRows.length - 1 ? {marginBottom: 0} : null]}>
                  {row.map(item => (
                    <QuickActionTile
                      key={item.route}
                      color={item.color}
                      icon={item.icon}
                      title={item.title}
                      hint={item.hint}
                      onPress={() => navigation.navigate(item.route)}
                    />
                  ))}
                  {row.length === 1 ? <View style={adminStyles.dashQuickBtn} /> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {tab === 'users' && isAdmin ? (
          <View style={[adminStyles.dashBody, styles.usersBody]}>
            <AdminUsersPanel />
          </View>
        ) : null}

        {tab === 'content' ? (
          <View style={[adminStyles.dashBody, {paddingTop: 16}]}>
            <AdminContentPanel navigation={navigation} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  usersBody: {paddingTop: 16},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});
