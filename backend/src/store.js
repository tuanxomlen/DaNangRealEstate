import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const demoPhotos = [
  'https://images.unsplash.com/photo-160059_order?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
];

export const store = {
  users: [],
  properties: [],
  favorites: new Set(),
  views: [],
  reports: [],
  notifications: [],
  tokenTransactions: [],
  categories: ['Đất nền', 'Nhà riêng', 'Căn hộ', 'Biệt thự', 'Mặt bằng', 'Khách sạn', 'Phòng trọ']
};

export async function seedDemo() {
  if (store.users.length) return;
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@danangrealestate.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  store.users.push({
    id: randomUUID(), name: 'Quản trị viên', email: adminEmail,
    phone: '0900000000', passwordHash: await bcrypt.hash(adminPassword, 10),
    role: 'Admin', status: 'Active', verified: true, tokens: 0, createdAt: new Date().toISOString()
  });
  const areas = ['Hải Châu', 'Sơn Trà', 'Ngũ Hành Sơn', 'Thanh Khê', 'Liên Chiểu', 'Cẩm Lệ'];
  const templates = [
    ['Nhà phố hiện đại gần trung tâm', 'Nhà riêng', 'Bán', 6800000000, 95, 'Hải Châu'],
    ['Đất nền khu dân cư', 'Đất nền', 'Bán', 3250000000, 100, 'Cẩm Lệ'],
    ['Căn hộ tiện nghi gần biển', 'Căn hộ', 'Cho thuê', 12000000, 68, 'Sơn Trà'],
    ['Mặt bằng kinh doanh mặt tiền', 'Mặt bằng', 'Cho thuê', 25000000, 110, 'Ngũ Hành Sơn'],
    ['Nhà 3 tầng phù hợp gia đình', 'Nhà riêng', 'Bán', 5900000000, 120, 'Thanh Khê'],
    ['Căn hộ view thành phố', 'Căn hộ', 'Bán', 2750000000, 72, 'Sơn Trà'],
    ['Biệt thự sân vườn', 'Biệt thự', 'Bán', 14500000000, 260, 'Ngũ Hành Sơn'],
    ['Phòng trọ đầy đủ nội thất', 'Phòng trọ', 'Cho thuê', 3500000, 28, 'Liên Chiểu'],
    ['Đất góc đường rộng', 'Đất nền', 'Bán', 4200000000, 125, 'Cẩm Lệ'],
    ['Nhà gần trường học', 'Nhà riêng', 'Cho thuê', 15000000, 90, 'Hải Châu'],
    ['Khách sạn mini', 'Khách sạn', 'Bán', 18900000000, 210, 'Sơn Trà'],
    ['Căn hộ mới nội thất đẹp', 'Căn hộ', 'Cho thuê', 9500000, 55, 'Ngũ Hành Sơn']
  ];
  templates.forEach((t, i) => {
    store.properties.push({
      id: randomUUID(), code: `DN${String(i + 1).padStart(5, '0')}`,
      title: t[0], category: t[1], transaction: t[2], price: t[3], area: t[4],
      district: t[5], ward: 'Khu vực minh họa', address: `${t[5]}, Đà Nẵng`,
      roadWidth: i % 2 ? 7.5 : 5.5, frontage: 5 + (i % 3), bedrooms: i % 4,
      bathrooms: 1 + (i % 3), floors: 1 + (i % 4), direction: ['Đông', 'Tây', 'Nam', 'Bắc'][i % 4],
      legal: 'Thông tin minh họa', description: `${t[0]} tại ${t[5]}, Đà Nẵng. Đây là dữ liệu minh họa để thử nghiệm website, vui lòng xác minh thông tin thực tế trước khi giao dịch.`,
      images: [demoPhotos[(i + 1) % demoPhotos.length], demoPhotos[(i + 2) % demoPhotos.length]],
      coverImage: demoPhotos[(i + 1) % demoPhotos.length], status: 'Approved',
      featured: i < 3, views: 25 * (i + 1), ownerId: null,
      ownerName: 'DaNangRealEstate', createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
}
