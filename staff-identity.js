'use strict';

function normalizeStaffEmail(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('invalid_staff_email');
  const email = value.trim();
  if (!email) return null;
  const parts = email.split('@');
  const [local, domain] = parts;
  if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
      /[\s<>"(),:;\\\[\]\x00-\x1f\x7f]/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain || domain.split('.').length < 2 || domain.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new Error('invalid_staff_email');
  }
  return local + '@' + domain.toLowerCase();
}

function normalizeStaffLogin(value) {
  if (typeof value !== 'string' || !/^[A-Za-zА-Яа-яЁё0-9_-]{3,32}$/.test(value.trim())) throw new Error('invalid_staff_login');
  return value.trim();
}

function publicStaffProfile(person) {
  const profile = { ...person };
  profile.loginConfigured = person.loginConfigured ?? Boolean(person.passwordHash || person.password_hash);
  for (const key of ['password', 'passwordHash', 'password_hash', 'pin', 'pinHash', 'pin_hash', 'pinCode', 'pin_data_encrypted', 'pin_data_iv', 'pin_data_tag']) delete profile[key];
  return profile;
}

module.exports = { normalizeStaffEmail, normalizeStaffLogin, publicStaffProfile };
