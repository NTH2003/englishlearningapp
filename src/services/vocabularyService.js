import {vocabularyData, lessonsData} from '../data/vocabularyData';
import {getLearningProgress, saveLearningProgress} from './storageService';

// Lấy tất cả từ vựng
export const getAllVocabulary = () => {
  return vocabularyData;
};

// Lấy từ vựng theo ID
export const getVocabularyById = (id) => {
  // Convert to number if needed
  const numId = typeof id === 'string' ? parseInt(id) : id;
  const word = vocabularyData.find(word => word.id === numId);
  console.log('getVocabularyById - Looking for ID:', numId, 'Found:', word);
  return word;
};

// Lấy từ vựng theo chủ đề
export const getVocabularyByCategory = (category) => {
  return vocabularyData.filter(word => word.category === category);
};

// Lấy từ vựng theo cấp độ
export const getVocabularyByLevel = (level) => {
  return vocabularyData.filter(word => word.level === level);
};

// Đánh dấu từ đã học
export const markWordAsLearned = async (wordId, learned = true) => {
  try {
    const progress = await getLearningProgress();
    const updatedProgress = progress || {
      wordsLearned: [],
      lessonsCompleted: [],
    };

    if (learned) {
      if (!updatedProgress.wordsLearned.includes(wordId)) {
        updatedProgress.wordsLearned.push(wordId);
      }
    } else {
      updatedProgress.wordsLearned = updatedProgress.wordsLearned.filter(
        id => id !== wordId
      );
    }

    await saveLearningProgress(updatedProgress);
    return true;
  } catch (error) {
    console.error('Error marking word as learned:', error);
    return false;
  }
};

// Kiểm tra từ đã học chưa
export const isWordLearned = async (wordId) => {
  try {
    const progress = await getLearningProgress();
    if (!progress || !progress.wordsLearned) {
      return false;
    }
    return progress.wordsLearned.includes(wordId);
  } catch (error) {
    console.error('Error checking word learned status:', error);
    return false;
  }
};

// Lấy số từ đã học
export const getLearnedWordsCount = async () => {
  try {
    const progress = await getLearningProgress();
    return progress?.wordsLearned?.length || 0;
  } catch (error) {
    console.error('Error getting learned words count:', error);
    return 0;
  }
};

// Lấy tất cả bài học
export const getAllLessons = () => {
  return lessonsData;
};

// Lấy bài học theo ID
export const getLessonById = (id) => {
  return lessonsData.find(lesson => lesson.id === id);
};
