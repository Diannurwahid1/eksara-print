import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sql = await readFile(join(__dirname, "..", "sql", "001_initial.sql"), "utf8");
    await pool.query(sql);
    process.stdout.write("Eksara database schema is ready.\n");
  } finally { await pool.end(); }
}
main();
