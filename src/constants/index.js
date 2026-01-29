// App Constants
export const APP_NAME = 'English Learning App';
export const APP_VERSION = '0.0.1';

// API Constants (sẽ cập nhật sau)
export const API_BASE_URL = 'https://api.example.com';

// Storage Keys
export const STORAGE_KEYS = {
  USER_DATA: '@user_data',
  LEARNING_PROGRESS: '@learning_progress',
  SETTINGS: '@settings',
};

// Colors - Bảng màu xanh biển đồng nhất
export const COLORS = {
  // Màu chủ đạo - Xanh biển nhạt (tính năng học tập)
  PRIMARY: '#60A5FA',        // Xanh biển nhạt - màu chính
  PRIMARY_LIGHT: '#60A5FA',   // Xanh biển nhạt
  PRIMARY_DARK: '#2563EB',   // Xanh biển đậm (tiến độ học tập)
  PRIMARY_SOFT: '#60A5FA',   // Xanh biển nhạt
  
  // Màu phụ - Cùng màu xanh biển nhạt
  SECONDARY: '#60A5FA',      // Xanh biển nhạt
  ACCENT: '#60A5FA',          // Xanh biển nhạt
  
  // Màu trạng thái (giữ nguyên để dễ nhận biết)
  SUCCESS: '#10B981',         // Xanh lá nhẹ
  WARNING: '#F59E0B',         // Cam nhẹ
  ERROR: '#EF4444',           // Đỏ nhẹ
  
  // Màu nền và text
  BACKGROUND: '#F0F4F8',      // Xanh xám nhạt
  BACKGROUND_WHITE: '#FFFFFF',
  TEXT: '#1E293B',            // Xám đen
  TEXT_SECONDARY: '#64748B',  // Xám
  TEXT_LIGHT: '#94A3B8',      // Xám nhạt
  BORDER: '#E2E8F0',          // Xám nhạt
  CARD_SHADOW: '#00000010',
};

// Learning Levels
export const LEARNING_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
};
