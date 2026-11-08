import dotenv from 'dotenv';
dotenv.config();
import { getPool } from './db.js';
import sql from 'mssql';

const pool = await getPool();
if (!pool) {
  console.log('USE_SQL_SERVER chưa bật. Đặt USE_SQL_SERVER=true trong .env để khởi tạo SQL Server.');
  process.exit(0);
}
const schema = `
IF OBJECT_ID('dbo.Users','U') IS NULL
CREATE TABLE dbo.Users (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  FullName NVARCHAR(120) NOT NULL,
  Email NVARCHAR(254) NOT NULL UNIQUE,
  Phone NVARCHAR(30) NULL,
  PasswordHash NVARCHAR(255) NOT NULL,
  Role NVARCHAR(20) NOT NULL DEFAULT 'User',
  Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.Properties','U') IS NULL
CREATE TABLE dbo.Properties (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  Code NVARCHAR(30) NOT NULL UNIQUE,
  Title NVARCHAR(200) NOT NULL,
  Category NVARCHAR(50) NOT NULL,
  TransactionType NVARCHAR(20) NOT NULL,
  Price DECIMAL(19,2) NOT NULL,
  Area DECIMAL(12,2) NOT NULL,
  District NVARCHAR(100) NOT NULL,
  Ward NVARCHAR(100) NULL,
  Address NVARCHAR(300) NOT NULL,
  RoadWidth DECIMAL(6,2) NULL,
  Frontage DECIMAL(6,2) NULL,
  Bedrooms INT NULL,
  Bathrooms INT NULL,
  Floors INT NULL,
  Direction NVARCHAR(30) NULL,
  Legal NVARCHAR(100) NULL,
  Description NVARCHAR(MAX) NOT NULL,
  ImagesJson NVARCHAR(MAX) NOT NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
  Featured BIT NOT NULL DEFAULT 0,
  Views INT NOT NULL DEFAULT 0,
  OwnerId UNIQUEIDENTIFIER NULL,
  OwnerName NVARCHAR(120) NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Properties_Users FOREIGN KEY (OwnerId) REFERENCES dbo.Users(Id)
);
IF OBJECT_ID('dbo.Favorites','U') IS NULL
CREATE TABLE dbo.Favorites (
  UserId UNIQUEIDENTIFIER NOT NULL,
  PropertyId UNIQUEIDENTIFIER NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Favorites PRIMARY KEY(UserId, PropertyId),
  CONSTRAINT FK_Favorites_Users FOREIGN KEY(UserId) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_Favorites_Properties FOREIGN KEY(PropertyId) REFERENCES dbo.Properties(Id)
);
IF OBJECT_ID('dbo.Reports','U') IS NULL
CREATE TABLE dbo.Reports (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  PropertyId UNIQUEIDENTIFIER NOT NULL,
  ReporterId UNIQUEIDENTIFIER NOT NULL,
  Reason NVARCHAR(100) NOT NULL,
  Details NVARCHAR(1000) NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Reports_Properties FOREIGN KEY(PropertyId) REFERENCES dbo.Properties(Id),
  CONSTRAINT FK_Reports_Users FOREIGN KEY(ReporterId) REFERENCES dbo.Users(Id)
);
IF COL_LENGTH('dbo.Users','IsVerified') IS NULL ALTER TABLE dbo.Users ADD IsVerified BIT NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.Users','Tokens') IS NULL ALTER TABLE dbo.Users ADD Tokens INT NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.Users','AvatarUrl') IS NULL ALTER TABLE dbo.Users ADD AvatarUrl NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Users','Bio') IS NULL ALTER TABLE dbo.Users ADD Bio NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Users','PendingPhone') IS NULL ALTER TABLE dbo.Users ADD PendingPhone NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.Users','PhoneChangeStatus') IS NULL ALTER TABLE dbo.Users ADD PhoneChangeStatus NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.Properties','IsVerified') IS NULL ALTER TABLE dbo.Properties ADD IsVerified BIT NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.Properties','PriorityLevel') IS NULL ALTER TABLE dbo.Properties ADD PriorityLevel INT NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.Properties','PriorityUntil') IS NULL ALTER TABLE dbo.Properties ADD PriorityUntil DATETIME2 NULL;
IF COL_LENGTH('dbo.Properties','ListingUntil') IS NULL ALTER TABLE dbo.Properties ADD ListingUntil DATETIME2 NULL;

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

IF OBJECT_ID('dbo.TokenTransactions','U') IS NULL
CREATE TABLE dbo.TokenTransactions (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  UserId UNIQUEIDENTIFIER NOT NULL,
  Type NVARCHAR(20) NOT NULL,
  Amount INT NOT NULL,
  BalanceAfter INT NOT NULL,
  Note NVARCHAR(200) NULL,
  PropertyId UNIQUEIDENTIFIER NULL,
  CreatedBy UNIQUEIDENTIFIER NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_TokenTransactions_Users FOREIGN KEY(UserId) REFERENCES dbo.Users(Id)
);
IF OBJECT_ID('dbo.Conversations','U') IS NULL
CREATE TABLE dbo.Conversations (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  User1Id UNIQUEIDENTIFIER NOT NULL,
  User2Id UNIQUEIDENTIFIER NOT NULL,
  PropertyId UNIQUEIDENTIFIER NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Conversations_User1 FOREIGN KEY(User1Id) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_Conversations_User2 FOREIGN KEY(User2Id) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_Conversations_Property FOREIGN KEY(PropertyId) REFERENCES dbo.Properties(Id)
);
IF OBJECT_ID('dbo.Messages','U') IS NULL
CREATE TABLE dbo.Messages (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  ConversationId UNIQUEIDENTIFIER NOT NULL,
  SenderId UNIQUEIDENTIFIER NOT NULL,
  Body NVARCHAR(2000) NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Messages_Conversation FOREIGN KEY(ConversationId) REFERENCES dbo.Conversations(Id),
  CONSTRAINT FK_Messages_Sender FOREIGN KEY(SenderId) REFERENCES dbo.Users(Id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Messages_Conversation_CreatedAt')
CREATE INDEX IX_Messages_Conversation_CreatedAt ON dbo.Messages(ConversationId, CreatedAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Properties_Status_CreatedAt')
CREATE INDEX IX_Properties_Status_CreatedAt ON dbo.Properties(Status, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Properties_District_Category')
CREATE INDEX IX_Properties_District_Category ON dbo.Properties(District, Category);
IF OBJECT_ID('dbo.Appointments','U') IS NULL
CREATE TABLE dbo.Appointments (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  PropertyId UNIQUEIDENTIFIER NOT NULL,
  BuyerId UNIQUEIDENTIFIER NOT NULL,
  OwnerId UNIQUEIDENTIFIER NOT NULL,
  VisitAt DATETIME2 NOT NULL,
  Note NVARCHAR(1000) NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Appointments_Property FOREIGN KEY(PropertyId) REFERENCES dbo.Properties(Id),
  CONSTRAINT FK_Appointments_Buyer FOREIGN KEY(BuyerId) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_Appointments_Owner FOREIGN KEY(OwnerId) REFERENCES dbo.Users(Id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Appointments_Buyer_CreatedAt')
CREATE INDEX IX_Appointments_Buyer_CreatedAt ON dbo.Appointments(BuyerId, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Appointments_Owner_Status')
CREATE INDEX IX_Appointments_Owner_Status ON dbo.Appointments(OwnerId, Status, VisitAt);

IF OBJECT_ID('dbo.ForumPosts','U') IS NULL
CREATE TABLE dbo.ForumPosts (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  UserId UNIQUEIDENTIFIER NOT NULL,
  Content NVARCHAR(MAX) NOT NULL,
  ImagesJson NVARCHAR(MAX) NULL,
  PropertyId UNIQUEIDENTIFIER NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ForumPosts_User FOREIGN KEY(UserId) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_ForumPosts_Property FOREIGN KEY(PropertyId) REFERENCES dbo.Properties(Id)
);
IF OBJECT_ID('dbo.ForumComments','U') IS NULL
CREATE TABLE dbo.ForumComments (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  PostId UNIQUEIDENTIFIER NOT NULL,
  UserId UNIQUEIDENTIFIER NOT NULL,
  ParentId UNIQUEIDENTIFIER NULL,
  Content NVARCHAR(2000) NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ForumComments_Post FOREIGN KEY(PostId) REFERENCES dbo.ForumPosts(Id) ON DELETE CASCADE,
  CONSTRAINT FK_ForumComments_User FOREIGN KEY(UserId) REFERENCES dbo.Users(Id),
  CONSTRAINT FK_ForumComments_Parent FOREIGN KEY(ParentId) REFERENCES dbo.ForumComments(Id)
);
IF OBJECT_ID('dbo.ForumPostLikes','U') IS NULL
CREATE TABLE dbo.ForumPostLikes (
  PostId UNIQUEIDENTIFIER NOT NULL,
  UserId UNIQUEIDENTIFIER NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ForumPostLikes PRIMARY KEY(PostId,UserId),
  CONSTRAINT FK_ForumPostLikes_Post FOREIGN KEY(PostId) REFERENCES dbo.ForumPosts(Id) ON DELETE CASCADE,
  CONSTRAINT FK_ForumPostLikes_User FOREIGN KEY(UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
);
IF OBJECT_ID('dbo.ForumPostShares','U') IS NULL
CREATE TABLE dbo.ForumPostShares (
  Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  PostId UNIQUEIDENTIFIER NOT NULL,
  UserId UNIQUEIDENTIFIER NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ForumPostShares_Post FOREIGN KEY(PostId) REFERENCES dbo.ForumPosts(Id) ON DELETE CASCADE,
  CONSTRAINT FK_ForumPostShares_User FOREIGN KEY(UserId) REFERENCES dbo.Users(Id)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ForumPosts_CreatedAt')
CREATE INDEX IX_ForumPosts_CreatedAt ON dbo.ForumPosts(CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ForumComments_PostId')
CREATE INDEX IX_ForumComments_PostId ON dbo.ForumComments(PostId,CreatedAt);

`;
await pool.request()
  .input('Content', sql.NVarChar(sql.MAX), schema)
  .query('EXEC sys.sp_executesql @Content');
console.log('Đã khởi tạo các bảng SQL Server.');
process.exit(0);
