import express from "express";
import { sql } from "drizzle-orm";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./server/_core/oauth";
import { registerStorageProxy } from "./server/_core/storageProxy";
import { createContext } from "./server/_core/context";
import { appRouter } from "./server/routers";
import { getDb } from "./server/db";

const app = express();
const distPath = path.resolve(process.cwd(), "dist", "public");

// Keep the production middleware and limits aligned with the original app.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.get("/api/health", async (_req, res) => {
  const db = await getDb();
  if (!db) return res.status(503).json({ ok: false, database: "not-configured" });
  try {
    await db.execute(sql`SELECT 1`);
    return res.json({ ok: true, database: "ok" });
  } catch (error) {
    console.error("[Health] Database check failed:", error);
    return res.status(503).json({ ok: false, database: "unavailable" });
  }
});
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);
app.use(express.static(distPath));
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});

export default app;
