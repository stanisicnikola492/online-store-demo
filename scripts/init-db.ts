import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[init-db] DATABASE_URL is not set');
  process.exit(1);
}

function parseUrl(raw: string) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

async function waitForDb(cfg: ReturnType<typeof parseUrl>, attempts = 60) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const conn = await mysql.createConnection(cfg);
      await conn.end();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`[init-db] waiting for MySQL (${i}/${attempts})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const cfg = parseUrl(DATABASE_URL!);
  await waitForDb(cfg);

  console.log('[init-db] applying migrations');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });

  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM `User`');
  const userCount = (rows as Array<{ n: number }>)[0]?.n ?? 0;

  if (userCount === 0) {
    const dumpPath = path.join(process.cwd(), 'database', 'demo.sql');
    if (fs.existsSync(dumpPath)) {
      console.log('[init-db] loading demo data from database/demo.sql');
      await conn.query(fs.readFileSync(dumpPath, 'utf8'));
    } else {
      console.warn('[init-db] no demo dump found; database left empty');
    }
  } else {
    console.log(`[init-db] demo data already present (${userCount} users), skipping load`);
  }

  await conn.end();
  console.log('[init-db] ready');
}

main().catch((err) => {
  console.error('[init-db] failed', err);
  process.exit(1);
});
