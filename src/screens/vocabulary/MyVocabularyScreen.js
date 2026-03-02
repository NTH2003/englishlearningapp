import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {getFavoriteWords, removeFavoriteWord} from '../../services/storageService';
import {getVocabularyById} from '../../services/vocabularyService';

const getLevelText = (level) => {
  const map = {Beginner: 'Sơ cấp', Intermediate: 'Trung cấp', Advanced: 'Cao cấp'};
  return map[level] || level;
};

const getCategoryText = (category) => {
  const map = {
    Food: 'Thực phẩm',
    Travel: 'Du lịch',
    'Daily Life': 'Cuộc sống hàng ngày',
    Technology: 'Công nghệ',
  };
  return map[category] || category;
};

const MyVocabularyScreen = () => {
  const navigation = useNavigation();
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const ids = await getFavoriteWords();
      const list = ids.map(id => getVocabularyById(id)).filter(Boolean);
      setWords(list);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setWords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadFavorites();
    }, [loadFavorites]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFavorites();
  }, [loadFavorites]);

  const handleRemoveFavorite = async (wordId) => {
    await removeFavoriteWord(wordId);
    loadFavorites();
  };

  const handleStudyWord = (word) => {
    navigation.navigate('VocabularyFlashcard', {
      words: [word],
      topicId: word.category,
    });
  };

  const handleStudyAll = () => {
    if (words.length === 0) return;
    navigation.navigate('VocabularyFlashcard', {
      words,
      topicId: 'MyVocabulary',
    });
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY_DARK} />
          <Text style={styles.loadingText}>Đang tải từ yêu thích...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (words.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.PRIMARY_DARK]}
            />
          }>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>★</Text>
            <Text style={styles.emptyTitle}>Chưa có từ yêu thích</Text>
            <Text style={styles.emptySubtitle}>
              Khi học FlashCard, hãy bấm vào dấu sao để thêm từ vào đây. Dữ liệu được đồng bộ với tài khoản của bạn.
            </Text>
            <TouchableOpacity
              style={styles.goStudyButton}
              onPress={() => navigation.navigate('Vocabulary')}
              activeOpacity={0.8}>
              <Text style={styles.goStudyButtonText}>Đi học từ vựng</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerIcon}>★</Text>
            <Text style={styles.headerTitle}>Từ vựng của tôi</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{words.length} từ</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          Dữ liệu đồng bộ với tài khoản • Kéo xuống để làm mới
        </Text>
      </View>

      <TouchableOpacity
        style={styles.studyAllButton}
        onPress={handleStudyAll}
        activeOpacity={0.8}>
        <Text style={styles.studyAllIcon}>📚</Text>
        <Text style={styles.studyAllText}>Học tất cả ({words.length} từ)</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.PRIMARY_DARK]}
          />
        }>
        {words.map(word => (
          <View key={word.id} style={styles.card}>
            <TouchableOpacity
              style={styles.cardLeft}
              onPress={() => handleStudyWord(word)}
              activeOpacity={0.8}>
              <View style={styles.badgesRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{getLevelText(word.level)}</Text>
                </View>
                <View style={[styles.tag, styles.tagCategory]}>
                  <Text style={styles.tagText}>{getCategoryText(word.category)}</Text>
                </View>
              </View>
              <Text style={styles.wordText}>{word.word}</Text>
              <Text style={styles.pronunciationText}>{word.pronunciation}</Text>
              <Text style={styles.meaningText}>{word.meaning}</Text>
            </TouchableOpacity>
            <View style={styles.cardRight}>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemoveFavorite(word.id)}
                activeOpacity={0.7}>
                <Text style={styles.removeBtnIcon}>★</Text>
                <Text style={styles.removeBtnLabel}>Bỏ yêu thích</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.studyBtn}
                onPress={() => handleStudyWord(word)}
                activeOpacity={0.7}>
                <Text style={styles.studyBtnText}>Học</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyIcon: {
    fontSize: 56,
    color: COLORS.PRIMARY,
    marginBottom: 20,
    opacity: 0.9,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  goStudyButton: {
    backgroundColor: COLORS.PRIMARY_DARK,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  goStudyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 8,
    color: COLORS.PRIMARY_DARK,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.TEXT,
  },
  badge: {
    backgroundColor: COLORS.PRIMARY_SOFT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.PRIMARY_DARK,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 8,
  },
  studyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 14,
    shadowColor: COLORS.PRIMARY_DARK,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  studyAllIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  studyAllText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.BACKGROUND_WHITE,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  cardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  tag: {
    marginRight: 8,
    marginBottom: 4,
    backgroundColor: COLORS.PRIMARY_DARK,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagCategory: {
    backgroundColor: COLORS.PRIMARY,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  wordText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.PRIMARY_DARK,
  },
  pronunciationText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: 'italic',
    marginTop: 4,
  },
  meaningText: {
    fontSize: 16,
    color: COLORS.TEXT,
    marginTop: 6,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  removeBtnIcon: {
    fontSize: 16,
    color: COLORS.PRIMARY_DARK,
    marginRight: 4,
  },
  removeBtnLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  studyBtn: {
    backgroundColor: COLORS.PRIMARY_DARK,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  studyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.BACKGROUND_WHITE,
  },
  bottomSpacer: {
    height: 24,
  },
});

export default MyVocabularyScreen;
