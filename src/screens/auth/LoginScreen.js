import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {COLORS} from '../../constants';
import {THEME} from '../../theme';

function getAuthService() {
  try {
    return require('../../services/firebaseService');
  } catch (_) {
    return null;
  }
}

const LoginScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = useCallback(async () => {
    setError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Email không hợp lệ');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    const auth = getAuthService();
    if (!auth) {
      setError('Tính năng đăng nhập chưa khả dụng.');
      return;
    }

    setLoading(true);
    try {
      const result = await auth.signInWithEmail(trimmedEmail, password);
      if (result.ok) {
        // AuthStack/MainStack sẽ tự đổi theo trạng thái đăng nhập
      } else {
        setError(result.error || 'Đăng nhập thất bại.');
      }
    } catch (e) {
      setError(e?.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  const handleGoogleLogin = useCallback(async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const auth = getAuthService();
      if (!auth?.signInWithGoogle) {
        setError('Đăng nhập Google chưa khả dụng.');
        return;
      }
      const result = await auth.signInWithGoogle();
      if (!result.ok) {
        setError(result.error || 'Đăng nhập Google thất bại.');
      }
    } catch (e) {
      setError(e?.message || 'Đăng nhập Google thất bại.');
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const goToRegister = useCallback(() => {
    navigation.navigate('Register');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={THEME.gradient.hero}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.hero}>
        <View style={styles.brandWrap}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>📚</Text>
          </View>
          <Text style={styles.brandTitle}>EasyEng</Text>
          <Text style={styles.brandSubtitle}>Học tiếng Anh mỗi ngày</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.scrollContent}>
          <View style={[styles.card, THEME.shadow.card]}>
            <Text style={styles.cardTitle}>Đăng nhập</Text>
            <Text style={styles.cardSubtitle}>
              Nhập thông tin của bạn để tiếp tục
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>✉</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={COLORS.TEXT_LIGHT}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setError('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading && !googleLoading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Mật khẩu</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={[styles.input, styles.inputPassword]}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.TEXT_LIGHT}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError('');
                  }}
                  secureTextEntry={!showPassword}
                  editable={!loading && !googleLoading}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading || googleLoading}
                  hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <View style={styles.forgotWrap}>
              <TouchableOpacity
                disabled={loading || googleLoading}
                onPress={() =>
                  Alert.alert(
                    'Quên mật khẩu',
                    'Chức năng quên mật khẩu đang phát triển.',
                  )
                }
              >
                <Text style={styles.forgotLink}>Quên mật khẩu?</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[
                styles.loginBtn,
                loading && styles.loginBtnDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.BACKGROUND_WHITE} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Đăng nhập</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>HOẶC</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Login */}
            <TouchableOpacity
              style={[
                styles.googleBtn,
                googleLoading && styles.googleBtnDisabled,
              ]}
              onPress={handleGoogleLogin}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color={COLORS.TEXT} size="small" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleBtnText}>Đăng nhập với Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Sign Up Link */}
            <View style={styles.signupWrap}>
              <Text style={styles.signupText}>Chưa có tài khoản? </Text>
              <TouchableOpacity
                onPress={goToRegister}
                disabled={loading || googleLoading}
              >
                <Text style={styles.signupLink}>Đăng ký ngay</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Bằng việc đăng nhập, bạn đồng ý với{' '}
            <Text style={styles.footerLink}>Điều khoản sử dụng</Text>
            {' '}và{' '}
            <Text style={styles.footerLink}>Chính sách bảo mật</Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  hero: {
    paddingTop: 12,
    paddingBottom: 52,
    paddingHorizontal: 24,
    borderBottomLeftRadius: THEME.radius.xxl,
    borderBottomRightRadius: THEME.radius.xxl,
  },
  keyboardView: {
    flex: 1,
    marginTop: -36,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  brandWrap: {
    alignItems: 'center',
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoEmoji: {
    fontSize: 32,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.BACKGROUND_WHITE,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: THEME.radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY_SOFT,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.TEXT,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: COLORS.ERROR + '15',
    borderWidth: 1,
    borderColor: COLORS.ERROR + '40',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.ERROR,
  },
  fieldWrap: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 12,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
    color: COLORS.TEXT_SECONDARY,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: COLORS.TEXT,
    paddingVertical: 0,
  },
  inputPassword: {
    paddingRight: 8,
  },
  eyeBtn: {
    padding: 8,
  },
  eyeIcon: {
    fontSize: 18,
  },
  forgotWrap: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  forgotLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },
  loginBtn: {
    height: 48,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.BACKGROUND_WHITE,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.BORDER,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  googleBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  signupWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signupText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },
  footer: {
    marginTop: 24,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  footerLink: {
    textDecorationLine: 'underline',
    color: COLORS.TEXT,
  },
});

export default LoginScreen;
