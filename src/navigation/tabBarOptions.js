import {Platform, StyleSheet} from 'react-native';
import {COLORS} from '../constants';

/**
 * Style tab bar trùng với MainTabs.
 * Không được set `tabBarStyle: undefined` (sẽ mất padding đáy / safe area → nav bị nhích lên).
 */
export function buildMainTabBarStyle(bottomInset = 0) {
  return {
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.07)',
    elevation: Platform.OS === 'android' ? 14 : 0,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: Platform.OS === 'ios' ? 0.07 : 0,
    shadowRadius: 16,
    paddingTop: 6,
    paddingBottom: Math.max(10, bottomInset),
  };
}
