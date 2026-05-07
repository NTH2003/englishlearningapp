/**
 * Quyền admin / giáo viên / người học — chỉ đọc Firebase Auth + danh sách email.
 */
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {ROLES} from './constants';

const authInstance = getAuth(getApp());
const ADMIN_EMAILS = Array.isArray(ROLES?.ADMIN_EMAILS) ? ROLES.ADMIN_EMAILS : [];
const TEACHER_EMAILS = Array.isArray(ROLES?.TEACHER_EMAILS)
  ? ROLES.TEACHER_EMAILS
  : [];

export function getCurrentUser() {
  return authInstance.currentUser;
}

export function isAdminEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (ADMIN_EMAILS.includes(normalized)) return true;
  const local = normalized.split('@')[0] || '';
  return local === 'admin' || local === 'administrator';
}

export function isTeacherEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (TEACHER_EMAILS.includes(normalized)) return true;
  const local = normalized.split('@')[0] || '';
  return local === 'teacher' || local === 'giaovien';
}

export function isCurrentUserAdmin() {
  const user = getCurrentUser();
  if (!user || user.isAnonymous || !user.email) return false;
  return isAdminEmail(user.email);
}

export function getCurrentUserRole() {
  const user = getCurrentUser();
  if (!user || user.isAnonymous || !user.email) return 'learner';
  const email = String(user.email).trim().toLowerCase();
  if (isAdminEmail(email)) return 'admin';
  if (isTeacherEmail(email)) return 'teacher';
  return 'learner';
}

export function canAccessAdminPanel() {
  const role = getCurrentUserRole();
  return role === 'admin' || role === 'teacher';
}

export function canManageUsers() {
  return getCurrentUserRole() === 'admin';
}
