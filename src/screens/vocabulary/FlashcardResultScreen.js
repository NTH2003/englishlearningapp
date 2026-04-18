import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  InteractionManager,
} from 'react-native';
import {useNavigation, CommonActions} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';
import {flushLearningProgressWrites} from '../../services/vocabularyService';
import {emitLearningProgressUpdated} from '../../services/learningProgressEvents';

const FlashcardResultScreen = ({route}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {words, topicId, wordStatus, topicName, topic} = route.params || {};

  const total = Array.isArray(words) ? words.length : 0;
  const displayTopicName = topicName || topic?.name || 'Chủ đề';

  const remembered = useMemo(() => {
    if (!Array.isArray(words) || !words.length) return 0;
    let c = 0;
    for (const w of words) {
      if (wordStatus?.[String(w.id)] === true) c += 1;
    }
    return c;
  }, [wordStatus, words]);

  const notRemembered = Math.max(0, total - remembered);
  const pctRemembered =
    total > 0 ? Math.round((remembered / total) * 100) : 0;

  const notRememberedWords = useMemo(() => {
    if (!Array.isArray(words)) return [];
    return words.filter((w) => wordStatus?.[String(w.id)] !== true);
  }, [wordStatus, words]);

  const onReviewNotRemembered = () => {
    if (!notRememberedWords.length) return;
    navigation.replace('VocabularyFlashcard', {
      topicId,
      topicName,
      topic,
      words: notRememberedWords,
    });
  };

  const onFinish = async () => {
    /** Chờ queue lưu tối đa vài giây — nếu treo (Firebase/mạng) vẫn phải pop được. */
    const FLUSH_MAX_MS = 2200;
    try {
      await Promise.race([
        flushLearningProgressWrites(),
        new Promise((resolve) => setTimeout(resolve, FLUSH_MAX_MS)),
      ]);
    } catch (_) {}
    /** popToTop() đôi khi không có navigator xử lý (stack 1 màn / RN) → reset về màn Từ vựng gốc. */
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{name: 'Vocabulary'}],
      }),
    );
    /** Reset lọc «Hoàn thành» / tìm kiếm — nếu không có chủ đề 100% sẽ thấy «Không tìm thấy» dù dữ liệu vẫn có. */
    InteractionManager.runAfterInteractions(() => {
      emitLearningProgressUpdated({resetTopicFilters: true});
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingTop: Math.max(insets.top, 8) + 6},
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Feather name="award" size={36} color={COLORS.PRIMARY_DARK} />
          </View>
          <Text style={styles.heroTitle}>Hoàn thành bài học</Text>
          <Text style={styles.heroTopic} numberOfLines={2}>
            {displayTopicName}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, styles.statBoxTotal]}>
            <Text style={styles.statNum}>{total}</Text>
            <Text style={styles.statLbl}>Từ đã xem</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxOk]}>
            <Text style={styles.statNum}>{remembered}</Text>
            <Text style={styles.statLbl}>Đã nhớ</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxWarn]}>
            <Text style={styles.statNum}>{notRemembered}</Text>
            <Text style={styles.statLbl}>Cần ôn</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Mức độ nắm bài</Text>
            <Text style={styles.progressPct}>{pctRemembered}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {width: `${pctRemembered}%`},
              ]}
            />
          </View>
          <Text style={styles.progressCaption}>
            {pctRemembered >= 70
              ? 'Làm tốt! Có thể chuyển sang chủ đề hoặc chế độ luyện tập khác.'
              : pctRemembered >= 40
                ? 'Khá ổn — nên ôn thêm các từ “Cần ôn” hoặc làm trắc nghiệm.'
                : 'Hãy ôn lại các từ chưa nhớ trước khi học tiếp.'}
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Từ vựng đã học ({total})</Text>
        <View style={styles.wordListCard}>
          <View style={styles.wordListBody}>
          {Array.isArray(words) &&
            words.map((w) => {
              const ok = wordStatus?.[String(w.id)] === true;
              return (
                <View key={String(w.id)} style={styles.wordRow}>
                  <View style={styles.wordRowMain}>
                    <Text style={styles.wordEn}>{w.word}</Text>
                    <Text style={styles.wordVi} numberOfLines={2}>
                      {w.meaning}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      ok ? styles.statusPillOk : styles.statusPillNo,
                    ]}>
                    <Text
                      style={[
                        styles.statusPillText,
                        ok ? styles.statusPillTextOk : styles.statusPillTextNo,
                      ]}>
                      {ok ? 'Đã nhớ' : 'Cần ôn'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.reviewCard}>
          <View style={styles.reviewHead}>
            <View style={styles.reviewIconWrap}>
              <Feather name="refresh-cw" size={18} color={COLORS.PRIMARY_DARK} />
            </View>
            <View style={styles.reviewBody}>
              <Text style={styles.reviewTitle}>Cần ôn tập</Text>
              <Text style={styles.reviewDesc}>
                Bạn có {notRemembered} từ cần ôn tập lại. Hãy dành thời gian để ghi nhớ những từ này nhé!
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.reviewBtn,
              !notRememberedWords.length && styles.disabledButton,
            ]}
            onPress={onReviewNotRemembered}
            disabled={!notRememberedWords.length}
            activeOpacity={0.88}>
            <Text style={styles.reviewBtnText}>Ôn tập ngay</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onFinish}
            activeOpacity={0.85}>
            <Feather name="home" size={16} color="#FFFFFF" style={styles.btnIcon} />
            <Text style={styles.primaryText}>Về trang Từ vựng</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.BACKGROUND},
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...THEME.shadow.soft,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.TEXT,
    textAlign: 'center',
  },
  heroTopic: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.PRIMARY_DARK,
    marginTop: 6,
    textAlign: 'center',
  },
  heroHint: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  statBoxTotal: {
    backgroundColor: '#F8FAFC',
    borderColor: COLORS.BORDER,
  },
  statBoxOk: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statBoxWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.TEXT,
  },
  statLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
    textAlign: 'center',
  },
  progressCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    ...THEME.shadow.soft,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  progressPct: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.PRIMARY_DARK,
  },
  progressTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: COLORS.PRIMARY,
  },
  progressCaption: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 10,
    lineHeight: 19,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.TEXT,
    marginBottom: 10,
  },
  wordListCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    marginBottom: 22,
    overflow: 'hidden',
    ...THEME.shadow.soft,
  },
  wordListBody: {
    maxHeight: 250,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.BORDER,
  },
  wordRowMain: {flex: 1, paddingRight: 10},
  wordEn: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.PRIMARY_DARK,
  },
  wordVi: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillOk: {backgroundColor: '#DCFCE7'},
  statusPillNo: {backgroundColor: '#FEF3C7'},
  statusPillText: {fontSize: 10, fontWeight: '800'},
  statusPillTextOk: {color: '#166534'},
  statusPillTextNo: {color: '#92400E'},
  reviewCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: 14,
    marginBottom: 18,
  },
  reviewHead: {flexDirection: 'row', alignItems: 'flex-start'},
  reviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reviewBody: {flex: 1},
  reviewTitle: {fontSize: 20, fontWeight: '800', color: COLORS.TEXT},
  reviewDesc: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 18,
    marginTop: 4,
  },
  reviewBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  reviewBtnText: {color: '#fff', fontWeight: '800', fontSize: 14},
  actions: {gap: 10, marginBottom: 8},
  primaryButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  btnIcon: {marginRight: 8},
  primaryText: {color: COLORS.BACKGROUND_WHITE, fontWeight: '800', fontSize: 15},
  secondaryButton: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  secondaryText: {color: COLORS.TEXT, fontWeight: '800', fontSize: 15},
  disabledButton: {opacity: 0.5},
});

export default FlashcardResultScreen;
