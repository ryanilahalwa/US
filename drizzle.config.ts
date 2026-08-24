import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const parsed = new URL(connectionString);
const ca = process.env.AIVEN_MYSQL_CA?.replace(/\\n/g, "\n") || undefined;
const isAiven = parsed.hostname.endsWith(".aivencloud.com") || parsed.hostname.endsWith(".aiven.io");
const requiresTls = isAiven || parsed.searchParams.get("ssl-mode")?.toUpperCase() === "REQUIRED";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ...(requiresTls ? { ssl: { ca, rejectUnauthorized: Boolean(ca) } } : {}),
  },
});
