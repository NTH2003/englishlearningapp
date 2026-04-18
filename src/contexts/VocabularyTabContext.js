import React from 'react';

/**
 * Khi màn Từ vựng dùng top tab Học / Ôn tập, ôn tập cần chuyển tab thay vì navigation.goBack().
 */
export const VocabularyTabContext = React.createContext({
  /** @type {'bundles' | 'review' | null} */
  activeTab: null,
  /** @type {(t: 'bundles' | 'review') => void} */
  setTab: () => {},
  /** TopicSelection bỏ paddingTop (SafeArea đã xử lý ở VocabularyRoot) */
  embedInRoot: false,
});
