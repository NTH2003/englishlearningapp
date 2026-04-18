import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {COLORS} from '../../constants';
import {emitLearningProgressUpdated} from '../../services/learningProgressEvents';
import {VocabularyTabContext} from '../../contexts/VocabularyTabContext';
import TopicSelectionScreen from './TopicSelectionScreen';
import VocabularyReviewHubScreen from './VocabularyReviewHubScreen';

const HERO_COPY = {
  bundles: 'Chọn một bộ để học flashcard và các chế độ luyện tập.',
  review: 'Ôn lại từ đã học, luyện trắc nghiệm và thử thách.',
};

/**
 * Tab Từ vựng: Bộ từ vựng | Ôn tập.
 * (Danh sách từ / từ đã học: xem trang chủ.)
 */
export default function VocabularyRootScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const [tab, setTab] = useState('bundles');
  const [reviewKey, setReviewKey] = useState(0);
  const [topicListRefreshTick, setTopicListRefreshTick] = useState(0);

  useEffect(() => {
    const initial = route.params?.initialVocabTab;
    if (initial === 'review' || initial === 'bundles') {
      if (initial === 'review') {
        setTab('review');
        setReviewKey((k) => k + 1);
      } else {
        setTab('bundles');
      }
      try {
        navigation.setParams({initialVocabTab: undefined});
      } catch (_) {}
    }
  }, [route.params?.initialVocabTab, navigation]);

  useFocusEffect(
    useCallback(() => {
      setTopicListRefreshTick((n) => n + 1);
      const id = requestAnimationFrame(() => {
        emitLearningProgressUpdated();
      });
      return () => cancelAnimationFrame(id);
    }, []),
  );

  const switchToReview = useCallback(() => {
    setTab('review');
    setReviewKey((k) => k + 1);
  }, []);

  const ctx = useMemo(
    () => ({
      activeTab: tab,
      setTab,
      embedInRoot: true,
    }),
    [tab],
  );

  return (
    <VocabularyTabContext.Provider value={ctx}>
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={[styles.heroOrange, {paddingTop: Math.max(insets.top, 10)}]}>
          <Text style={styles.heroTitle}>Từ vựng</Text>
          <Text style={styles.heroSubtitle}>{HERO_COPY[tab]}</Text>
          <View style={styles.pillWrap}>
            <TouchableOpacity
              style={[styles.pillSeg, tab === 'bundles' && styles.pillSegActive]}
              onPress={() => setTab('bundles')}
              activeOpacity={1}
              accessibilityRole="tab"
              accessibilityState={{selected: tab === 'bundles'}}>
              <Text
                style={[styles.pillTextInactive, tab === 'bundles' && styles.pillTextSelected]}
                numberOfLines={1}>
                Bộ từ vựng
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillSeg, tab === 'review' && styles.pillSegActive]}
              onPress={switchToReview}
              activeOpacity={1}
              accessibilityRole="tab"
              accessibilityState={{selected: tab === 'review'}}>
              <Text
                style={[styles.pillTextInactive, tab === 'review' && styles.pillTextSelected]}
                numberOfLines={1}>
                Ôn tập
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.body}>
          <View
            style={[styles.tabPane, tab !== 'bundles' && styles.tabPaneHidden]}
            pointerEvents={tab === 'bundles' ? 'auto' : 'none'}>
            <TopicSelectionScreen rootFocusTick={topicListRefreshTick} />
          </View>
          <View
            style={[styles.tabPane, tab !== 'review' && styles.tabPaneHidden]}
            pointerEvents={tab === 'review' ? 'auto' : 'none'}>
            <VocabularyReviewHubScreen key={reviewKey} />
          </View>
        </View>
      </SafeAreaView>
    </VocabularyTabContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  heroOrange: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
    lineHeight: 18,
  },
  pillWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderRadius: 999,
    padding: 4,
    marginTop: 14,
    gap: 2,
  },
  pillSeg: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    minWidth: 0,
  },
  pillSegActive: {
    backgroundColor: '#FFFFFF',
  },
  pillTextInactive: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  pillTextSelected: {
    color: COLORS.TEXT,
  },
  body: {
    flex: 1,
  },
  tabPane: {
    flex: 1,
    minHeight: 0,
  },
  tabPaneHidden: {
    display: 'none',
  },
});
