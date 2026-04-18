import React from 'react';
import {StyleSheet, View} from 'react-native';
import Video from 'react-native-video';

/**
 * Phát URL âm thanh (mp3/m4a) trong app, không mở trình duyệt.
 * Dùng cho flashcard / từ vựng khi không dùng TTS.
 */
export default function InlineAudioPlayer({uri, playKey, onEnd, onError}) {
  if (!uri) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Video
        key={String(playKey)}
        source={{uri}}
        paused={false}
        ignoreSilentSwitch="ignore"
        playInBackground={false}
        playWhenInactive={false}
        onEnd={onEnd}
        onError={onError}
        style={styles.hidden}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hidden: {
    width: 1,
    height: 1,
  },
});
