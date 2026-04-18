import {COLORS} from '../constants';

/**
 * Style tab bar trùng với MainTabs.
 * Không được set `tabBarStyle: undefined` (sẽ mất padding đáy / safe area → nav bị nhích lên).
 */
export function buildMainTabBarStyle(bottomInset = 0) {
  return {
    backgroundColor: COLORS.BACKGROUND,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    paddingTop: 6,
    paddingBottom: Math.max(8, bottomInset),
  };
}
