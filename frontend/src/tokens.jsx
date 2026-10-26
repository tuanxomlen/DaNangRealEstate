import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Coins, Crown, Rocket, ShieldCheck, KeyRound, X, Star, Gem, BadgeCheck as GoldCheck } from 'lucide-react';
import { api, digitsOnly, formatDigits, moneyWords } from './api.js';

const fmt = n => Number(n || 0).toLocaleString('vi-VN');

// ===== Cấu hình gói ưu tiên (lấy từ backend, có giá trị dự phòng) =====
const DEFAULT_CFG = {
  tiers: [{ level: 1, name: 'Bạc', cost: 1000, days: 3 }, { level: 2, name: 'Vàng', cost: 4000, days: 7 }, { level: 3, name: 'Kim cương', cost: 10000, days: 15 }],
  priorityDays: 30, listingDays: 30
};
export function useTiers() {
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  useEffect(() => { api('/tokens/config').then(setCfg).catch(() => {}); }, []);
  return cfg;
}
const TIER_ICON = { 1: Star, 2: Crown, 3: Gem };
const TIER_NAME = { 1: 'Bạc', 2: 'Vàng', 3: 'Kim cương' };
const daysText = d => (d > 0 ? `${d} ngày` : 'không giới hạn thời gian');

// ===== Huy hiệu vai trò và xác minh tài khoản (tooltip khi rê chuột) =====
export function VerifiedBadge({ size = 18 }) {
  return <span className="verified-badge broker-verified-badge" title="Môi giới đã được xác thực thông tin cá nhân" aria-label="Môi giới đã được xác thực thông tin cá nhân"><ShieldCheck size={size} fill="#19b7b2" stroke="#fff"/></span>;
}
export function SupportBadge({ size = 17 }) {
  return <span className="verified-badge support-badge" title="Tài khoản đội ngũ support — có quyền quản trị, không thể nâng cấp vai trò người dùng" aria-label="Tài khoản đội ngũ support"><GoldCheck size={size} fill="#e4ad35" stroke="#fff"/></span>;
}
export function AdminBadge({ size = 17 }) {
  return <span className="verified-badge admin-badge" title="Quản trị viên chính thức của DaNangRealEstate" aria-label="Quản trị viên"><BadgeCheck size={size} fill="#1d9bf0" stroke="#fff"/></span>;
}
export function UserRoleBadges({ user, size = 17 }) {
  if (!user) return null;
  return <>{user.role === 'Admin' && <AdminBadge size={size} />}{user.role === 'Support' && <SupportBadge size={size} />}{user.verified && user.role !== 'Admin' && <VerifiedBadge size={size} />}</>;
}

// ===== Nhãn cấp ưu tiên =====
export function TierTag({ level }) {
  if (!level) return null;
  const Icon = TIER_ICON[level] || Star;
  return <span className={`tier-tag tier-${level}`}><Icon size={12}/> VIP {TIER_NAME[level]?.toUpperCase()}</span>;
}
export function VerifiedListingTag() {
  return <span className="verified-listing"><ShieldCheck size={12}/> ĐÃ XÁC THỰC</span>;
}

// ===== Ô nhập tiền: tự chấm phân cách hàng nghìn và hiện chữ dễ đọc (3000000000 -> 3 tỷ) =====
export function MoneyInput({ name, value, onChange, placeholder, required }) {
  const words = moneyWords(value);
  return <>
    <input required={required} inputMode="numeric" autoComplete="off" name={name} value={formatDigits(value)} placeholder={placeholder}
      onChange={e => onChange({ target: { name, value: digitsOnly(e.target.value) } })}/>
    {words && <small className="money-hint">= {words}</small>}
  </>;
}

// ===== Chọn gói khi đăng tin =====
export function TierPicker({ tiers, balance, value, onChange, days }) {
  return <div className="form-section">
    <h3>Gói đăng tin</h3>
    <p className="form-hint tier-balance"><Coins size={14}/> Số dư của bạn: <strong>{fmt(balance)} token</strong> · <Link to="/tokens">Xem bảng token</Link></p>
    <div className="tier-options">
      <label className={`tier-option ${value === 0 ? 'selected' : ''}`}>
        <input type="radio" name="tier" checked={value === 0} onChange={() => onChange(0)}/>
        <strong>Đăng thường</strong><span>Miễn phí</span><small>Hiển thị thường trong 30 ngày · chờ quản trị viên duyệt tin</small>
      </label>
      {tiers.map(t => {
        const can = balance >= t.cost; const Icon = TIER_ICON[t.level] || Star;
        return <label key={t.level} className={`tier-option tier-${t.level} ${value === t.level ? 'selected' : ''} ${can ? '' : 'disabled'}`}>
          <input type="radio" name="tier" disabled={!can} checked={value === t.level} onChange={() => onChange(t.level)}/>
          <strong><Icon size={14}/> Gói {t.name}</strong><span>{fmt(t.cost)} token</span>
          <small>{can ? `Đăng ngay, không chờ duyệt · ưu tiên ${daysText(t.days ?? days)}` : 'Không đủ token'}</small>
        </label>;
      })}
    </div>
  </div>;
}

// ===== Hộp thoại dùng token để đẩy tin đã đăng =====
export function BoostModal({ property, tiers, balance, onClose, onDone }) {
  const current = property.priorityLevel || 0;
  const currentCost = current ? (tiers.find(t => t.level === current)?.cost || 0) : 0;
  const options = tiers.filter(t => t.level > current);
  const [level, setLevel] = useState(options[0]?.level || 0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const chosen = tiers.find(t => t.level === level);
  const cost = chosen ? chosen.cost - currentCost : 0;
  const submit = async () => {
    setBusy(true); setError('');
    try { const d = await api(`/properties/${property.id}/boost`, { method: 'POST', body: JSON.stringify({ level }) }); onDone(d.message); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
    <h3><Rocket size={18}/> Ưu tiên hiển thị tin</h3>
    <p className="form-hint">{property.title}<br/>Số dư: <strong>{fmt(balance)} token</strong>{current > 0 && <> · Đang ở gói {TIER_NAME[current]} (chỉ trả phần chênh lệch khi nâng cấp)</>}</p>
    {options.length === 0 ? <p>Tin này đang ở gói cao nhất.</p> : <div className="tier-options tier-options-col">
      {options.map(t => { const c = t.cost - currentCost; const can = balance >= c; const Icon = TIER_ICON[t.level] || Star;
        return <label key={t.level} className={`tier-option tier-${t.level} ${level === t.level ? 'selected' : ''} ${can ? '' : 'disabled'}`}>
          <input type="radio" name="boost" disabled={!can} checked={level === t.level} onChange={() => setLevel(t.level)}/>
          <strong><Icon size={14}/> Gói {t.name}</strong><span>{fmt(c)} token</span><small>{can ? `Duyệt ngay · ưu tiên ${daysText(t.days ?? 0)}` : 'Không đủ token'}</small>
        </label>; })}
    </div>}
    {error && <div className="error-message">{error}</div>}
    <div className="form-actions">
      <button className="btn btn-outline" onClick={onClose}>Hủy</button>
      <button className="btn btn-primary" disabled={busy || !chosen || balance < cost} onClick={submit}>{busy ? 'Đang xử lý...' : `Dùng ${fmt(cost)} token`}</button>
    </div>
  </div></div>;
}

// ===== Trang điểm token của người dùng =====
const TYPE_LABEL = { grant: 'Được cấp', revoke: 'Bị thu hồi', spend: 'Sử dụng' };
export function TokensPage({ user, refreshUser }) {
  const { tiers, priorityDays } = useTiers();
  const [data, setData] = useState({ balance: 0, transactions: [] }); const [error, setError] = useState('');
  useEffect(() => { if (user) { api('/tokens/me').then(setData).catch(e => setError(e.message)); refreshUser?.(); } }, [user?.id]);
  if (!user) return <main className="container page-main"><div className="empty-state"><KeyRound size={34}/><h2>Đăng nhập để xem điểm token</h2><Link to="/login" className="btn btn-primary">Đăng nhập</Link></div></main>;
  return <main className="container page-main">
    <div className="page-title-row"><div><span className="section-kicker">ĐIỂM TOKEN</span><h1>Token & gói ưu tiên</h1><p>Dùng token để đăng tin ngay không cần duyệt và đưa tin lên đầu trang.</p></div></div>
    {error && <div className="error-message">{error}</div>}
    <div className="token-balance panel">
      <span className="token-coin"><Coins size={30}/></span>
      <div><small>Số dư hiện tại</small><strong>{fmt(data.balance)} <em>token</em></strong>
        <p>Token do quản trị viên cấp cho tài khoản. Cần thêm token vui lòng liên hệ quản trị viên.</p></div>
    </div>
    <div className="section-heading token-heading"><div><span className="section-kicker">BẢNG GÓI</span><h2>3 gói VIP ưu tiên hiển thị</h2><p className="form-hint">VIP thường: hiển thị 30 ngày. VIP Bạc: 3 ngày; VIP Vàng: 7 ngày; VIP Kim cương: 15 ngày ưu tiên.</p></div></div>
    <div className="tier-cards">
      {tiers.map(t => { const Icon = TIER_ICON[t.level] || Star; return <div key={t.level} className={`tier-card tier-${t.level}`}>
        <span className="tier-card-icon"><Icon size={22}/></span><h3>Gói {t.name}</h3><div className="tier-card-cost">{fmt(t.cost)} <small>token</small></div>
        <ul><li>Đăng tin ngay, bỏ qua bước duyệt</li><li>Ưu tiên hiển thị đầu trang ({daysText(t.days ?? priorityDays)})</li><li>Khung tin màu {t.level === 1 ? 'bạc' : t.level === 2 ? 'vàng' : 'kim cương'}</li>{t.level > 1 && <li>Xếp trên các gói thấp hơn</li>}</ul>
      </div>; })}
    </div>
    <div className="token-links"><Link to="/post" className="btn btn-primary"><Coins size={16}/> Đăng tin bằng token</Link><Link to="/my-properties" className="btn btn-outline"><Rocket size={16}/> Ưu tiên tin đã đăng</Link></div>
    <div className="section-heading token-heading"><div><span className="section-kicker">LỊCH SỬ</span><h2>Giao dịch token</h2></div></div>
    {data.transactions.length ? <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Loại</th><th>Số token</th><th>Số dư sau</th><th>Ghi chú</th></tr></thead><tbody>
      {data.transactions.map(t => <tr key={t.id}><td>{new Date(t.createdAt).toLocaleString('vi-VN')}</td><td>{TYPE_LABEL[t.type] || t.type}</td><td className={t.amount > 0 ? 'amount-plus' : 'amount-minus'}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td><td>{fmt(t.balanceAfter)}</td><td>{t.note}</td></tr>)}
    </tbody></table></div> : <div className="empty-state"><Coins size={32}/><h3>Chưa có giao dịch token</h3><p>Khi quản trị viên cấp token hoặc bạn sử dụng token, lịch sử sẽ hiện ở đây.</p></div>}
  </main>;
}

// ===== Tab Token trong trang Admin =====
export function TokensAdmin({ onChanged }) {
  const [data, setData] = useState({ users: [], transactions: [], totalIssued: 0 });
  const [userId, setUserId] = useState(''); const [mode, setMode] = useState('grant'); const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => api('/admin/tokens').then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const submit = async e => {
    e.preventDefault(); setError(''); setMsg(''); setBusy(true);
    try {
      const n = Number(amount) * (mode === 'grant' ? 1 : -1);
      const d = await api('/admin/tokens/grant', { method: 'POST', body: JSON.stringify({ userId, amount: n, note }) });
      setMsg(d.message); setAmount(''); setNote(''); await load(); onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div>
    <div className="panel token-admin-form">
      <h3><Coins size={17}/> Phát / thu hồi token</h3>
      <form onSubmit={submit} className="token-admin-grid">
        <label>ID tài khoản<input required value={userId} onChange={e => setUserId(e.target.value.trim())} placeholder="Dán ID tài khoản UUID tại đây" autoComplete="off"/></label>
        <label>Thao tác<select value={mode} onChange={e => setMode(e.target.value)}><option value="grant">Cấp token</option><option value="revoke">Thu hồi token</option></select></label>
        <label>Số token<input required type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ví dụ: 5000"/></label>
        <label className="token-note">Ghi chú<input value={note} maxLength="200" onChange={e => setNote(e.target.value)} placeholder="Lý do cấp / thu hồi (không bắt buộc)"/></label>
        <div className="token-chips">{[1000, 4000, 10000].map(v => <button type="button" key={v} className="btn btn-outline btn-small" onClick={() => setAmount(String(v))}>{fmt(v)}</button>)}</div>
        <button className="btn btn-primary" disabled={busy || !userId}>{busy ? 'Đang xử lý...' : mode === 'grant' ? 'Cấp token' : 'Thu hồi token'}</button>
      </form>
      {error && <div className="error-message">{error}</div>}{msg && <div className="success-message">{msg}</div>}
      <p className="form-hint">Nhập ID duy nhất của người dùng trong trang cá nhân của họ. Tổng token đã cấp từ trước đến nay: <strong>{fmt(data.totalIssued)}</strong></p>
    </div>
    <h4 className="token-sub">Số dư token theo tài khoản</h4>
    <div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Email</th><th>ID tài khoản</th><th>Xác minh</th><th>Số dư token</th><th></th></tr></thead><tbody>
      {data.users.map(u => <tr key={u.id}><td>{u.name}{u.verified && <VerifiedBadge/>}</td><td>{u.email}</td><td><code className="user-id-code">{u.id}</code></td><td>{u.verified ? 'Đã xác minh' : '—'}</td><td><strong>{fmt(u.tokens)}</strong></td><td><button type="button" className="btn btn-outline btn-small" onClick={() => setUserId(u.id)}>Chọn ID</button></td></tr>)}
    </tbody></table></div>
    <h4 className="token-sub">Giao dịch gần đây</h4>
    {data.transactions.length ? <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Loại</th><th>Số token</th><th>Số dư sau</th><th>Ghi chú</th></tr></thead><tbody>
      {data.transactions.map(t => <tr key={t.id}><td>{new Date(t.createdAt).toLocaleString('vi-VN')}</td><td>{t.userName}</td><td>{TYPE_LABEL[t.type] || t.type}</td><td className={t.amount > 0 ? 'amount-plus' : 'amount-minus'}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td><td>{fmt(t.balanceAfter)}</td><td>{t.note}</td></tr>)}
    </tbody></table></div> : <div className="empty-state">Chưa có giao dịch token.</div>}
  </div>;
}
