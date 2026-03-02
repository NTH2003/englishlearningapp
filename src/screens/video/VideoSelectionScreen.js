import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../../constants';
import {getAllVideos} from '../../data/videoData';

// TOPICS giống với TopicSelectionScreen
const TOPICS = [
  {
    id: "Food",
    name: "Thực phẩm",
    icon: "🍔",
    color: "#FF6B6B",
  },
  {
    id: "Travel",
    name: "Du lịch",
    icon: "✈️",
    color: "#4ECDC4",
  },
  {
    id: "Daily Life",
    name: "Cuộc sống hàng ngày",
    icon: "🏠",
    color: "#45B7D1",
  },
  {
    id: "Technology",
    name: "Công nghệ",
    icon: "💻",
    color: "#96CEB4",
  },
];

const VideoSelectionScreen = () => {
  const navigation = useNavigation();
  const [videosByTopic, setVideosByTopic] = useState({});

  useEffect(() => {
    const allVideos = getAllVideos();
    // Nhóm video theo chủ đề
    const grouped = {};
    TOPICS.forEach((topic) => {
      grouped[topic.id] = allVideos.filter((video) => video.category === topic.id);
    });
    setVideosByTopic(grouped);
  }, []);

  const handleSelectVideo = (video) => {
    navigation.navigate('VideoLearning', {video});
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'Beginner':
        return COLORS.PRIMARY;
      case 'Intermediate':
        return '#FF9800';
      case 'Advanced':
        return '#F44336';
      default:
        return COLORS.PRIMARY;
    }
  };

  const getLevelText = (level) => {
    switch (level) {
      case 'Beginner':
        return 'Sơ cấp';
      case 'Intermediate':
        return 'Trung cấp';
      case 'Advanced':
        return 'Nâng cao';
      default:
        return level;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Học qua Video</Text>
          <Text style={styles.subtitle}>Xem video và luyện tập từ vựng</Text>
        </View>

        <View style={styles.content}>
          {TOPICS.map((topic) => {
            const topicVideos = videosByTopic[topic.id] || [];
            if (topicVideos.length === 0) return null;
            
            return (
              <View key={topic.id} style={styles.topicSection}>
                <View style={styles.topicHeader}>
                  <Text style={styles.topicIcon}>{topic.icon}</Text>
                  <Text style={[styles.topicName, {color: topic.color}]}>
                    {topic.name}
                  </Text>
                </View>
                {topicVideos.map((video) => (
                  <TouchableOpacity
                    key={video.id}
                    style={styles.videoCard}
                    onPress={() => handleSelectVideo(video)}
                    activeOpacity={0.7}>
                    <View style={styles.videoHeader}>
                      <Text style={styles.videoThumbnail}>{video.thumbnail}</Text>
                      <View style={styles.videoInfo}>
                        <Text style={styles.videoTitle}>{video.title}</Text>
                        <Text style={styles.videoDescription}>{video.description}</Text>
                        <View style={styles.videoMeta}>
                          <View
                            style={[
                              styles.levelBadge,
                              {backgroundColor: getLevelColor(video.level) + '20'},
                            ]}>
                            <Text
                              style={[
                                styles.levelText,
                                {color: getLevelColor(video.level)},
                              ]}>
                              {getLevelText(video.level)}
                            </Text>
                          </View>
                          <Text style={styles.duration}>⏱️ {video.duration}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </View>
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
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  content: {
    padding: 20,
    paddingTop: 10,
  },
  topicSection: {
    marginBottom: 24,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  topicIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  topicName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  videoCard: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: COLORS.TEXT,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  videoThumbnail: {
    fontSize: 48,
    marginRight: 16,
  },
  videoInfo: {
    flex: 1,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  videoDescription: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12,
    lineHeight: 20,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  duration: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
});

export default VideoSelectionScreen;
