import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

// Lazily create the Drizzle instance so local tooling can run without a DB.
// Aiven requires TLS; its connection URI commonly contains ssl-mode=REQUIRED,
// which mysql2 does not translate into its ssl option automatically.
export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      const parsed = new URL(ENV.databaseUrl);
      const isAiven = parsed.hostname.endsWith(".aivencloud.com") || parsed.hostname.endsWith(".aiven.io");
      const requiresTls = isAiven || parsed.searchParams.get("ssl-mode")?.toUpperCase() === "REQUIRED";
      const pool = createPool({
        uri: ENV.databaseUrl,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ...(requiresTls ? { ssl: { ca: ENV.aivenMysqlCa || undefined, rejectUnauthorized: Boolean(ENV.aivenMysqlCa) } } : {}),
      });
      _pool = pool;
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to initialize connection:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
