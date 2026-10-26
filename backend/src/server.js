import crypto from 'node:crypto';
import { createServer } from 'node:http';

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { getPool, sql } from './db.js';
import {
  TIERS,
  priorityDays,
  effectiveLevel,
  publicUser,
  planBoost,
  applyPriority
} from './tokens.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 24) {
  console.warn('CẢNH BÁO: Hãy đặt JWT_SECRET dài ít nhất 24 ký tự trong backend/.env.');
}

app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'https:', 'http:'] } } }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '8mb' }));

// Tin tức bất động sản từ Google News RSS. Cache ngắn hạn để tránh gọi nguồn ngoài liên tục.
const newsCache = new Map();
const newsTopics = {
  danang: 'bất động sản Đà Nẵng',
  market: 'thị trường bất động sản Việt Nam',
  planning: 'quy hoạch hạ tầng Đà Nẵng bất động sản',
  legal: 'pháp lý nhà đất bất động sản Việt Nam',
  investment: 'đầu tư tài chính bất động sản Việt Nam'
};
function decodeNewsText(value = '', { preserveUrls = false } = {}) {
  // Decode RSS-escaped HTML first, then remove markup so href/src attributes
  // can never leak into the visible description.
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(preserveUrls ? /$^/ : /https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function rssTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  // Link URLs must be preserved for the article link; only visible text fields strip URLs.
  return match ? decodeNewsText(match[1], { preserveUrls: tag.toLowerCase() === 'link' }) : '';
}
app.get('/api/news', asyncRoute(async (req, res) => {
  const topic = newsTopics[String(req.query.topic || 'danang')] ? String(req.query.topic || 'danang') : 'danang';
  const cached = newsCache.get(topic);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return res.json({ items: cached.items, cached: true });
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(newsTopics[topic])}&hl=vi&gl=VN&ceid=VN:vi`;
  try {
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'DaNangRealEstate/1.0 (RSS reader)' }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
    const xml = await response.text();
    const channel = xml.match(/<channel>([\s\S]*?)<\/channel>/i)?.[1] || xml;
    const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20).map(match => {
      const block = match[1];
      const sourceMatch = block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
      return {
        title: rssTag(block, 'title'),
        link: rssTag(block, 'link'),
        pubDate: rssTag(block, 'pubDate'),
        description: rssTag(block, 'description').slice(0, 360),
        source: sourceMatch ? decodeNewsText(sourceMatch[1]) : 'Google News'
      };
    }).filter(item => item.title && /^https?:\/\//i.test(item.link));
    newsCache.set(topic, { at: Date.now(), items });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ items, cached: false });
  } catch (error) {
    if (cached) return res.json({ items: cached.items, cached: true, stale: true });
    res.status(502).json({ error: 'Không thể lấy tin tức từ nguồn RSS lúc này. Vui lòng thử lại sau.' });
  }
}));

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const now = () => new Date().toISOString();

function tokenFor(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET || 'local-only-unsafe-secret-change-me',
    { expiresIn: '8h' }
  );
}

// Chuyển giá trị tùy chọn thành số hoặc null.
// Không truyền chuỗi rỗng, NaN, Infinity hoặc số vượt giới hạn SQL DECIMAL.
function optionalNumber(value, maxValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || number > maxValue) {
    return null;
  }

  return number;
}

function requiredNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return NaN;
  }
  return Number(value);
}

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    passwordHash: row.passwordHash,
    role: row.role,
    status: row.status,
    verified: Boolean(row.verified),
    tokens: Number(row.tokens || 0),
    avatarUrl: row.avatarUrl || null,
    bio: row.bio || '', pendingPhone: row.pendingPhone || '', phoneChangeStatus: row.phoneChangeStatus || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : now()
  };
}

function mapProperty(row) {
  if (!row) return null;

  let images = [];

  try {
    images = JSON.parse(row.imagesJson || '[]');
    if (!Array.isArray(images)) images = [];
  } catch {
    images = [];
  }

  const property = {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    transaction: row.transaction,
    price: Number(row.price || 0),
    area: Number(row.area || 0),
    district: row.district,
    ward: row.ward || '',
    address: row.address,
    roadWidth: row.roadWidth == null ? null : Number(row.roadWidth),
    frontage: row.frontage == null ? null : Number(row.frontage),
    bedrooms: Number(row.bedrooms || 0),
    bathrooms: Number(row.bathrooms || 0),
    floors: Number(row.floors || 0),
    direction: row.direction || '',
    legal: row.legal || '',
    description: row.description || '',
    images,
    coverImage: images[0] ||
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
    status: row.status,
    featured: Boolean(row.featured),
    verified: Boolean(row.verified),
    priorityLevel: Number(row.priorityLevel || 0),
    priorityUntil: row.priorityUntil
      ? new Date(row.priorityUntil).toISOString()
      : null,
    listingUntil: row.listingUntil ? new Date(row.listingUntil).toISOString() : null,
    views: Number(row.views || 0),
    ownerId: row.ownerId || null,
    ownerName: row.ownerName || 'DaNangRealEstate',
    ownerAvatarUrl: row.ownerAvatarUrl || '',
    ownerPhone: row.ownerPhone || '',
    ownerBio: row.ownerBio || '',
    ownerVerified: Boolean(row.ownerVerified),
    ownerRole: row.ownerRole || 'User',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : now(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : now()
  };

  return { ...property, priorityLevel: effectiveLevel(property) };
}

function mapReport(row) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    reporterId: row.reporterId,
    reason: row.reason,
    details: row.details || '',
    status: row.status,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : now()
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: Number(row.amount || 0),
    balanceAfter: Number(row.balanceAfter || 0),
    note: row.note || '',
    propertyId: row.propertyId || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : now()
  };
}

const USER_COLUMNS = `
  Id AS id,
  FullName AS name,
  Email AS email,
  Phone AS phone,
  PasswordHash AS passwordHash,
  Role AS role,
  Status AS status,
  IsVerified AS verified,
  Tokens AS tokens,
  AvatarUrl AS avatarUrl,
  Bio AS bio, PendingPhone AS pendingPhone, PhoneChangeStatus AS phoneChangeStatus,
  CreatedAt AS createdAt
`;

const PROPERTY_COLUMNS = `
  p.Id AS id,
  p.Code AS code,
  p.Title AS title,
  p.Category AS category,
  p.TransactionType AS [transaction],
  p.Price AS price,
  p.Area AS area,
  p.District AS district,
  p.Ward AS ward,
  p.Address AS address,
  p.RoadWidth AS roadWidth,
  p.Frontage AS frontage,
  p.Bedrooms AS bedrooms,
  p.Bathrooms AS bathrooms,
  p.Floors AS floors,
  p.Direction AS direction,
  p.Legal AS legal,
  p.Description AS description,
  p.ImagesJson AS imagesJson,
  p.Status AS status,
  p.Featured AS featured,
  p.IsVerified AS verified,
  p.PriorityLevel AS priorityLevel,
  p.PriorityUntil AS priorityUntil,
  p.ListingUntil AS listingUntil,
  p.Views AS views,
  p.OwnerId AS ownerId,
  p.OwnerName AS ownerName,
  u.Phone AS ownerPhone,
  u.AvatarUrl AS ownerAvatarUrl,
  u.Bio AS ownerBio,
  u.Role AS ownerRole,
  p.CreatedAt AS createdAt,
  p.UpdatedAt AS updatedAt,
  ISNULL(u.IsVerified, 0) AS ownerVerified
`;

const PROPERTY_FROM = `
  FROM dbo.Properties p
  LEFT JOIN dbo.Users u ON u.Id = p.OwnerId
`;

async function findUserById(id) {
  const pool = await getPool();

  const result = await pool.request()
    .input('Id', sql.UniqueIdentifier, id)
    .query(`
      SELECT ${USER_COLUMNS}
      FROM dbo.Users
      WHERE Id = @Id
    `);

  return mapUser(result.recordset[0]);
}

async function findPropertyById(idOrCode) {
  const pool = await getPool();

  const result = await pool.request()
    .input('Id', sql.NVarChar(100), String(idOrCode))
    .query(`
      SELECT TOP 1 ${PROPERTY_COLUMNS}
      ${PROPERTY_FROM}
      WHERE CONVERT(NVARCHAR(36), p.Id) = @Id
         OR p.Code = @Id
    `);

  return mapProperty(result.recordset[0]);
}

async function saveTokenTransaction(userId, amount, note, options = {}) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const balanceResult = await new sql.Request(transaction)
      .input('UserId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT Tokens
        FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
        WHERE Id = @UserId
      `);

    if (!balanceResult.recordset.length) {
      throw new Error('Không tìm thấy tài khoản.');
    }

    const balance = Number(balanceResult.recordset[0].Tokens || 0);
    const nextBalance = balance + amount;

    if (nextBalance < 0) {
      throw new Error('Không đủ token để thực hiện giao dịch.');
    }

    await new sql.Request(transaction)
      .input('UserId', sql.UniqueIdentifier, userId)
      .input('Balance', sql.Int, nextBalance)
      .query(`
        UPDATE dbo.Users SET Tokens = @Balance WHERE Id = @UserId
      `);

    const id = randomUUID();
    const type = options.type || (amount > 0 ? 'grant' : 'spend');
    const safeNote = String(note || '').slice(0, 200);
    const createdBy = options.createdBy || userId;

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, id)
      .input('UserId', sql.UniqueIdentifier, userId)
      .input('Type', sql.NVarChar(20), type)
      .input('Amount', sql.Int, amount)
      .input('BalanceAfter', sql.Int, nextBalance)
      .input('Note', sql.NVarChar(200), safeNote)
      .input('PropertyId', sql.UniqueIdentifier, options.propertyId || null)
      .input('CreatedBy', sql.UniqueIdentifier, createdBy)
      .query(`
        INSERT INTO dbo.TokenTransactions
          (Id, UserId, Type, Amount, BalanceAfter, Note, PropertyId, CreatedBy)
        VALUES
          (@Id, @UserId, @Type, @Amount, @BalanceAfter, @Note, @PropertyId, @CreatedBy)
      `);

    await transaction.commit();

    return {
      id,
      userId,
      type,
      amount,
      balanceAfter: nextBalance,
      note: safeNote,
      propertyId: options.propertyId || null,
      createdBy,
      createdAt: now()
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Giao dịch có thể đã rollback.
    }
    throw error;
  }
}

async function seedAdminSql() {
  const pool = await getPool();

  const email = String(
    process.env.ADMIN_EMAIL || 'admin@danangrealestate.local'
  ).trim().toLowerCase();

  const existing = await pool.request()
    .input('Email', sql.NVarChar(254), email)
    .query('SELECT Id FROM dbo.Users WHERE Email = @Email');

  if (existing.recordset.length) {
    console.log('Tài khoản Admin đã tồn tại trong SQL Server.');
    return;
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || 'Admin123!',
    12
  );

  await pool.request()
    .input('Id', sql.UniqueIdentifier, id)
    .input('FullName', sql.NVarChar(120), 'Quản trị viên')
    .input('Email', sql.NVarChar(254), email)
    .input('Phone', sql.NVarChar(30), '0900000000')
    .input('PasswordHash', sql.NVarChar(255), passwordHash)
    .query(`
      INSERT INTO dbo.Users
        (Id, FullName, Email, Phone, PasswordHash, Role, Status, IsVerified, Tokens)
      VALUES
        (@Id, @FullName, @Email, @Phone, @PasswordHash, 'Admin', 'Active', 1, 0)
    `);

  console.log('Đã tạo tài khoản Admin trong SQL Server.');
}

async function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
  }

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET || 'local-only-unsafe-secret-change-me'
    );

    req.user = await findUserById(decoded.sub);

    if (!req.user || req.user.status !== 'Active') {
      return res.status(401).json({
        message: 'Tài khoản không hợp lệ hoặc đã bị khóa.'
      });
    }

    return next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError' ||
      error.name === 'NotBeforeError'
    ) {
      return res.status(401).json({
        message: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.'
      });
    }

    return next(error);
  }
}

const auth = authMiddleware;

// Upload ảnh lên Cloudinary; backend chỉ ký yêu cầu, không lưu file ảnh cục bộ.
app.post('/api/uploads', auth, asyncRoute(async (req, res) => {
  const { fileName = 'image', type, data, purpose = 'property' } = req.body || {};
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(type) || typeof data !== 'string') {
    return res.status(400).json({ message: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.' });
  }
  const match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== type) {
    return res.status(400).json({ message: 'Dữ liệu ảnh không hợp lệ.' });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    return res.status(413).json({ message: 'Mỗi ảnh phải nhỏ hơn hoặc bằng 5 MB.' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({ message: 'Chưa cấu hình Cloudinary. Hãy điền CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trong backend/.env rồi khởi động lại backend.' });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = purpose === 'avatar' ? 'danang-real-estate/avatars' : 'danang-real-estate/properties';
  const publicId = crypto.randomUUID();
  const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), String(fileName).slice(0, 120));
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('signature', signature);

  const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
    method: 'POST',
    body: form
  });
  const result = await cloudinaryResponse.json().catch(() => ({}));
  if (!cloudinaryResponse.ok || !result.secure_url) {
    console.error('Cloudinary upload failed:', result?.error?.message || cloudinaryResponse.statusText);
    return res.status(502).json({ message: 'Không tải được ảnh lên Cloudinary. Hãy kiểm tra cấu hình Cloudinary và thử lại.' });
  }
  return res.status(201).json({ url: result.secure_url, fileName: String(fileName).slice(0, 120) });
}));

function adminOnly(req, res, next) {
  if (!['Admin', 'Support'].includes(req.user?.role)) {
    return res.status(403).json({
      message: 'Bạn không có quyền thực hiện thao tác này.'
    });
  }
  return next();
}

// Chỉ quản trị viên chính mới được thay đổi vai trò tài khoản.
function superAdminOnly(req, res, next) {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ message: 'Chỉ quản trị viên chính mới được nâng cấp vai trò người dùng.' });
  }
  return next();
}

const publicProperty = property => property.status === 'Approved' && (!property.listingUntil || new Date(property.listingUntil).getTime() > Date.now());

// ==================== HEALTH & DOCS ====================

app.get('/api/health', asyncRoute(async (req, res) => {
  const pool = await getPool();
  await pool.request().query('SELECT 1 AS ok');

  res.json({
    status: 'ok',
    app: 'DaNangRealEstate',
    mode: 'sql-server',
    database: 'connected'
  });
}));

app.get('/api/docs', (req, res) => {
  res.json({
    openapi: '3.0.3',
    info: { title: 'DaNangRealEstate API', version: '1.0.0' },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths: Object.fromEntries([
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/me',
      '/api/properties',
      '/api/properties/{id}',
      '/api/favorites',
      '/api/admin/dashboard'
    ].map(path => [path, { get: { summary: `Endpoint ${path}` } }]))
  });
});

// ==================== AUTH ====================

async function ensureEmailVerificationTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.EmailVerificationCodes', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.EmailVerificationCodes (
        Email NVARCHAR(254) NOT NULL PRIMARY KEY,
        FullName NVARCHAR(120) NOT NULL,
        Phone NVARCHAR(30) NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        CodeHash CHAR(64) NOT NULL,
        ExpiresAt DATETIME2 NOT NULL,
        LastSentAt DATETIME2 NOT NULL,
        Attempts INT NOT NULL CONSTRAINT DF_EmailVerificationCodes_Attempts DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_EmailVerificationCodes_CreatedAt DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

function emailTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    const error = new Error('Chưa cấu hình SMTP_USER và SMTP_PASS trong backend/.env.');
    error.status = 503;
    throw error;
  }
  return nodemailer.createTransport({ host, port, secure: String(process.env.SMTP_SECURE || (port === 465)).toLowerCase() === 'true', auth: { user, pass } });
}

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, phone = '', password } = req.body || {};
  if (!String(name || '').trim() || !String(email || '').trim() || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập họ tên, email và mật khẩu.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
  }
  if (String(name).trim().length > 120 || String(phone).trim().length > 30) {
    return res.status(400).json({ message: 'Họ tên hoặc số điện thoại quá dài.' });
  }
  const pool = await getPool();
  await ensureEmailVerificationTable(pool);
  const existing = await pool.request().input('Email', sql.NVarChar(254), normalizedEmail)
    .query('SELECT Id FROM dbo.Users WHERE Email = @Email');
  if (existing.recordset.length) return res.status(409).json({ message: 'Email đã được sử dụng.' });

  const pending = await pool.request().input('Email', sql.NVarChar(254), normalizedEmail)
    .query('SELECT LastSentAt FROM dbo.EmailVerificationCodes WHERE Email = @Email');
  if (pending.recordset.length && Date.now() - new Date(pending.recordset[0].LastSentAt).getTime() < 60_000) {
    return res.status(429).json({ message: 'Bạn vừa yêu cầu mã xác thực. Vui lòng chờ 60 giây rồi thử lại.' });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(`${normalizedEmail}:${code}:${process.env.JWT_SECRET || 'local'}`).digest('hex');
  const passwordHash = await bcrypt.hash(String(password), 12);
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await pool.request()
    .input('Email', sql.NVarChar(254), normalizedEmail)
    .input('FullName', sql.NVarChar(120), String(name).trim())
    .input('Phone', sql.NVarChar(30), String(phone).trim())
    .input('PasswordHash', sql.NVarChar(255), passwordHash)
    .input('CodeHash', sql.Char(64), codeHash)
    .input('ExpiresAt', sql.DateTime2, expiresAt)
    .input('LastSentAt', sql.DateTime2, new Date())
    .query(`MERGE dbo.EmailVerificationCodes AS target
      USING (SELECT @Email AS Email) AS source ON target.Email = source.Email
      WHEN MATCHED THEN UPDATE SET FullName=@FullName, Phone=@Phone, PasswordHash=@PasswordHash, CodeHash=@CodeHash, ExpiresAt=@ExpiresAt, LastSentAt=@LastSentAt, Attempts=0
      WHEN NOT MATCHED THEN INSERT (Email, FullName, Phone, PasswordHash, CodeHash, ExpiresAt, LastSentAt, Attempts) VALUES (@Email, @FullName, @Phone, @PasswordHash, @CodeHash, @ExpiresAt, @LastSentAt, 0);`);

  try {
    const transporter = emailTransport();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: normalizedEmail,
      subject: 'Mã xác thực email - DaNangRealEstate',
      text: `Xin chào ${String(name).trim()},\n\nMã xác thực email của bạn là: ${code}\nMã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không yêu cầu tạo tài khoản, hãy bỏ qua email này.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#183b5d"><h2>DaNangRealEstate</h2><p>Xin chào ${String(name).trim().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},</p><p>Nhập mã sau để xác thực địa chỉ email của bạn:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#edf4fa;padding:20px;text-align:center;border-radius:10px">${code}</div><p>Mã có hiệu lực trong <b>10 phút</b>. Không chia sẻ mã này với bất kỳ ai.</p><small>Nếu bạn không yêu cầu tạo tài khoản, hãy bỏ qua email này.</small></div>`
    });
  } catch (error) {
    await pool.request().input('Email', sql.NVarChar(254), normalizedEmail).query('DELETE FROM dbo.EmailVerificationCodes WHERE Email = @Email');
    console.error('Không gửi được email xác thực:', error.message);
    return res.status(503).json({ message: 'Không gửi được email xác thực. Hãy kiểm tra cấu hình Gmail SMTP trong backend/.env.' });
  }
  return res.status(200).json({ message: 'Mã xác thực đã được gửi đến email của bạn.', verificationRequired: true, email: normalizedEmail });
}));

app.post('/api/auth/verify-email', asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ và mã xác thực gồm 6 chữ số.' });
  }
  const pool = await getPool();
  await ensureEmailVerificationTable(pool);
  const result = await pool.request().input('Email', sql.NVarChar(254), email)
    .query('SELECT * FROM dbo.EmailVerificationCodes WHERE Email = @Email');
  const pending = result.recordset[0];
  if (!pending) return res.status(400).json({ message: 'Không tìm thấy yêu cầu xác thực. Vui lòng đăng ký lại để nhận mã mới.' });
  if (new Date(pending.ExpiresAt).getTime() < Date.now()) {
    await pool.request().input('Email', sql.NVarChar(254), email).query('DELETE FROM dbo.EmailVerificationCodes WHERE Email = @Email');
    return res.status(400).json({ message: 'Mã xác thực đã hết hạn. Vui lòng đăng ký lại để nhận mã mới.' });
  }
  if (Number(pending.Attempts) >= 5) {
    await pool.request().input('Email', sql.NVarChar(254), email).query('DELETE FROM dbo.EmailVerificationCodes WHERE Email = @Email');
    return res.status(429).json({ message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng đăng ký lại.' });
  }
  const expected = crypto.createHash('sha256').update(`${email}:${code}:${process.env.JWT_SECRET || 'local'}`).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(pending.CodeHash)))) {
    await pool.request().input('Email', sql.NVarChar(254), email).query('UPDATE dbo.EmailVerificationCodes SET Attempts = Attempts + 1 WHERE Email = @Email');
    return res.status(400).json({ message: `Mã xác thực không chính xác. Còn ${4 - Number(pending.Attempts)} lần thử.` });
  }
  const existing = await pool.request().input('Email', sql.NVarChar(254), email).query('SELECT Id FROM dbo.Users WHERE Email = @Email');
  if (existing.recordset.length) {
    await pool.request().input('Email', sql.NVarChar(254), email).query('DELETE FROM dbo.EmailVerificationCodes WHERE Email = @Email');
    return res.status(409).json({ message: 'Email đã được sử dụng.' });
  }
  const id = randomUUID();
  // Cấp 5.000 token đúng một lần khi tài khoản được tạo sau khi xác thực email.
  // Hai thông báo được tạo cùng lúc với tài khoản mới.
  await pool.request()
    .input('Id', sql.UniqueIdentifier, id)
    .input('FullName', sql.NVarChar(120), pending.FullName)
    .input('Email', sql.NVarChar(254), email)
    .input('Phone', sql.NVarChar(30), pending.Phone || '')
    .input('PasswordHash', sql.NVarChar(255), pending.PasswordHash)
    .query(`
      INSERT INTO dbo.Users (Id, FullName, Email, Phone, PasswordHash, Role, Status, Tokens)
      VALUES (@Id, @FullName, @Email, @Phone, @PasswordHash, 'User', 'Active', 5000);

      INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type, RelatedId)
      VALUES
        (NEWID(), @Id, N'Tặng 5000 Token cho tài khoản mới',
         N'Để chào mừng người dùng đến với website bất động sản Đà Nẵng, Đội ngũ admin kính tặng tất cả 5000 token khi đăng kí tài khoản thành công. Xin trân trọng cảm ơn!',
         'WelcomeBonus', NULL),
        (NEWID(), @Id, N'Tin đăng BDS được Xác Thực',
         N'Để xác nhận tin xác thực vui lòng liên hệ đội ngũ hỗ trợ qua gmail: lenhotuan14092005@gmail.com. Trân trọng cảm ơn!',
         'VerificationInfo', NULL);
    `);
  await pool.request().input('Email', sql.NVarChar(254), email).query('DELETE FROM dbo.EmailVerificationCodes WHERE Email = @Email');
  const user = await findUserById(id);
  return res.status(201).json({ message: 'Email đã được xác thực. Tài khoản đã tạo thành công.', token: tokenFor(user), user: publicUser(user) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const pool = await getPool();

  const result = await pool.request()
    .input('Email', sql.NVarChar(254), email)
    .query(`SELECT ${USER_COLUMNS} FROM dbo.Users WHERE Email = @Email`);

  const user = mapUser(result.recordset[0]);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      message: 'Email hoặc mật khẩu không chính xác.'
    });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ message: 'Tài khoản đã bị khóa.' });
  }

  return res.json({ token: tokenFor(user), user: publicUser(user) });
}));

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/users/me', auth, asyncRoute(async (req, res) => {
  const { name, phone, avatarUrl, bio } = req.body || {};
  if (avatarUrl !== undefined && avatarUrl !== null && (typeof avatarUrl !== 'string' || avatarUrl.length > 1000 || !/^https:\/\/res\.cloudinary\.com\//i.test(avatarUrl))) return res.status(400).json({ message: 'Đường dẫn ảnh đại diện Cloudinary không hợp lệ.' });
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ message: 'Họ tên không được để trống.' });
  if (bio !== undefined && String(bio).trim().length > 500) return res.status(400).json({ message: 'Giới thiệu tối đa 500 ký tự.' });
  const pool = await getPool();
  const requestedPhone = phone === undefined ? req.user.phone : String(phone).trim().slice(0,30);
  const phoneChanged = phone !== undefined && requestedPhone !== String(req.user.phone || '');
  await pool.request().input('Id', sql.UniqueIdentifier, req.user.id)
    .input('FullName', sql.NVarChar(120), name === undefined ? req.user.name : String(name).trim().slice(0,120))
    .input('Phone', sql.NVarChar(30), req.user.phone || '')
    .input('PendingPhone', sql.NVarChar(30), phoneChanged ? requestedPhone : (req.user.pendingPhone || null))
    .input('PhoneChangeStatus', sql.NVarChar(20), phoneChanged ? 'Pending' : (req.user.phoneChangeStatus || null))
    .input('Bio', sql.NVarChar(1000), bio === undefined ? (req.user.bio || '') : String(bio).trim())
    .input('AvatarUrl', sql.NVarChar(1000), avatarUrl === undefined ? null : avatarUrl)
    .query(`UPDATE dbo.Users SET FullName=@FullName, Bio=@Bio, PendingPhone=@PendingPhone, PhoneChangeStatus=@PhoneChangeStatus, AvatarUrl=COALESCE(@AvatarUrl,AvatarUrl) WHERE Id=@Id`);
  return res.json({ message: phoneChanged ? 'Đã lưu hồ sơ. Số điện thoại mới đang chờ quản trị viên duyệt.' : 'Đã cập nhật hồ sơ.', user: publicUser(await findUserById(req.user.id)) });
}));

app.get('/api/admin/phone-requests', auth, adminOnly, asyncRoute(async (req,res)=>{
 const pool=await getPool(); const result=await pool.request().query(`SELECT Id AS id,FullName AS name,Email AS email,Phone AS phone,PendingPhone AS pendingPhone,PhoneChangeStatus AS phoneChangeStatus FROM dbo.Users WHERE PhoneChangeStatus='Pending' AND PendingPhone IS NOT NULL ORDER BY FullName`);
 res.json({items:result.recordset});
}));
app.patch('/api/admin/phone-requests/:id', auth, adminOnly, asyncRoute(async(req,res)=>{
 const action=String(req.body?.action||''); if(!['approve','reject'].includes(action)) return res.status(400).json({message:'Thao tác không hợp lệ.'});
 const pool=await getPool(); const request=await pool.request().input('Id',sql.UniqueIdentifier,req.params.id).query(`SELECT PendingPhone FROM dbo.Users WHERE Id=@Id AND PhoneChangeStatus='Pending'`);
 if(!request.recordset.length) return res.status(404).json({message:'Không tìm thấy yêu cầu đổi số điện thoại đang chờ duyệt.'});
 if(action==='approve') await pool.request().input('Id',sql.UniqueIdentifier,req.params.id).query(`UPDATE dbo.Users SET Phone=PendingPhone,PendingPhone=NULL,PhoneChangeStatus='Approved' WHERE Id=@Id`);
 else await pool.request().input('Id',sql.UniqueIdentifier,req.params.id).query(`UPDATE dbo.Users SET PendingPhone=NULL,PhoneChangeStatus='Rejected' WHERE Id=@Id`);
 res.json({message:action==='approve'?'Đã duyệt số điện thoại mới.':'Đã từ chối yêu cầu đổi số điện thoại.'});
}));

// ==================== PROPERTIES ====================

app.get('/api/properties', asyncRoute(async (req, res) => {
  const pool = await getPool();

  const q = String(req.query.q || '').trim();
  const district = String(req.query.district || '').trim();
  const category = String(req.query.category || '').trim();
  const transactionType = String(req.query.transaction || '').trim();

  // Giá và diện tích là các bộ lọc tùy chọn.
  // NULL nghĩa là không giới hạn ở phía đó.
  const minPrice = optionalNumber(req.query.minPrice, 99999999999999999);
  const maxPrice = optionalNumber(req.query.maxPrice, 99999999999999999);
  const minArea = optionalNumber(req.query.minArea, 9999999999.99);
  const maxArea = optionalNumber(req.query.maxArea, 9999999999.99);

  if (
    (req.query.minPrice !== undefined && req.query.minPrice !== '' && minPrice === null) ||
    (req.query.maxPrice !== undefined && req.query.maxPrice !== '' && maxPrice === null) ||
    (req.query.minArea !== undefined && req.query.minArea !== '' && minArea === null) ||
    (req.query.maxArea !== undefined && req.query.maxArea !== '' && maxArea === null)
  ) {
    return res.status(400).json({
      message: 'Giá hoặc diện tích lọc không hợp lệ.'
    });
  }

  if (
    (minPrice !== null && maxPrice !== null && minPrice > maxPrice) ||
    (minArea !== null && maxArea !== null && minArea > maxArea)
  ) {
    return res.status(400).json({
      message: 'Giá trị tối thiểu không được lớn hơn giá trị tối đa.'
    });
  }

  const verified = req.query.verified === 'true';

  const request = pool.request()
    .input('Q', sql.NVarChar(300), `%${q}%`)
    .input('District', sql.NVarChar(100), district || null)
    .input('Category', sql.NVarChar(50), category || null)
    .input('TransactionType', sql.NVarChar(20), transactionType || null)
    .input('MinPrice', sql.Decimal(19, 2), minPrice)
    .input('MaxPrice', sql.Decimal(19, 2), maxPrice)
    .input('MinArea', sql.Decimal(12, 2), minArea)
    .input('MaxArea', sql.Decimal(12, 2), maxArea)
    .input('Verified', sql.Bit, verified);

  const result = await request.query(`
    SELECT ${PROPERTY_COLUMNS}
    ${PROPERTY_FROM}
    WHERE p.Status = 'Approved'
      AND (p.ListingUntil IS NULL OR p.ListingUntil > SYSUTCDATETIME())
      AND (
        @Q = '%%'
        OR p.Title LIKE @Q
        OR p.Description LIKE @Q
        OR p.Address LIKE @Q
        OR p.District LIKE @Q
      )
      AND (@District IS NULL OR p.District = @District)
      AND (@Category IS NULL OR p.Category = @Category)
      AND (@TransactionType IS NULL OR p.TransactionType = @TransactionType)
      AND (@Verified = 0 OR p.IsVerified = 1)
      AND (@MinPrice IS NULL OR p.Price >= @MinPrice)
      AND (@MaxPrice IS NULL OR p.Price <= @MaxPrice)
      AND (@MinArea IS NULL OR p.Area >= @MinArea)
      AND (@MaxArea IS NULL OR p.Area <= @MaxArea)
  `);

  let list = result.recordset.map(mapProperty);
  const sort = String(req.query.sort || 'newest');

  if (sort === 'price-asc') {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === 'price-desc') {
    list.sort((a, b) => b.price - a.price);
  } else if (sort === 'area-desc') {
    list.sort((a, b) => b.area - a.area);
  } else {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Tin ưu tiên hiển thị trước; thứ tự phụ giữ theo bộ sắp xếp đã chọn.
  list.sort((a, b) => effectiveLevel(b) - effectiveLevel(a));

  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(
    24,
    Math.max(1, Number.parseInt(req.query.limit || '12', 10) || 12)
  );
  const total = list.length;

  return res.json({
    items: list.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
}));

app.get('/api/properties/:id', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const property = await findPropertyById(req.params.id);

  if (!property) {
    return res.status(404).json({ message: 'Không tìm thấy tin bất động sản.' });
  }

  if (!publicProperty(property)) {
    const authorization = req.headers.authorization || '';
    const rawToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    if (!rawToken) {
      return res.status(404).json({ message: 'Không tìm thấy tin bất động sản.' });
    }

    try {
      const decoded = jwt.verify(
        rawToken,
        JWT_SECRET || 'local-only-unsafe-secret-change-me'
      );
      const currentUser = await findUserById(decoded.sub);

      if (
        !currentUser ||
        (currentUser.id !== property.ownerId && !['Admin', 'Support'].includes(currentUser.role))
      ) {
        return res.status(404).json({ message: 'Không tìm thấy tin bất động sản.' });
      }
    } catch {
      return res.status(404).json({ message: 'Không tìm thấy tin bất động sản.' });
    }
  }

  await pool.request()
    .input('Id', sql.UniqueIdentifier, property.id)
    .query('UPDATE dbo.Properties SET Views = Views + 1 WHERE Id = @Id');

  property.views += 1;
  return res.json({ property });
}));

app.post('/api/properties', auth, asyncRoute(async (req, res) => {
  const b = req.body || {};
  const price = requiredNumber(b.price);
  const area = requiredNumber(b.area);

  if (
    !String(b.title || '').trim() ||
    !b.category ||
    !b.transaction ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 99999999999999999 ||
    !Number.isFinite(area) ||
    area <= 0 ||
    area > 9999999999.99 ||
    !String(b.district || '').trim() ||
    !String(b.description || '').trim()
  ) {
    return res.status(400).json({
      message: 'Vui lòng nhập tiêu đề, danh mục, giao dịch, giá, diện tích, khu vực và mô tả hợp lệ.'
    });
  }

  const level = Number(b.priorityLevel || 0);

  if (![0, 1, 2, 3].includes(level)) {
    return res.status(400).json({ message: 'Gói ưu tiên không hợp lệ.' });
  }

  const pool = await getPool();
  const id = randomUUID();
  const code = `DN${Date.now().toString().slice(-8)}`;
  const images = Array.isArray(b.images)
    ? b.images.slice(0, 10).filter(
        image => typeof image === 'string' && /^https?:\/\//i.test(image)
      )
    : [];

  const p = {
    id,
    code,
    title: String(b.title).trim().slice(0, 200),
    category: String(b.category),
    transaction: String(b.transaction),
    price,
    area,
    district: String(b.district).trim().slice(0, 100),
    ward: String(b.ward || '').slice(0, 100),
    address: String(b.address || `${b.district}, Đà Nẵng`).slice(0, 300),
    roadWidth: optionalNumber(b.roadWidth, 9999.99),
    frontage: optionalNumber(b.frontage, 9999.99),
    bedrooms: Number(b.bedrooms || 0),
    bathrooms: Number(b.bathrooms || 0),
    floors: Number(b.floors || 0),
    direction: String(b.direction || '').slice(0, 30),
    legal: String(b.legal || '').slice(0, 100),
    description: String(b.description).trim(),
    images,
    status: 'Pending',
    featured: false,
    verified: false,
    priorityLevel: 0,
    priorityUntil: null,
    views: 0,
    ownerId: req.user.id,
    ownerName: req.user.name,
    createdAt: now(),
    listingUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    updatedAt: now()
  };

  let plan = null;

  if (level > 0) {
    plan = planBoost(p, level, req.user);

    if (plan.error) {
      return res.status(400).json({ message: plan.error });
    }

    applyPriority(p, level);
  }

  const dbTransaction = new sql.Transaction(pool);
  await dbTransaction.begin();

  try {
    let balanceAfter = null;

    if (plan) {
      const balanceResult = await new sql.Request(dbTransaction)
        .input('Id', sql.UniqueIdentifier, req.user.id)
        .query(`
          SELECT Tokens
          FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
          WHERE Id = @Id
        `);

      const balance = Number(balanceResult.recordset[0]?.Tokens || 0);

      if (balance < plan.cost) {
        throw new Error('Không đủ token để đăng tin ưu tiên.');
      }

      balanceAfter = balance - plan.cost;

      await new sql.Request(dbTransaction)
        .input('Id', sql.UniqueIdentifier, req.user.id)
        .input('Balance', sql.Int, balanceAfter)
        .query('UPDATE dbo.Users SET Tokens = @Balance WHERE Id = @Id');
    }

    await new sql.Request(dbTransaction)
      .input('Id', sql.UniqueIdentifier, id)
      .input('Code', sql.NVarChar(30), code)
      .input('Title', sql.NVarChar(200), p.title)
      .input('Category', sql.NVarChar(50), p.category)
      .input('TransactionType', sql.NVarChar(20), p.transaction)
      .input('Price', sql.Decimal(19, 2), p.price)
      .input('Area', sql.Decimal(12, 2), p.area)
      .input('District', sql.NVarChar(100), p.district)
      .input('Ward', sql.NVarChar(100), p.ward || null)
      .input('Address', sql.NVarChar(300), p.address)
      .input('RoadWidth', sql.Decimal(6, 2), p.roadWidth)
      .input('Frontage', sql.Decimal(6, 2), p.frontage)
      .input('Bedrooms', sql.Int, p.bedrooms)
      .input('Bathrooms', sql.Int, p.bathrooms)
      .input('Floors', sql.Int, p.floors)
      .input('Direction', sql.NVarChar(30), p.direction || null)
      .input('Legal', sql.NVarChar(100), p.legal || null)
      .input('Description', sql.NVarChar(sql.MAX), p.description)
      .input('ImagesJson', sql.NVarChar(sql.MAX), JSON.stringify(images))
      .input('Status', sql.NVarChar(20), p.status)
      .input('Featured', sql.Bit, false)
      .input('IsVerified', sql.Bit, false)
      .input('PriorityLevel', sql.Int, p.priorityLevel)
      .input(
        'PriorityUntil',
        sql.DateTime2,
        p.priorityUntil ? new Date(p.priorityUntil) : null
      )
      .input('ListingUntil', sql.DateTime2, new Date(p.listingUntil))
      .input('OwnerId', sql.UniqueIdentifier, req.user.id)
      .input('OwnerName', sql.NVarChar(120), req.user.name)
      .query(`
        INSERT INTO dbo.Properties (
          Id, Code, Title, Category, TransactionType, Price, Area,
          District, Ward, Address, RoadWidth, Frontage, Bedrooms,
          Bathrooms, Floors, Direction, Legal, Description, ImagesJson,
          Status, Featured, IsVerified, PriorityLevel, PriorityUntil, ListingUntil,
          Views, OwnerId, OwnerName
        )
        VALUES (
          @Id, @Code, @Title, @Category, @TransactionType, @Price, @Area,
          @District, @Ward, @Address, @RoadWidth, @Frontage, @Bedrooms,
          @Bathrooms, @Floors, @Direction, @Legal, @Description, @ImagesJson,
          @Status, @Featured, @IsVerified, @PriorityLevel, @PriorityUntil, @ListingUntil,
          0, @OwnerId, @OwnerName
        )
      `);

    if (plan) {
      await new sql.Request(dbTransaction)
        .input('Id', sql.UniqueIdentifier, randomUUID())
        .input('UserId', sql.UniqueIdentifier, req.user.id)
        .input('Type', sql.NVarChar(20), 'spend')
        .input('Amount', sql.Int, -plan.cost)
        .input('BalanceAfter', sql.Int, balanceAfter)
        .input('Note', sql.NVarChar(200), `Đăng tin ${code} - gói ${plan.tier.name}`)
        .input('PropertyId', sql.UniqueIdentifier, id)
        .input('CreatedBy', sql.UniqueIdentifier, req.user.id)
        .query(`
          INSERT INTO dbo.TokenTransactions
            (Id, UserId, Type, Amount, BalanceAfter, Note, PropertyId, CreatedBy)
          VALUES
            (@Id, @UserId, @Type, @Amount, @BalanceAfter, @Note, @PropertyId, @CreatedBy)
        `);
    }

    await dbTransaction.commit();
  } catch (error) {
    try {
      await dbTransaction.rollback();
    } catch {
      // Bỏ qua lỗi rollback.
    }

    if (error.message === 'Không đủ token để đăng tin ưu tiên.') {
      return res.status(400).json({ message: error.message });
    }

    throw error;
  }

  const property = await findPropertyById(id);

  if (plan) {
    const user = await findUserById(req.user.id);

    return res.status(201).json({
      message: `Đã đăng tin với gói ${plan.tier.name} (-${plan.cost.toLocaleString('vi-VN')} token).`,
      property,
      balance: user.tokens
    });
  }

  return res.status(201).json({
    message: 'Đã gửi tin đăng. Tin đang chờ Admin duyệt.',
    property
  });
}));

app.put('/api/properties/:id', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.id);

  if (!p) {
    return res.status(404).json({ message: 'Không tìm thấy tin.' });
  }

  if (p.ownerId !== req.user.id && !['Admin', 'Support'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Bạn chỉ được sửa tin của mình.' });
  }

  const b = req.body || {};
  const value = (key, current) => b[key] === undefined ? current : b[key];

  const title = String(value('title', p.title) || '').trim();
  const category = String(value('category', p.category) || '');
  const transactionType = String(value('transaction', p.transaction) || '');
  const price = requiredNumber(value('price', p.price));
  const area = requiredNumber(value('area', p.area));
  const district = String(value('district', p.district) || '').trim();
  const ward = String(value('ward', p.ward) || '');
  const address = String(value('address', p.address || `${district}, Đà Nẵng`));
  const description = String(value('description', p.description) || '').trim();

  if (
    !title ||
    !district ||
    !description ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 99999999999999999 ||
    !Number.isFinite(area) ||
    area <= 0 ||
    area > 9999999999.99
  ) {
    return res.status(400).json({ message: 'Thông tin tin đăng không hợp lệ.' });
  }

  const roadWidth = value('roadWidth', p.roadWidth);
  const frontage = value('frontage', p.frontage);
  const validRoadWidth = roadWidth == null || roadWidth === ''
    ? null : optionalNumber(roadWidth, 9999.99);
  const validFrontage = frontage == null || frontage === ''
    ? null : optionalNumber(frontage, 9999.99);

  if (
    (roadWidth !== null && roadWidth !== '' && validRoadWidth === null) ||
    (frontage !== null && frontage !== '' && validFrontage === null)
  ) {
    return res.status(400).json({
      message: 'Độ rộng đường hoặc mặt tiền không hợp lệ.'
    });
  }

  const rawImages = value('images', p.images);
  const images = Array.isArray(rawImages)
    ? rawImages.slice(0, 10).filter(
        image => typeof image === 'string' && /^https?:\/\//i.test(image)
      )
    : [];

  await pool.request()
    .input('Id', sql.UniqueIdentifier, p.id)
    .input('Title', sql.NVarChar(200), title.slice(0, 200))
    .input('Category', sql.NVarChar(50), category)
    .input('TransactionType', sql.NVarChar(20), transactionType)
    .input('Price', sql.Decimal(19, 2), price)
    .input('Area', sql.Decimal(12, 2), area)
    .input('District', sql.NVarChar(100), district.slice(0, 100))
    .input('Ward', sql.NVarChar(100), ward.slice(0, 100) || null)
    .input('Address', sql.NVarChar(300), address.slice(0, 300))
    .input('RoadWidth', sql.Decimal(6, 2), validRoadWidth)
    .input('Frontage', sql.Decimal(6, 2), validFrontage)
    .input('Bedrooms', sql.Int, Number(value('bedrooms', p.bedrooms) || 0))
    .input('Bathrooms', sql.Int, Number(value('bathrooms', p.bathrooms) || 0))
    .input('Floors', sql.Int, Number(value('floors', p.floors) || 0))
    .input('Direction', sql.NVarChar(30), String(value('direction', p.direction) || '').slice(0, 30) || null)
    .input('Legal', sql.NVarChar(100), String(value('legal', p.legal) || '').slice(0, 100) || null)
    .input('Description', sql.NVarChar(sql.MAX), description)
    .input('ImagesJson', sql.NVarChar(sql.MAX), JSON.stringify(images))
    .query(`
      UPDATE dbo.Properties
      SET Title = @Title,
          Category = @Category,
          TransactionType = @TransactionType,
          Price = @Price,
          Area = @Area,
          District = @District,
          Ward = @Ward,
          Address = @Address,
          RoadWidth = @RoadWidth,
          Frontage = @Frontage,
          Bedrooms = @Bedrooms,
          Bathrooms = @Bathrooms,
          Floors = @Floors,
          Direction = @Direction,
          Legal = @Legal,
          Description = @Description,
          ImagesJson = @ImagesJson,
          Status = 'Pending',
          UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @Id
    `);

  return res.json({
    message: 'Đã cập nhật tin; tin cần được duyệt lại.',
    property: await findPropertyById(p.id)
  });
}));

app.delete('/api/properties/:id', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.id);

  if (!p) {
    return res.status(404).json({ message: 'Không tìm thấy tin.' });
  }

  if (p.ownerId !== req.user.id && !['Admin', 'Support'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Bạn chỉ được xóa tin của mình.' });
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, p.id)
      .query('DELETE FROM dbo.Favorites WHERE PropertyId = @Id');

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, p.id)
      .query('DELETE FROM dbo.Reports WHERE PropertyId = @Id');

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, p.id)
      .query('UPDATE dbo.TokenTransactions SET PropertyId = NULL WHERE PropertyId = @Id');

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, p.id)
      .query('DELETE FROM dbo.Properties WHERE Id = @Id');

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Bỏ qua lỗi rollback.
    }
    throw error;
  }

  return res.json({ message: 'Đã xóa tin đăng.' });
}));

app.get('/api/users/me/properties', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request()
    .input('OwnerId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT ${PROPERTY_COLUMNS}
      ${PROPERTY_FROM}
      WHERE p.OwnerId = @OwnerId
      ORDER BY p.CreatedAt DESC
    `);

  return res.json({ items: result.recordset.map(mapProperty) });
}));

// ==================== FAVORITES ====================

app.get('/api/favorites', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT ${PROPERTY_COLUMNS}
      ${PROPERTY_FROM}
      INNER JOIN dbo.Favorites f ON f.PropertyId = p.Id
      WHERE f.UserId = @UserId
      ORDER BY f.CreatedAt DESC
    `);

  return res.json({ items: result.recordset.map(mapProperty) });
}));

app.post('/api/favorites/:propertyId', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.propertyId);

  if (!p || !publicProperty(p)) {
    return res.status(404).json({ message: 'Tin không khả dụng.' });
  }

  await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .input('PropertyId', sql.UniqueIdentifier, p.id)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.Favorites
        WHERE UserId = @UserId AND PropertyId = @PropertyId
      )
      INSERT INTO dbo.Favorites (UserId, PropertyId)
      VALUES (@UserId, @PropertyId)
    `);

  return res.json({ message: 'Đã thêm vào yêu thích.' });
}));

app.delete('/api/favorites/:propertyId', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.propertyId);

  if (p) {
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, req.user.id)
      .input('PropertyId', sql.UniqueIdentifier, p.id)
      .query(`
        DELETE FROM dbo.Favorites
        WHERE UserId = @UserId AND PropertyId = @PropertyId
      `);
  }

  return res.json({ message: 'Đã bỏ yêu thích.' });
}));

// ==================== REPORTS ====================

app.post('/api/reports', auth, asyncRoute(async (req, res) => {
  const { propertyId, reason, details = '' } = req.body || {};

  if (!propertyId || !reason) {
    return res.status(400).json({
      message: 'Tin hoặc lý do báo cáo không hợp lệ.'
    });
  }

  const p = await findPropertyById(propertyId);

  if (!p) {
    return res.status(400).json({
      message: 'Tin hoặc lý do báo cáo không hợp lệ.'
    });
  }

  const pool = await getPool();

  await pool.request()
    .input('Id', sql.UniqueIdentifier, randomUUID())
    .input('PropertyId', sql.UniqueIdentifier, p.id)
    .input('ReporterId', sql.UniqueIdentifier, req.user.id)
    .input('Reason', sql.NVarChar(100), String(reason).slice(0, 100))
    .input('Details', sql.NVarChar(1000), String(details).slice(0, 1000))
    .query(`
      INSERT INTO dbo.Reports
        (Id, PropertyId, ReporterId, Reason, Details, Status)
      VALUES
        (@Id, @PropertyId, @ReporterId, @Reason, @Details, 'Pending')
    `);

  return res.status(201).json({
    message: 'Đã gửi báo cáo cho quản trị viên.'
  });
}));

// ==================== TOKENS ====================

app.get('/api/tokens/config', (req, res) => {
  res.json({ tiers: TIERS, priorityDays: priorityDays(0), listingDays: 30 });
});

app.get('/api/tokens/me', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT TOP 100
        Id AS id,
        UserId AS userId,
        Type AS type,
        Amount AS amount,
        BalanceAfter AS balanceAfter,
        Note AS note,
        PropertyId AS propertyId,
        CreatedBy AS createdBy,
        CreatedAt AS createdAt
      FROM dbo.TokenTransactions
      WHERE UserId = @UserId
      ORDER BY CreatedAt DESC
    `);

  const user = await findUserById(req.user.id);

  return res.json({
    balance: user.tokens,
    transactions: result.recordset.map(mapTransaction)
  });
}));

app.post('/api/properties/:id/boost', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.id);

  if (!p) {
    return res.status(404).json({ message: 'Không tìm thấy tin.' });
  }

  if (p.ownerId !== req.user.id) {
    return res.status(403).json({
      message: 'Bạn chỉ được dùng token cho tin của mình.'
    });
  }

  const level = Number(req.body?.level);
  const plan = planBoost(p, level, req.user);

  if (plan.error) {
    return res.status(400).json({ message: plan.error });
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const balanceResult = await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, req.user.id)
      .query(`
        SELECT Tokens
        FROM dbo.Users WITH (UPDLOCK, ROWLOCK)
        WHERE Id = @Id
      `);

    const balance = Number(balanceResult.recordset[0]?.Tokens || 0);

    if (balance < plan.cost) {
      throw new Error('Không đủ token để nâng cấp tin.');
    }

    const nextBalance = balance - plan.cost;
    const days = priorityDays(level);
    const until = new Date(Date.now() + days * 86400000);

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, p.id)
      .input('Level', sql.Int, level)
      .input('Until', sql.DateTime2, until)
      .query(`
        UPDATE dbo.Properties
        SET PriorityLevel = @Level,
            PriorityUntil = @Until,
            Status = 'Approved',
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @Id
      `);

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, req.user.id)
      .input('Balance', sql.Int, nextBalance)
      .query('UPDATE dbo.Users SET Tokens = @Balance WHERE Id = @Id');

    await new sql.Request(transaction)
      .input('Id', sql.UniqueIdentifier, randomUUID())
      .input('UserId', sql.UniqueIdentifier, req.user.id)
      .input('Type', sql.NVarChar(20), 'spend')
      .input('Amount', sql.Int, -plan.cost)
      .input('BalanceAfter', sql.Int, nextBalance)
      .input('Note', sql.NVarChar(200), `Ưu tiên tin ${p.code} - gói ${plan.tier.name}`)
      .input('PropertyId', sql.UniqueIdentifier, p.id)
      .input('CreatedBy', sql.UniqueIdentifier, req.user.id)
      .query(`
        INSERT INTO dbo.TokenTransactions
          (Id, UserId, Type, Amount, BalanceAfter, Note, PropertyId, CreatedBy)
        VALUES
          (@Id, @UserId, @Type, @Amount, @BalanceAfter, @Note, @PropertyId, @CreatedBy)
      `);

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Bỏ qua lỗi rollback.
    }

    if (error.message === 'Không đủ token để nâng cấp tin.') {
      return res.status(400).json({ message: error.message });
    }

    throw error;
  }

  const user = await findUserById(req.user.id);

  return res.json({
    message: `Đã áp dụng gói ${plan.tier.name} (-${plan.cost.toLocaleString('vi-VN')} token). Tin được hiển thị ưu tiên.`,
    property: await findPropertyById(p.id),
    balance: user.tokens
  });
}));

// ==================== ADMIN TOKENS ====================

app.get('/api/admin/tokens', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const usersResult = await pool.request().query(`
    SELECT Id AS id, FullName AS name, Email AS email,
           Role AS role, Status AS status, IsVerified AS verified,
           Tokens AS tokens
    FROM dbo.Users
    ORDER BY CreatedAt DESC
  `);

  const transactionsResult = await pool.request().query(`
    SELECT TOP 200
      t.Id AS id, t.UserId AS userId, t.Type AS type,
      t.Amount AS amount, t.BalanceAfter AS balanceAfter,
      t.Note AS note, t.PropertyId AS propertyId,
      t.CreatedBy AS createdBy, t.CreatedAt AS createdAt,
      u.FullName AS userName
    FROM dbo.TokenTransactions t
    INNER JOIN dbo.Users u ON u.Id = t.UserId
    ORDER BY t.CreatedAt DESC
  `);

  const totalResult = await pool.request().query(`
    SELECT COALESCE(SUM(CASE
      WHEN Type = 'grant' AND Amount > 0 THEN Amount ELSE 0 END), 0) AS totalIssued
    FROM dbo.TokenTransactions
  `);

  return res.json({
    users: usersResult.recordset.map(user => ({
      ...user,
      verified: Boolean(user.verified),
      tokens: Number(user.tokens || 0)
    })),
    transactions: transactionsResult.recordset.map(item => ({
      ...mapTransaction(item),
      userName: item.userName || '—'
    })),
    totalIssued: Number(totalResult.recordset[0].totalIssued || 0)
  });
}));

app.post('/api/admin/tokens/grant', auth, adminOnly, asyncRoute(async (req, res) => {
  const { userId, amount, note } = req.body || {};
  const n = Number(amount);

  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100000000) {
    return res.status(400).json({
      message: 'Số token phải là số nguyên khác 0 (tối đa 100.000.000).'
    });
  }

  const target = await findUserById(userId);

  if (!target) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  }

  let transaction;

  try {
    transaction = await saveTokenTransaction(
      target.id,
      n,
      note || (n > 0 ? 'Admin cấp token' : 'Admin thu hồi token'),
      {
        type: n > 0 ? 'grant' : 'revoke',
        createdBy: req.user.id
      }
    );
  } catch (error) {
    if (error.message === 'Không đủ token để thực hiện giao dịch.') {
      return res.status(400).json({
        message: 'Không thể thu hồi nhiều hơn số token người dùng đang có.'
      });
    }
    throw error;
  }

  return res.json({
    message: n > 0
      ? `Đã cấp ${n.toLocaleString('vi-VN')} token cho ${target.name}.`
      : `Đã thu hồi ${Math.abs(n).toLocaleString('vi-VN')} token của ${target.name}.`,
    balance: transaction.balanceAfter,
    transaction
  });
}));

// ==================== ADMIN USERS ====================

app.patch('/api/admin/users/:id/verified', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const target = await findUserById(req.params.id);

  if (!target) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  }

  const verified = typeof req.body?.verified === 'boolean'
    ? req.body.verified
    : !target.verified;

  await pool.request()
    .input('Id', sql.UniqueIdentifier, target.id)
    .input('Verified', sql.Bit, verified)
    .query('UPDATE dbo.Users SET IsVerified = @Verified WHERE Id = @Id');

  return res.json({
    message: verified ? 'Đã xác minh tài khoản.' : 'Đã gỡ xác minh tài khoản.',
    verified
  });
}));

app.get('/api/admin/users', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT Id AS id, FullName AS name, Email AS email,
           Phone AS phone, Role AS role, Status AS status,
           IsVerified AS verified, Tokens AS tokens, CreatedAt AS createdAt
    FROM dbo.Users
    ORDER BY CreatedAt DESC
  `);

  return res.json({
    items: result.recordset.map(user => ({
      ...user,
      verified: Boolean(user.verified),
      tokens: Number(user.tokens || 0)
    }))
  });
}));

// Quản trị viên chính có thể bổ nhiệm hoặc gỡ quyền Support; không cấp quyền Admin qua giao diện này.
app.patch('/api/admin/users/:id/role', auth, superAdminOnly, asyncRoute(async (req, res) => {
  const target = await findUserById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  if (target.id === req.user.id) return res.status(400).json({ message: 'Không thể thay đổi vai trò của chính mình tại đây.' });
  if (target.role === 'Admin') return res.status(400).json({ message: 'Không thể thay đổi vai trò quản trị viên chính bằng chức năng này.' });
  const role = req.body?.role;
  if (!['User', 'Support'].includes(role)) return res.status(400).json({ message: 'Vai trò chỉ được phép là User hoặc Support.' });
  const pool = await getPool();
  await pool.request().input('Id', sql.UniqueIdentifier, target.id).input('Role', sql.NVarChar(30), role)
    .query('UPDATE dbo.Users SET Role = @Role WHERE Id = @Id');
  return res.json({ message: role === 'Support' ? 'Đã nâng tài khoản lên đội ngũ Support.' : 'Đã gỡ quyền Support của tài khoản.', role });
}));

app.patch('/api/admin/users/:id/status', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const target = await findUserById(req.params.id);

  if (!target) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  }

  if (target.id === req.user.id) {
    return res.status(400).json({
      message: 'Không thể tự khóa tài khoản đang sử dụng.'
    });
  }

  if (!['Active', 'Blocked'].includes(req.body?.status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
  }

  await pool.request()
    .input('Id', sql.UniqueIdentifier, target.id)
    .input('Status', sql.NVarChar(20), req.body.status)
    .query('UPDATE dbo.Users SET Status = @Status WHERE Id = @Id');

  return res.json({ message: 'Đã cập nhật tài khoản.' });
}));

// ==================== THÔNG BÁO ====================
app.get('/api/notifications', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`SELECT TOP (100) Id AS id, Title AS title, Body AS body, Type AS type,
                   RelatedId AS relatedId, CreatedAt AS createdAt, ReadAt AS readAt
            FROM dbo.Notifications WHERE UserId = @UserId ORDER BY CreatedAt DESC`);
  const items = result.recordset.map(n => ({
    ...n,
    createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : now(),
    readAt: n.readAt ? new Date(n.readAt).toISOString() : null
  }));
  return res.json({ items, unread: items.filter(n => !n.readAt).length });
}));

app.patch('/api/notifications/:id/read', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('Id', sql.UniqueIdentifier, req.params.id)
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`UPDATE dbo.Notifications SET ReadAt = COALESCE(ReadAt, SYSUTCDATETIME())
            WHERE Id = @Id AND UserId = @UserId; SELECT @@ROWCOUNT AS affected;`);
  if (!result.recordset[0]?.affected) return res.status(404).json({ message: 'Không tìm thấy thông báo.' });
  return res.json({ message: 'Đã đánh dấu đã đọc.' });
}));

app.post('/api/notifications/read-all', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  await pool.request().input('UserId', sql.UniqueIdentifier, req.user.id)
    .query('UPDATE dbo.Notifications SET ReadAt = SYSUTCDATETIME() WHERE UserId = @UserId AND ReadAt IS NULL');
  return res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
}));

app.get('/api/admin/notifications', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP (100) n.Title AS title, n.Body AS body, n.Type AS type,
      MAX(n.CreatedAt) AS createdAt, COUNT(*) AS recipientCount,
      SUM(CASE WHEN n.ReadAt IS NOT NULL THEN 1 ELSE 0 END) AS readCount
    FROM dbo.Notifications n
    WHERE n.Type = 'Announcement'
    GROUP BY n.Title, n.Body, n.Type,
      DATEADD(MINUTE, DATEDIFF(MINUTE, 0, n.CreatedAt), 0)
    ORDER BY MAX(n.CreatedAt) DESC`);
  return res.json({ items: result.recordset.map(n => ({ ...n, createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : now() })) });
}));

app.post('/api/admin/notifications', auth, adminOnly, asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const recipientId = req.body?.recipientId ? String(req.body.recipientId) : null;
  if (!title || title.length > 180 || !body || body.length > 2000) {
    return res.status(400).json({ message: 'Tiêu đề (tối đa 180 ký tự) và nội dung (tối đa 2000 ký tự) là bắt buộc.' });
  }
  const pool = await getPool();
  const request = pool.request()
    .input('Id', sql.UniqueIdentifier, randomUUID())
    .input('Title', sql.NVarChar(180), title)
    .input('Body', sql.NVarChar(2000), body)
    .input('CreatedBy', sql.UniqueIdentifier, req.user.id);
  if (recipientId) {
    const exists = await pool.request().input('UserId', sql.UniqueIdentifier, recipientId)
      .query("SELECT Id FROM dbo.Users WHERE Id=@UserId AND Status='Active'");
    if (!exists.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng đang hoạt động.' });
    await request.input('UserId', sql.UniqueIdentifier, recipientId).query(`
      INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type, CreatedBy)
      VALUES (@Id, @UserId, @Title, @Body, 'Announcement', @CreatedBy)`);
    return res.status(201).json({ message: 'Đã gửi thông báo cho người dùng.' });
  }
  await pool.request().input('Title', sql.NVarChar(180), title)
    .input('Body', sql.NVarChar(2000), body)
    .input('CreatedBy', sql.UniqueIdentifier, req.user.id)
    .query(`INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type, CreatedBy)
      SELECT NEWID(), Id, @Title, @Body, 'Announcement', @CreatedBy
      FROM dbo.Users WHERE Status='Active' AND Role <> 'Admin'`);
  return res.status(201).json({ message: 'Đã gửi thông báo đến tất cả người dùng đang hoạt động.' });
}));

// ==================== ADMIN PROPERTIES ====================

app.post('/api/admin/properties/:id/verify', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.id);

  if (!p) {
    return res.status(404).json({ message: 'Không tìm thấy tin.' });
  }

  const verified = typeof req.body?.verified === 'boolean'
    ? req.body.verified
    : !p.verified;

  await pool.request()
    .input('Id', sql.UniqueIdentifier, p.id)
    .input('Verified', sql.Bit, verified)
    .query(`
      UPDATE dbo.Properties
      SET IsVerified = @Verified, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @Id
    `);

  // Chỉ gửi thông báo khi admin vừa chuyển tin từ chưa xác thực sang đã xác thực.
  if (verified && !p.verified && p.ownerId) {
    await pool.request()
      .input('UserId', sql.UniqueIdentifier, p.ownerId)
      .input('PropertyId', sql.UniqueIdentifier, p.id)
      .input('Title', sql.NVarChar(180), 'Tin đăng BĐS đã được xác thực thành công')
      .input('Body', sql.NVarChar(2000), `Tin "${p.title}" đã được admin xác thực thành công.`)
      .query(`
        INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type, RelatedId)
        VALUES (NEWID(), @UserId, @Title, @Body, 'ListingVerified', @PropertyId)
      `);
  }

  return res.json({
    message: verified ? 'Đã xác thực tin đăng.' : 'Đã gỡ xác thực tin đăng.',
    property: await findPropertyById(p.id)
  });
}));

app.get('/api/admin/security', auth, adminOnly, asyncRoute(async (req,res)=>{
 const pool=await getPool();
 const [blocked,recent,reports]=await Promise.all([
  pool.request().query(`SELECT TOP 50 Id AS id,FullName AS name,Email AS email,Phone AS phone,Role AS role,CreatedAt AS createdAt FROM dbo.Users WHERE Status<>'Active' ORDER BY CreatedAt DESC`),
  pool.request().query(`SELECT TOP 50 Id AS id,FullName AS name,Email AS email,Role AS role,CreatedAt AS createdAt FROM dbo.Users WHERE CreatedAt>=DATEADD(day,-7,SYSUTCDATETIME()) ORDER BY CreatedAt DESC`),
  pool.request().query(`SELECT TOP 50 r.Id AS id,r.PropertyId AS propertyId,r.Reason AS reason,r.Details AS details,r.CreatedAt AS createdAt,p.Title AS propertyTitle,u.FullName AS reporterName FROM dbo.Reports r JOIN dbo.Properties p ON p.Id=r.PropertyId JOIN dbo.Users u ON u.Id=r.ReporterId WHERE r.Status='Pending' ORDER BY r.CreatedAt DESC`)
 ]);
 return res.json({blocked:blocked.recordset,recentUsers:recent.recordset,pendingReports:reports.recordset,generatedAt:now()});
}));

app.get('/api/admin/dashboard', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.Users) AS users,
      (SELECT COUNT(*) FROM dbo.Properties) AS properties,
      (SELECT COUNT(*) FROM dbo.Properties WHERE Status = 'Pending') AS pending,
      (SELECT COUNT(*) FROM dbo.Properties WHERE Status = 'Approved') AS approved,
      (SELECT COUNT(*) FROM dbo.Properties WHERE Status = 'Rejected') AS rejected,
      (SELECT COUNT(*) FROM dbo.Reports WHERE Status = 'Pending') AS reports,
      (SELECT COALESCE(SUM(Views), 0) FROM dbo.Properties) AS views
  `);

  return res.json(result.recordset[0]);
}));

app.get('/api/admin/properties', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT ${PROPERTY_COLUMNS}
    ${PROPERTY_FROM}
    ORDER BY p.CreatedAt DESC
  `);

  return res.json({ items: result.recordset.map(mapProperty) });
}));

app.post('/api/admin/properties/:id/:action', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const p = await findPropertyById(req.params.id);

  if (!p) {
    return res.status(404).json({ message: 'Không tìm thấy tin.' });
  }

  const actions = {
    approve: 'Approved',
    reject: 'Rejected',
    hide: 'Hidden'
  };

  const status = actions[req.params.action];

  if (!status) {
    return res.status(400).json({ message: 'Thao tác không hợp lệ.' });
  }

  if (req.params.action === 'reject') {
    // Từ chối đồng nghĩa xóa vĩnh viễn tin đăng. Xóa các bản ghi phụ thuộc trước để không vi phạm khóa ngoại.
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = () => new sql.Request(transaction).input('Id', sql.UniqueIdentifier, p.id);
      await request().query(`DELETE FROM dbo.Messages WHERE ConversationId IN (SELECT Id FROM dbo.Conversations WHERE PropertyId = @Id)`);
      await request().query(`DELETE FROM dbo.Conversations WHERE PropertyId = @Id`);
      await request().query(`DELETE FROM dbo.Favorites WHERE PropertyId = @Id`);
      await request().query(`DELETE FROM dbo.Reports WHERE PropertyId = @Id`);
      await request().query(`DELETE FROM dbo.Properties WHERE Id = @Id`);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return res.json({ message: 'Đã từ chối và xóa vĩnh viễn tin đăng cùng dữ liệu liên quan.' });
  }

  await pool.request()
    .input('Id', sql.UniqueIdentifier, p.id)
    .input('Status', sql.NVarChar(20), status)
    .query(`
      UPDATE dbo.Properties
      SET Status = @Status, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @Id
    `);

  return res.json({
    message: 'Đã cập nhật trạng thái tin.',
    property: await findPropertyById(p.id)
  });
}));

// ==================== ADMIN REPORTS ====================

app.get('/api/admin/reports', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT Id AS id, PropertyId AS propertyId,
           ReporterId AS reporterId, Reason AS reason,
           Details AS details, Status AS status, CreatedAt AS createdAt
    FROM dbo.Reports
    ORDER BY CreatedAt DESC
  `);

  return res.json({ items: result.recordset.map(mapReport) });
}));

app.patch('/api/admin/reports/:id', auth, adminOnly, asyncRoute(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request()
    .input('Id', sql.UniqueIdentifier, req.params.id)
    .query(`
      UPDATE dbo.Reports
      SET Status = 'Resolved'
      OUTPUT
        INSERTED.Id AS id,
        INSERTED.PropertyId AS propertyId,
        INSERTED.ReporterId AS reporterId,
        INSERTED.Reason AS reason,
        INSERTED.Details AS details,
        INSERTED.Status AS status,
        INSERTED.CreatedAt AS createdAt
      WHERE Id = @Id
    `);

  if (!result.recordset.length) {
    return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
  }

  return res.json({
    message: 'Đã xử lý báo cáo.',
    report: mapReport(result.recordset[0])
  });
}));


// ==================== PUBLIC AGENT DIRECTORY ====================
app.get('/api/agents', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const request = pool.request().input('Transaction',sql.NVarChar(20),String(req.query.transaction||'')).input('Category',sql.NVarChar(50),String(req.query.category||''));
  const result = await request.query(`
    SELECT TOP 100 u.Id AS id, u.FullName AS name, u.Email AS email, u.Phone AS phone,
      u.AvatarUrl AS avatarUrl, u.Bio AS bio, u.IsVerified AS verified, u.Role AS role, u.CreatedAt AS createdAt,
      (SELECT COUNT(*) FROM dbo.Properties p WHERE p.OwnerId=u.Id AND p.Status='Approved') AS activeListings,
      (SELECT COUNT(*) FROM dbo.Properties p WHERE p.OwnerId=u.Id AND p.Status='Approved' AND p.IsVerified=1) AS verifiedListings
    FROM dbo.Users u WHERE u.Status='Active'
      AND EXISTS (SELECT 1 FROM dbo.Properties p WHERE p.OwnerId=u.Id AND p.Status='Approved' AND (@Transaction='' OR p.TransactionType=@Transaction) AND (@Category='' OR p.Category=@Category))
    ORDER BY activeListings DESC, u.CreatedAt DESC
  `);
  return res.json({items: result.recordset});
}));

// ==================== PUBLIC AGENT PROFILE ====================
app.get('/api/agents/:id', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input('Id', sql.UniqueIdentifier, req.params.id).query(`
    SELECT u.Id AS id, u.FullName AS name, u.Email AS email, u.Phone AS phone,
      u.AvatarUrl AS avatarUrl, u.Bio AS bio, u.IsVerified AS verified, u.Role AS role, u.CreatedAt AS createdAt,
      (SELECT COUNT(*) FROM dbo.Properties p WHERE p.OwnerId=u.Id AND p.Status='Approved') AS activeListings,
      (SELECT COUNT(*) FROM dbo.Properties p WHERE p.OwnerId=u.Id AND p.Status='Approved' AND p.IsVerified=1) AS verifiedListings,
      (SELECT COUNT(*) FROM dbo.Properties p WHERE p.OwnerId=u.Id) AS totalListings
    FROM dbo.Users u WHERE u.Id=@Id AND u.Status='Active'
  `);
  if (!result.recordset.length) return res.status(404).json({message:'Không tìm thấy hồ sơ môi giới.'});
  const listings = await pool.request().input('Id', sql.UniqueIdentifier, req.params.id).query(`
    SELECT ${PROPERTY_COLUMNS} ${PROPERTY_FROM} WHERE p.OwnerId=@Id AND p.Status='Approved' ORDER BY p.CreatedAt DESC
  `);
  return res.json({agent: result.recordset[0], items:listings.recordset.map(mapProperty)});
}));

// ==================== APPOINTMENTS / PROPERTY VISITS ====================
app.post('/api/appointments', auth, asyncRoute(async (req, res) => {
  const propertyId=String(req.body?.propertyId||'');
  const visitAt=new Date(req.body?.visitAt||'');
  const note=String(req.body?.note||'').trim().slice(0,1000);
  if (!propertyId || !Number.isFinite(visitAt.getTime()) || visitAt.getTime() < Date.now()+30*60*1000) {
    return res.status(400).json({message:'Chọn thời gian xem nhà hợp lệ, tối thiểu trước 30 phút.'});
  }
  const property=await findPropertyById(propertyId);
  if (!property || !publicProperty(property)) return res.status(404).json({message:'Tin đăng không khả dụng.'});
  if (!property.ownerId || property.ownerId===req.user.id) return res.status(400).json({message:'Bạn không thể đặt lịch xem tin của chính mình.'});
  const id=crypto.randomUUID(); const pool=await getPool();
  await pool.request().input('Id',sql.UniqueIdentifier,id).input('PropertyId',sql.UniqueIdentifier,propertyId)
    .input('BuyerId',sql.UniqueIdentifier,req.user.id).input('OwnerId',sql.UniqueIdentifier,property.ownerId)
    .input('VisitAt',sql.DateTime2,visitAt).input('Note',sql.NVarChar(1000),note||null)
    .query(`INSERT INTO dbo.Appointments(Id,PropertyId,BuyerId,OwnerId,VisitAt,Note) VALUES(@Id,@PropertyId,@BuyerId,@OwnerId,@VisitAt,@Note)`);
  await pool.request().input('Id',sql.UniqueIdentifier,crypto.randomUUID()).input('UserId',sql.UniqueIdentifier,property.ownerId)
    .input('Title',sql.NVarChar(180),'Yêu cầu đặt lịch xem nhà').input('Body',sql.NVarChar(2000),`${req.user.name} muốn đặt lịch xem tin "${property.title}" vào ${visitAt.toLocaleDateString('vi-VN')}.`)
    .input('Type',sql.NVarChar(30),'Appointment').input('RelatedId',sql.UniqueIdentifier,id).input('CreatedBy',sql.UniqueIdentifier,req.user.id)
    .query(`INSERT INTO dbo.Notifications(Id,UserId,Title,Body,Type,RelatedId,CreatedBy) VALUES(@Id,@UserId,@Title,@Body,@Type,@RelatedId,@CreatedBy)`);
  return res.status(201).json({message:'Đã gửi yêu cầu đặt lịch xem nhà cho người đăng.',id});
}));
app.get('/api/appointments', auth, asyncRoute(async (req,res)=>{
  const pool=await getPool();
  const result=await pool.request().input('UserId',sql.UniqueIdentifier,req.user.id).query(`
    SELECT a.Id AS id,a.PropertyId AS propertyId,a.BuyerId AS buyerId,a.OwnerId AS ownerId,
      a.VisitAt AS visitAt,a.Note AS note,a.Status AS status,a.CreatedAt AS createdAt,
      p.Title AS propertyTitle,p.Address AS address,
      b.FullName AS buyerName,b.Phone AS buyerPhone,b.Email AS buyerEmail,
      o.FullName AS ownerName,o.Phone AS ownerPhone
    FROM dbo.Appointments a JOIN dbo.Properties p ON p.Id=a.PropertyId
    JOIN dbo.Users b ON b.Id=a.BuyerId JOIN dbo.Users o ON o.Id=a.OwnerId
    WHERE a.BuyerId=@UserId OR a.OwnerId=@UserId OR @UserId IN (SELECT Id FROM dbo.Users WHERE Role IN ('Admin','Support'))
    ORDER BY a.VisitAt DESC`);
  return res.json({items:result.recordset.map(a=>({...a,visitAt:new Date(a.visitAt).toISOString(),createdAt:new Date(a.createdAt).toISOString(),canManage:a.ownerId===req.user.id||['Admin','Support'].includes(req.user.role)}))});
}));
app.patch('/api/appointments/:id', auth, asyncRoute(async (req,res)=>{
  const status=String(req.body?.status||'');
  if(!['Accepted','Declined','Completed','Cancelled'].includes(status)) return res.status(400).json({message:'Trạng thái lịch hẹn không hợp lệ.'});
  const pool=await getPool();
  const result=await pool.request().input('Id',sql.UniqueIdentifier,req.params.id).input('UserId',sql.UniqueIdentifier,req.user.id)
    .input('Status',sql.NVarChar(20),status).query(`
      UPDATE dbo.Appointments SET Status=@Status,UpdatedAt=SYSUTCDATETIME()
      OUTPUT INSERTED.Id AS id,INSERTED.BuyerId AS buyerId,INSERTED.OwnerId AS ownerId,INSERTED.PropertyId AS propertyId
      WHERE Id=@Id AND (OwnerId=@UserId OR BuyerId=@UserId OR @UserId IN (SELECT Id FROM dbo.Users WHERE Role IN ('Admin','Support')))
    `);
  if(!result.recordset.length) return res.status(404).json({message:'Không tìm thấy lịch hẹn hoặc bạn không có quyền.'});
  const a=result.recordset[0]; const notifyUser=status==='Cancelled'?a.ownerId:a.buyerId;
  await pool.request().input('Id',sql.UniqueIdentifier,crypto.randomUUID()).input('UserId',sql.UniqueIdentifier,notifyUser)
    .input('Title',sql.NVarChar(180),'Cập nhật lịch xem nhà').input('Body',sql.NVarChar(2000),`Lịch xem nhà đã được cập nhật: ${{Accepted:'Đã xác nhận',Declined:'Từ chối',Completed:'Đã hoàn tất',Cancelled:'Đã hủy'}[status]}.`)
    .input('Type',sql.NVarChar(30),'Appointment').input('RelatedId',sql.UniqueIdentifier,a.id).input('CreatedBy',sql.UniqueIdentifier,req.user.id)
    .query(`INSERT INTO dbo.Notifications(Id,UserId,Title,Body,Type,RelatedId,CreatedBy) VALUES(@Id,@UserId,@Title,@Body,@Type,@RelatedId,@CreatedBy)`);
  return res.json({message:'Đã cập nhật lịch hẹn.',status});
}));

// ==================== MESSAGING ====================

// Tạo hoặc mở hội thoại với người đăng tin.
app.post('/api/messages/conversations', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const recipientId = String(req.body?.recipientId || '');
  const propertyId = req.body?.propertyId ? String(req.body.propertyId) : null;

  if (!recipientId || recipientId === req.user.id) {
    return res.status(400).json({ message: 'Người nhận không hợp lệ.' });
  }

  const recipient = await findUserById(recipientId);
  if (!recipient || recipient.status !== 'Active') {
    return res.status(404).json({ message: 'Không tìm thấy người nhận.' });
  }

  if (propertyId) {
    const property = await findPropertyById(propertyId);
    if (!property || (!publicProperty(property) &&
        property.ownerId !== req.user.id && !['Admin', 'Support'].includes(req.user.role))) {
      return res.status(404).json({ message: 'Không tìm thấy tin đăng.' });
    }
  }

  const existing = await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .input('RecipientId', sql.UniqueIdentifier, recipientId)
    .input('PropertyId', sql.UniqueIdentifier, propertyId)
    .query(`
      SELECT TOP 1 Id AS id
      FROM dbo.Conversations
      WHERE ((User1Id = @UserId AND User2Id = @RecipientId)
          OR (User1Id = @RecipientId AND User2Id = @UserId))
        AND ((PropertyId = @PropertyId) OR (PropertyId IS NULL AND @PropertyId IS NULL))
      ORDER BY CreatedAt DESC
    `);

  let conversationId = existing.recordset[0]?.id;
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    await pool.request()
      .input('Id', sql.UniqueIdentifier, conversationId)
      .input('User1Id', sql.UniqueIdentifier, req.user.id)
      .input('User2Id', sql.UniqueIdentifier, recipientId)
      .input('PropertyId', sql.UniqueIdentifier, propertyId)
      .query(`
        INSERT INTO dbo.Conversations (Id, User1Id, User2Id, PropertyId)
        VALUES (@Id, @User1Id, @User2Id, @PropertyId)
      `);
  }

  return res.json({ conversationId });
}));

app.get('/api/messages/conversations', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT c.Id AS id, c.PropertyId AS propertyId, c.CreatedAt AS createdAt,
        CASE WHEN c.User1Id = @UserId THEN u2.Id ELSE u1.Id END AS otherUserId,
        CASE WHEN c.User1Id = @UserId THEN u2.FullName ELSE u1.FullName END AS otherUserName,
        CASE WHEN c.User1Id = @UserId THEN u2.Phone ELSE u1.Phone END AS otherUserPhone,
        p.Title AS propertyTitle,
        (SELECT TOP 1 m.Body FROM dbo.Messages m
          WHERE m.ConversationId = c.Id ORDER BY m.CreatedAt DESC) AS lastMessage,
        (SELECT TOP 1 m.CreatedAt FROM dbo.Messages m
          WHERE m.ConversationId = c.Id ORDER BY m.CreatedAt DESC) AS lastMessageAt,
        (SELECT COUNT_BIG(1) FROM dbo.Messages unread
          WHERE unread.ConversationId = c.Id AND unread.SenderId <> @UserId
            AND unread.ReadAt IS NULL) AS unreadCount
      FROM dbo.Conversations c
      INNER JOIN dbo.Users u1 ON u1.Id = c.User1Id
      INNER JOIN dbo.Users u2 ON u2.Id = c.User2Id
      LEFT JOIN dbo.Properties p ON p.Id = c.PropertyId
      WHERE c.User1Id = @UserId OR c.User2Id = @UserId
      ORDER BY COALESCE(
        (SELECT TOP 1 m.CreatedAt FROM dbo.Messages m
          WHERE m.ConversationId = c.Id ORDER BY m.CreatedAt DESC), c.CreatedAt
      ) DESC
    `);
  return res.json({ items: result.recordset });
}));

app.get('/api/messages/conversations/:id', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const conversation = await pool.request()
    .input('Id', sql.UniqueIdentifier, req.params.id)
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT c.Id AS id, c.PropertyId AS propertyId,
        CASE WHEN c.User1Id = @UserId THEN u2.FullName ELSE u1.FullName END AS otherUserName,
        CASE WHEN c.User1Id = @UserId THEN u2.Phone ELSE u1.Phone END AS otherUserPhone,
        CASE WHEN c.User1Id = @UserId THEN c.User2Id ELSE c.User1Id END AS otherUserId,
        p.Title AS propertyTitle
      FROM dbo.Conversations c
      INNER JOIN dbo.Users u1 ON u1.Id = c.User1Id
      INNER JOIN dbo.Users u2 ON u2.Id = c.User2Id
      LEFT JOIN dbo.Properties p ON p.Id = c.PropertyId
      WHERE c.Id = @Id AND (c.User1Id = @UserId OR c.User2Id = @UserId)
    `);
  if (!conversation.recordset.length) {
    return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện.' });
  }
  const readResult = await pool.request()
    .input('ConversationId', sql.UniqueIdentifier, req.params.id)
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      UPDATE dbo.Messages SET ReadAt = SYSUTCDATETIME()
      WHERE ConversationId = @ConversationId AND SenderId <> @UserId AND ReadAt IS NULL
    `);
  if (readResult.rowsAffected?.[0] > 0) {
    broadcastToUser(conversation.recordset[0].otherUserId, {
      type: 'read', conversationId: req.params.id, readerId: req.user.id
    });
  }
  const messages = await pool.request()
    .input('ConversationId', sql.UniqueIdentifier, req.params.id)
    .query(`
      SELECT Id AS id, SenderId AS senderId, Body AS body,
        CreatedAt AS createdAt, ReadAt AS readAt
      FROM dbo.Messages WHERE ConversationId = @ConversationId
      ORDER BY CreatedAt ASC
    `);
  return res.json({ conversation: conversation.recordset[0], items: messages.recordset });
}));

app.post('/api/messages/conversations/:id', auth, asyncRoute(async (req, res) => {
  const pool = await getPool();
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 2000) {
    return res.status(400).json({ message: 'Tin nhắn không được để trống và tối đa 2000 ký tự.' });
  }
  const access = await pool.request()
    .input('Id', sql.UniqueIdentifier, req.params.id)
    .input('UserId', sql.UniqueIdentifier, req.user.id)
    .query(`
      SELECT Id, User1Id AS user1Id, User2Id AS user2Id FROM dbo.Conversations
      WHERE Id = @Id AND (User1Id = @UserId OR User2Id = @UserId)
    `);
  if (!access.recordset.length) {
    return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện.' });
  }
  const id = crypto.randomUUID();
  const result = await pool.request()
    .input('Id', sql.UniqueIdentifier, id)
    .input('ConversationId', sql.UniqueIdentifier, req.params.id)
    .input('SenderId', sql.UniqueIdentifier, req.user.id)
    .input('Body', sql.NVarChar(2000), body)
    .query(`
      INSERT INTO dbo.Messages (Id, ConversationId, SenderId, Body)
      OUTPUT INSERTED.Id AS id, INSERTED.SenderId AS senderId,
        INSERTED.Body AS body, INSERTED.CreatedAt AS createdAt
      VALUES (@Id, @ConversationId, @SenderId, @Body)
    `);
  const message = { ...result.recordset[0], readAt: null };
  const participants = access.recordset[0];
  broadcastToUser(participants.user1Id, {
    type: 'message', conversationId: req.params.id, message
  });
  broadcastToUser(participants.user2Id, {
    type: 'message', conversationId: req.params.id, message
  });
  return res.status(201).json({ message });
}));

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy API.' });
});

app.use((err, req, res, next) => {
  console.error('API error:', err);

  if (res.headersSent) return next(err);

  // Lỗi dữ liệu đầu vào từ SQL Server có thể trả về 400 thay vì 500.
  if (err.number === 8023 || err.number === 8115) {
    return res.status(400).json({
      message: 'Giá trị số không hợp lệ hoặc vượt giới hạn cho phép.'
    });
  }

  res.status(500).json({
    message: 'Lỗi máy chủ. Vui lòng thử lại.'
  });
});

// ==================== REAL-TIME MESSAGING (WebSocket) ====================
// WebSocket dùng JWT hiện có; chỉ người dùng đang hoạt động mới được kết nối.
// Không cần thư viện WebSocket bổ sung, tương thích WebSocket tích hợp trong trình duyệt.
const socketsByUser = new Map();

function websocketFrame(opcode, payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function sendSocketJson(socket, payload) {
  if (!socket.destroyed && socket.writable) {
    try { socket.write(websocketFrame(0x1, JSON.stringify(payload))); } catch { socket.destroy(); }
  }
}

function broadcastToUser(userId, payload) {
  if (!userId) return;
  const clients = socketsByUser.get(String(userId));
  if (!clients) return;
  for (const socket of clients) sendSocketJson(socket, payload);
}

function removeSocket(userId, socket) {
  const clients = socketsByUser.get(String(userId));
  if (!clients) return;
  clients.delete(socket);
  if (!clients.size) socketsByUser.delete(String(userId));
}

httpServer.on('upgrade', async (request, socket) => {
  let userId = null;
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const origin = request.headers.origin;
    const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    if (origin && origin !== allowedOrigin && !origin.startsWith('http://localhost:')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    const token = url.searchParams.get('token') || '';
    if (!token) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    const decoded = jwt.verify(token, JWT_SECRET || 'local-only-unsafe-secret-change-me');
    const user = await findUserById(decoded.sub);
    if (!user || user.status !== 'Active') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
    }
    const key = request.headers['sec-websocket-key'];
    if (!key || request.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      ''
    ].join('\r\n') + '\r\n');
    userId = String(user.id);
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsByUser.get(userId).add(socket);
    socket.setNoDelay(true);
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const first = buffer[0], second = buffer[1];
        const opcode = first & 0x0f;
        const masked = Boolean(second & 0x80);
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2); offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          const largeLength = buffer.readBigUInt64BE(2);
          if (largeLength > 1024n * 1024n) { socket.destroy(); return; }
          length = Number(largeLength); offset = 10;
        }
        const maskLength = masked ? 4 : 0;
        if (buffer.length < offset + maskLength + length) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : null;
        offset += maskLength;
        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        buffer = buffer.subarray(offset + length);
        if (masked && mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        if (opcode === 0x8) { socket.end(websocketFrame(0x8)); return; }
        if (opcode === 0x9) socket.write(websocketFrame(0xA, payload));
        if (opcode === 0x1) {
          try {
            const incoming = JSON.parse(payload.toString('utf8'));
            if (incoming?.type === 'ping') sendSocketJson(socket, { type: 'pong', at: Date.now() });
          } catch { /* Bỏ qua payload không hợp lệ; client không được gửi thao tác dữ liệu qua WS. */ }
        }
      }
    });
    socket.on('close', () => removeSocket(userId, socket));
    socket.on('end', () => removeSocket(userId, socket));
    socket.on('error', () => removeSocket(userId, socket));
    sendSocketJson(socket, { type: 'connected', userId });
  } catch {
    if (userId) removeSocket(userId, socket);
    if (!socket.destroyed) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); }
  }
});

// Thêm cột đọc tin theo cách tương thích dữ liệu cũ (không xóa hoặc sửa nội dung cũ).
async function ensureMessagingSchema() {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Messages', 'U') IS NOT NULL AND COL_LENGTH('dbo.Messages', 'ReadAt') IS NULL
      ALTER TABLE dbo.Messages ADD ReadAt DATETIME2 NULL;
  `);
}

async function ensureNotificationSchema() {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.Notifications','U') IS NULL
    CREATE TABLE dbo.Notifications (
      Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      UserId UNIQUEIDENTIFIER NOT NULL,
      Title NVARCHAR(180) NOT NULL,
      Body NVARCHAR(2000) NOT NULL,
      Type NVARCHAR(30) NOT NULL DEFAULT 'Announcement',
      RelatedId UNIQUEIDENTIFIER NULL,
      CreatedBy UNIQUEIDENTIFIER NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      ReadAt DATETIME2 NULL,
      CONSTRAINT FK_Notifications_Users FOREIGN KEY(UserId) REFERENCES dbo.Users(Id)
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Notifications_User_CreatedAt')
      CREATE INDEX IX_Notifications_User_CreatedAt ON dbo.Notifications(UserId, CreatedAt DESC);

    -- Hiển thị hướng dẫn xác thực cho tài khoản hiện có; không tạo trùng khi backend khởi động lại.
    INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type)
    SELECT NEWID(), u.Id, N'Tin đăng BDS được Xác Thực',
      N'Để xác nhận tin xác thực vui lòng liên hệ đội ngũ hỗ trợ qua gmail: lenhotuan14092005@gmail.com. Trân trọng cảm ơn!',
      'VerificationInfo'
    FROM dbo.Users u
    WHERE u.Status='Active' AND u.Role <> 'Admin'
      AND NOT EXISTS (
        SELECT 1 FROM dbo.Notifications n
        WHERE n.UserId=u.Id AND n.Title=N'Tin đăng BDS được Xác Thực'
      );
  `);
}

// Tự động duyệt tin đã chờ đủ 12 giờ; chỉ chuyển Pending một lần nên không gửi thông báo trùng.
async function autoApproveMatureListings() {
  const pool = await getPool();
  const result = await pool.request().query(`
    DECLARE @approved TABLE (OwnerId UNIQUEIDENTIFIER, PropertyId UNIQUEIDENTIFIER, Title NVARCHAR(200));
    UPDATE dbo.Properties
      SET Status='Approved', UpdatedAt=SYSUTCDATETIME()
      OUTPUT inserted.OwnerId, inserted.Id, inserted.Title INTO @approved(OwnerId, PropertyId, Title)
      WHERE Status='Pending' AND CreatedAt <= DATEADD(HOUR, -12, SYSUTCDATETIME());
    INSERT INTO dbo.Notifications (Id, UserId, Title, Body, Type, RelatedId)
      SELECT NEWID(), a.OwnerId, N'Tin đăng đã được tự động duyệt',
        CONCAT(N'Tin "', a.Title, N'" đã được hệ thống tự động duyệt sau 12 giờ chờ xử lý.'),
        'ListingApproved', a.PropertyId
      FROM @approved a WHERE a.OwnerId IS NOT NULL;
    SELECT COUNT(*) AS approvedCount FROM @approved;
  `);
  const count = Number(result.recordset?.[0]?.approvedCount || 0);
  if (count) console.log(`Tự động duyệt ${count} tin đã chờ đủ 12 giờ.`);
}

// ==================== START SERVER ====================

async function startServer() {
  if (process.env.USE_SQL_SERVER !== 'true') {
    throw new Error('USE_SQL_SERVER phải được đặt thành true trong backend/.env.');
  }

  await getPool();
  await ensureMessagingSchema();
  await ensureNotificationSchema();
  await seedAdminSql();
  await autoApproveMatureListings();
  setInterval(() => autoApproveMatureListings().catch(error => console.error('Lỗi tự động duyệt tin:', error.message)), 60 * 1000).unref();

  httpServer.listen(PORT, () => {
    console.log(`DaNangRealEstate API đang chạy: http://localhost:${PORT}`);
    console.log(`WebSocket tin nhắn: ws://localhost:${PORT}/ws`);
    console.log('Chế độ dữ liệu: SQL Server');
  });
}

startServer().catch(error => {
  console.error('Không thể khởi động backend:', error);
  process.exit(1);
});
