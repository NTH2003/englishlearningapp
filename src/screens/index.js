/**
 * Tất cả màn hình app – import từ đây để dùng trong navigation.
 * Cấu trúc thư mục:
 *   auth/     – Đăng nhập, Đăng ký
 *   main/     – Trang chủ, Hồ sơ, Hoạt động của tôi
 *   vocabulary/ – Học từ vựng (chủ đề, flashcard, quiz, gõ từ, nghe, từ của tôi)
 *   video/    – Chọn video, Xem video
 *   dialogue/ – Giới thiệu hội thoại, Thực hành hội thoại
 *   lesson/   – Chi tiết bài học
 */

export { LoginScreen, RegisterScreen } from './auth';
export { HomeScreen, ProfileScreen, LearningPathScreen, AdminScreen } from './main';
export {
  TopicSelectionScreen,
  StudyModeSelectionScreen,
  VocabularyFlashcardScreen,
  VocabularyQuizScreen,
  VocabularyTypingScreen,
  VocabularyListeningScreen,
  MyVocabularyScreen,
  ReviewSessionScreen,
} from './vocabulary';
export { VideoSelectionScreen, VideoLearningScreen } from './video';
export { DialogueIntroScreen, DialoguePracticeScreen } from './dialogue';
export { LessonDetailScreen } from './lesson';
