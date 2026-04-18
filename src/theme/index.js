/**
 * Design system — đồng bộ giao diện toàn app (cam/kem, bóng đổ, bo góc).
 * Dùng kèm COLORS từ constants.
 */
import {COLORS} from '../constants';

export const THEME = {
  colors: COLORS,

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    pill: 999,
  },

  /** Bóng đổ dùng chung cho card / tab */
  shadow: {
    card: {
      shadowColor: COLORS.PRIMARY_DARK,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 5,
    },
    soft: {
      shadowColor: COLORS.PRIMARY,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    tab: {
      shadowColor: '#000000',
      shadowOffset: {width: 0, height: -3},
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 12,
    },
    floating: {
      shadowColor: COLORS.PRIMARY_DARK,
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
  },

  /** Tham số cho LinearGradient */
  gradient: {
    /** Header / auth hero */
    hero: ['#FF8C38', COLORS.PRIMARY_DARK],
    /** Nền chuyển nhẹ */
    soft: [COLORS.PRIMARY_SOFT, COLORS.BACKGROUND],
    /** Chỉ vạch cam */
    primary: [COLORS.PRIMARY_LIGHT, COLORS.PRIMARY_DARK],
  },
};

export default THEME;
