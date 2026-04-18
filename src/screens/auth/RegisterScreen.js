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

const RegisterScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = useCallback(async () => {
    setError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password || !confirmPassword) {
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
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    const auth = getAuthService();
    if (!auth) {
      setError('Tính năng đăng ký chưa khả dụng.');
      return;
    }

    setLoading(true);
    try {
      const result = await auth.signUpWithEmail(trimmedEmail, password);
      if (result.ok) {
        setError('');
        Alert.alert(
          'Thành công',
          'Đăng ký thành công. Bạn có thể đăng nhập ngay.',
          [
            {
              text: 'OK',
              onPress: async () => {
                // Đảm bảo sau khi đăng ký xong vẫn phải đăng nhập mới vào Home
                try {
                  await auth.signOut?.();
                } catch (_) {
                  // ignore
                }
                navigation.navigate('Login');
              },
            },
          ],
        );
      } else {
        setError(result.error || 'Đăng ký thất bại.');
      }
    } catch (e) {
      setError(e?.message || 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, navigation]);

  const goToLogin = useCallback(() => {
    navigation.navigate('Login');
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
            <Text style={styles.cardTitle}>Đăng ký</Text>
            <Text style={styles.cardSubtitle}>
              Tạo tài khoản để đồng bộ tiến độ học tập
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
                  editable={!loading}
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
                  placeholder="Ít nhất 6 ký tự"
                  placeholderTextColor={COLORS.TEXT_LIGHT}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError('');
                  }}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Xác nhận mật khẩu</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={[styles.input, styles.inputPassword]}
                  placeholder="Nhập lại mật khẩu"
                  placeholderTextColor={COLORS.TEXT_LIGHT}
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    setError('');
                  }}
                  secureTextEntry={!showConfirmPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                  hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                >
                  <Text style={styles.eyeIcon}>
                    {showConfirmPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.BACKGROUND_WHITE} size="small" />
              ) : (
                <Text style={styles.registerBtnText}>Đăng ký</Text>
              )}
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.loginWrap}>
              <Text style={styles.loginText}>Đã có tài khoản? </Text>
              <TouchableOpacity onPress={goToLogin} disabled={loading}>
                <Text style={styles.loginLink}>Đăng nhập</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Bằng việc đăng ký, bạn đồng ý với{' '}
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
  registerBtn: {
    height: 48,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  registerBtnDisabled: {
    opacity: 0.7,
  },
  registerBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.BACKGROUND_WHITE,
  },
  loginWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  loginLink: {
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

export default RegisterScreen;
