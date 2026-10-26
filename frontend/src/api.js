const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getToken() { return localStorage.getItem('dnre_token'); }
export function getWebSocketUrl() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  const wsBase = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:').replace(/\/api\/?$/i, '');
  return `${wsBase}/ws?token=${encodeURIComponent(getToken() || '')}`;
}
export function saveSession(data) {
  if (data?.token) localStorage.setItem('dnre_token', data.token);
  if (data?.user) localStorage.setItem('dnre_user', JSON.stringify(data.user));
}
export function clearSession() {
  localStorage.removeItem('dnre_token');
  localStorage.removeItem('dnre_user');
}
export function getSavedUser() {
  try { return JSON.parse(localStorage.getItem('dnre_user') || 'null'); } catch { return null; }
}
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Yêu cầu thất bại (${response.status})`);
  return data;
}
export const money = (value, transaction) => {
  const n = Number(value || 0);
  if (transaction === 'Cho thuê' || n < 100000000) {
    if (n >= 1000000) return `${(n / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu/tháng`;
    return `${n.toLocaleString('vi-VN')} đ/tháng`;
  }
  if (n >= 1000000000) return `${(n / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  return `${(n / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} triệu`;
};

// ----- Hiển thị tiền dễ đọc khi nhập: 3000000000 -> "3 tỷ", 3250000000 -> "3 tỷ 250 triệu" -----
export const digitsOnly = v => String(v ?? '').replace(/\D/g, '').slice(0, 13);
export const formatDigits = v => { const d = digitsOnly(v); return d ? Number(d).toLocaleString('vi-VN') : ''; };
export function moneyWords(value) {
  const n = Math.floor(Number(value || 0));
  if (!Number.isFinite(n) || n <= 0) return '';
  const ty = Math.floor(n / 1e9), tr = Math.floor((n % 1e9) / 1e6), ng = Math.floor((n % 1e6) / 1e3), d = n % 1e3;
  const parts = [];
  if (ty) parts.push(`${ty.toLocaleString('vi-VN')} tỷ`);
  if (tr) parts.push(`${tr} triệu`);
  if (ng) parts.push(`${ng} nghìn`);
  if (d) parts.push(`${d} đồng`);
  return parts.join(' ');
}
