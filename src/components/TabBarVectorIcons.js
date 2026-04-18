/**
 * Icon tab bar dùng Feather (react-native-vector-icons) — outline, đồng bộ với mock.
 */
import React from 'react';
import Feather from 'react-native-vector-icons/Feather';

/** @type {Record<string, string>} */
const FEATHER_NAMES = {
  home: 'home',
  'book-open': 'book-open',
  video: 'video',
  'message-circle': 'message-circle',
  user: 'user',
};

/**
 * @param {object} props
 * @param {'home'|'book-open'|'video'|'message-circle'|'user'} props.name
 * @param {string} props.color
 * @param {number} [props.size]
 */
export function TabBarVectorIcon({name, color, size = 26}) {
  const iconName = FEATHER_NAMES[name] || 'home';
  return <Feather name={iconName} size={size} color={color} />;
}
