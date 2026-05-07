/**
 * Màn hình app – import từ đây để dùng trong navigation.
 * Cấu trúc thư mục:
 *   auth/       – Đăng nhập, Đăng ký
 *   main/       – Trang chủ, Hồ sơ, bảng xếp hạng
 *   vocabulary/ – Học từ vựng
 *   video/      – Chọn video, Xem video
 *   dialogue/   – Hội thoại
 */

export { LoginScreen, RegisterScreen } from './auth';
export {
  HomeScreen,
  ProfileScreen,
  LearningPathScreen,
  LearnedVocabularyScreen,
} from './main';
export {
  VocabularyRootScreen,
  TopicSelectionScreen,
  VocabularyFlashcardScreen,
  FlashcardResultScreen,
  VocabularyQuizScreen,
  VocabularyTypingScreen,
  VocabularyListeningScreen,
  VocabularyQuickChallengeScreen,
  VocabularyTopicDetailScreen,
  VocabularyReviewHubScreen,
} from './vocabulary';
export { VideoSelectionScreen, VideoLearningScreen } from './video';
export { DialogueIntroScreen, DialoguePracticeScreen } from './dialogue';
