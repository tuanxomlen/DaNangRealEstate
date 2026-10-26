/*
  Migration for public profile bio and admin-approved phone changes.
  Run this script against the SAME database configured in backend/.env.
  Safe to run repeatedly; existing data is preserved.
*/
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
  THROW 50001, 'dbo.Users does not exist. Check DB_DATABASE in backend/.env.', 1;
END;
GO

IF COL_LENGTH('dbo.Users', 'Bio') IS NULL
  ALTER TABLE dbo.Users ADD Bio NVARCHAR(1000) NULL;
GO

IF COL_LENGTH('dbo.Users', 'PendingPhone') IS NULL
  ALTER TABLE dbo.Users ADD PendingPhone NVARCHAR(30) NULL;
GO

IF COL_LENGTH('dbo.Users', 'PhoneChangeStatus') IS NULL
  ALTER TABLE dbo.Users ADD PhoneChangeStatus NVARCHAR(20) NULL;
GO

PRINT N'Profile/phone migration completed.';
GO
