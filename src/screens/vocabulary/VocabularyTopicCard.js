import React, {memo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';

export function getTopicFeatherIcon(topicId) {
  const map = {
    Food: 'book-open',
    Travel: 'map-pin',
    'Daily Life': 'home',
    Technology: 'cpu',
  };
  return map[topicId] || 'layers';
}

/**
 * Hiển thị emoji/icon admin (field `topic.icon`), nếu trống thì dùng icon Feather mặc định.
 */
export function TopicIconDisplay({topic, size = 26}) {
  let raw = String(topic?.icon ?? '').trim();
  if (/^https?:\/\//i.test(raw)) {
    raw = '';
  }
  if (raw.length > 0) {
    return (
      <Text
        style={[styles.topicEmojiIcon, {fontSize: size}]}
        allowFontScaling={false}
        numberOfLines={1}>
        {raw}
      </Text>
    );
  }
  return (
    <Feather name={getTopicFeatherIcon(topic.id)} size={size} color={topic.color} />
  );
}

export const VocabularyTopicCard = memo(
  ({topic, progress, status, locked, onPress}) => {
    const accentColor =
      String(topic?.color || '#3B82F6').trim() || '#3B82F6';
    const statusMap = {
      not_started: {label: 'Chưa học', bg: '#F3F4F6', text: '#4B5563'},
      in_progress: {label: 'Đang học', bg: '#EFF6FF', text: '#1D4ED8'},
      ready_for_exam: {label: 'Chờ kiểm tra', bg: '#FFF7ED', text: '#C2410C'},
      completed: {label: 'Hoàn thành', bg: '#ECFDF5', text: '#047857'},
    };
    const statusUi = statusMap[status] || statusMap.not_started;
    const learnedCount = Math.max(0, Number(progress?.learned || 0));
    const totalCount = Math.max(0, Number(progress?.total || 0));
    const safePercentage = Math.max(
      0,
      Math.min(100, Number(progress?.percentage || 0)),
    );

    return (
      <TouchableOpacity
        style={[
          styles.topicCard,
          styles.topicCardShadow,
          locked && styles.topicCardLocked,
        ]}
        onPress={onPress}
        activeOpacity={0.7}>
        <View style={[styles.topicTopAccent, {backgroundColor: accentColor}]} />
        <View style={styles.topicCardInner}>
          <View style={styles.topicRowMain}>
            <View
              style={[
                styles.iconContainer,
                {backgroundColor: accentColor + '18'},
              ]}>
              <TopicIconDisplay topic={{...topic, color: accentColor}} size={26} />
            </View>
            <View style={styles.topicInfo}>
              <Text style={styles.topicName} numberOfLines={2}>
                {topic.name}
              </Text>
              <View style={styles.topicMetaRow}>
                <View style={[styles.topicBadge, {backgroundColor: statusUi.bg}]}>
                  <Text style={[styles.topicBadgeText, {color: statusUi.text}]}>
                    {statusUi.label}
                  </Text>
                </View>
                <View style={styles.topicBadge}>
                  <Text style={styles.topicBadgeText}>
                    {learnedCount}/{totalCount} từ
                  </Text>
                </View>
              </View>
              <View style={styles.topicProgressRow}>
                <View style={styles.topicProgressTrack}>
                  <View
                    style={[
                      styles.topicProgressFill,
                      {
                        width: `${safePercentage}%`,
                        backgroundColor: accentColor,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[styles.topicPercentText, {color: accentColor}]}>
                  {safePercentage}%
                </Text>
              </View>
            </View>
            <View style={styles.topicChevronWrap}>
              {locked ? (
                <Feather name="lock" size={22} color={COLORS.TEXT_LIGHT} />
              ) : (
                <Feather name="chevron-right" size={22} color={COLORS.TEXT_LIGHT} />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

VocabularyTopicCard.displayName = 'VocabularyTopicCard';

const styles = StyleSheet.create({
  topicCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },
  topicCardLocked: {
    opacity: 0.62,
  },
  topicTopAccent: {
    height: 4,
    width: '100%',
  },
  topicCardInner: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 14,
  },
  topicRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicCardShadow: {
    ...THEME.shadow.soft,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topicEmojiIcon: {
    textAlign: 'center',
    lineHeight: 32,
  },
  topicInfo: {
    flex: 1,
    minWidth: 0,
  },
  topicName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginBottom: 7,
  },
  topicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 7,
  },
  topicBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  topicBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  topicProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topicProgressTrack: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#E5EAF1',
    overflow: 'hidden',
  },
  topicPercentText: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 38,
    textAlign: 'right',
  },
  topicProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  topicChevronWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
