'use client';
// Checker identity (§7): no password on the floor. First use verifies the
// checker code once and stores the signed device token; every submission
// still re-sends the checker code for attribution.

export function getCheckerCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('checker_code') || '';
}

export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('device_token');
}

export function getCheckerName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('checker_name') || '';
}

export function saveChecker(code: string, deviceToken: string, name?: string) {
  localStorage.setItem('checker_code', code);
  localStorage.setItem('device_token', deviceToken);
  if (name) localStorage.setItem('checker_name', name);
}

export function clearChecker() {
  localStorage.removeItem('checker_code');
  localStorage.removeItem('device_token');
  localStorage.removeItem('checker_name');
}
