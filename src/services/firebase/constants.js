/**
 * 🔥 FIREBASE CONSTANTS
 * Dùng chung toàn bộ app (Firestore + Storage + Keys)
 */

/* ========================
   📦 COLLECTIONS
======================== */
export const COLLECTIONS = {
    USERS: 'users',
    USER_PROGRESS: 'userProgress',
    LEADERBOARD: 'leaderboardPublic',
    CONFIG: 'config',
    WORD_MEDIA: 'wordMedia',
  };
  
  /* ========================
     📄 DOCUMENT IDS
  ======================== */
  export const DOCS = {
    TOPICS: 'topics',
    VOCABULARY: 'vocabulary',
    VIDEOS: 'videos',
    DIALOGUES: 'dialogues',
  };
  
  /* ========================
     🔐 ROLES (PHÂN QUYỀN)
  ======================== */
  export const ROLES = {
    ADMIN_EMAILS: ['admin@gmail.com'],
    TEACHER_EMAILS: ['teacher@gmail.com'],
  };
  
  /* ========================
     🔑 LOCAL STORAGE KEYS
  ======================== */
  export const STORAGE_KEYS = {
    LEARNING_PROGRESS: 'learningProgress',
    VOCABULARY_PROGRESS: 'vocabularyProgress',
    USER_DATA: 'userData',
    SETTINGS: 'settings',
  };
  
  /* ========================
     📊 FIRESTORE FIELD KEYS
  ======================== */
  export const FIELD_KEYS = {
    DATA: 'data',
  };
  
  /* ========================
     ⚙️ FEATURE FLAGS
  ======================== */
  export const FEATURES = {
    ENABLE_LEGACY_PROGRESS_RECOVERY: false,
  };

/* ========================
   Backward-compatible named exports
   (nhiều service cũ vẫn import trực tiếp các hằng này)
======================== */
export const USERS_COLLECTION = COLLECTIONS.USERS;
export const USER_PROGRESS_COLLECTION = COLLECTIONS.USER_PROGRESS;
export const LEADERBOARD_PUBLIC_COLLECTION = COLLECTIONS.LEADERBOARD;
export const CONFIG_COLLECTION = COLLECTIONS.CONFIG;
export const WORD_MEDIA_COLLECTION = COLLECTIONS.WORD_MEDIA;

export const TOPICS_DOC_ID = DOCS.TOPICS;
export const VOCABULARY_DOC_ID = DOCS.VOCABULARY;
export const VIDEOS_DOC_ID = DOCS.VIDEOS;
export const DIALOGUES_DOC_ID = DOCS.DIALOGUES;

export const DATA_FIELD = FIELD_KEYS.DATA;

export const LEARNING_PROGRESS_KEY = STORAGE_KEYS.LEARNING_PROGRESS;
export const VOCABULARY_PROGRESS_KEY = STORAGE_KEYS.VOCABULARY_PROGRESS;
export const USER_DATA_KEY = STORAGE_KEYS.USER_DATA;

export const ADMIN_EMAILS = Array.isArray(ROLES.ADMIN_EMAILS) ? ROLES.ADMIN_EMAILS : [];
export const TEACHER_EMAILS = Array.isArray(ROLES.TEACHER_EMAILS) ? ROLES.TEACHER_EMAILS : [];

export const ENABLE_LEGACY_PROGRESS_RECOVERY = Boolean(
  FEATURES.ENABLE_LEGACY_PROGRESS_RECOVERY,
);