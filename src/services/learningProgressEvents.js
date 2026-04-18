import {DeviceEventEmitter} from 'react-native';

export const LEARNING_PROGRESS_UPDATED = 'LEARNING_PROGRESS_UPDATED';

/**
 * @param {{ resetTopicFilters?: boolean } | void} options — resetTopicFilters: về từ tổng kết, bỏ lọc «Hoàn thành» / ô tìm.
 */
export function emitLearningProgressUpdated(options) {
  DeviceEventEmitter.emit(LEARNING_PROGRESS_UPDATED, options ?? null);
}
