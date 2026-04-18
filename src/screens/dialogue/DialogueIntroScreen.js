import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {getAllDialogues, loadDialoguesFromFirebase} from '../../services/dialogueService';

const DialogueIntroScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [topicFilter, setTopicFilter] = useState('all');
  const [dialogues, setDialogues] = useState(() => getAllDialogues());
  const heroPadTop = Math.max(insets.top, 8) + 8;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await loadDialoguesFromFirebase();
      if (!cancelled) {
        setDialogues(Array.isArray(rows) ? rows : []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectScenario = scenario => {
    navigation.navigate('DialoguePractice', {
      scenarioId: scenario.id,
      partnerId: 'us',
    });
  };

  const filteredScenarios = useMemo(() => {
    if (topicFilter === 'done') {
      return dialogues.filter((s) => Boolean(s.completed));
    }
    if (topicFilter === 'todo') {
      return dialogues.filter((s) => !Boolean(s.completed));
    }
    return dialogues;
  }, [dialogues, topicFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.PRIMARY}
        translucent={Platform.OS === 'android'}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.heroOrange, {paddingTop: heroPadTop}]}>
          <Text style={styles.heroTitle}>Hội thoại</Text>
          <Text style={styles.heroSubtitle}>
            Luyện nói với trợ lý thông minh
          </Text>
        </View>

        <View style={styles.filterTabsWrap}>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'all' && styles.filterTabActive]}
            onPress={() => setTopicFilter('all')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'all' && styles.filterTabTextActive,
              ]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'done' && styles.filterTabActive]}
            onPress={() => setTopicFilter('done')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'done' && styles.filterTabTextActive,
              ]}>
              Đã học
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, topicFilter === 'todo' && styles.filterTabActive]}
            onPress={() => setTopicFilter('todo')}
            activeOpacity={0.85}>
            <Text
              style={[
                styles.filterTabText,
                topicFilter === 'todo' && styles.filterTabTextActive,
              ]}>
              Chưa học
            </Text>
          </TouchableOpacity>
        </View>

        {filteredScenarios.map(scenario => {
          const accent = scenario.accentColor || COLORS.PRIMARY;
          const done = Boolean(scenario.completed);
          return (
            <TouchableOpacity
              key={scenario.id}
              style={[styles.topicCard, THEME.shadow.soft]}
              activeOpacity={0.85}
              onPress={() => handleSelectScenario(scenario)}>
              <View style={[styles.topicTopBar, {backgroundColor: accent}]} />
              <View style={styles.topicBody}>
                <View style={styles.topicLeft}>
                  <Text style={styles.topicEmoji}>{scenario.icon || '💬'}</Text>
                </View>
                <View style={styles.topicCenter}>
                  <Text style={styles.topicTitle}>{scenario.title}</Text>
                  <Text style={styles.topicDesc} numberOfLines={2}>
                    {scenario.description}
                  </Text>
                </View>
                <View style={styles.topicRight}>
                  {done ? (
                    <View style={styles.checkCircle}>
                      <Feather name="check" size={16} color="#FFFFFF" />
                    </View>
                  ) : (
                    <Feather
                      name="chevron-right"
                      size={22}
                      color={COLORS.TEXT_LIGHT}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {filteredScenarios.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Không có chủ đề phù hợp</Text>
            <Text style={styles.emptyText}>
              Hãy đổi bộ lọc hoặc thêm dữ liệu hội thoại để bắt đầu luyện tập.
            </Text>
          </View>
        )}
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
    paddingBottom: 32,
  },
  heroOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
  },
  filterTabsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  filterTab: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterTabActive: {
    borderColor: COLORS.PRIMARY,
    backgroundColor: '#FFF7ED',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: COLORS.PRIMARY,
  },
  topicCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    overflow: 'hidden',
  },
  topicTopBar: {
    height: 4,
    width: '100%',
  },
  topicBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  topicLeft: {
    width: 44,
    alignItems: 'center',
  },
  topicEmoji: {
    fontSize: 28,
  },
  topicCenter: {
    flex: 1,
    minWidth: 0,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  topicDesc: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 18,
    marginBottom: 10,
  },
  topicRight: {
    justifyContent: 'center',
    paddingTop: 4,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    marginTop: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default DialogueIntroScreen;
