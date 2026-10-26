import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

let pool;
export async function getPool() {
  if (process.env.USE_SQL_SERVER !== 'true') return null;
  if (!pool) {
    pool = await sql.connect({
      server: process.env.DB_SERVER || 'localhost',
      database: process.env.DB_DATABASE || 'DaNangRealEstate',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: true },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    });
  }
  return pool;
}
export { sql };
