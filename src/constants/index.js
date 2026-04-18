// Colors - Theme nền sáng, màu nhấn cam/kem giống Home
export const COLORS = {
  // Cam chủ đạo theo mock màn hình (~#FF7B00)
  PRIMARY: '#FF7B00',
  PRIMARY_LIGHT: '#FF9533',
  PRIMARY_DARK: '#E86E00',
  /** Track thanh XP / nền kem */
  PRIMARY_SOFT: '#FFF0E0',
  SECONDARY: '#FFB366',
  ACCENT: '#22C55E',         // xanh lá cho trạng thái tốt

  SUCCESS: '#22C55E',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',

  // Nền sáng, chữ đậm
  BACKGROUND: '#FAFAFA',
  BACKGROUND_WHITE: '#FFFFFF', // card trắng
  TEXT: '#111827',             // chữ chính (gray-900)
  TEXT_SECONDARY: '#6B7280',   // chữ phụ (gray-500)
  TEXT_LIGHT: '#9CA3AF',       // chữ mờ (gray-400)
  BORDER: '#E5E7EB',           // viền nhạt (gray-200)
  CARD_SHADOW: '#00000040',
};

// Google Sign-In - Web Client ID (lấy từ Firebase Console > Project Settings > General > Web app)
export const GOOGLE_WEB_CLIENT_ID = '302695304329-rbeq9ce46i0mf50770i6sgnrrdd0rn5q.apps.googleusercontent.com';

// Cloudinary — Upload preset (unsigned) phải bật **Video** trong Media analysis / resource type.
export const CLOUDINARY = {
  CLOUD_NAME: 'dkblwkrw7',
  UPLOAD_PRESET: 'english_app',
};

// AI server (OpenAI proxy). Android emulator uses 10.0.2.2 to reach host machine.
export const AI_SERVER_URL = 'http://10.0.2.2:3001';
