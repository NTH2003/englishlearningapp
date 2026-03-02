import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {getDueWordsForToday, recordWordReview} from '../../services/reviewService';
import {getWordMedia} from '../../services/firebaseService';

const ReviewSessionScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [dueCount, setDueCount] = useState(0);
  const [goalWords, setGoalWords] = useState(10);
  const [doneWords, setDoneWords] = useState(0);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const currentWord = useMemo(() => {
    return words && words[index] ? words[index] : null;
  }, [words, index]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await getDueWordsForToday();
        setWords(res.words || []);
        setDueCount(res.dueCount || 0);
        setGoalWords(res.goalWords || 10);
        setDoneWords(res.doneWords || 0);
        setIndex(0);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadImage = async () => {
      if (!currentWord) {
        setImageUrl('');
        return;
      }
      const media = await getWordMedia(currentWord.id);
      if (cancelled) return;
      setImageUrl(media?.imageUrl || '');
    };
    loadImage();
    return () => {
      cancelled = true;
    };
  }, [currentWord]);

  const onRate = async (rating) => {
    if (!currentWord || saving) return;
    setSaving(true);
    try {
      await recordWordReview(currentWord.id, rating);
      const next = index + 1;
      if (next >= words.length) {
        navigation.goBack();
      } else {
        setIndex(next);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY_DARK} />
          <Text style={styles.loadingText}>Đang tải từ cần ôn...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ôn tập</Text>
          <View style={{width: 80}} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Hôm nay chưa có từ cần ôn</Text>
          <Text style={styles.emptyText}>
            Bạn đã hoàn thành mục tiêu hoặc chưa đánh dấu từ nào là đã học.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Vocabulary')}
            activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Học từ mới</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const remaining = Math.max(0, goalWords - doneWords);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ôn tập</Text>
        <Text style={styles.headerRight}>
          {index + 1}/{words.length}
        </Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          Đến hạn: <Text style={styles.summaryStrong}>{dueCount}</Text> • Mục tiêu:{" "}
          <Text style={styles.summaryStrong}>{remaining}</Text> từ còn lại
        </Text>
      </View>

      <View style={styles.card}>
        {imageUrl ? (
          <View style={styles.imageWrap}>
            <Image source={{uri: imageUrl}} style={styles.image} />
          </View>
        ) : null}

        <Text style={styles.word}>{currentWord.word}</Text>
        <Text style={styles.pronunciation}>{currentWord.pronunciation}</Text>
        <View style={styles.divider} />
        <Text style={styles.meaningLabel}>Nghĩa</Text>
        <Text style={styles.meaning}>{currentWord.meaning}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.rateButton, styles.hard]}
          onPress={() => onRate('hard')}
          disabled={saving}
          activeOpacity={0.85}>
          <Text style={styles.rateText}>Khó</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rateButton, styles.good]}
          onPress={() => onRate('good')}
          disabled={saving}
          activeOpacity={0.85}>
          <Text style={styles.rateText}>Bình thường</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rateButton, styles.easy]}
          onPress={() => onRate('easy')}
          disabled={saving}
          activeOpacity={0.85}>
          <Text style={styles.rateText}>Dễ</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.BACKGROUND},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backText: {color: COLORS.PRIMARY_DARK, fontWeight: '700'},
  headerTitle: {color: COLORS.TEXT, fontWeight: '800', fontSize: 16},
  headerRight: {color: COLORS.TEXT_SECONDARY, fontWeight: '700', width: 80, textAlign: 'right'},
  summary: {paddingHorizontal: 16, paddingTop: 12},
  summaryText: {color: COLORS.TEXT_SECONDARY, fontWeight: '600'},
  summaryStrong: {color: COLORS.TEXT, fontWeight: '800'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22},
  loadingText: {marginTop: 10, color: COLORS.TEXT_SECONDARY, fontWeight: '600'},
  emptyTitle: {fontSize: 18, fontWeight: '800', color: COLORS.TEXT, marginBottom: 6, textAlign: 'center'},
  emptyText: {fontSize: 13, color: COLORS.TEXT_SECONDARY, textAlign: 'center', marginBottom: 12},
  primaryButton: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  primaryButtonText: {color: '#fff', fontWeight: '700'},
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  imageWrap: {
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.BORDER,
    marginBottom: 12,
  },
  image: {width: '100%', height: '100%'},
  word: {fontSize: 34, fontWeight: '900', color: COLORS.TEXT, textAlign: 'center'},
  pronunciation: {marginTop: 4, color: COLORS.TEXT_SECONDARY, textAlign: 'center', fontWeight: '700'},
  divider: {height: 1, backgroundColor: COLORS.BORDER, marginVertical: 12},
  meaningLabel: {color: COLORS.TEXT_SECONDARY, fontWeight: '700', marginBottom: 4},
  meaning: {color: COLORS.TEXT, fontWeight: '800', fontSize: 18},
  actions: {flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16},
  rateButton: {flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center'},
  rateText: {color: '#fff', fontWeight: '800'},
  hard: {backgroundColor: COLORS.ERROR},
  good: {backgroundColor: COLORS.PRIMARY_DARK},
  easy: {backgroundColor: COLORS.SUCCESS},
});

export default ReviewSessionScreen;

