import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Heart, MapPin, BedDouble, Ruler, ArrowRight, Menu, X, UserRound, Plus, Building2, ShieldCheck, Eye, Trash2, Pencil, LogOut, LayoutDashboard, CheckCircle, SlidersHorizontal, Phone, KeyRound, Coins, Rocket, Users, MessageCircle, Send, ArrowLeft, Flag, Clock, Settings, Sun, Moon, Bell, Megaphone, CheckCheck, CalendarDays, Calculator, MapPinned, ExternalLink, List, Newspaper, RefreshCw, Clock3 } from 'lucide-react';
import { api, clearSession, getSavedUser, getToken, getWebSocketUrl, money, moneyWords, saveSession } from './api.js';
import { VerifiedBadge, SupportBadge, AdminBadge, UserRoleBadges, TierTag, VerifiedListingTag, MoneyInput, TierPicker, BoostModal, TokensPage, TokensAdmin, useTiers } from './tokens.jsx';

const FALLBACK = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80';
const districts = ['Hải Châu','Sơn Trà','Ngũ Hành Sơn','Thanh Khê','Liên Chiểu','Cẩm Lệ','Hòa Vang'];
const categories = ['Đất nền','Nhà riêng','Căn hộ','Biệt thự','Mặt bằng','Khách sạn','Phòng trọ'];
function useAuth() {
  const [user, setUser] = useState(getSavedUser());
  const logout = () => { clearSession(); setUser(null); };
  // Lấy lại thông tin mới nhất (số dư token, tích xanh...) từ server
  const refreshUser = useCallback(() => api('/auth/me').then(d => { saveSession({ user: d.user }); setUser(d.user); }).catch(() => {}), []);
  useEffect(() => { if (getToken()) refreshUser(); }, [refreshUser]);
  return { user, setUser, logout, refreshUser };
}
function Header({ user, logout, theme, toggleTheme }) {
  const [mobile, setMobile] = useState(false);
  const [showMeMenu, setShowMeMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (!user) { setUnread(0); setUnreadMessages(0); return; }
    let active = true;
    const refresh = () => {
      api('/notifications').then(d => { if (active) setUnread(d.unread || 0); }).catch(() => {});
      api('/messages/conversations').then(d => { if (active) setUnreadMessages((d.items || []).reduce((sum, c) => sum + Number(c.unreadCount || 0), 0)); }).catch(() => {});
    };
    refresh(); const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.id, location.pathname]);
  const currentTransaction = new URLSearchParams(location.search).get('transaction');
  return <header className="header">
    <div className="container header-inner">
      <div className="header-top">
        <Link className="brand" to="/"><span className="brand-icon"><Building2 size={22}/></span><span>DaNang<span className="brand-accent">RealEstate</span><small>BẤT ĐỘNG SẢN ĐÀ NẴNG</small></span></Link>
        <div className="header-account">
          {user ? <>
            <Link className="notification-link" to="/notifications" title="Thông báo"><Bell size={18}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</Link>
            <Link className="account-token" to="/profile"><Coins size={16}/><span>{Number(user.tokens || 0).toLocaleString('vi-VN')} token</span></Link>
            <Link className="header-contact-link" to="/messages" title="Liên hệ, xem tin nhắn mới"><MessageCircle size={17}/><span>Liên hệ</span>{unreadMessages>0&&<span className="contact-unread-badge">{unreadMessages>99?'99+':unreadMessages}</span>}</Link>
            <div className={`account-me-menu ${showMeMenu ? 'is-open' : ''}`}>
              <button type="button" className="account-me" aria-expanded={showMeMenu} onClick={() => setShowMeMenu(v => !v)}>{user.avatarUrl ? <img className="header-avatar" src={user.avatarUrl} alt="Ảnh đại diện"/> : <UserRound size={17}/>}<span>Tôi</span><small>{user.name}</small></button>
              {showMeMenu && <div className="nav-me-dropdown account-me-dropdown">
                <NavLink to="/my-properties" onClick={() => setShowMeMenu(false)}><Building2 size={16}/> Tin của tôi</NavLink>
                <NavLink to="/messages" onClick={() => setShowMeMenu(false)}><MessageCircle size={16}/> Tin nhắn</NavLink>
                <NavLink to="/tools/calculator" onClick={() => setShowMeMenu(false)}><Calculator size={16}/> Tính khoản vay</NavLink>
                <NavLink to="/appointments" onClick={() => setShowMeMenu(false)}><CalendarDays size={16}/> Lịch xem nhà</NavLink>
                <NavLink to="/favorites" onClick={() => setShowMeMenu(false)}><Heart size={16}/> Tin yêu thích</NavLink>
                <NavLink to="/notifications" onClick={() => setShowMeMenu(false)}><Bell size={16}/> Thông báo {unread > 0 ? `(${unread})` : ''}</NavLink>
                <NavLink to="/profile" onClick={() => setShowMeMenu(false)}><Settings size={16}/> Tài khoản của tôi</NavLink>
                {['Admin','Support'].includes(user.role) && <NavLink to="/admin" onClick={() => setShowMeMenu(false)}><ShieldCheck size={16}/> {user.role === 'Support' ? 'Đội ngũ Support' : 'Quản trị viên'}</NavLink>}
                <button type="button" className="account-dropdown-logout" onClick={() => { setShowMeMenu(false); logout(); }}><LogOut size={16}/> Đăng xuất</button>
              </div>}
            </div>
          </> : <><Link className="btn btn-outline btn-small" to="/login">Đăng nhập</Link><Link className="btn btn-primary btn-small" to="/register">Tạo tài khoản</Link></>}
          {user && <Link className="header-post-link" to="/post" onClick={() => { setMobile(false); setShowMeMenu(false); }}><Plus size={15}/><span>Đăng tin</span></Link>}
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} aria-label="Đổi giao diện sáng tối">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}<span>{theme === 'dark' ? 'Sáng' : 'Tối'}</span></button>
          <button className="icon-btn mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Mở menu">{mobile ? <X/> : <Menu/>}</button>
        </div>
      </div>
      <nav className={`nav-links ${mobile ? 'open' : ''}`}>
        <NavLink to="/" end onClick={() => setMobile(false)}>Trang chủ</NavLink>
        <NavLink to="/properties?transaction=B%C3%A1n" className={() => currentTransaction === 'Bán' ? 'active' : ''} onClick={() => setMobile(false)}>Mua bán</NavLink>
        <NavLink to="/properties?transaction=Cho%20thu%C3%AA" className={() => currentTransaction === 'Cho thuê' ? 'active' : ''} onClick={() => setMobile(false)}>Cho thuê</NavLink>
        <NavLink to="/agents" onClick={() => { setMobile(false); setShowMeMenu(false); }}><Users size={15}/> Nhà môi giới</NavLink>
        <NavLink to="/map" onClick={() => { setMobile(false); setShowMeMenu(false); }}><MapPinned size={15}/> Bản đồ</NavLink>
        <NavLink to="/news" onClick={() => { setMobile(false); setShowMeMenu(false); }}><Newspaper size={15}/> Tin tức</NavLink>
        {['Admin','Support'].includes(user?.role) && <NavLink className="admin-nav-link" to="/admin" onClick={() => setMobile(false)}><ShieldCheck size={15}/> {user.role === 'Support' ? 'Đội ngũ Support' : 'Quản trị viên'}</NavLink>}
      </nav>
    </div>
  </header>;
}
function PropertyCard({ p, favorite, onFavorite }) {
  return <article className={`property-card ${p.priorityLevel > 0 ? `tier-${p.priorityLevel}` : ''}`}>
    <div className="property-image-wrap"><Link to={`/properties/${p.id}`}><img className="property-image" src={p.coverImage || p.images?.[0] || FALLBACK} onError={e => { e.currentTarget.src = FALLBACK; }} alt={p.title}/></Link>
      <span className={`pill ${p.transaction === 'Cho thuê' ? 'pill-rent' : ''}`}>{p.transaction}</span>
      {p.featured && <span className="featured-tag">NỔI BẬT</span>}
      <TierTag level={p.priorityLevel}/>{p.verified && <VerifiedListingTag/>}
      <button className={`favorite-btn ${favorite ? 'is-favorite' : ''}`} onClick={() => onFavorite(p)} title="Thêm/bỏ yêu thích"><Heart size={19} fill={favorite ? 'currentColor' : 'none'}/></button>
    </div>
    <div className="property-content"><div className="property-price">{money(p.price, p.transaction)}</div><Link className="property-title" to={`/properties/${p.id}`}>{p.title}</Link>
      <div className="property-location"><MapPin size={15}/>{p.district}, Đà Nẵng</div>
      <div className="property-owner"><UserRound size={14}/>{p.ownerId?<Link to={`/agents/${p.ownerId}`}>{p.ownerName}</Link>:p.ownerName}{p.ownerRole === 'Admin' ? <AdminBadge size={15}/> : p.ownerRole === 'Support' ? <SupportBadge size={15}/> : p.ownerVerified && <VerifiedBadge size={15}/>}</div>
      <div className="property-posted-date"><Clock size={13}/> Đăng ngày {p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '—'}</div>
      <div className="property-meta"><span><Ruler size={15}/>{p.area} m²</span><span><BedDouble size={15}/>{p.bedrooms || '—'} PN</span><span><Eye size={15}/>{p.views || 0}</span></div>
    </div>
  </article>;
}
function Footer() {
  return <footer className="footer"><div className="container footer-grid"><div><Link className="brand brand-light" to="/"><span className="brand-icon"><Building2 size={22}/></span><span>DaNang<span className="brand-accent">RealEstate</span><small>BẤT ĐỘNG SẢN ĐÀ NẴNG</small></span></Link><p>Nền tảng tìm kiếm và khám phá bất động sản tại Đà Nẵng.</p></div><div><strong>Khám phá</strong><Link to="/properties">Mua bán nhà đất</Link><Link to="/map">Bản đồ bất động sản</Link><Link to="/tools/calculator">Tính khoản vay</Link><Link to="/appointments">Lịch xem nhà</Link><Link to="/properties?transaction=Cho%20thu%C3%AA">Bất động sản cho thuê</Link><Link to="/post">Đăng tin bất động sản</Link><Link to="/tokens">Điểm token & gói ưu tiên</Link></div><div><strong>Khu vực phổ biến</strong>{districts.slice(0,4).map(d => <Link key={d} to={`/properties?district=${encodeURIComponent(d)}`}>{d}</Link>)}</div><div><strong>Liên hệ</strong><span><MapPin size={15}/> Đà Nẵng, Việt Nam</span><a href="mailto:lenhotuan14092005@gmail.com"><span><span aria-hidden="true">✉</span> Email: lenhotuan14092005@gmail.com</span></a><a href="tel:0374094678"><span><Phone size={15}/> Điện thoại: 0374094678</span></a><a href="https://zalo.me/0374094678" target="_blank" rel="noreferrer"><span><MessageCircle size={15}/> Zalo: 0374094678</span></a></div></div><div className="footer-bottom">© {new Date().getFullYear()} DaNangRealEstate. Website demo.</div></footer>;
}
function Home({ user }) {
  const [items, setItems] = useState([]); const [q, setQ] = useState(''); const [transaction, setTransaction] = useState(''); const [district, setDistrict] = useState('');
  useEffect(() => { api('/properties?limit=10').then(d => setItems(d.items)).catch(() => {}); }, []);
  const search = () => { const params = new URLSearchParams(); if(q) params.set('q',q); if(transaction) params.set('transaction',transaction); if(district) params.set('district',district); window.location.href = `/properties?${params.toString()}`; };
  const favorite = async p => { if (!user) return alert('Vui lòng đăng nhập để sử dụng yêu thích.'); try { await api(`/favorites/${p.id}`, { method:'POST' }); alert('Đã thêm vào danh sách yêu thích.'); } catch(e) { alert(e.message); } };
  return <><section className="hero"><div className="hero-overlay"></div><div className="container hero-inner"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot"></span> KHÁM PHÁ BẤT ĐỘNG SẢN ĐÀ NẴNG</span><h1>Tìm nơi gọi là <span>nhà.</span><br/>Bắt đầu từ đây.</h1><p>Khám phá nhà đất, căn hộ và cơ hội đầu tư tại thành phố đáng sống.</p>
    <div className="search-panel"><div className="search-field"><label>Từ khóa</label><div><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tên bất động sản, khu vực..."/></div></div><div className="search-field"><label>Nhu cầu</label><select value={transaction} onChange={e=>setTransaction(e.target.value)}><option value="">Tất cả</option><option>Bán</option><option>Cho thuê</option></select></div><div className="search-field"><label>Khu vực</label><select value={district} onChange={e=>setDistrict(e.target.value)}><option value="">Tất cả Đà Nẵng</option>{districts.map(d=><option key={d}>{d}</option>)}</select></div><button className="btn btn-primary search-submit" onClick={search}><Search size={18}/> Tìm kiếm</button></div>
    <div className="hero-trust"><span><CheckCircle size={16}/> Bộ lọc linh hoạt</span><span><CheckCircle size={16}/> Quản lý tin minh bạch</span><span><CheckCircle size={16}/> Dành riêng Đà Nẵng</span></div></div></div></section>
    <section className="section container"><div className="section-heading"><div><span className="section-kicker">DANH SÁCH MỚI</span><h2>Bất động sản nổi bật</h2><p>Khám phá các tin đăng đang hiển thị trên hệ thống demo.</p></div><Link className="text-link" to="/properties">Xem tất cả <ArrowRight size={17}/></Link></div>
      {items.length ? <div className="property-grid home-property-grid">{items.slice(0,10).map(p=><PropertyCard key={p.id} p={p} favorite={false} onFavorite={favorite}/>)}</div> : <div className="empty-state"><Building2 size={36}/><h3>Đang tải danh sách...</h3><p>Nếu chưa có dữ liệu, hãy kiểm tra backend đã chạy chưa.</p></div>}
    </section>
    <section className="benefit-band"><div className="container benefit-grid"><div><span className="benefit-icon"><Search/></span><h3>Tìm kiếm dễ dàng</h3><p>Lọc theo nhu cầu, giá, diện tích và khu vực.</p></div><div><span className="benefit-icon"><ShieldCheck/></span><h3>Quy trình duyệt tin</h3><p>Tin đăng mới được gửi Admin kiểm tra trước khi công khai.</p></div><div><span className="benefit-icon"><Heart/></span><h3>Lưu tin yêu thích</h3><p>Lưu lại những lựa chọn phù hợp với bạn.</p></div></div></section>
    <section className="cta container"><div><span className="section-kicker">BẠN CÓ BẤT ĐỘNG SẢN?</span><h2>Đăng tin và tiếp cận khách hàng</h2><p>Tạo tin đăng, bổ sung thông tin và gửi duyệt ngay trên hệ thống.</p></div><Link to="/post" className="btn btn-orange">Đăng tin ngay <ArrowRight size={18}/></Link></section>
  </>;
}
function Properties({ user }) {
  const [params, setParams] = useSearchParams();
  const [q,setQ] = useState(params.get('q')||''); const [district,setDistrict]=useState(params.get('district')||''); const [category,setCategory]=useState(params.get('category')||''); const [transaction,setTransaction]=useState(params.get('transaction')||''); const [sort,setSort]=useState(params.get('sort')||'newest'); const [minPrice,setMinPrice]=useState(params.get('minPrice')||''); const [maxPrice,setMaxPrice]=useState(params.get('maxPrice')||''); const [verifiedOnly,setVerifiedOnly]=useState(params.get('verified')==='true');
  const [items,setItems]=useState([]); const [total,setTotal]=useState(0); const [viewMode,setViewMode]=useState('list'); const [page,setPage]=useState(1); const [loading,setLoading]=useState(true); const [favorites,setFavorites]=useState([]);
  // Đồng bộ bộ lọc với URL mỗi khi chuyển trực tiếp giữa Mua bán và Cho thuê.
  // Tránh giữ transaction cũ khi component Properties vẫn được tái sử dụng.
  useEffect(() => {
    setQ(params.get('q') || '');
    setDistrict(params.get('district') || '');
    setCategory(params.get('category') || '');
    setTransaction(params.get('transaction') || '');
    setSort(params.get('sort') || 'newest');
    setMinPrice(params.get('minPrice') ? String(Number(params.get('minPrice')) / 1000000) : '');
    setMaxPrice(params.get('maxPrice') ? String(Number(params.get('maxPrice')) / 1000000) : '');
    setVerifiedOnly(params.get('verified') === 'true');
    setPage(1);
    setViewMode('list');
  }, [params]);
  const load = useCallback(async () => { setLoading(true); try { const p=new URLSearchParams({page:String(page),limit:'12',sort}); if(q)p.set('q',q); if(district)p.set('district',district); if(category)p.set('category',category); if(transaction)p.set('transaction',transaction); if(verifiedOnly)p.set('verified','true'); if(minPrice)p.set('minPrice',String(Number(minPrice)*1000000)); if(maxPrice)p.set('maxPrice',String(Number(maxPrice)*1000000)); const d=await api(`/properties?${p}`); setItems(d.items); setTotal(d.total); } catch(e){ console.error(e); } finally {setLoading(false);} },[page,sort,q,district,category,transaction,minPrice,maxPrice,verifiedOnly]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{ if(user) api('/favorites').then(d=>setFavorites(d.items.map(x=>x.id))).catch(()=>{}); },[user]);
  const apply=()=>{setPage(1); const p=new URLSearchParams(); Object.entries({q,district,category,transaction,sort}).forEach(([k,v])=>v&&p.set(k,v)); setParams(p);};
  const toggleFavorite=async p=>{if(!user){alert('Vui lòng đăng nhập để lưu tin.');return;}try{if(favorites.includes(p.id)){await api(`/favorites/${p.id}`,{method:'DELETE'});setFavorites(f=>f.filter(x=>x!==p.id));}else{await api(`/favorites/${p.id}`,{method:'POST'});setFavorites(f=>[...f,p.id]);}}catch(e){alert(e.message)}};
  return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">KHÁM PHÁ ĐÀ NẴNG</span><h1>Tìm kiếm bất động sản</h1><p>Tìm lựa chọn phù hợp với nhu cầu của bạn.</p></div><Link to="/post" className="btn btn-primary"><Plus size={17}/> Đăng tin</Link></div>
    <div className="listing-layout"><aside className="filter-panel"><h3><SlidersHorizontal size={18}/> Bộ lọc</h3><label>Từ khóa</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nhập từ khóa"/><label>Nhu cầu</label><select value={transaction} onChange={e=>setTransaction(e.target.value)}><option value="">Tất cả</option><option>Bán</option><option>Cho thuê</option></select><label>Loại bất động sản</label><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tất cả loại hình</option>{categories.map(c=><option key={c}>{c}</option>)}</select><label>Khu vực</label><select value={district} onChange={e=>setDistrict(e.target.value)}><option value="">Tất cả Đà Nẵng</option>{districts.map(d=><option key={d}>{d}</option>)}</select><div className="two-fields"><div><label>Giá từ (triệu)</label><input type="number" min="0" value={minPrice} onChange={e=>setMinPrice(e.target.value)} placeholder="0"/>{minPrice&&<small className="money-hint">{moneyWords(Number(minPrice)*1000000)}</small>}</div><div><label>Đến (triệu)</label><input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="Không giới hạn"/>{maxPrice&&<small className="money-hint">{moneyWords(Number(maxPrice)*1000000)}</small>}</div></div><label className="check-row"><input type="checkbox" checked={verifiedOnly} onChange={e=>{setVerifiedOnly(e.target.checked);setPage(1)}}/> Chỉ tin đã xác thực</label><label>Sắp xếp</label><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Mới nhất</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option><option value="area-desc">Diện tích lớn nhất</option></select><button className="btn btn-primary btn-block" onClick={apply}><Search size={17}/> Áp dụng bộ lọc</button></aside>
    <section className="listing-results"><div className="results-top"><span><strong>{total}</strong> bất động sản</span><div className="results-view-tools"><span>Dữ liệu demo tại Đà Nẵng</span><div className="view-switch" role="group" aria-label="Chế độ xem"><button type="button" className={viewMode==='grid'?'active':''} onClick={()=>setViewMode('grid')} aria-pressed={viewMode==='grid'} title="Xem dạng lưới"><LayoutDashboard size={16}/> Lưới</button><button type="button" className={viewMode==='list'?'active':''} onClick={()=>setViewMode('list')} aria-pressed={viewMode==='list'} title="Xem dạng ngang"><List size={16}/> Ngang</button></div></div></div>{loading?<div className="empty-state">Đang tải dữ liệu...</div>:items.length?<><div className={`property-grid ${viewMode==='list'?'property-list-view':''}`}>{items.map(p=><PropertyCard key={p.id} p={p} favorite={favorites.includes(p.id)} onFavorite={toggleFavorite}/>)}</div><div className="pagination"><button className="btn btn-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Trang trước</button><span>Trang {page}</span><button className="btn btn-outline" disabled={page*12>=total} onClick={()=>setPage(p=>p+1)}>Trang sau</button></div></>:<div className="empty-state"><Search size={34}/><h3>Không tìm thấy bất động sản</h3><p>Hãy thử thay đổi điều kiện lọc.</p><button className="btn btn-outline" onClick={()=>{setQ('');setDistrict('');setCategory('');setTransaction('');setMinPrice('');setMaxPrice('');setVerifiedOnly(false);setPage(1)}}>Xóa bộ lọc</button></div>}</section></div>
  </main>;
}
function PropertyDetail({ user }) {
  const { id } = useParams(); const navigate=useNavigate(); const [p,setP]=useState(null); const [error,setError]=useState(''); const [active,setActive]=useState(0); const [bookingOpen,setBookingOpen]=useState(false); const [visitDate,setVisitDate]=useState(''); const [visitNote,setVisitNote]=useState(''); const [bookingBusy,setBookingBusy]=useState(false);
  const minVisitDate = (() => { const d=new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const submitAppointment = async (e) => { e.preventDefault(); if (!visitDate) { alert('Vui lòng chọn ngày xem nhà.'); return; } setBookingBusy(true); try { const chosen = new Date(`${visitDate}T12:00:00`); if (Number.isNaN(chosen.getTime()) || chosen.getTime() < Date.now()+30*60*1000) throw new Error('Vui lòng chọn ngày xem nhà hợp lệ.'); await api('/appointments',{method:'POST',body:JSON.stringify({propertyId:p.id,visitAt:chosen.toISOString(),note:visitNote})}); setBookingOpen(false); setVisitDate(''); setVisitNote(''); alert('Đã gửi yêu cầu đặt lịch xem nhà. Bạn có thể theo dõi trong mục Lịch xem nhà.'); } catch(e) { alert(e.message); } finally { setBookingBusy(false); } };
  useEffect(()=>{api(`/properties/${id}`).then(d=>setP(d.property)).catch(e=>setError(e.message));},[id]);
  const fav=async()=>{if(!user){alert('Vui lòng đăng nhập để lưu tin.');return;}try{await api(`/favorites/${p.id}`,{method:'POST'});alert('Đã thêm vào yêu thích.')}catch(e){alert(e.message)}};
  if(error)return <main className="container page-main"><div className="empty-state"><h2>{error}</h2><Link to="/properties" className="btn btn-primary">Quay lại danh sách</Link></div></main>;
  if(!p)return <main className="container page-main">Đang tải chi tiết...</main>;
  const imgs=p.images?.length?p.images:[p.coverImage||FALLBACK];
  return <main className="container page-main"><div className="breadcrumbs"><Link to="/">Trang chủ</Link> / <Link to="/properties">Bất động sản</Link> / {p.district}</div>{p.priorityLevel>0&&<div className={`tier-banner tier-${p.priorityLevel}`}><TierTag level={p.priorityLevel}/> Tin ưu tiên hiển thị</div>}<div className="detail-heading"><div><span className="pill">{p.transaction}</span>{p.verified&&<VerifiedListingTag/>}<h1>{p.title}</h1><p><MapPin size={16}/>{p.address}</p></div><div className="detail-price">{money(p.price,p.transaction)}<small>Mã tin: {p.code}</small></div></div><div className="detail-gallery"><div className="detail-main-image"><img src={imgs[active]||FALLBACK} onError={e=>e.currentTarget.src=FALLBACK} alt={p.title}/></div><div className="detail-thumbs">{imgs.map((im,i)=><button key={im+i} className={i===active?'selected':''} onClick={()=>setActive(i)}><img src={im} onError={e=>e.currentTarget.src=FALLBACK} alt={`Ảnh ${i+1}`}/></button>)}</div></div>
  <div className="detail-layout"><section className="panel detail-description"><h2>Thông tin bất động sản</h2><div className="facts-grid"><div><Ruler/><span>Diện tích<strong>{p.area} m²</strong></span></div><div><BedDouble/><span>Phòng ngủ<strong>{p.bedrooms||'Đang cập nhật'}</strong></span></div><div><Building2/><span>Số tầng<strong>{p.floors||'Đang cập nhật'}</strong></span></div><div><MapPin/><span>Chiều rộng đường<strong>{p.roadWidth?p.roadWidth+' m':'Đang cập nhật'}</strong></span></div></div><h3>Mô tả chi tiết</h3><p className="long-description">{p.description}</p><h3>Thông tin khác</h3><div className="detail-table"><div><span>Loại hình</span><strong>{p.category}</strong></div><div><span>Khu vực</span><strong>{p.district}, Đà Nẵng</strong></div><div><span>Pháp lý</span><strong>{p.legal||'Liên hệ để biết thêm'}</strong></div><div><span>Hướng</span><strong>{p.direction||'Đang cập nhật'}</strong></div><div><span>Xác thực tin</span><strong>{p.verified?'Đã xác thực':'Chưa xác thực'}</strong></div><div><span>Lượt xem</span><strong>{p.views||0}</strong></div><div><span>Ngày đăng</span><strong>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '—'}</strong></div></div><div className="demo-note">Lưu ý: Tin có thể là dữ liệu minh họa. Vui lòng xác minh thông tin, pháp lý và giá trước khi giao dịch.</div></section><aside className="panel contact-panel"><Link className="agent-avatar contact-avatar-link" to={p.ownerId?`/agents/${p.ownerId}`:"/agents"} title="Xem hồ sơ người đăng">{p.ownerAvatarUrl?<img src={p.ownerAvatarUrl} alt={p.ownerName||'Người đăng tin'}/>:<UserRound size={28}/>}</Link><h3>{p.ownerName||'Người đăng tin'}{p.ownerVerified&&<VerifiedBadge size={18}/>}</h3><p>{p.ownerVerified?'Tài khoản đã được xác minh':'Người đăng trên DaNangRealEstate'}</p>{p.ownerPhone?<a className="owner-phone" href={`tel:${p.ownerPhone}`}><Phone size={18}/><span><small>Số điện thoại người đăng</small><strong>{p.ownerPhone}</strong></span></a>:<div className="owner-phone owner-phone-empty"><Phone size={18}/><span><small>Số điện thoại người đăng</small><strong>Chưa cập nhật</strong></span></div>}<a className="btn btn-primary btn-block" href={p.ownerPhone?`tel:${p.ownerPhone}`:undefined} onClick={e=>{if(!p.ownerPhone){e.preventDefault();alert('Người đăng chưa cập nhật số điện thoại.')}}}><Phone size={17}/> Gọi điện</a>{user&&p.ownerId&&user.id!==p.ownerId&&<button className="btn btn-orange btn-block" onClick={async()=>{try{const d=await api('/messages/conversations',{method:'POST',body:JSON.stringify({recipientId:p.ownerId,propertyId:p.id})});navigate(`/messages?conversation=${d.conversationId}`)}catch(e){alert(e.message)}}}><MessageCircle size={17}/> Nhắn tin người đăng</button>}{user&&p.ownerId&&user.id!==p.ownerId&&<button className="btn btn-outline btn-block" onClick={()=>{setVisitDate(minVisitDate);setVisitNote('');setBookingOpen(true)}}><CalendarDays size={17}/> Đặt lịch xem nhà</button>}<button className="btn btn-outline btn-block" onClick={fav}><Heart size={17}/> Lưu tin yêu thích</button><button className="btn btn-outline btn-block" onClick={()=>navigator.clipboard?.writeText(window.location.href).then(()=>alert('Đã sao chép liên kết.')).catch(()=>alert(window.location.href))}>Chia sẻ tin đăng</button>{user&&<button className="btn btn-outline btn-block" onClick={async()=>{const reason=prompt('Lý do báo cáo tin này?');if(reason)try{await api('/reports',{method:'POST',body:JSON.stringify({propertyId:p.id,reason})});alert('Đã gửi báo cáo.')}catch(e){alert(e.message)}}}>Báo cáo tin</button>}</aside></div>{bookingOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBookingOpen(false)}}><section className="booking-modal panel" role="dialog" aria-modal="true" aria-labelledby="booking-title"><button className="booking-close" type="button" onClick={()=>setBookingOpen(false)} aria-label="Đóng">×</button><span className="section-kicker">LỊCH XEM NHÀ</span><h2 id="booking-title">Chọn ngày muốn xem nhà</h2><p className="booking-property-title">{p.title}</p><form className="form-stack" onSubmit={submitAppointment}><label>Ngày xem nhà<input type="date" value={visitDate} min={minVisitDate} onChange={e=>setVisitDate(e.target.value)} required/></label><p className="form-hint">Chỉ cần chọn ngày, không cần chọn giờ. Người đăng sẽ liên hệ để thống nhất thời gian cụ thể.</p><label>Ghi chú (không bắt buộc)<textarea value={visitNote} onChange={e=>setVisitNote(e.target.value)} rows={3} maxLength={1000} placeholder="Ví dụ: Tôi muốn xem nhà cùng gia đình."/></label><div className="form-actions"><button type="button" className="btn btn-outline" onClick={()=>setBookingOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary" disabled={bookingBusy}>{bookingBusy?'Đang gửi...':'Gửi yêu cầu'}</button></div></form></section></div>}</main>;
}
function AuthPage({ mode, setUser }) {
  const register = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationStep, setVerificationStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const submit = async e => {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (register && !verificationStep) {
        const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
        setEmail(d.email || email.trim().toLowerCase());
        setVerificationStep(true);
        setNotice(d.message || 'Mã xác thực đã được gửi đến email của bạn.');
        return;
      }
      if (register && verificationStep) {
        const d = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) });
        saveSession(d); setUser(d.user); navigate(d.user.role === 'Admin' ? '/admin' : '/');
        return;
      }
      const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      saveSession(d); setUser(d.user); navigate(d.user.role === 'Admin' ? '/admin' : '/');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const resendCode = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
      setNotice(d.message || 'Mã xác thực mới đã được gửi.'); setCode('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <main className="auth-page"><div className="auth-card">
    <Link className="brand auth-brand" to="/"><span className="brand-icon"><Building2/></span><span>DaNang<span className="brand-accent">RealEstate</span><small>BẤT ĐỘNG SẢN ĐÀ NẴNG</small></span></Link>
    <span className="section-kicker">{register ? (verificationStep ? 'XÁC THỰC EMAIL' : 'BẮT ĐẦU HÀNH TRÌNH') : 'CHÀO MỪNG QUAY TRỞ LẠI'}</span>
    <h1>{register ? (verificationStep ? 'Nhập mã xác thực' : 'Tạo tài khoản') : 'Đăng nhập'}</h1>
    <p>{register ? (verificationStep ? `Chúng tôi đã gửi mã 6 chữ số đến ${email}. Mã có hiệu lực trong 10 phút.` : 'Đăng ký bằng email. Bạn cần xác thực email trước khi tài khoản được tạo.') : 'Đăng nhập để quản lý tin đăng của bạn.'}</p>
    <form onSubmit={submit} className="form-stack">
      {register && !verificationStep && <><label>Họ và tên<input required value={name} onChange={e => setName(e.target.value)} placeholder="Nguyễn Văn A" maxLength={120}/></label><label>Số điện thoại<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09xx xxx xxx" maxLength={30}/></label></>}
      <label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" readOnly={register && verificationStep}/></label>
      {(!register || !verificationStep) && <label>Mật khẩu<input required type="password" minLength="8" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 8 ký tự" autoComplete={register ? 'new-password' : 'current-password'}/></label>}
      {register && verificationStep && <label>Mã xác thực 6 chữ số<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"/></label>}
      {error && <div className="error-message">{error}</div>}{notice && <div className="success-message">{notice}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Đang xử lý...' : register ? (verificationStep ? 'Xác thực và tạo tài khoản' : 'Gửi mã xác thực') : 'Đăng nhập'} <ArrowRight size={17}/></button>
    </form>
    {register && verificationStep && <div className="verification-actions"><button type="button" className="btn btn-outline btn-block" disabled={busy} onClick={resendCode}>Gửi lại mã</button><button type="button" className="back-home" onClick={() => { setVerificationStep(false); setCode(''); setError(''); setNotice(''); }}>← Sửa thông tin đăng ký</button></div>}
    <p className="auth-switch">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <Link to={register ? '/login' : '/register'}>{register ? 'Đăng nhập' : 'Đăng ký ngay'}</Link></p><Link to="/" className="back-home">← Quay về trang chủ</Link>
  </div></main>;
}
// Trích xuất những thông tin nhận diện được từ mô tả tiếng Việt.
// Chỉ tự điền các ô còn trống để không ghi đè dữ liệu người đăng đã nhập.
function extractPropertyDetails(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text) return {};
  const result = {};
  const first = (...patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return '';
  };
  const number = value => {
    if (!value) return '';
    const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/m²|m2|m/gi, '');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  };
  const area = first(/(?:diện\s*tích|diện tích đất|DT)\s*[:\-]?\s*([\d.,]+\s*m(?:²|2)?)/i);
  if (area) result.area = number(area);
  // Nhận dạng cách viết phổ biến tại Việt Nam: đường 7m5 = 7,5 m.
  const road = first(/(?:chiều rộng đường|rộng đường|đường rộng|đường)\s*[:\-]?\s*(\d+(?:[.,]\d+)?m\d?\s*(?:m)?|\d+(?:[.,]\d+)?\s*m)/i);
  if (road) {
    const compact = road.replace(/\s/g, '').toLowerCase();
    const m = compact.match(/^(\d+)m(\d)$/);
    result.roadWidth = m ? `${m[1]}.${m[2]}` : number(road);
  }
  const frontage = first(/(?:mặt tiền|ngang|bề ngang)\s*[:\-]?\s*(\d+(?:[.,]\d+)?\s*m?)/i);
  if (frontage) result.frontage = number(frontage);
  const bedrooms = first(/(?:số phòng ngủ|phòng ngủ|PN|\bngủ)\s*[:\-]?\s*(\d+)\s*(?:phòng)?/i, /(\d+)\s*(?:phòng ngủ|PN)\b/i);
  if (bedrooms) result.bedrooms = bedrooms;
  const floors = first(/(?:số tầng|nhà)\s*[:\-]?\s*(\d+)\s*tầng/i, /(\d+)\s*tầng\b/i);
  if (floors) result.floors = floors;
  const ward = first(/\b(phường\s+[\p{L}\d .'-]+?)(?=,|\.|;|\s+(?:quận|huyện|đường|diện tích|DT|giá|giá bán)\b|$)/iu, /\b(xã\s+[\p{L}\d .'-]+?)(?=,|\.|;|\s+(?:huyện|đường|diện tích|DT|giá|giá bán)\b|$)/iu);
  if (ward) result.ward = ward.replace(/\s+/g, ' ').trim();
  const district = ['Hải Châu','Sơn Trà','Ngũ Hành Sơn','Thanh Khê','Liên Chiểu','Cẩm Lệ','Hòa Vang'].find(d => new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
  if (district) result.district = district;
  const street = first(/(?:đường|mặt tiền đường|MT đường)\s+([^,.;\n]+?)(?=\s+(?:phường|xã|quận|huyện|diện tích|DT|mặt tiền|ngang|đường rộng|rộng đường|giá|giá bán|\d+(?:[.,]\d+)?\s*m(?:²|2)?|\d+\s*tầng)\b|[,.;]|$)/i);
  if (street && !/^rộng\b/i.test(street)) result.address = street.trim();
  const priceRaw = first(/(?:giá bán|giá|chào bán|bán giá)\s*[:\-]?\s*((?:\d+(?:[.,]\d+)?)\s*(?:tỷ|tỉ|ty|triệu|tr|đồng|đ))/i, /\b(\d+(?:[.,]\d+)?\s*(?:tỷ|tỉ|ty|triệu|tr))\b/i, /(?:giá bán|giá|chào bán)\s*[:\-]?\s*((?:\d{1,3}[.,]){2,}\d{3})\s*(?:đồng|vnđ|vnd)?/i);
  if (priceRaw) {
    const m = priceRaw.toLowerCase().replace(/\s/g, '').replace(',', '.').match(/^(\d+(?:\.\d+)?)(tỷ|tỉ|ty|triệu|tr|đồng|đ)?$/);
    if (m) {
      const amount = Number(m[1]);
      const unit = m[2] || '';
      const multiplier = ['tỷ','tỉ','ty'].includes(unit) ? 1e9 : ['triệu','tr'].includes(unit) ? 1e6 : 1;
      if (Number.isFinite(amount) && amount > 0) result.price = String(Math.round(amount * multiplier));
    } else {
      const digits = priceRaw.replace(/\D/g, '');
      if (digits.length >= 6) result.price = digits;
    }
  }
  return result;
}

function PostProperty({ user, refreshUser, editMode = false }) {
  const navigate=useNavigate(); const { id: editId } = useParams(); const [loadingEdit,setLoadingEdit]=useState(editMode); const [form,setForm]=useState({title:'',category:'Đất nền',transaction:'Bán',price:'',area:'',district:'',ward:'',address:'',roadWidth:'',frontage:'',bedrooms:'',floors:'',direction:'',legal:'',description:'',images:''}); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [uploadedImages,setUploadedImages]=useState([]); const [uploading,setUploading]=useState(false);
  useEffect(()=>{if(!editMode||!editId||!user)return;let active=true;api(`/properties/${editId}`).then(({property:p})=>{if(!active)return;setForm({title:p.title||'',category:p.category||'Đất nền',transaction:p.transaction||'Bán',price:String(p.price??''),area:String(p.area??''),district:p.district||'',ward:p.ward||'',address:p.address||'',roadWidth:p.roadWidth==null?'':String(p.roadWidth),frontage:p.frontage==null?'':String(p.frontage),bedrooms:String(p.bedrooms||''),floors:String(p.floors||''),direction:p.direction||'',legal:p.legal||'',description:p.description||'',images:''});setUploadedImages(Array.isArray(p.images)?p.images:[]);setLoadingEdit(false)}).catch(e=>{if(active){setError(e.message);setLoadingEdit(false)}});return()=>{active=false}},[editMode,editId,user?.id]);
  const update=e=>{
    const {name,value}=e.target;
    if(name==='description') {
      const extracted=extractPropertyDetails(value);
      setForm(f=>{
        const next={...f,description:value};
        for(const [key,parsed] of Object.entries(extracted)) {
          if(parsed!=='' && (f[key]===undefined || f[key]===null || String(f[key]).trim()==='')) next[key]=parsed;
        }
        return next;
      });
    } else setForm(f=>({...f,[name]:value}));
  };
  const uploadFiles=async e=>{const files=Array.from(e.target.files||[]); if(!files.length)return; if(uploadedImages.length+files.length>10){setError('Bạn chỉ được tải lên tối đa 10 ảnh.');e.target.value='';return;} setUploading(true);setError('');try{const next=[];for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)){throw new Error(`Ảnh ${file.name} không đúng định dạng. Chỉ nhận JPG, PNG hoặc WEBP.`)}if(file.size>5*1024*1024)throw new Error(`Ảnh ${file.name} vượt quá 5 MB.`);const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Không đọc được file ảnh.'));reader.readAsDataURL(file)});const result=await api('/uploads',{method:'POST',body:JSON.stringify({fileName:file.name,type:file.type,data})});next.push(result.url)}setUploadedImages(old=>[...old,...next]);}catch(err){setError(err.message)}finally{setUploading(false);e.target.value=''}};
  const {tiers,priorityDays}=useTiers(); const [level,setLevel]=useState(0);
  useEffect(()=>{refreshUser&&refreshUser()},[]);
  if(!user)return <main className="container page-main"><div className="empty-state"><KeyRound size={34}/><h2>Bạn cần đăng nhập để đăng tin</h2><Link to="/login" className="btn btn-primary">Đăng nhập ngay</Link></div></main>;
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{const externalImages=form.images.split('\n').map(x=>x.trim()).filter(x=>/^https?:\/\//i.test(x));const images=[...uploadedImages,...externalImages].slice(0,10);const body={...form,price:Number(form.price),area:Number(form.area),roadWidth:form.roadWidth?Number(form.roadWidth):null,frontage:form.frontage?Number(form.frontage):null,bedrooms:form.bedrooms?Number(form.bedrooms):0,floors:form.floors?Number(form.floors):0,images,priorityLevel:level};const d=await api(editMode?`/properties/${editId}`:'/properties',{method:editMode?'PUT':'POST',body:JSON.stringify(body)});refreshUser&&refreshUser();alert(d.message||(editMode?'Cập nhật tin thành công.':'Đăng tin thành công.'));navigate('/my-properties');}catch(e){setError(e.message)}finally{setBusy(false)}};
  return <main className="container page-main narrow-page post-property-page"><div className="page-title-row"><div><span className="section-kicker">{editMode?'CHỈNH SỬA TIN ĐĂNG':'ĐĂNG TIN BẤT ĐỘNG SẢN'}</span><h1>{editMode?'Chỉnh sửa tin đăng':'Thông tin tin đăng'}</h1><p>{editMode?'Cập nhật thông tin bất động sản của bạn. Sau khi lưu, tin sẽ được gửi duyệt lại.':'Nhập chính xác thông tin để khách hàng dễ tìm kiếm.'}</p></div></div><form className="panel property-form" onSubmit={submit}><div className="form-section"><h3>Thông tin cơ bản</h3><div className="form-grid"><label className="full">Tiêu đề tin đăng *<input required name="title" maxLength="200" value={form.title} onChange={update} placeholder="Ví dụ: Bán đất nền tại Sơn Trà"/></label><label className="full description-first-field">Mô tả chi tiết *<textarea required rows="5" name="description" value={form.description} onChange={update} placeholder="Ví dụ: Bán nhà đường Nguyễn Văn Linh, phường Hải Châu, diện tích 100m2, mặt tiền 5m, đường 7m5, nhà 2 tầng 3 phòng ngủ, giá bán 3 tỷ..."/><small className="form-hint">Nhập mô tả tự nhiên. Hệ thống sẽ tự điền các thông tin nhận diện được vào những ô còn trống; thông tin không có trong mô tả sẽ để trống.</small></label><label>Loại giao dịch *<select name="transaction" value={form.transaction} onChange={update}><option>Bán</option><option>Cho thuê</option></select></label><label>Loại bất động sản *<select name="category" value={form.category} onChange={update}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Giá (VNĐ) *<MoneyInput required name="price" value={form.price} onChange={update} placeholder="Ví dụ: 3.500.000.000"/></label><label>Diện tích (m²) *<input required type="number" min="1" step=".1" name="area" value={form.area} onChange={update} placeholder="100"/></label><label>Quận/huyện *<select name="district" value={form.district} onChange={update}><option value="">Chọn quận/huyện</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label><label>Phường/xã<input name="ward" value={form.ward} onChange={update} placeholder="Tên phường/xã"/></label><label className="full">Địa chỉ mô tả<input name="address" value={form.address} onChange={update} placeholder="Tên đường, khu vực; không cần nhập số nhà"/></label></div></div>
    <div className="form-section"><h3>Đặc điểm bất động sản</h3><div className="form-grid"><label>Chiều rộng đường (m)<input type="number" step=".1" min="0" name="roadWidth" value={form.roadWidth} onChange={update}/></label><label>Mặt tiền (m)<input type="number" step=".1" min="0" name="frontage" value={form.frontage} onChange={update}/></label><label>Phòng ngủ<input type="number" min="0" name="bedrooms" value={form.bedrooms} onChange={update}/></label><label>Số tầng<input type="number" min="0" name="floors" value={form.floors} onChange={update}/></label><label>Hướng<select name="direction" value={form.direction} onChange={update}><option value="">Chọn hướng</option>{['Đông','Tây','Nam','Bắc','Đông Nam','Đông Bắc','Tây Nam','Tây Bắc'].map(x=><option key={x}>{x}</option>)}</select></label><label>Pháp lý<input name="legal" value={form.legal} onChange={update} placeholder="Ví dụ: Sổ đỏ (cần xác minh)"/></label><div className="full upload-field"><label htmlFor="property-images-upload">Tải ảnh từ máy tính (tối đa 10 ảnh, JPG/PNG/WEBP, mỗi ảnh tối đa 5 MB)</label><input id="property-images-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadFiles} disabled={uploading || uploadedImages.length>=10}/>{uploading&&<p className="form-hint">Đang tải ảnh lên Cloudinary...</p>}{uploadedImages.length>0&&<div className="uploaded-image-list">{uploadedImages.map((url,index)=><div className="uploaded-image-item" key={url}><img src={url} alt={`Ảnh đã tải ${index+1}`}/><button type="button" onClick={()=>setUploadedImages(old=>old.filter(x=>x!==url))} aria-label="Xóa ảnh"><X size={15}/></button></div>)}</div>}</div><label className="full">Hoặc thêm URL ảnh (mỗi dòng một URL)<textarea rows="2" name="images" value={form.images} onChange={update} placeholder="https://..."/></label></div><p className="form-hint">Ảnh được lưu trên Cloudinary, cơ sở dữ liệu chỉ lưu URL. Tổng số ảnh mỗi tin tối đa 10.</p></div>{!editMode&&<TierPicker tiers={tiers} days={priorityDays} balance={user.tokens||0} value={level} onChange={setLevel}/>}{error&&<div className="error-message">{error}</div>}<div className="form-actions"><Link to="/" className="btn btn-outline">Hủy</Link><button className="btn btn-primary" disabled={busy||uploading||loadingEdit}>{loadingEdit?'Đang tải tin...':busy?'Đang lưu...':editMode?'Lưu thay đổi':level>0?'Đăng tin ngay':'Gửi tin chờ duyệt'} <ArrowRight size={17}/></button></div></form></main>;
}
function MyProperties({user,refreshUser}) {
  const {tiers}=useTiers(); const [boosting,setBoosting]=useState(null);
  const [items,setItems]=useState([]);const [error,setError]=useState('');
  const [titleFilter,setTitleFilter]=useState('');const [categoryFilter,setCategoryFilter]=useState('');const [dateFilter,setDateFilter]=useState('all');
  const load=()=>api('/users/me/properties').then(d=>setItems(d.items)).catch(e=>setError(e.message));
  useEffect(()=>{if(user)load()},[user]);
  if(!user)return <main className="container page-main"><div className="empty-state"><h2>Vui lòng đăng nhập</h2><Link to="/login" className="btn btn-primary">Đăng nhập</Link></div></main>;
  const del=async p=>{if(!confirm(`Bạn chắc chắn muốn xóa tin "${p.title}"?`))return;try{await api(`/properties/${p.id}`,{method:'DELETE'});load()}catch(e){alert(e.message)}};
  const dateText=v=>v?new Date(v).toLocaleDateString('vi-VN'):'Không có';
  const filtered=items.filter(p=>{const titleOk=p.title.toLocaleLowerCase('vi').includes(titleFilter.trim().toLocaleLowerCase('vi'));const categoryOk=!categoryFilter||p.category===categoryFilter;const created=new Date(p.createdAt).getTime();const now=new Date();let dateOk=true;if(dateFilter!=='all'){const days=Number(dateFilter);const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);dateOk=created>=start.getTime()&&created<=now.getTime()}return titleOk&&categoryOk&&dateOk});
  return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">KHU VỰC CÁ NHÂN</span><h1>Tin đăng của tôi</h1><p>Quản lý, lọc tin đăng và theo dõi ngày hết hạn tin/gói ưu tiên.</p></div><Link to="/post" className="btn btn-primary"><Plus size={17}/> Đăng tin mới</Link></div>
    <div className="panel my-properties-filters"><label>Tìm theo tiêu đề<input value={titleFilter} onChange={e=>setTitleFilter(e.target.value)} placeholder="Nhập tiêu đề tin..."/></label><label>Loại tin<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Tất cả loại tin</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>Ngày đăng<select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="all">Tất cả thời gian</option><option value="1">Hôm nay</option><option value="7">7 ngày gần đây</option><option value="30">30 ngày gần đây</option><option value="90">90 ngày gần đây</option></select></label><button className="btn btn-outline" onClick={()=>{setTitleFilter('');setCategoryFilter('');setDateFilter('all')}}>Xóa lọc</button></div>
    {error&&<div className="error-message">{error}</div>}{filtered.length?<div className="table-wrap"><table><thead><tr><th>Tin đăng</th><th>Giá</th><th>Trạng thái</th><th>Gói ưu tiên</th><th>Ngày đăng</th><th>Tin hết hạn</th><th>Ưu tiên hết hạn</th><th>Thao tác</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><div className="table-property"><img src={p.coverImage||FALLBACK} alt=""/><span><strong>{p.title}</strong><small>{p.code} · {p.district}</small></span></div></td><td>{money(p.price,p.transaction)}</td><td><span className={`status status-${p.status.toLowerCase()}`}>{({Pending:'Chờ duyệt',Approved:'Đã duyệt',Rejected:'Từ chối',Hidden:'Đã ẩn'})[p.status]||p.status}</span>{p.moderationReason&&<small className="reason">{p.moderationReason}</small>}</td><td>{p.priorityLevel>0?<TierTag level={p.priorityLevel}/>:'—'}{p.verified&&<VerifiedListingTag/>}</td><td>{dateText(p.createdAt)}</td><td>{dateText(p.listingUntil)}</td><td>{p.priorityUntil?dateText(p.priorityUntil):'—'}</td><td><div className="table-actions"><Link to={`/properties/${p.id}`} title="Xem"><Eye size={17}/></Link><Link to={`/properties/${p.id}/edit`} title="Sửa tin"><Pencil size={17}/></Link>{['Pending','Approved'].includes(p.status)&&p.priorityLevel<3&&<button className="boost-btn" onClick={()=>setBoosting(p)} title="Dùng token để ưu tiên tin"><Rocket size={17}/></button>}<button onClick={()=>del(p)} title="Xóa"><Trash2 size={17}/></button></div></td></tr>)}</tbody></table><div className="form-hint" style={{padding:'12px 16px'}}>Hiển thị {filtered.length}/{items.length} tin đăng.</div></div>:<div className="empty-state"><Building2 size={35}/><h3>{items.length?'Không tìm thấy tin phù hợp':'Bạn chưa có tin đăng'}</h3><p>{items.length?'Hãy thử thay đổi bộ lọc.':'Bắt đầu đăng bất động sản đầu tiên.'}</p>{!items.length&&<Link to="/post" className="btn btn-primary">Đăng tin ngay</Link>}</div>}{boosting&&<BoostModal property={boosting} tiers={tiers} balance={user.tokens||0} onClose={()=>setBoosting(null)} onDone={m=>{setBoosting(null);alert(m);load();refreshUser&&refreshUser()}}/>}</main>;
}
function Favorites({user}) {
  const [items,setItems]=useState([]);const [error,setError]=useState('');const load=()=>api('/favorites').then(d=>setItems(d.items)).catch(e=>setError(e.message));
  useEffect(()=>{if(user)load()},[user]);
  const remove=async p=>{try{await api(`/favorites/${p.id}`,{method:'DELETE'});load()}catch(e){alert(e.message)}};
  if(!user)return <main className="container page-main"><div className="empty-state"><h2>Đăng nhập để xem tin yêu thích</h2><Link to="/login" className="btn btn-primary">Đăng nhập</Link></div></main>;
  return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">ĐÃ LƯU</span><h1>Bất động sản yêu thích</h1><p>Các tin bạn đã lưu để xem lại.</p></div></div>{error&&<div className="error-message">{error}</div>}{items.length?<div className={`property-grid ${viewMode==='list'?'property-list-view':''}`}>{items.map(p=><PropertyCard key={p.id} p={p} favorite onFavorite={remove}/>)}</div>:<div className="empty-state"><Heart size={34}/><h3>Chưa có tin yêu thích</h3><p>Nhấn biểu tượng trái tim ở một tin đăng để lưu lại.</p><Link to="/properties" className="btn btn-primary">Khám phá bất động sản</Link></div>}</main>;
}
function MessagesPage({user}) {
  const [searchParams]=useSearchParams();
  const navigate=useNavigate();
  const [conversations,setConversations]=useState([]);
  const [conversation,setConversation]=useState(null);
  const [messages,setMessages]=useState([]);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [inboxFilter,setInboxFilter]=useState('all');
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const [connection,setConnection]=useState('connecting');
  const messagesEndRef=useRef(null);
  const selectedId=searchParams.get('conversation')||'';
  const loadConversations=useCallback(async()=>{
    try { const d=await api('/messages/conversations'); setConversations(d.items||[]); setError(''); }
    catch(e){setError(e.message)}
  },[]);
  const loadMessages=useCallback(async(id)=>{
    if(!id){setConversation(null);setMessages([]);return;}
    try {const d=await api(`/messages/conversations/${id}`);setConversation(d.conversation);setMessages(d.items||[]);setError('');}
    catch(e){setError(e.message)}
  },[]);
  useEffect(()=>{if(user)loadConversations()},[user,loadConversations]);
  useEffect(()=>{if(selectedId)loadMessages(selectedId).then(loadConversations);else loadMessages('')},[selectedId,loadMessages,loadConversations]);
  // WebSocket delivers new messages to every active session of the recipient.
  // A light polling fallback keeps the inbox usable if a proxy blocks WebSocket.
  useEffect(()=>{
    if(!user || !getToken()) return undefined;
    let socket; let reconnectTimer; let disposed=false; let retry=1000;
    const connect=()=>{
      if(disposed) return;
      try { socket=new WebSocket(getWebSocketUrl()); }
      catch { setConnection('polling'); return; }
      socket.onopen=()=>{retry=1000;setConnection('online');};
      socket.onmessage=event=>{
        let payload;try{payload=JSON.parse(event.data)}catch{return;}
        if(payload.type==='message'){
          if(payload.conversationId===selectedId){
            setMessages(old=>old.some(m=>m.id===payload.message.id)?old:[...old,payload.message]);
            // Fetching marks incoming messages as read on the server.
            if(payload.message.senderId!==user.id) loadMessages(selectedId).then(loadConversations);
            else loadConversations();
          } else loadConversations();
        } else if(payload.type==='read' && payload.conversationId===selectedId){
          loadMessages(selectedId);
        }
      };
      socket.onerror=()=>{setConnection('polling');};
      socket.onclose=()=>{
        if(disposed)return;
        setConnection('polling');
        reconnectTimer=setTimeout(connect,retry);
        retry=Math.min(retry*2,15000);
      };
    };
    connect();
    const poll=setInterval(()=>{loadConversations();if(selectedId)loadMessages(selectedId)},15000);
    return ()=>{disposed=true;clearTimeout(reconnectTimer);clearInterval(poll);if(socket){socket.onclose=null;socket.close();}};
  },[user?.id,selectedId,loadConversations,loadMessages]);
  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages]);
  const send=async e=>{
    e.preventDefault();const body=draft.trim();if(!body||!selectedId||sending)return;
    setSending(true);
    try{
      const d=await api(`/messages/conversations/${selectedId}`,{method:'POST',body:JSON.stringify({body})});
      setMessages(old=>old.some(m=>m.id===d.message.id)?old:[...old,d.message]);
      setDraft('');await loadConversations();
    }catch(e){setError(e.message)}finally{setSending(false)}
  };
  const filteredConversations=conversations.filter(c=>`${c.otherUserName||''} ${c.propertyTitle||''} ${c.lastMessage||''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (inboxFilter==='all' || (inboxFilter==='unread' && Number(c.unreadCount)>0)));
  const totalUnread=conversations.reduce((sum,c)=>sum+Number(c.unreadCount||0),0);
  if(!user)return <main className="container page-main"><div className="empty-state"><MessageCircle size={40}/><h2>Đăng nhập để nhắn tin</h2><Link to="/login" className="btn btn-primary">Đăng nhập</Link></div></main>;
  return <main className="container page-main messages-page">
    <div className="page-title-row"><div><span className="section-kicker">TRAO ĐỔI TRỰC TIẾP</span><h1>Tin nhắn {totalUnread>0&&<span className="message-title-count">{totalUnread}</span>}</h1><p>Trao đổi với người đăng tin bất động sản, lưu lịch sử và nhận tin mới.</p></div><div className={`connection-status ${connection==='online'?'is-online':''}`}><span/>{connection==='online'?'Đang kết nối trực tiếp':connection==='connecting'?'Đang kết nối...':'Chế độ dự phòng'}</div></div>
    {error&&<div className="error-message" role="alert">{error}<button className="inline-dismiss" onClick={()=>setError('')}>Đóng</button></div>}
    <div className="messages-shell">
      <aside className={`conversation-list ${selectedId?'conversation-list-mobile-hidden':''}`}>
        <div className="conversation-list-head"><div><strong>Hội thoại</strong><small>{conversations.length} cuộc trò chuyện</small></div><button className="icon-btn" onClick={loadConversations} title="Làm mới danh sách" aria-label="Làm mới danh sách"><Settings size={17}/></button></div>
        <label className="conversation-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm người hoặc tin đăng..." aria-label="Tìm hội thoại"/></label>
        <div className="conversation-filters" role="group" aria-label="Lọc hội thoại"><button type="button" className={inboxFilter==='all'?'selected':''} onClick={()=>setInboxFilter('all')}>Tất cả <span>{conversations.length}</span></button><button type="button" className={inboxFilter==='unread'?'selected':''} onClick={()=>setInboxFilter('unread')}>Chưa đọc <span>{totalUnread}</span></button></div>
        <div className="conversation-items">
          {filteredConversations.length?filteredConversations.map(c=><button key={c.id} className={`conversation-item ${selectedId===c.id?'active':''} ${Number(c.unreadCount)>0?'has-unread':''}`} onClick={()=>navigate(`/messages?conversation=${c.id}`)}>
            <span className="conversation-avatar"><UserRound size={20}/></span><span className="conversation-summary"><strong>{c.otherUserName}</strong><small>{c.propertyTitle||'Trao đổi trực tiếp'}</small><small className="conversation-last">{c.lastMessage||'Bắt đầu cuộc trò chuyện'}</small></span>
            <span className="conversation-meta">{c.lastMessageAt&&<small>{new Date(c.lastMessageAt).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}</small>}{Number(c.unreadCount)>0&&<span className="unread-count">{Number(c.unreadCount)>99?'99+':c.unreadCount}</span>}</span>
          </button>):<div className="conversation-empty"><MessageCircle size={28}/><strong>{search?'Không tìm thấy hội thoại':'Chưa có hội thoại'}</strong><span>{search?'Thử từ khóa khác.':'Mở một tin bất động sản và nhấn “Nhắn tin người đăng” để bắt đầu.'}</span>{!search&&<Link to="/properties" className="btn btn-outline btn-small">Tìm bất động sản</Link>}</div>}
        </div>
      </aside>
      <section className={`chat-panel ${selectedId?'chat-panel-mobile-active':''}`}>
        {conversation?<>
          <header className="chat-header"><button className="icon-btn chat-back" onClick={()=>navigate('/messages')} aria-label="Quay lại danh sách"><ArrowLeft size={18}/></button><span className="conversation-avatar"><UserRound size={20}/></span><div><strong>{conversation.otherUserName}</strong><small>{conversation.propertyTitle||'Trao đổi bất động sản'}{conversation.otherUserPhone?` · ${conversation.otherUserPhone}`:''}</small></div><span className="chat-live-indicator"><span/>Tin nhắn riêng tư</span></header>
          {conversation.propertyTitle&&<div className="chat-property-context"><Building2 size={16}/><span><small>Đang trao đổi về</small><strong>{conversation.propertyTitle}</strong></span></div>}
          <div className="chat-messages">{messages.map(m=><div key={m.id} className={`chat-message ${m.senderId===user.id?'mine':'theirs'}`}><div>{m.body}</div><small>{new Date(m.createdAt).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'})}{m.senderId===user.id&&<span className="message-read-status">{m.readAt?' · Đã xem':' · Đã gửi'}</span>}</small></div>)}{!messages.length&&<div className="chat-empty"><MessageCircle size={32}/><strong>Hãy bắt đầu cuộc trò chuyện</strong><span>Gửi lời chào để hỏi thêm thông tin về bất động sản.</span></div>}<div ref={messagesEndRef}/></div>
          <div className="chat-quick-replies"><span>Trả lời nhanh:</span>{['Tin này còn không ạ?','Tôi có thể thương lượng giá không?','Tôi muốn hẹn xem nhà.'].map(text=><button type="button" key={text} onClick={()=>setDraft(text)}>{text}</button>)}</div><form className="chat-compose" onSubmit={send}><div className="compose-input-wrap"><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Nhập tin nhắn..." maxLength={2000} aria-label="Nội dung tin nhắn"/><small>{draft.length}/2000</small></div><button className="btn btn-primary" type="submit" disabled={!draft.trim()||sending}><Send size={17}/>{sending?'Đang gửi...':'Gửi'}</button></form><div className="chat-safety-note">Không chia sẻ mật khẩu, mã OTP hoặc thông tin thanh toán nhạy cảm qua tin nhắn.</div>
        </>:<div className="chat-empty chat-no-selection"><MessageCircle size={42}/><h3>Chọn một cuộc trò chuyện</h3><p>Hoặc vào trang chi tiết bất động sản và nhấn “Nhắn tin người đăng”.</p><Link className="btn btn-outline" to="/properties">Tìm bất động sản</Link></div>}
      </section>
      <aside className="chat-context-panel"><div className="context-card-icon"><Building2 size={24}/></div><span className="section-kicker">THÔNG TIN LIÊN HỆ</span><h3>{conversation?.propertyTitle || 'Trao đổi bất động sản'}</h3><p>Giữ cuộc trao đổi tập trung vào bất động sản đang quan tâm để dễ theo dõi thông tin.</p>{conversation?.propertyId && <Link className="btn btn-outline btn-block" to={`/properties/${conversation.propertyId}`}><Eye size={16}/> Xem tin bất động sản</Link>}<div className="context-divider"/><h4>Gợi ý an toàn</h4><ul><li>Xác minh thông tin và giấy tờ trước khi giao dịch.</li><li>Không gửi mã OTP hoặc mật khẩu.</li><li>Không chuyển tiền khi chưa kiểm tra thực tế.</li></ul><Link to="/properties" className="context-browse">Khám phá tin đăng <ArrowRight size={14}/></Link></aside>
    </div>
  </main>;
}

function RankProgress({user}){
 const [count,setCount]=useState(0); const [frame,setFrame]=useState(()=>localStorage.getItem(`dre-avatar-frame-${user?.id}`)||'auto');
 useEffect(()=>{if(!user)return;api(`/agents/${user.id}`).then(d=>setCount(Number(d.agent?.totalListings||0))).catch(()=>{});},[user?.id]);
 const rank=count>=1000?'Kim cương':count>=100?'Vàng':count>=10?'Bạc':'Thành viên'; const next=count<10?10:count<100?100:count<1000?1000:1000; const progress=count>=1000?100:Math.min(100,count/next*100); const saved=()=>{localStorage.setItem(`dre-avatar-frame-${user.id}`,frame);window.dispatchEvent(new Event('storage'));};
 return <div className="rank-progress-card"><div className="rank-progress-top"><span>Hạng môi giới</span><strong>{rank}</strong></div><div className="rank-progress-track"><span style={{width:`${progress}%`}}/></div><small>{count.toLocaleString('vi-VN')} tin đã đăng · {count>=1000?'Đã đạt hạng cao nhất':`Mục tiêu tiếp theo: ${next.toLocaleString('vi-VN')} tin`}</small><label className="frame-select-label">Khung ảnh đại diện<select value={frame} onChange={e=>setFrame(e.target.value)}><option value="auto">Tự động theo hạng</option><option value="default">Mặc định</option><option value="silver">Bạc</option><option value="gold">Vàng</option><option value="diamond">Kim cương</option></select></label><small className="frame-note">Bạc từ 10 tin · Vàng từ 100 tin · Kim cương từ 1.000 tin. Tùy chọn khung được lưu trên thiết bị này.</small><button className="btn btn-outline btn-small" type="button" onClick={saved}>Lưu khung ảnh</button></div>;
}

function ProfilePage({ user, refreshUser }) {
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [name, setName] = useState(user?.name || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  useEffect(() => { setPhone(user?.phone || ''); setBio(user?.bio || ''); setName(user?.name || ''); }, [user?.id, user?.phone, user?.name]);
  if (!user) return <main className="container page-main"><div className="empty-state"><UserRound size={38}/><h2>Đăng nhập để xem tài khoản</h2><p>Thông tin cá nhân và số dư token sẽ hiển thị tại đây.</p><Link className="btn btn-primary" to="/login">Đăng nhập</Link></div></main>;
  const copyId = async () => { try { await navigator.clipboard.writeText(String(user.id)); setMessage('Đã sao chép ID tài khoản.'); } catch { setMessage(`ID tài khoản: ${user.id}`); } };
  const uploadAvatar = async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WEBP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Ảnh đại diện phải nhỏ hơn hoặc bằng 5 MB.'); return; }
    setAvatarBusy(true); setError(''); setMessage('');
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.')); reader.readAsDataURL(file); });
      const uploaded = await api('/uploads', { method:'POST', body:JSON.stringify({ fileName:file.name, type:file.type, data:dataUrl, purpose:'avatar' }) });
      await api('/users/me', { method:'PUT', body:JSON.stringify({ avatarUrl:uploaded.url }) });
      await refreshUser?.(); setMessage('Đã cập nhật ảnh đại diện.');
    } catch (err) { setError(err.message); } finally { setAvatarBusy(false); }
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setMessage(''); setError('');
    try { await api('/users/me', { method:'PUT', body:JSON.stringify({ name, phone, bio }) }); await refreshUser?.(); setMessage('Đã cập nhật thông tin cá nhân.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="container page-main profile-page">
    <div className="page-title-row"><div><span className="section-kicker">TÀI KHOẢN CỦA BẠN</span><h1>Trang cá nhân</h1><p>Quản lý thông tin, mã tài khoản và số dư token của bạn.</p></div><Link className="btn btn-outline" to="/tokens"><Coins size={17}/> Lịch sử token</Link></div>
    <div className="profile-layout">
      <aside className="panel profile-summary"><AgentAvatar agent={{...user, totalListings: user.totalListings}}/><label className="avatar-upload-button">{avatarBusy ? 'Đang tải ảnh...' : 'Đổi ảnh đại diện'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy} hidden/></label><small className="avatar-help">JPG, PNG hoặc WEBP · tối đa 5 MB</small><h2>{user.name}</h2><p>{user.email}</p><div className="profile-badges"><span className="profile-role">{user.role === 'Admin' ? 'Quản trị viên' : user.role === 'Support' ? 'Đội ngũ Support' : 'Thành viên'}</span><UserRoleBadges user={user} /></div><RankProgress user={user}/><div className="profile-balance"><Coins size={23}/><span><small>Số dư token</small><strong>{Number(user.tokens || 0).toLocaleString('vi-VN')}</strong></span></div><Link className="btn btn-primary btn-block" to="/tokens">Quản lý token</Link><Link className="btn btn-outline btn-block" to="/my-properties">Tin đăng của tôi</Link></aside>
      <section className="profile-main">
        <div className="panel profile-id-card"><div><span className="section-kicker">ID TÀI KHOẢN DUY NHẤT</span><h3>Mã định danh của bạn</h3><p>Dùng chính xác ID này khi quản trị viên cấp token cho tài khoản.</p><code>{user.id}</code></div><button className="btn btn-primary" onClick={copyId}><KeyRound size={16}/> Sao chép ID</button></div>
        <form className="panel profile-form" onSubmit={save}><h2>Thông tin cá nhân</h2><div className="profile-info-grid"><label>Họ và tên<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label><label>Email<input value={user.email || ''} readOnly/></label><label>Số điện thoại<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Nhập số điện thoại" maxLength={30}/>{user.phoneChangeStatus==='Pending'&&<small className="phone-pending">Đang chờ admin duyệt số mới: {user.pendingPhone}</small>}{user.phoneChangeStatus==='Rejected'&&<small className="phone-rejected">Yêu cầu đổi số gần nhất đã bị từ chối. Bạn có thể gửi lại.</small>}</label><label>Trạng thái tài khoản<input value={user.status === 'Active' ? 'Đang hoạt động' : user.status || 'Chưa rõ'} readOnly/></label><label>Ngày tham gia<input value={user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '—'} readOnly/></label></div>{error&&<div className="error-message">{error}</div>}{message&&<div className="success-message">{message}</div>}<button className="btn btn-primary" type="submit" disabled={busy}>{busy?'Đang lưu...':'Lưu thông tin'}</button></form>
        <div className="profile-shortcuts"><Link to="/messages"><MessageCircle/><span><strong>Tin nhắn</strong><small>Trao đổi với người đăng tin</small></span><ArrowRight/></Link><Link to="/favorites"><Heart/><span><strong>Tin yêu thích</strong><small>Các bất động sản đã lưu</small></span><ArrowRight/></Link><Link to="/my-properties"><Building2/><span><strong>Tin đăng của tôi</strong><small>Theo dõi trạng thái tin đăng</small></span><ArrowRight/></Link></div>
      </section>
    </div>
  </main>;
}

function NotificationsPage({ user }) {
  const [items,setItems]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(()=>api('/notifications').then(d=>setItems(d.items||[])).catch(e=>setError(e.message)).finally(()=>setLoading(false)),[]);
  useEffect(()=>{if(user)load();else setLoading(false)},[user,load]);
  const markRead=async n=>{if(n.readAt)return;try{await api(`/notifications/${n.id}/read`,{method:'PATCH'});setItems(old=>old.map(x=>x.id===n.id?{...x,readAt:new Date().toISOString()}:x))}catch(e){alert(e.message)}};
  const markAll=async()=>{try{await api('/notifications/read-all',{method:'POST'});setItems(old=>old.map(x=>({...x,readAt:x.readAt||new Date().toISOString()})))}catch(e){alert(e.message)}};
  if(!user)return <main className="container page-main"><div className="empty-state"><Bell size={34}/><h2>Đăng nhập để xem thông báo</h2><Link className="btn btn-primary" to="/login">Đăng nhập</Link></div></main>;
  return <main className="container page-main notifications-page"><div className="page-title-row"><div><span className="section-kicker">TRUNG TÂM THÔNG TIN</span><h1>Thông báo</h1><p>Thông tin mới nhất từ DaNangRealEstate và trạng thái tin đăng của bạn.</p></div>{items.some(n=>!n.readAt)&&<button className="btn btn-outline" onClick={markAll}><CheckCheck size={16}/> Đánh dấu tất cả đã đọc</button>}</div>{error&&<div className="error-message">{error}</div>}{loading?<div className="empty-state">Đang tải thông báo...</div>:items.length?<div className="notification-list">{items.map(n=><article key={n.id} className={`notification-item ${!n.readAt?'unread':''}`} onClick={()=>markRead(n)}><div className="notification-item-icon"><Bell size={18}/></div><div className="notification-item-content"><div className="notification-item-heading"><strong>{n.title}</strong>{!n.readAt&&<span className="unread-dot">Mới</span>}</div><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString('vi-VN')}</small></div></article>)}</div>:<div className="empty-state"><Bell size={34}/><h3>Bạn chưa có thông báo</h3><p>Khi quản trị viên gửi thông báo, nội dung sẽ xuất hiện tại đây.</p></div>}</main>;
}

function Admin({user}) {
  const [dashboard,setDashboard]=useState(null);
  const [items,setItems]=useState([]);
  const [users,setUsers]=useState([]);
  const [tab,setTab]=useState('dashboard');
  const [propertyStatusTab,setPropertyStatusTab]=useState('Pending');
  const [error,setError]=useState('');
  const [noticeTitle,setNoticeTitle]=useState('');
  const [noticeBody,setNoticeBody]=useState('');
  const [noticeRecipient,setNoticeRecipient]=useState('');
  const [noticeBusy,setNoticeBusy]=useState(false);
  const [noticeHistory,setNoticeHistory]=useState([]);
  const load=useCallback(()=>Promise.all([api('/admin/dashboard'),api('/admin/properties'),api('/admin/users')]).then(([d,p,u])=>{setDashboard(d);setItems(p.items);setUsers(u.items);setError('')}).catch(e=>setError(e.message)),[]);
  useEffect(()=>{if(['Admin','Support'].includes(user?.role))load()},[user,load]);
  if(!user||!['Admin','Support'].includes(user.role))return <main className="container page-main"><div className="empty-state"><ShieldCheck size={40}/><h2>Bạn không có quyền truy cập</h2><Link to="/login" className="btn btn-primary">Đăng nhập</Link></div></main>;
  const action=async(p,a)=>{const prompts={approve:'Bạn muốn duyệt tin đăng này?',reject:'Từ chối tin này sẽ XÓA VĨNH VIỄN tin đăng cùng dữ liệu liên quan khỏi hệ thống. Bạn có chắc chắn?',hide:'Bạn muốn ẩn tin đăng này?'};if(!window.confirm(prompts[a]||'Xác nhận thao tác?'))return;try{await api(`/admin/properties/${p.id}/${a}`,{method:'POST',body:JSON.stringify({})});await load()}catch(e){alert(e.message)}};
  const verifyUser=async u=>{try{await api(`/admin/users/${u.id}/verified`,{method:'PATCH',body:JSON.stringify({verified:!u.verified})});await load()}catch(e){alert(e.message)}};
  const verifyProp=async p=>{try{await api(`/admin/properties/${p.id}/verify`,{method:'POST',body:JSON.stringify({verified:!p.verified})});await load()}catch(e){alert(e.message)}};
  const toggle=async u=>{try{await api(`/admin/users/${u.id}/status`,{method:'PATCH',body:JSON.stringify({status:u.status==='Active'?'Blocked':'Active'})});await load()}catch(e){alert(e.message)}};
  const nav=[
    {id:'dashboard',label:'Tổng quan',icon:LayoutDashboard},
    {id:'properties',label:'Quản lý tin đăng',icon:Building2},
    {id:'users',label:'Quản lý người dùng',icon:Users},
    {id:'phone-requests',label:'Duyệt số điện thoại',icon:Phone},
    {id:'tokens',label:'Quản lý token',icon:Coins},
    {id:'reports',label:'Báo cáo vi phạm',icon:Flag},
    {id:'security',label:'Cảnh báo an toàn',icon:ShieldCheck},
    {id:'messages',label:'Tin nhắn',icon:MessageCircle},
    {id:'notifications',label:'Thông báo người dùng',icon:Megaphone}
  ];
  return <main className="container page-main admin-page">
    <div className="admin-heading"><div><span className="section-kicker">TRUNG TÂM ĐIỀU HÀNH</span><h1>Quản trị hệ thống</h1><p>Quản lý tin đăng, người dùng và hoạt động trên nền tảng.</p></div><span className="admin-chip">{user.role === 'Support' ? <><SupportBadge/> Đội ngũ Support</> : <><AdminBadge/> Quản trị viên</>}</span></div>
    <div className="admin-shell">
      <aside className="admin-sidebar"><div className="admin-sidebar-title"><span className="admin-sidebar-logo"><Building2 size={20}/></span><span><strong>ADMIN PANEL</strong><small>DaNangRealEstate</small></span></div>
        <span className="admin-menu-caption">MENU QUẢN LÝ</span>
        {nav.map(n=>{const Icon=n.icon;return <button key={n.id} className={`admin-menu-item ${tab===n.id?'active':''}`} onClick={()=>setTab(n.id)}><Icon size={18}/><span>{n.label}</span>{n.id==='properties'&&dashboard?.pending>0&&<small>{dashboard.pending}</small>}</button>})}
        <div className="admin-sidebar-bottom"><ShieldCheck size={16}/><span>Hệ thống quản trị<br/><small>{user.role === 'Support' ? 'Quyền Support' : 'Quyền quản trị viên chính'}</small></span></div>
      </aside>
      <section className="admin-workspace">
        <div className="admin-workspace-top"><div><span className="section-kicker">QUẢN LÝ / {nav.find(n=>n.id===tab)?.label.toUpperCase()}</span><h2>{nav.find(n=>n.id===tab)?.label}</h2></div><button className="btn btn-outline btn-small" onClick={load}><ArrowLeft size={15} className="refresh-icon"/> Làm mới</button></div>
        {error&&<div className="error-message">{error}</div>}
        {tab==='dashboard'&&<><div className="stats-grid admin-stats">{[['Tổng tin đăng',dashboard?.properties,Building2],['Chờ duyệt',dashboard?.pending,Clock],['Đã duyệt',dashboard?.approved,CheckCircle],['Tài khoản',dashboard?.users,Users],['Báo cáo chờ xử lý',dashboard?.reports,Flag],['Lượt xem',dashboard?.views,Eye]].map(([label,value,Icon])=><div className="stat-card" key={label}><span>{label}</span><strong>{value??'—'}</strong><small><Icon size={14}/> Thống kê hiện tại</small></div>)}</div><div className="admin-quick-grid"><button onClick={()=>setTab('properties')}><Building2/><span><strong>Duyệt tin đăng</strong><small>{dashboard?.pending||0} tin đang chờ xử lý</small></span><ArrowRight/></button><button onClick={()=>setTab('users')}><Users/><span><strong>Người dùng</strong><small>Quản lý tài khoản và xác minh</small></span><ArrowRight/></button><button onClick={()=>setTab('reports')}><Flag/><span><strong>Báo cáo vi phạm</strong><small>Xem và xử lý báo cáo</small></span><ArrowRight/></button></div></>}
        {tab==='properties'&&<><div className="admin-tabs property-status-tabs"><button className={propertyStatusTab==='Pending'?'active':''} onClick={()=>setPropertyStatusTab('Pending')}>Tin chờ duyệt <span>{items.filter(p=>p.status==='Pending').length}</span></button><button className={propertyStatusTab==='Approved'?'active':''} onClick={()=>setPropertyStatusTab('Approved')}>Tin đã duyệt <span>{items.filter(p=>p.status==='Approved').length}</span></button></div><div className="table-wrap"><table><thead><tr><th>Tin đăng</th><th>Giá</th><th>Trạng thái</th><th>Người đăng</th><th>Thao tác</th></tr></thead><tbody>{items.filter(p=>p.status===propertyStatusTab).map(p=><tr key={p.id}><td><div className="table-property"><img src={p.coverImage||FALLBACK} alt=""/><span><strong>{p.title}</strong><small>{p.code} · {p.district}</small></span></div></td><td>{money(p.price,p.transaction)}</td><td><span className={`status status-${String(p.status).toLowerCase()}`}>{p.status==='Pending'?'Chờ duyệt':'Đã duyệt'}</span>{p.priorityLevel>0&&<><br/><TierTag level={p.priorityLevel}/></>}{p.verified&&<><br/><VerifiedListingTag/></>}</td><td>{p.ownerName}{p.ownerRole==='Admin'?<AdminBadge/>:p.ownerRole==='Support'?<SupportBadge/>:p.ownerVerified&&<VerifiedBadge/>}</td><td><div className="admin-actions">{p.status==='Pending'&&<button className="approve" onClick={()=>action(p,'approve')} title="Duyệt tin"><CheckCircle size={17}/></button>}<button onClick={()=>action(p,'reject')} title="Từ chối và xóa tin"><Trash2 size={17}/></button>{p.status==='Approved'&&<><button onClick={()=>action(p,'hide')} title="Ẩn tin"><Eye size={17}/></button><button className={p.verified?'verify-on':''} onClick={()=>verifyProp(p)} title={p.verified?'Gỡ xác thực tin':'Xác thực tin'}><ShieldCheck size={17}/></button></>}<Link className="admin-detail-link" to={`/properties/${p.id}`} title="Xem tin"><Eye size={17}/></Link></div></td></tr>)}</tbody></table>{!items.filter(p=>p.status===propertyStatusTab).length&&<div className="empty-state">{propertyStatusTab==='Pending'?'Không có tin đang chờ duyệt.':'Chưa có tin nào được duyệt.'}</div>}</div></>}
        {tab==='users'&&<div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Email / SĐT</th><th>Vai trò</th><th>Token</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.name}<UserRoleBadges user={u}/></td><td>{u.email}<small className="admin-cell-sub">{u.phone||'Chưa có số điện thoại'}</small></td><td>{u.role==='Admin'?<><AdminBadge/> Quản trị viên</>:u.role==='Support'?<><SupportBadge/> Support</>:u.verified?<><VerifiedBadge/> Môi giới xác thực</>:'Thành viên'}</td><td>{(u.tokens||0).toLocaleString('vi-VN')}</td><td><span className={`status ${u.status==='Active'?'status-approved':'status-hidden'}`}>{u.status==='Active'?'Hoạt động':'Đã khóa'}</span></td><td><div className="admin-actions-inline"><button className="btn btn-outline btn-small" onClick={()=>verifyUser(u)}>{u.verified?'Gỡ huy hiệu xác thực':'Xác minh môi giới'}</button>{user.role==='Admin'&&u.role!=='Admin'&&<button className="btn btn-outline btn-small" onClick={async()=>{try{await api(`/admin/users/${u.id}/role`,{method:'PATCH',body:JSON.stringify({role:u.role==='Support'?'User':'Support'})});await load()}catch(e){alert(e.message)}}}>{u.role==='Support'?'Gỡ quyền Support':'Nâng lên Support'}</button>}<button className="btn btn-outline btn-small" disabled={u.id===user.id||u.role==='Admin'} onClick={()=>toggle(u)}>{u.status==='Active'?'Khóa':'Mở khóa'}</button></div></td></tr>)}</tbody></table></div>}
        {tab==='phone-requests'&&<PhoneRequestsAdmin/>}
        {tab==='tokens'&&<TokensAdmin onChanged={load}/> }
        {tab==='reports'&&<ReportsAdmin/>}
        {tab==='security'&&<SecurityAdmin/>}
        {tab==='messages'&&<AdminMessages/>}
        {tab==='notifications'&&<section className="panel admin-notification-panel"><h3><Megaphone size={19}/> Gửi thông báo cho người dùng</h3><p>Thông báo sẽ xuất hiện ở biểu tượng chuông trên website. Chọn tất cả người dùng hoặc gửi riêng cho một tài khoản.</p><form onSubmit={async e=>{e.preventDefault();setNoticeBusy(true);try{const d=await api('/admin/notifications',{method:'POST',body:JSON.stringify({title:noticeTitle,body:noticeBody,recipientId:noticeRecipient||null})});alert(d.message);setNoticeTitle('');setNoticeBody('');setNoticeRecipient('');const h=await api('/admin/notifications');setNoticeHistory(h.items||[])}catch(err){alert(err.message)}finally{setNoticeBusy(false)}}} className="admin-notification-form"><label>Tiêu đề<input value={noticeTitle} onChange={e=>setNoticeTitle(e.target.value)} maxLength={180} required placeholder="Ví dụ: Bảo trì hệ thống"/></label><label>Nội dung<textarea value={noticeBody} onChange={e=>setNoticeBody(e.target.value)} maxLength={2000} rows={4} required placeholder="Nhập nội dung thông báo..."/></label><label>Người nhận<select value={noticeRecipient} onChange={e=>setNoticeRecipient(e.target.value)}><option value="">Tất cả người dùng đang hoạt động</option>{users.filter(u=>u.role!=='Admin'&&u.status==='Active').map(u=><option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label><button className="btn btn-primary" disabled={noticeBusy} type="submit"><Send size={16}/>{noticeBusy?'Đang gửi...':'Gửi thông báo'}</button></form><h3 className="admin-notification-history-title">Thông báo gần đây</h3><button className="btn btn-outline btn-small" onClick={()=>api('/admin/notifications').then(d=>setNoticeHistory(d.items||[])).catch(e=>alert(e.message))}>Tải lịch sử</button>{noticeHistory.length?<div className="notification-list">{noticeHistory.map((n,i)=><article className="notification-item" key={`${n.createdAt}-${i}`}><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString('vi-VN')} · {n.readCount||0}/{n.recipientCount||0} đã đọc</small></article>)}</div>:<p className="muted">Nhấn “Tải lịch sử” để xem các thông báo đã gửi.</p>}</section>}
      </section>
    </div>
  </main>;
}
function PhoneRequestsAdmin(){const [items,setItems]=useState([]);const [loading,setLoading]=useState(true);const load=()=>api('/admin/phone-requests').then(d=>setItems(d.items||[])).catch(e=>alert(e.message)).finally(()=>setLoading(false));useEffect(()=>{load()},[]);const decide=async(u,action)=>{if(!window.confirm(action==='approve'?`Duyệt số ${u.pendingPhone} cho ${u.name}?`:`Từ chối đổi số điện thoại của ${u.name}?`))return;try{await api(`/admin/phone-requests/${u.id}`,{method:'PATCH',body:JSON.stringify({action})});load()}catch(e){alert(e.message)}};return <div><div className="admin-actions-inline"><p>Kiểm tra số điện thoại mới do người dùng gửi lên trước khi cập nhật chính thức.</p><button className="btn btn-outline btn-small" onClick={load}>Làm mới</button></div>{loading?<p>Đang tải...</p>:items.length?<div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Email</th><th>Số hiện tại</th><th>Số đề nghị</th><th>Thao tác</th></tr></thead><tbody>{items.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.phone||'Chưa có'}</td><td><strong>{u.pendingPhone}</strong></td><td><div className="admin-actions-inline"><button className="btn btn-primary btn-small" onClick={()=>decide(u,'approve')}>Duyệt</button><button className="btn btn-outline btn-small" onClick={()=>decide(u,'reject')}>Từ chối</button></div></td></tr>)}</tbody></table></div>:<div className="empty-state">Không có yêu cầu đổi số điện thoại đang chờ duyệt.</div>}</div>}
function AdminMessages(){return <div className="admin-message-info"><MessageCircle size={34}/><h3>Quản lý tin nhắn</h3><p>Tin nhắn riêng tư giữa người mua và người đăng được quản lý trong giao diện hội thoại. Chỉ xem hoặc xử lý nội dung khi có cơ sở và quyền phù hợp.</p><Link to="/messages" className="btn btn-primary">Mở giao diện tin nhắn</Link></div>}
function SecurityAdmin(){
 const [data,setData]=useState(null);const [error,setError]=useState('');const load=()=>api('/admin/security').then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[]);
 return <section className="security-admin">{error&&<div className="error-message">{error}</div>}<div className="admin-quick-grid"><div className="panel security-summary"><ShieldCheck/><strong>{data?.blocked?.length??'—'}</strong><span>Tài khoản đang bị khóa</span></div><div className="panel security-summary"><Flag/><strong>{data?.pendingReports?.length??'—'}</strong><span>Báo cáo chờ xử lý</span></div><div className="panel security-summary"><Users/><strong>{data?.recentUsers?.length??'—'}</strong><span>Tài khoản mới trong 7 ngày</span></div></div><button className="btn btn-outline btn-small" onClick={load}>Làm mới cảnh báo</button><h3>Báo cáo tin đăng đang chờ</h3>{data?.pendingReports?.length?<div className="table-wrap"><table><thead><tr><th>Tin đăng</th><th>Người báo cáo</th><th>Lý do</th><th>Ngày gửi</th><th></th></tr></thead><tbody>{data.pendingReports.map(r=><tr key={r.id}><td>{r.propertyTitle}</td><td>{r.reporterName}</td><td>{r.reason}{r.details&&<small className="admin-cell-sub">{r.details}</small>}</td><td>{new Date(r.createdAt).toLocaleString('vi-VN')}</td><td><Link className="btn btn-outline btn-small" to={`/properties/${r.propertyId}`}>Xem tin</Link></td></tr>)}</tbody></table></div>:<p className="muted">Không có báo cáo đang chờ.</p>}<h3>Tài khoản mới trong 7 ngày</h3>{data?.recentUsers?.length?<div className="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Ngày tạo</th></tr></thead><tbody>{data.recentUsers.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{new Date(u.createdAt).toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div>:<p className="muted">Chưa có tài khoản mới.</p>}<h3>Tài khoản bị khóa</h3>{data?.blocked?.length?<div className="table-wrap"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th></tr></thead><tbody>{data.blocked.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody></table></div>:<p className="muted">Không có tài khoản bị khóa.</p>}<p className="demo-note">Trung tâm này tổng hợp các tín hiệu quản trị hiện có (báo cáo, tài khoản mới và tài khoản bị khóa); chưa phải hệ thống phát hiện tự động đăng nhập bất thường.</p></section>;
}
function ReportsAdmin(){const [items,setItems]=useState([]);const [error,setError]=useState('');const load=()=>api('/admin/reports').then(d=>setItems(d.items)).catch(e=>setError(e.message));useEffect(()=>{load()},[]);return <div>{error&&<div className="error-message">{error}</div>}{items.length?<div className="table-wrap"><table><thead><tr><th>Tin ID</th><th>Lý do</th><th>Chi tiết</th><th>Trạng thái</th><th></th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td>{r.propertyId}</td><td>{r.reason}</td><td>{r.details}</td><td>{r.status}</td><td><button className="btn btn-outline btn-small" onClick={async()=>{try{await api(`/admin/reports/${r.id}`,{method:'PATCH'});load()}catch(e){alert(e.message)}}}>Đã xử lý</button></td></tr>)}</tbody></table></div>:<div className="empty-state">Chưa có báo cáo vi phạm.</div>}</div>}

function AgentAvatar({ agent, size = 'large' }) {
 const [savedFrame,setSavedFrame]=useState(()=>{try{return localStorage.getItem(`dre-avatar-frame-${agent?.id}`)||'auto'}catch{return 'auto'}});
 useEffect(()=>{const sync=()=>{try{setSavedFrame(localStorage.getItem(`dre-avatar-frame-${agent?.id}`)||'auto')}catch{}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[agent?.id]);
 const level = Number(agent?.totalListings ?? agent?.activeListings ?? 0) >= 1000 ? 'diamond' : Number(agent?.totalListings ?? agent?.activeListings ?? 0) >= 100 ? 'gold' : Number(agent?.totalListings ?? agent?.activeListings ?? 0) >= 10 ? 'silver' : 'default';
 const chosen = savedFrame || 'auto';
 const frame = chosen === 'auto' ? level : chosen;
 return <div className={`agent-avatar-frame frame-${frame} ${size === 'small' ? 'agent-avatar-small' : ''}`}>{agent?.avatarUrl ? <img src={agent.avatarUrl} alt={agent.name || 'Ảnh đại diện'}/> : <UserRound size={size === 'small' ? 24 : 38}/>}</div>;
}
function AgentsPage(){
 const [items,setItems]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [q,setQ]=useState(''); const [need,setNeed]=useState(''); const [kind,setKind]=useState('');
 useEffect(()=>{setLoading(true);const params=new URLSearchParams();if(need)params.set('transaction',need);if(kind)params.set('category',kind);api(`/agents${params.toString()?'?'+params.toString():''}`).then(d=>setItems(d.items||[])).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[need,kind]);
 const filtered=items.filter(a=>`${a.name||''} ${a.phone||''}`.toLowerCase().includes(q.toLowerCase()));
 const rank=a=>{const n=Number(a.totalListings??a.activeListings??0);return n>=1000?'Kim cương':n>=100?'Vàng':n>=10?'Bạc':'Thành viên';};
 return <main className="container page-main agents-page"><div className="page-title-row"><div><span className="section-kicker">CỘNG ĐỒNG CHUYÊN GIA</span><h1>Nhà môi giới bất động sản</h1><p>Tìm người đăng tin, xem hồ sơ cá nhân và các bất động sản đang giới thiệu.</p></div></div>
 <div className="agents-layout"><section className="agents-main"><div className="agents-toolbar"><label className="agents-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm theo tên nhà môi giới..."/></label><select aria-label="Nhu cầu" value={need} onChange={e=>setNeed(e.target.value)}><option value="">Mua/bán/thuê</option><option value="Bán">Cần bán</option><option value="Cho thuê">Cho thuê</option></select><select aria-label="Loại nhà đất" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Tất cả loại nhà đất</option><option>Nhà riêng</option><option>Đất nền</option><option>Căn hộ</option><option>Biệt thự</option><option>Mặt bằng</option><option>Khách sạn</option><option>Phòng trọ</option></select><span>{filtered.length} hồ sơ</span></div>
 {loading?<div className="empty-state">Đang tải danh sách nhà môi giới...</div>:error?<div className="empty-state">{error}</div>:filtered.length?<div className="agents-list">{filtered.map(a=><article className="agent-list-card" key={a.id}><AgentAvatar agent={a}/><div className="agent-list-info"><div className="agent-list-name"><Link to={`/agents/${a.id}`}>{a.name}</Link>{a.role==='Admin'?<AdminBadge/>:a.role==='Support'?<SupportBadge/>:a.verified&&<VerifiedBadge/>}<span className={`agent-rank-tag rank-${rank(a).toLowerCase().replace(' ','-')}`}>{rank(a)}</span></div><p><MapPin size={14}/> Đà Nẵng {a.phone?` · ${a.phone}`:''}</p><div className="agent-list-stats"><span><Building2 size={14}/>{a.activeListings||0} tin đang hiển thị</span></div><Link className="agent-profile-link" to={`/agents/${a.id}`}>Xem trang cá nhân <ArrowRight size={14}/></Link></div><div className="agent-list-bio-box"><strong>Giới thiệu</strong><p className="agent-list-bio">{a.bio||'Chưa có thông tin giới thiệu.'}</p></div></article>)}</div>:<div className="empty-state">Chưa có nhà môi giới phù hợp. Người dùng có tin đang hiển thị sẽ xuất hiện tại đây.</div>}</section>
 <aside className="agents-sidebar"><div className="agents-sidebar-head"><ShieldCheck size={18}/><div><strong>Nhà môi giới chuyên nghiệp</strong><small>Hồ sơ có nhiều tin đăng</small></div></div>{[...items].sort((a,b)=>(b.activeListings||0)-(a.activeListings||0)).slice(0,5).map((a,i)=><Link className="professional-agent" key={a.id} to={`/agents/${a.id}`}><span className="professional-number">{i+1}</span><AgentAvatar agent={a} size="small"/><span><strong>{a.name}</strong><small>{a.activeListings||0} tin · {rank(a)}</small></span><ArrowRight size={15}/></Link>)}{!items.length&&!loading&&<p className="muted">Danh sách sẽ hiển thị khi có nhà môi giới.</p>}</aside></div></main>;
}

function AgentProfilePage({user}){
 const {id}=useParams();const [data,setData]=useState(null);const [error,setError]=useState('');
 useEffect(()=>{api(`/agents/${id}`).then(setData).catch(e=>setError(e.message))},[id]);
 if(error)return <main className="container page-main"><div className="empty-state"><h2>{error}</h2><Link className="btn btn-primary" to="/properties">Quay lại tin đăng</Link></div></main>;
 if(!data)return <main className="container page-main">Đang tải hồ sơ môi giới...</main>;
 const a=data.agent;
 return <main className="container page-main"><section className="panel agent-profile-card"><AgentAvatar agent={a} /><div className="agent-profile-info"><span className="section-kicker">HỒ SƠ NGƯỜI ĐĂNG</span><h1>{a.name}{a.role==='Admin'?<AdminBadge/>:a.role==='Support'?<SupportBadge/>:a.verified&&<VerifiedBadge/>}</h1><p>{a.verified?'Môi giới đã được xác thực thông tin cá nhân':'Người dùng DaNangRealEstate'}</p>{a.bio&&<div className="agent-bio"><strong>Giới thiệu</strong><p>{a.bio}</p></div>}<div className="agent-profile-meta"><span><Building2 size={15}/> {a.activeListings||0} tin đang hiển thị</span><span><ShieldCheck size={15}/> {a.verifiedListings||0} tin đã xác thực</span>{a.createdAt&&<span>Tham gia {new Date(a.createdAt).toLocaleDateString('vi-VN')}</span>}</div>{a.phone&&<a className="btn btn-primary" href={`tel:${a.phone}`}><Phone size={16}/> {a.phone}</a>}{user&&user.id!==a.id&&<button className="btn btn-orange" onClick={async()=>{try{const d=await api('/messages/conversations',{method:'POST',body:JSON.stringify({recipientId:a.id})});window.location.href=`/messages?conversation=${d.conversationId}`}catch(e){alert(e.message)}}}><MessageCircle size={16}/> Nhắn tin</button>}</div></section><div className="section-heading"><div><span className="section-kicker">TIN ĐANG HIỂN THỊ</span><h2>Bất động sản của {a.name}</h2></div></div>{data.items?.length?<div className="property-grid">{data.items.map(p=><PropertyCard key={p.id} p={p} favorite={false} onFavorite={()=>alert('Đăng nhập để lưu tin yêu thích.')}/>)}</div>:<div className="empty-state">Người dùng hiện chưa có tin đăng đang hiển thị.</div>}</main>;
}
function MapPage(){
 const [district,setDistrict]=useState(''); const [items,setItems]=useState([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{api(`/properties?limit=30${district?`&district=${encodeURIComponent(district)}`:''}`).then(d=>setItems(d.items||[])).catch(()=>setItems([])).finally(()=>setLoading(false));},[district]);
 const mapQuery=encodeURIComponent(district?`${district}, Đà Nẵng, Việt Nam`:'Đà Nẵng, Việt Nam');
 return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">KHÁM PHÁ KHU VỰC</span><h1>Bản đồ bất động sản Đà Nẵng</h1><p>Tra cứu khu vực và mở vị trí tin đăng trên bản đồ.</p></div></div><div className="map-tools panel"><label>Khu vực<select value={district} onChange={e=>{setDistrict(e.target.value);setLoading(true)}}><option value="">Toàn Đà Nẵng</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label><a className="btn btn-outline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}><ExternalLink size={16}/> Mở Google Maps</a></div><div className="map-layout"><iframe title="Bản đồ Đà Nẵng" className="map-embed" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=107.95%2C15.95%2C108.32%2C16.20&layer=mapnik&marker=16.0678%2C108.2208`}/><section className="map-list panel"><h2>Tin đăng trong khu vực</h2>{loading?<p>Đang tải tin đăng...</p>:items.length?items.map(p=><article className="map-property" key={p.id}><img src={p.coverImage||FALLBACK} alt=""/><div><Link to={`/properties/${p.id}`}>{p.title}</Link><small>{p.district} · {money(p.price,p.transaction)}</small><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address}, ${p.district}, Đà Nẵng`)}`}>Tìm khu vực <ExternalLink size={12}/></a></div></article>):<p>Chưa có tin đăng phù hợp.</p>}<p className="demo-note">Bản đồ đang hiển thị khu vực Đà Nẵng tổng quát. Vị trí từng tin cần được người đăng cung cấp tọa độ chính xác để ghim đúng địa chỉ.</p></section></div></main>;
}
function RealEstateNewsPage(){
 const [topic,setTopic]=useState('danang');
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [updatedAt,setUpdatedAt]=useState(null);
 const topics=[{id:'danang',label:'Bất động sản Đà Nẵng'},{id:'market',label:'Thị trường'},{id:'planning',label:'Quy hoạch & hạ tầng'},{id:'legal',label:'Pháp lý nhà đất'},{id:'investment',label:'Đầu tư & tài chính'}];
 const load=useCallback(async(selected=topic)=>{
   setLoading(true);setError('');
   try{const data=await api(`/news?topic=${encodeURIComponent(selected)}`);setItems(data.items||[]);setUpdatedAt(new Date());}
   catch(e){setError(e.message||'Không thể tải tin tức lúc này.');setItems([])}
   finally{setLoading(false)}
 },[topic]);
 useEffect(()=>{load(topic)},[topic]);
 // Tự làm mới tin mỗi 24 giờ khi người dùng vẫn mở trang Tin tức.
 useEffect(()=>{
   const timer=window.setInterval(()=>{load(topic)},24*60*60*1000);
   return ()=>window.clearInterval(timer);
 },[load,topic]);
 return <main className="container page-main news-page">
   <div className="page-title-row"><div><span className="section-kicker">TIN TỨC THỊ TRƯỜNG</span><h1>Tin tức bất động sản</h1><p>Cập nhật tin mới từ các nguồn báo chí công khai, tập trung vào Đà Nẵng và những chủ đề bạn quan tâm.</p></div><button className="btn btn-outline" onClick={()=>load(topic)} disabled={loading}><RefreshCw size={15}/> {loading?'Đang cập nhật':'Làm mới tin'}</button></div>
   <div className="news-topic-tabs" role="tablist" aria-label="Chủ đề tin tức">{topics.map(t=><button key={t.id} type="button" className={topic===t.id?'active':''} onClick={()=>setTopic(t.id)}>{t.label}</button>)}</div>
   <div className="news-meta"><span><Newspaper size={15}/> Nguồn: Google News RSS · Bài viết thuộc các đơn vị xuất bản gốc</span>{updatedAt&&<span><Clock3 size={14}/> Cập nhật lúc {updatedAt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span>}</div>
   {loading?<div className="empty-state"><RefreshCw size={26}/><p>Đang lấy tin mới nhất...</p></div>:error?<div className="panel news-error"><h3>Chưa tải được tin tức</h3><p>{error}</p><button className="btn btn-primary" onClick={()=>load(topic)}>Thử lại</button><p className="demo-note">Kiểm tra backend đang chạy và máy chủ có thể truy cập nguồn RSS bên ngoài.</p></div>:items.length?<div className="news-list">{items.map((item,index)=><article className="panel news-card" key={item.link||`${item.title}-${index}`}><div className="news-card-top"><span className="news-source">{item.source||'Nguồn tin'}</span><time>{item.pubDate?new Date(item.pubDate).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}):'Mới cập nhật'}</time></div><h2><a href={item.link} target="_blank" rel="noreferrer">{item.title}</a></h2>{item.description&&<p>{item.description}</p>}<a className="text-link" href={item.link} target="_blank" rel="noreferrer">Đọc bài viết gốc <ArrowRight size={15}/></a></article>)}</div>:<div className="empty-state"><Newspaper size={30}/><h3>Chưa có tin phù hợp</h3><p>Thử chọn một chủ đề khác hoặc làm mới danh sách.</p></div>}
   <p className="news-disclaimer">Tin được tổng hợp tự động từ RSS công khai. Tiêu đề, nội dung và bản quyền thuộc nguồn báo chí gốc; hãy mở liên kết để đọc toàn bài. Tin mới có thể thay đổi theo thời điểm và nguồn cung cấp.</p>
 </main>;
}

function MortgageCalculator(){
 const [price,setPrice]=useState('3000000000');const [deposit,setDeposit]=useState('30');const [rate,setRate]=useState('9');const [years,setYears]=useState('20');
 const principal=Math.max(0,Number(price||0)*(1-Number(deposit||0)/100));const n=Math.max(1,Number(years||1)*12);const r=Math.max(0,Number(rate||0)/1200);const monthly=r===0?principal/n:principal*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);const moneyFmt=v=>Math.round(v).toLocaleString('vi-VN')+' đ';
 return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">CÔNG CỤ HỖ TRỢ</span><h1>Tính khoản vay mua nhà</h1><p>Ước tính khoản trả hàng tháng dựa trên giá nhà, vốn tự có, lãi suất và thời hạn vay.</p></div></div><div className="calculator-layout"><form className="panel calculator-form" onSubmit={e=>e.preventDefault()}><label>Giá bất động sản (VNĐ)<input type="number" min="0" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Vốn tự có (%)<input type="number" min="0" max="100" value={deposit} onChange={e=>setDeposit(e.target.value)}/></label><label>Lãi suất năm (%)<input type="number" min="0" max="40" step="0.1" value={rate} onChange={e=>setRate(e.target.value)}/></label><label>Thời hạn vay (năm)<select value={years} onChange={e=>setYears(e.target.value)}>{[5,10,15,20,25,30].map(y=><option key={y} value={y}>{y} năm</option>)}</select></label></form><section className="panel calculator-result"><span className="section-kicker">KẾT QUẢ ƯỚC TÍNH</span><h2>{moneyFmt(monthly)}</h2><p>Khoản thanh toán hàng tháng</p><div className="detail-table"><div><span>Số tiền vay</span><strong>{moneyFmt(principal)}</strong></div><div><span>Vốn tự có</span><strong>{moneyFmt(Number(price||0)*Number(deposit||0)/100)}</strong></div><div><span>Tổng trả dự kiến</span><strong>{moneyFmt(monthly*n)}</strong></div><div><span>Tiền lãi ước tính</span><strong>{moneyFmt(Math.max(0,monthly*n-principal))}</strong></div></div><p className="demo-note">Đây là ước tính theo lãi suất cố định và phương thức trả góp đều, không phải đề nghị cho vay. Lãi suất thực tế, phí và lịch trả nợ phụ thuộc ngân hàng.</p></section></div></main>;
}
function AppointmentsPage({user}){
 const [items,setItems]=useState([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const load=useCallback(()=>api('/appointments').then(d=>{setItems(d.items||[]);setError('')}).catch(e=>setError(e.message)).finally(()=>setLoading(false)),[]);useEffect(()=>{if(user)load();else setLoading(false)},[user,load]);
 if(!user)return <main className="container page-main"><div className="empty-state"><CalendarDays size={36}/><h2>Đăng nhập để quản lý lịch xem nhà</h2><Link className="btn btn-primary" to="/login">Đăng nhập</Link></div></main>;
 const update=async(a,status)=>{try{await api(`/appointments/${a.id}`,{method:'PATCH',body:JSON.stringify({status})});load()}catch(e){alert(e.message)}};
 return <main className="container page-main"><div className="page-title-row"><div><span className="section-kicker">LỊCH HẸN</span><h1>Lịch xem nhà</h1><p>Theo dõi yêu cầu xem nhà bạn đã gửi hoặc nhận từ khách hàng.</p></div><button className="btn btn-outline" onClick={load}>Làm mới</button></div>{error&&<div className="error-message">{error}</div>}{loading?<div className="empty-state">Đang tải lịch hẹn...</div>:items.length?<div className="appointment-list">{items.map(a=><article className="panel appointment-card" key={a.id}><div><span className={`status status-${String(a.status).toLowerCase()}`}>{({Pending:'Chờ xác nhận',Accepted:'Đã xác nhận',Declined:'Đã từ chối',Completed:'Hoàn tất',Cancelled:'Đã hủy'})[a.status]||a.status}</span><h3><Link to={`/properties/${a.propertyId}`}>{a.propertyTitle}</Link></h3><p><CalendarDays size={15}/> {new Date(a.visitAt).toLocaleDateString('vi-VN')}</p><p><MapPin size={15}/> {a.address}</p><p>{a.buyerId===user.id?`Người liên hệ: ${a.ownerName}`:`Khách hàng: ${a.buyerName} · ${a.buyerPhone||a.buyerEmail}`}</p>{a.note&&<p>Ghi chú: {a.note}</p>}</div>{a.canManage&&a.ownerId===user.id&&a.status==='Pending'&&<div className="appointment-actions"><button className="btn btn-primary btn-small" onClick={()=>update(a,'Accepted')}>Xác nhận</button><button className="btn btn-outline btn-small" onClick={()=>update(a,'Declined')}>Từ chối</button></div>}{a.buyerId===user.id&&['Pending','Accepted'].includes(a.status)&&<button className="btn btn-outline btn-small" onClick={()=>update(a,'Cancelled')}>Hủy lịch</button>}</article>)}</div>:<div className="empty-state"><CalendarDays size={36}/><h3>Chưa có lịch xem nhà</h3><p>Mở tin bất động sản và chọn “Đặt lịch xem nhà” để gửi yêu cầu.</p><Link to="/properties" className="btn btn-primary">Khám phá bất động sản</Link></div>}</main>;
}

export default function App(){
  const {user,setUser,logout,refreshUser}=useAuth();
  const [theme,setTheme] = useState(() => { try { return localStorage.getItem('dre-theme') || 'light'; } catch { return 'light'; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('dre-theme', theme); } catch {} }, [theme]);
  const toggleTheme = () => setTheme(value => value === 'dark' ? 'light' : 'dark');
  const doLogout=()=>{logout();window.location.href='/'};
  return <><Header user={user} logout={doLogout} theme={theme} toggleTheme={toggleTheme}/><Routes>
    <Route path="/" element={<Home user={user}/>}/>
    <Route path="/properties" element={<Properties user={user}/>}/>
    <Route path="/map" element={<MapPage/>}/>
    <Route path="/news" element={<RealEstateNewsPage/>}/>
    <Route path="/agents" element={<AgentsPage/>}/>
    <Route path="/agents/:id" element={<AgentProfilePage user={user}/>}/>
    <Route path="/tools/calculator" element={<MortgageCalculator/>}/>
    <Route path="/appointments" element={<AppointmentsPage user={user}/>}/>
    <Route path="/properties/:id" element={<PropertyDetail user={user}/>}/>
    <Route path="/login" element={<AuthPage mode="login" setUser={setUser}/>}/>
    <Route path="/register" element={<AuthPage mode="register" setUser={setUser}/>}/>
    <Route path="/post" element={<PostProperty user={user} refreshUser={refreshUser}/>}/>
    <Route path="/properties/:id/edit" element={<PostProperty user={user} refreshUser={refreshUser} editMode/>}/>
    <Route path="/tokens" element={<TokensPage user={user} refreshUser={refreshUser}/>}/>
    <Route path="/profile" element={<ProfilePage user={user} refreshUser={refreshUser}/>}/>
    <Route path="/my-properties" element={<MyProperties user={user} refreshUser={refreshUser}/>}/>
    <Route path="/favorites" element={<Favorites user={user}/>}/>
    <Route path="/messages" element={<MessagesPage user={user}/>}/>
    <Route path="/notifications" element={<NotificationsPage user={user}/>}/>
    <Route path="/admin" element={<Admin user={user}/>}/>
    <Route path="*" element={<main className="container page-main empty-state"><h1>Không tìm thấy trang</h1><Link to="/" className="btn btn-primary">Về trang chủ</Link></main>}/>
  </Routes><Footer/></>;
}
