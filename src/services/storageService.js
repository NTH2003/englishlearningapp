import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../constants';

// Lưu dữ liệu người dùng
export const saveUserData = async (userData) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    return false;
  }
};

// Lấy dữ liệu người dùng
export const getUserData = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

// Lưu tiến độ học tập
export const saveLearningProgress = async (progress) => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.LEARNING_PROGRESS,
      JSON.stringify(progress),
    );
    return true;
  } catch (error) {
    console.error('Error saving learning progress:', error);
    return false;
  }
};

// Lấy tiến độ học tập
export const getLearningProgress = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LEARNING_PROGRESS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting learning progress:', error);
    return null;
  }
};

// Ghi nhận video đã xem
export const addVideoWatched = async (videoId) => {
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      favoriteWords: [],
    };

    if (!Array.isArray(updated.videosWatched)) {
      updated.videosWatched = [];
    }

    if (!updated.videosWatched.includes(videoId)) {
      updated.videosWatched.push(videoId);
      await saveLearningProgress(updated);
    }
    return true;
  } catch (error) {
    console.error('Error adding video watched:', error);
    return false;
  }
};

// Thêm từ vào danh sách yêu thích
export const addFavoriteWord = async (wordId) => {
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      favoriteWords: [],
    };

    if (!Array.isArray(updated.favoriteWords)) {
      updated.favoriteWords = [];
    }

    if (!updated.favoriteWords.includes(wordId)) {
      updated.favoriteWords.push(wordId);
      await saveLearningProgress(updated);
    }
    return true;
  } catch (error) {
    console.error('Error adding favorite word:', error);
    return false;
  }
};

// Bỏ từ khỏi danh sách yêu thích
export const removeFavoriteWord = async (wordId) => {
  try {
    const progress = await getLearningProgress();
    const updated = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
      videosWatched: [],
      favoriteWords: [],
    };

    if (!Array.isArray(updated.favoriteWords)) {
      updated.favoriteWords = [];
    }

    updated.favoriteWords = updated.favoriteWords.filter(id => id !== wordId);
    await saveLearningProgress(updated);
    return true;
  } catch (error) {
    console.error('Error removing favorite word:', error);
    return false;
  }
};

// Lấy danh sách ID từ yêu thích
export const getFavoriteWords = async () => {
  try {
    const progress = await getLearningProgress();
    if (!progress || !Array.isArray(progress.favoriteWords)) {
      return [];
    }
    return progress.favoriteWords;
  } catch (error) {
    console.error('Error getting favorite words:', error);
    return [];
  }
};

// Kiểm tra 1 từ có nằm trong danh sách yêu thích không
export const isFavoriteWord = async (wordId) => {
  try {
    const favorites = await getFavoriteWords();
    return favorites.includes(wordId);
  } catch (error) {
    console.error('Error checking favorite word:', error);
    return false;
  }
};

// Xóa tất cả dữ liệu (đăng xuất)
export const clearAllData = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_DATA,
      STORAGE_KEYS.LEARNING_PROGRESS,
      STORAGE_KEYS.SETTINGS,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
};
