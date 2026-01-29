import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../constants';
import {dialogueScenarios} from '../data/dialogueData';

const DialogueIntroScreen = () => {
  const navigation = useNavigation();

  // Tạm thời lấy tình huống đầu tiên (mức sơ cấp – cà phê)
  const beginnerScenario = dialogueScenarios[0];

  const handleStartDialogue = () => {
    navigation.navigate('DialoguePractice', {scenarioId: beginnerScenario.id});
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header giống phong cách hình minh họa */}
        <View style={styles.headerCard}>
          <View style={styles.headerIconWrapper}>
            <Text style={styles.headerIcon}>💬</Text>
          </View>
          <View style={styles.headerTextWrapper}>
            <Text style={styles.headerTitle}>Thực hành hội thoại</Text>
            <Text style={styles.headerSubtitle}>
              Trong bài học này, bạn sẽ sử dụng các từ vựng của mình trong một
              tình huống giao tiếp thực tế.
            </Text>
          </View>
        </View>

        {/* Thẻ giới thiệu tình huống */}
        <View style={styles.scenarioCard}>
          <Text style={styles.scenarioLabel}>Dành cho người mới bắt đầu</Text>
          <Text style={styles.scenarioTitle}>{beginnerScenario.title}</Text>

          <Text style={styles.sectionLabel}>Mục tiêu</Text>
          <Text style={styles.scenarioGoal}>{beginnerScenario.goal}</Text>

          <View style={styles.scenarioBottomRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Sơ cấp</Text>
            </View>
            {/* Ảnh minh họa: dùng hình mặc định nếu muốn sau này thay bằng URL thực */}
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imageEmoji}>☕</Text>
            </View>
          </View>
        </View>

        {/* Nút bắt đầu */}
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.8}
          onPress={handleStartDialogue}>
          <Text style={styles.startButtonText}>▶ Bắt đầu hội thoại</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEF5E7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE49B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  headerIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTextWrapper: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
  },
  scenarioCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  scenarioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.PRIMARY_DARK,
    marginBottom: 6,
  },
  scenarioTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  scenarioGoal: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: 12,
  },
  scenarioBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY + '20',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.PRIMARY_DARK,
  },
  imagePlaceholder: {
    width: 120,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F3E5AB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageEmoji: {
    fontSize: 32,
  },
  startButton: {
    marginTop: 8,
    backgroundColor: '#FFC107',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
});

export default DialogueIntroScreen;

