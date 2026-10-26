import { randomUUID } from 'node:crypto';
import { store } from './store.js';

// Ba gói ưu tiên trả phí; VIP thường là miễn phí và hiển thị tối đa 30 ngày.
export const LISTING_DAYS = 30;
export const TIERS = [
  { level: 1, key: 'silver', name: 'Bạc', cost: 1000, days: 3 },
  { level: 2, key: 'gold', name: 'Vàng', cost: 4000, days: 7 },
  { level: 3, key: 'diamond', name: 'Kim cương', cost: 10000, days: 15 }
];
export const tierOf = level => TIERS.find(t => t.level === level) || null;

// Số ngày tin được ưu tiên hiển thị. Đặt PRIORITY_DAYS=0 trong .env nếu muốn ưu tiên vĩnh viễn.
// Đọc lúc gọi hàm (không đọc lúc import) để chắc chắn .env đã được nạp.
export function priorityDays(level = 0) {
  if (Number(level) > 0) return tierOf(Number(level))?.days ?? 0;
  return LISTING_DAYS;
}

// Cấp ưu tiên đang còn hiệu lực của một tin (0 nếu chưa mua hoặc đã hết hạn)
export function effectiveLevel(p, now = Date.now()) {
  if (!p.priorityLevel) return 0;
  if (!p.priorityUntil) return p.priorityLevel;
  return new Date(p.priorityUntil).getTime() > now ? p.priorityLevel : 0;
}

export const publicUser = u => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
  verified: !!u.verified, tokens: u.tokens || 0, avatarUrl: u.avatarUrl || null,
  bio: u.bio || '', pendingPhone: u.pendingPhone || '', phoneChangeStatus: u.phoneChangeStatus || '', createdAt: u.createdAt || null
});

// Dữ liệu tin trả về cho frontend: thêm tích xanh của chủ tin và cấp ưu tiên còn hiệu lực
export function serializeProperty(p) {
  const owner = p.ownerId ? store.users.find(u => u.id === p.ownerId) : null;
  return {
    ...p,
    verified: !!p.verified,
    priorityLevel: effectiveLevel(p),
    ownerVerified: owner ? !!owner.verified : p.ownerVerified === true
  };
}

// Cộng/trừ token và ghi sổ giao dịch. amount > 0: cộng, amount < 0: trừ.
export function addTransaction(user, { type, amount, note, propertyId, createdBy }) {
  user.tokens = (user.tokens || 0) + amount;
  const t = {
    id: randomUUID(), userId: user.id, type, amount, balanceAfter: user.tokens,
    note: String(note || '').slice(0, 200), propertyId: propertyId || null,
    createdBy: createdBy || user.id, createdAt: new Date().toISOString()
  };
  store.tokenTransactions.unshift(t);
  return t;
}

// Kiểm tra và tính phí mua/nâng cấp gói ưu tiên. Nếu đang có gói thấp hơn còn hạn thì chỉ trả phần chênh lệch.
export function planBoost(p, level, user) {
  const tier = tierOf(level);
  if (!tier) return { error: 'Gói ưu tiên không hợp lệ.' };
  if (!['Pending', 'Approved'].includes(p.status)) return { error: 'Tin đã bị từ chối hoặc bị ẩn nên không thể dùng token.' };
  const current = effectiveLevel(p);
  if (level <= current) return { error: `Tin đang ở gói ${tierOf(current).name} (bằng hoặc cao hơn gói đã chọn).` };
  const cost = tier.cost - (current ? tierOf(current).cost : 0);
  const balance = user.tokens || 0;
  if (balance < cost) return { error: `Không đủ token. Cần ${cost.toLocaleString('vi-VN')}, bạn đang có ${balance.toLocaleString('vi-VN')}.` };
  return { tier, cost };
}

// Áp dụng gói: đăng ngay (bỏ qua bước duyệt) + ưu tiên hiển thị
export function applyPriority(p, level) {
  const days = priorityDays(level);
  p.priorityLevel = level;
  p.priorityUntil = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  p.status = 'Approved';
  p.updatedAt = new Date().toISOString();
}

// Dữ liệu demo: một vài tin mẫu có ưu tiên / xác thực để xem giao diện ngay khi chạy
export function seedDemoTokens() {
  const demoLevels = { 4: 3, 5: 2, 7: 1 };
  const verifiedIdx = [0, 2, 4, 6];
  store.properties.forEach((p, i) => {
    p.ownerVerified = true;
    p.verified = verifiedIdx.includes(i);
    p.priorityLevel = 0; p.priorityUntil = null;
    if (demoLevels[i]) applyPriority(p, demoLevels[i]);
  });
}
