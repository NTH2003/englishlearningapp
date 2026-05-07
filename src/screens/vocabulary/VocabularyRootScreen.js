import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {COLORS} from '../../constants';
import {VocabularyTabContext} from '../../contexts/VocabularyTabContext';
import TopicSelectionScreen from './TopicSelectionScreen';
import VocabularyReviewHubScreen from './VocabularyReviewHubScreen';

/**
 * Tab Từ vựng: Bộ từ vựng | Ôn tập.
 * (Danh sách từ / từ đã học: xem trang chủ.)
 */
export default function VocabularyRootScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const [tab, setTab] = useState('bundles');
  const topicListRefreshTick = 0;

  useEffect(() => {
    const initial = route.params?.initialVocabTab;
    if (initial === 'review' || initial === 'bundles') {
      if (initial === 'review') {
        setTab('review');
      } else {
        setTab('bundles');
      }
      try {
        navigation.setParams({initialVocabTab: undefined});
      } catch (_) {}
    }
  }, [route.params?.initialVocabTab, navigation]);

  // Khi rời tab Từ vựng rồi quay lại, luôn về tab mặc định "Bộ từ vựng".
  useFocusEffect(
    useCallback(() => {
      setTab('bundles');
      return undefined;
    }, []),
  );

  const switchToReview = useCallback(() => {
    setTab('review');
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
            <VocabularyReviewHubScreen />
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
    marginBottom: 2,
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
