import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {SafeAreaView} from 'react-native-safe-area-context';
import {COLORS} from '../../constants';

const MODES = [
  {
    key: 'flashcard',
    title: 'Học flashcard',
    hint: 'Lật thẻ học nghĩa và phiên âm',
    icon: 'layers',
    target: 'VocabularyFlashcard',
  },
  {
    key: 'quiz',
    title: 'Trắc nghiệm',
    hint: 'Quiz nhanh theo từ của video',
    icon: 'check-square',
    target: 'VocabularyQuiz',
  },
  {
    key: 'typing',
    title: 'Gõ từ',
    hint: 'Nhìn nghĩa và gõ từ tiếng Anh',
    icon: 'edit-3',
    target: 'VocabularyTyping',
  },
  {
    key: 'listening',
    title: 'Nghe và chọn',
    hint: 'Nghe phát âm và chọn đáp án',
    icon: 'headphones',
    target: 'VocabularyListening',
  },
];

export default function VideoVocabularyStudyModeScreen({route, navigation}) {
  const words = Array.isArray(route?.params?.words) ? route.params.words : [];
  const topicName =
    String(route?.params?.topicName || '').trim() || 'Từ vựng từ video';
  const topicId = String(route?.params?.topicId || 'video_vocab');
  const topic = route?.params?.topic || null;

  const navParams = useMemo(
    () => ({
      words,
      topicId,
      topicName,
      topic,
      practiceMode: 'video',
    }),
    [topic, topicId, topicName, words],
  );

  const openMode = (mode) => {
    if (!words.length) {
      Alert.alert('Chưa có từ', 'Video này chưa có từ vựng để luyện tập.');
      return;
    }
    navigation.navigate(mode.target, navParams);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chọn phương thức học</Text>
        <Text style={styles.subtitle}>
          {topicName} ({words.length} từ)
        </Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {MODES.map((mode) => (
            <TouchableOpacity
              key={mode.key}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => openMode(mode)}>
              <View style={styles.iconWrap}>
                <Feather name={mode.icon} size={24} color={COLORS.PRIMARY_DARK} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{mode.title}</Text>
                <Text style={styles.cardHint}>{mode.hint}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    minHeight: 168,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.PRIMARY_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.TEXT,
    letterSpacing: -0.2,
  },
  cardHint: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 19,
  },
  bottomSpacer: {
    height: 6,
  },
});
