import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  feelingResponses,
  feelings,
  locations,
  moments,
  momentReactions,
  bucketItems,
  timelineEvents,
  countdowns,
  voiceMemories,
  notificationPreferences,
  notifications,
  relationshipInvites,
  relationshipMembers,
  relationships,
  users,
  wellnessEntries,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storageDelete, storagePreparePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { getRelationshipElapsed } from "../../shared/orbit";

const moods = ["radiant", "calm", "tender", "heavy", "restless", "hopeful"] as const;
const entryTypes = ["cycle", "mood", "wellness"] as const;
const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"] as const;
const videoMimeTypes = ["video/mp4", "video/webm"] as const;
const audioMimeTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a"] as const;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The private space is temporarily unavailable." });
  return db;
}

async function getMembership(db: Database, userId: number) {
  const rows = await db
    .select({ relationship: relationships, membership: relationshipMembers })
    .from(relationshipMembers)
    .innerJoin(relationships, eq(relationshipMembers.relationshipId, relationships.id))
    .where(eq(relationshipMembers.userId, userId))
    .limit(1);
  return rows[0];
}

async function requireMembership(db: Database, userId: number) {
  const result = await getMembership(db, userId);
  if (!result) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Create or join your private orbit before accessing shared content." });
  }
  return result;
}

async function getPartnerId(db: Database, relationshipId: number, userId: number) {
  const rows = await db
    .select({ userId: relationshipMembers.userId })
    .from(relationshipMembers)
    .where(and(eq(relationshipMembers.relationshipId, relationshipId), ne(relationshipMembers.userId, userId)))
    .limit(1);
  return rows[0]?.userId;
}

async function shouldNotify(
  db: Database,
  relationshipId: number,
  recipientId: number,
  category: "memories" | "feelings" | "wellness",
) {
  const preference = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.relationshipId, relationshipId), eq(notificationPreferences.userId, recipientId)))
    .limit(1);
  const current = preference[0];
  if (category === "wellness") return current?.wellnessEnabled ?? false;
  return category === "memories" ? (current?.memoriesEnabled ?? true) : (current?.feelingsEnabled ?? true);
}

async function notifyPartner(
  db: Database,
  relationshipId: number,
  authorId: number,
  category: "memories" | "feelings" | "wellness",
  type: "moment" | "feeling" | "wellness",
  title: string,
  body: string,
  targetPath: string,
) {
  const partnerId = await getPartnerId(db, relationshipId, authorId);
  if (!partnerId || !(await shouldNotify(db, relationshipId, partnerId, category))) return;
  await db.insert(notifications).values({ relationshipId, recipientId: partnerId, type, title, body, targetPath });
}

async function createDueReminders(db: Database, relationshipId: number, userId: number) {
  const preference = await db.select({ enabled: notificationPreferences.remindersEnabled }).from(notificationPreferences)
    .where(and(eq(notificationPreferences.relationshipId, relationshipId), eq(notificationPreferences.userId, userId))).limit(1);
  if (!preference[0]?.enabled) return;
  const dueEntries = await db.select().from(wellnessEntries).where(and(
    eq(wellnessEntries.relationshipId, relationshipId),
    eq(wellnessEntries.ownerId, userId),
    isNotNull(wellnessEntries.reminderAt),
    lte(wellnessEntries.reminderAt, new Date()),
  ));
  for (const entry of dueEntries) {
    const targetPath = `/wellness?reminder=${entry.id}`;
    const existing = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.recipientId, userId), eq(notifications.type, "reminder"), eq(notifications.targetPath, targetPath))).limit(1);
    if (!existing[0]) {
      await db.insert(notifications).values({
        relationshipId,
        recipientId: userId,
        type: "reminder",
        title: "Private calendar reminder",
        body: `${entry.entryType === "cycle" ? "Cycle" : "Wellness"} reminder: ${entry.value}`,
        targetPath,
      });
    }
  }
  const dueCountdowns = await db.select().from(countdowns).where(and(eq(countdowns.relationshipId, relationshipId), eq(countdowns.createdById, userId), eq(countdowns.reminderEnabled, true), isNull(countdowns.completedAt), lte(countdowns.targetAt, new Date())));
  for (const countdown of dueCountdowns) {
    const targetPath = `/more?tab=countdowns&reminder=${countdown.id}`;
    const existing = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.recipientId, userId), eq(notifications.type, "reminder"), eq(notifications.targetPath, targetPath))).limit(1);
    if (!existing[0]) await db.insert(notifications).values({ relationshipId, recipientId: userId, type: "reminder", title: "A countdown has arrived", body: countdown.title, targetPath });
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function fileExtension(filename: string, mimeType: string) {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  if (sanitized.includes(".")) return sanitized;
  const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/heic": ".heic", "image/heif": ".heif", "video/mp4": ".mp4", "video/webm": ".webm" };
  return `${sanitized || "memory"}${extensions[mimeType] ?? ""}`;
}

export const orbitRouter = router({
  relationship: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await getMembership(db, ctx.user.id);
      if (!current) return { relationship: null, member: null, partner: null };
      const partner = await db
        .select({ id: users.id, name: users.name })
        .from(relationshipMembers)
        .innerJoin(users, eq(relationshipMembers.userId, users.id))
        .where(and(eq(relationshipMembers.relationshipId, current.relationship.id), ne(relationshipMembers.userId, ctx.user.id)))
        .limit(1);
      return { relationship: current.relationship, member: current.membership, partner: partner[0] ?? null };
    }),
    duration: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return { startDate: current.relationship.startDate, ...getRelationshipElapsed(current.relationship.startDate) };
    }),
    setup: protectedProcedure
      .input(z.object({ displayName: z.string().trim().min(2).max(80), startDate: z.coerce.date() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDatabase();
        if (await getMembership(db, ctx.user.id)) throw new TRPCError({ code: "CONFLICT", message: "This account is already linked to a private orbit." });
        const created = await db.insert(relationships).values({ ownerId: ctx.user.id, displayName: input.displayName, startDate: input.startDate }).$returningId();
        const relationshipId = created[0]?.id;
        if (!relationshipId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create your private orbit." });
        await db.insert(relationshipMembers).values({ relationshipId, userId: ctx.user.id, role: "owner" });
        await db.insert(notificationPreferences).values({ relationshipId, userId: ctx.user.id });
        return { relationshipId };
      }),
    createInvite: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (current.membership.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the person who created the orbit can issue the partner invitation." });
      const members = await db.select({ id: relationshipMembers.id }).from(relationshipMembers).where(eq(relationshipMembers.relationshipId, current.relationship.id));
      if (members.length >= 2) throw new TRPCError({ code: "CONFLICT", message: "This private orbit already has its two members." });
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(relationshipInvites).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, tokenHash: hashToken(token), expiresAt });
      return { token, expiresAt };
    }),
    previewInvite: protectedProcedure.input(z.object({ token: z.string().min(40).max(100) })).query(async ({ input }) => {
      const db = await requireDatabase();
      const invite = await db
        .select({ relationship: relationships, invite: relationshipInvites })
        .from(relationshipInvites)
        .innerJoin(relationships, eq(relationshipInvites.relationshipId, relationships.id))
        .where(and(eq(relationshipInvites.tokenHash, hashToken(input.token)), gt(relationshipInvites.expiresAt, new Date()), isNull(relationshipInvites.acceptedAt), isNull(relationshipInvites.revokedAt)))
        .limit(1);
      if (!invite[0]) throw new TRPCError({ code: "NOT_FOUND", message: "This private invitation is no longer available." });
      return { displayName: invite[0].relationship.displayName, startDate: invite[0].relationship.startDate };
    }),
    acceptInvite: protectedProcedure.input(z.object({ token: z.string().min(40).max(100) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      if (await getMembership(db, ctx.user.id)) throw new TRPCError({ code: "CONFLICT", message: "This account is already linked to a private orbit." });
      const invite = await db
        .select()
        .from(relationshipInvites)
        .where(and(eq(relationshipInvites.tokenHash, hashToken(input.token)), gt(relationshipInvites.expiresAt, new Date()), isNull(relationshipInvites.acceptedAt), isNull(relationshipInvites.revokedAt)))
        .limit(1);
      const activeInvite = invite[0];
      if (!activeInvite || activeInvite.createdById === ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "This private invitation is unavailable." });
      const members = await db.select({ id: relationshipMembers.id }).from(relationshipMembers).where(eq(relationshipMembers.relationshipId, activeInvite.relationshipId));
      if (members.length >= 2) throw new TRPCError({ code: "CONFLICT", message: "This private orbit already has its two members." });
      await db.insert(relationshipMembers).values({ relationshipId: activeInvite.relationshipId, userId: ctx.user.id, role: "partner" });
      await db.insert(notificationPreferences).values({ relationshipId: activeInvite.relationshipId, userId: ctx.user.id });
      await db.update(relationshipInvites).set({ acceptedById: ctx.user.id, acceptedAt: new Date() }).where(eq(relationshipInvites.id, activeInvite.id));
      await db.insert(notifications).values({ relationshipId: activeInvite.relationshipId, recipientId: activeInvite.createdById, type: "partner", title: "Your orbit is complete", body: "Your partner accepted the private invitation.", targetPath: "/" });
      return { relationshipId: activeInvite.relationshipId };
    }),
    update: protectedProcedure.input(z.object({ displayName: z.string().trim().min(2).max(80), startDate: z.coerce.date() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (current.membership.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the orbit owner can change the relationship settings." });
      await db.update(relationships).set(input).where(eq(relationships.id, current.relationship.id));
      return { success: true };
    }),
  }),

  moments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const rows = await db.select({ moment: moments, authorName: users.name }).from(moments).innerJoin(users, eq(moments.createdById, users.id)).where(and(eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).orderBy(desc(moments.occurredAt)).limit(100);
      const reactions = await db.select().from(momentReactions).where(eq(momentReactions.relationshipId, current.relationship.id));
      return rows.map((row) => ({ ...row, reactions: reactions.filter((reaction) => reaction.momentId === row.moment.id) }));
    }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const rows = await db.select({ mediaType: moments.mediaType, fileSizeBytes: moments.fileSizeBytes }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id))));
      return { moments: rows.length, photos: rows.filter((row) => row.mediaType === "photo").length, videos: rows.filter((row) => row.mediaType === "video").length, bytes: rows.reduce((total, row) => total + (row.fileSizeBytes ?? 0), 0) };
    }),
    prepareUpload: protectedProcedure.input(z.object({ filename: z.string().min(1).max(160), mimeType: z.enum([...imageMimeTypes, ...videoMimeTypes]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const prepared = await storagePreparePut(`orbit/${current.relationship.id}/moments/${ctx.user.id}-${Date.now()}-${fileExtension(input.filename, input.mimeType)}`, input.mimeType);
      return { ...prepared, mediaType: input.mimeType.startsWith("video/") ? "video" as const : "photo" as const };
    }),
    create: protectedProcedure.input(z.object({ filename: z.string().min(1).max(160), mimeType: z.enum([...imageMimeTypes, ...videoMimeTypes]), fileKey: z.string().min(1).max(512), mediaUrl: z.string().min(1).max(1024), caption: z.string().trim().max(500).optional(), visibility: z.enum(["pair", "private"]).default("pair"), favorite: z.boolean().default(false), fileSizeBytes: z.number().int().min(0).max(100_000_000).optional(), occurredAt: z.coerce.date() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const expectedPrefix = `orbit/${current.relationship.id}/moments/`;
      if (!input.fileKey.startsWith(expectedPrefix) || ![`/media/${input.fileKey}`, `/manus-storage/${input.fileKey}`].includes(input.mediaUrl)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file does not belong to this private orbit." });
      }
      const mediaType = input.mimeType.startsWith("video/") ? "video" : "photo";
      await db.insert(moments).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, mediaType, fileKey: input.fileKey, mediaUrl: input.mediaUrl, caption: input.caption || null, visibility: input.visibility, favorite: input.favorite, fileSizeBytes: input.fileSizeBytes ?? null, occurredAt: input.occurredAt });
      await notifyPartner(db, current.relationship.id, ctx.user.id, "memories", "moment", "A new memory was added", input.caption || "A private moment is waiting in your orbit.", "/moments");
      return { success: true };
    }),
    toggleFavorite: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ favorite: moments.favorite }).from(moments).where(and(eq(moments.id, input.id), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available." });
      await db.update(moments).set({ favorite: !selected[0].favorite }).where(eq(moments.id, input.id));
      return { favorite: !selected[0].favorite };
    }),
    react: protectedProcedure.input(z.object({ id: z.number().int().positive(), kind: z.enum(["heart", "smile", "remember"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.id), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available." });
      const existing = await db.select({ id: momentReactions.id }).from(momentReactions).where(and(eq(momentReactions.momentId, input.id), eq(momentReactions.userId, ctx.user.id), eq(momentReactions.kind, input.kind))).limit(1);
      if (existing[0]) await db.delete(momentReactions).where(eq(momentReactions.id, existing[0].id));
      else await db.insert(momentReactions).values({ relationshipId: current.relationship.id, momentId: input.id, userId: ctx.user.id, kind: input.kind });
      return { active: !existing[0] };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), caption: z.string().trim().max(500).optional(), occurredAt: z.coerce.date(), visibility: z.enum(["pair", "private"]).optional(), favorite: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const { id, ...values } = input;
      const result = await db.update(moments).set({ caption: values.caption || null, occurredAt: values.occurredAt, ...(values.visibility ? { visibility: values.visibility } : {}), ...(values.favorite === undefined ? {} : { favorite: values.favorite }) }).where(and(eq(moments.id, id), eq(moments.relationshipId, current.relationship.id), eq(moments.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
    setCover: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: moments.id }).from(moments).where(and(
        eq(moments.id, input.id),
        eq(moments.relationshipId, current.relationship.id),
        eq(moments.mediaType, "photo"),
      )).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a shared photo to use in the sphere." });
      await db.update(relationships).set({ coverMomentId: input.id }).where(eq(relationships.id, current.relationship.id));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const existing = await db.select({ mediaUrl: moments.mediaUrl, mediaType: moments.mediaType, fileKey: moments.fileKey }).from(moments).where(and(eq(moments.id, input.id), eq(moments.relationshipId, current.relationship.id), eq(moments.createdById, ctx.user.id))).limit(1);
      const deleted = await db.delete(moments).where(and(eq(moments.id, input.id), eq(moments.relationshipId, current.relationship.id), eq(moments.createdById, ctx.user.id)));
      if (deleted[0]?.affectedRows === 1 && existing[0]?.fileKey) {
        void storageDelete(existing[0].fileKey, existing[0].mediaType === "video" ? "video/mp4" : "image/jpeg").catch((error) => console.warn("[Storage] Failed to remove Cloudinary moment:", error));
      }
      if (deleted[0]?.affectedRows === 1 && current.relationship.coverMomentId === input.id) {
        await db.update(relationships).set({ coverMomentId: null }).where(eq(relationships.id, current.relationship.id));
      }
      return { success: deleted[0]?.affectedRows === 1 };
    }),
  }),

  feelings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const entries = await db.select({ feeling: feelings, authorName: users.name }).from(feelings).innerJoin(users, eq(feelings.authorId, users.id)).where(and(eq(feelings.relationshipId, current.relationship.id), or(eq(feelings.authorId, ctx.user.id), eq(feelings.visibility, "partner")))).orderBy(desc(feelings.createdAt)).limit(50);
      const responseRows = await db.select({ response: feelingResponses, authorName: users.name }).from(feelingResponses).innerJoin(users, eq(feelingResponses.authorId, users.id)).orderBy(desc(feelingResponses.createdAt)).limit(100);
      return entries.map((entry) => ({ ...entry, responses: responseRows.filter((response) => response.response.feelingId === entry.feeling.id) }));
    }),
    create: protectedProcedure.input(z.object({ mood: z.enum(moods), note: z.string().trim().min(1).max(800), visibility: z.enum(["partner", "private"]).default("partner") })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const created = await db.insert(feelings).values({ relationshipId: current.relationship.id, authorId: ctx.user.id, ...input }).$returningId();
      if (input.visibility === "partner") await notifyPartner(db, current.relationship.id, ctx.user.id, "feelings", "feeling", "A feeling was shared", `Your partner checked in as ${input.mood}.`, "/feelings");
      return { id: created[0]?.id };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), mood: z.enum(moods), note: z.string().trim().min(1).max(800), visibility: z.enum(["partner", "private"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const { id, ...values } = input;
      const result = await db.update(feelings).set(values).where(and(eq(feelings.id, id), eq(feelings.relationshipId, current.relationship.id), eq(feelings.authorId, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
    respond: protectedProcedure.input(z.object({ feelingId: z.number().int().positive(), message: z.string().trim().min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const entry = await db.select().from(feelings).where(and(eq(feelings.id, input.feelingId), eq(feelings.relationshipId, current.relationship.id))).limit(1);
      const feeling = entry[0];
      if (!feeling || (feeling.authorId !== ctx.user.id && feeling.visibility !== "partner")) throw new TRPCError({ code: "NOT_FOUND", message: "That check-in is not available to you." });
      await db.insert(feelingResponses).values({ feelingId: feeling.id, authorId: ctx.user.id, message: input.message });
      if (feeling.authorId !== ctx.user.id) await db.insert(notifications).values({ relationshipId: current.relationship.id, recipientId: feeling.authorId, type: "feeling", title: "You received a supportive response", body: "Your partner responded to your recent check-in.", targetPath: "/feelings" });
      return { success: true };
    }),
  }),

  location: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const records = await db.select({ location: locations, name: users.name }).from(locations).innerJoin(users, eq(locations.userId, users.id)).where(eq(locations.relationshipId, current.relationship.id));
      return records.filter((record) => record.location.userId === ctx.user.id || record.location.sharingEnabled);
    }),
    share: protectedProcedure.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().min(0).max(100000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const existing = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.relationshipId, current.relationship.id), eq(locations.userId, ctx.user.id))).limit(1);
      const values = { latitude: input.latitude.toFixed(7), longitude: input.longitude.toFixed(7), accuracyMeters: input.accuracyMeters ? Math.round(input.accuracyMeters) : null, sharingEnabled: true };
      if (existing[0]) await db.update(locations).set(values).where(eq(locations.id, existing[0].id));
      else await db.insert(locations).values({ relationshipId: current.relationship.id, userId: ctx.user.id, ...values });
      return { success: true };
    }),
    stop: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.update(locations).set({ sharingEnabled: false, latitude: null, longitude: null, accuracyMeters: null }).where(and(eq(locations.relationshipId, current.relationship.id), eq(locations.userId, ctx.user.id)));
      return { success: true };
    }),
  }),

  wellness: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ entry: wellnessEntries, ownerName: users.name }).from(wellnessEntries).innerJoin(users, eq(wellnessEntries.ownerId, users.id)).where(and(eq(wellnessEntries.relationshipId, current.relationship.id), or(eq(wellnessEntries.ownerId, ctx.user.id), eq(wellnessEntries.shareWithPartner, true)))).orderBy(desc(wellnessEntries.entryDate)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), cycleLength: z.number().int().min(20).max(45).optional(), entryType: z.enum(entryTypes), value: z.string().trim().min(1).max(80), note: z.string().trim().max(800).optional(), shareWithPartner: z.boolean().default(false), reminderAt: z.coerce.date().optional() }).superRefine((input, issue) => { if (input.periodEndDate && input.entryType !== "cycle") issue.addIssue({ code: "custom", path: ["periodEndDate"], message: "Period dates can only be attached to a cycle entry." }); if (input.periodEndDate && input.periodEndDate < input.entryDate) issue.addIssue({ code: "custom", path: ["periodEndDate"], message: "Period end date must be on or after the start date." }); if (input.cycleLength && input.entryType !== "cycle") issue.addIssue({ code: "custom", path: ["cycleLength"], message: "Cycle length can only be attached to a cycle entry." }); })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(wellnessEntries).values({
        relationshipId: current.relationship.id,
        ownerId: ctx.user.id,
        entryDate: new Date(`${input.entryDate}T00:00:00.000Z`),
        periodEndDate: input.periodEndDate ? new Date(`${input.periodEndDate}T00:00:00.000Z`) : null,
        cycleLength: input.cycleLength ?? null,
        entryType: input.entryType,
        value: input.value,
        note: input.note || null,
        shareWithPartner: input.shareWithPartner,
        reminderAt: input.reminderAt ?? null,
      });
      if (input.shareWithPartner) await notifyPartner(db, current.relationship.id, ctx.user.id, "wellness", "wellness", "A shared calendar item was added", "Your partner shared a private wellness calendar entry.", "/wellness");
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), cycleLength: z.number().int().min(20).max(45).nullable().optional(), entryType: z.enum(entryTypes), value: z.string().trim().min(1).max(80), note: z.string().trim().max(800).optional(), shareWithPartner: z.boolean(), reminderAt: z.coerce.date().nullable().optional() }).superRefine((input, issue) => { if (input.periodEndDate && input.entryType !== "cycle") issue.addIssue({ code: "custom", path: ["periodEndDate"], message: "Period dates can only be attached to a cycle entry." }); if (input.periodEndDate && input.periodEndDate < input.entryDate) issue.addIssue({ code: "custom", path: ["periodEndDate"], message: "Period end date must be on or after the start date." }); if (input.cycleLength && input.entryType !== "cycle") issue.addIssue({ code: "custom", path: ["cycleLength"], message: "Cycle length can only be attached to a cycle entry." }); })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const { id, ...values } = input;
      const result = await db.update(wellnessEntries).set({
        entryDate: new Date(`${values.entryDate}T00:00:00.000Z`),
        periodEndDate: values.periodEndDate ? new Date(`${values.periodEndDate}T00:00:00.000Z`) : null,
        cycleLength: values.cycleLength ?? null,
        entryType: values.entryType,
        value: values.value,
        note: values.note || null,
        shareWithPartner: values.shareWithPartner,
        reminderAt: values.reminderAt ?? null,
      }).where(and(eq(wellnessEntries.id, id), eq(wellnessEntries.relationshipId, current.relationship.id), eq(wellnessEntries.ownerId, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(wellnessEntries).where(and(eq(wellnessEntries.id, input.id), eq(wellnessEntries.relationshipId, current.relationship.id), eq(wellnessEntries.ownerId, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  relationshipExtras: router({
    updateCoverRotation: protectedProcedure.input(z.object({ enabled: z.boolean(), mode: z.enum(["manual", "weekly", "monthly", "anniversary"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.update(relationships).set({ coverRotationEnabled: input.enabled, coverRotationMode: input.mode }).where(eq(relationships.id, current.relationship.id));
      return { success: true };
    }),
    rotateCover: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const photos = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), eq(moments.mediaType, "photo"), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).orderBy(desc(moments.occurredAt));
      if (!photos.length) throw new TRPCError({ code: "NOT_FOUND", message: "Add a photo before rotating the sphere." });
      const currentIndex = photos.findIndex((photo) => photo.id === current.relationship.coverMomentId);
      const next = photos[(currentIndex + 1 + photos.length) % photos.length] ?? photos[0];
      await db.update(relationships).set({ coverMomentId: next.id, coverRotatedAt: new Date() }).where(eq(relationships.id, current.relationship.id));
      return { id: next.id };
    }),
  }),

  bucket: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ item: bucketItems, authorName: users.name }).from(bucketItems).innerJoin(users, eq(bucketItems.createdById, users.id)).where(eq(bucketItems.relationshipId, current.relationship.id)).orderBy(desc(bucketItems.completedAt), desc(bucketItems.targetDate), desc(bucketItems.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), note: z.string().trim().max(500).optional(), category: z.string().trim().max(40).default("together"), targetDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(bucketItems).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, note: input.note || null, category: input.category, targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null });
      return { success: true };
    }),
    toggle: protectedProcedure.input(z.object({ id: z.number().int().positive(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.update(bucketItems).set({ completedAt: input.completed ? new Date() : null }).where(and(eq(bucketItems.id, input.id), eq(bucketItems.relationshipId, current.relationship.id)));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(bucketItems).where(and(eq(bucketItems.id, input.id), eq(bucketItems.relationshipId, current.relationship.id), eq(bucketItems.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  timeline: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ event: timelineEvents, authorName: users.name }).from(timelineEvents).innerJoin(users, eq(timelineEvents.createdById, users.id)).where(eq(timelineEvents.relationshipId, current.relationship.id)).orderBy(desc(timelineEvents.eventDate)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), note: z.string().trim().max(800).optional(), eventDate: z.coerce.date(), momentId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.momentId) {
        const moment = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id))).limit(1);
        if (!moment[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available in this orbit." });
      }
      await db.insert(timelineEvents).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, note: input.note || null, eventDate: input.eventDate, momentId: input.momentId ?? null });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(timelineEvents).where(and(eq(timelineEvents.id, input.id), eq(timelineEvents.relationshipId, current.relationship.id), eq(timelineEvents.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  countdowns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ countdown: countdowns, authorName: users.name }).from(countdowns).innerJoin(users, eq(countdowns.createdById, users.id)).where(eq(countdowns.relationshipId, current.relationship.id)).orderBy(desc(countdowns.targetAt)).limit(50);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(120), note: z.string().trim().max(500).optional(), targetAt: z.coerce.date(), reminderEnabled: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(countdowns).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, note: input.note || null, targetAt: input.targetAt, reminderEnabled: input.reminderEnabled });
      return { success: true };
    }),
    complete: protectedProcedure.input(z.object({ id: z.number().int().positive(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.update(countdowns).set({ completedAt: input.completed ? new Date() : null }).where(and(eq(countdowns.id, input.id), eq(countdowns.relationshipId, current.relationship.id)));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(countdowns).where(and(eq(countdowns.id, input.id), eq(countdowns.relationshipId, current.relationship.id), eq(countdowns.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  voice: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ voice: voiceMemories, authorName: users.name }).from(voiceMemories).innerJoin(users, eq(voiceMemories.createdById, users.id)).where(and(eq(voiceMemories.relationshipId, current.relationship.id), or(eq(voiceMemories.visibility, "pair"), eq(voiceMemories.createdById, ctx.user.id)))).orderBy(desc(voiceMemories.occurredAt)).limit(60);
    }),
    prepareUpload: protectedProcedure.input(z.object({ filename: z.string().min(1).max(160), mimeType: z.enum(audioMimeTypes) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return storagePreparePut(`orbit/${current.relationship.id}/voice/${ctx.user.id}-${Date.now()}-${fileExtension(input.filename, input.mimeType)}`, input.mimeType);
    }),
    create: protectedProcedure.input(z.object({ filename: z.string().min(1).max(160), fileKey: z.string().min(1).max(512), mediaUrl: z.string().min(1).max(1024), caption: z.string().trim().max(500).optional(), transcript: z.string().max(5000).optional(), visibility: z.enum(["pair", "private"]).default("pair"), occurredAt: z.coerce.date(), durationSeconds: z.number().int().min(0).max(3600).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const expectedPrefix = `orbit/${current.relationship.id}/voice/`;
      if (!input.fileKey.startsWith(expectedPrefix) || ![`/media/${input.fileKey}`, `/manus-storage/${input.fileKey}`].includes(input.mediaUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "The voice memory does not belong to this private orbit." });
      await db.insert(voiceMemories).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, fileKey: input.fileKey, mediaUrl: input.mediaUrl, caption: input.caption || null, transcript: input.transcript || null, visibility: input.visibility, occurredAt: input.occurredAt, durationSeconds: input.durationSeconds ?? null });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const existing = await db.select({ fileKey: voiceMemories.fileKey }).from(voiceMemories).where(and(eq(voiceMemories.id, input.id), eq(voiceMemories.relationshipId, current.relationship.id), eq(voiceMemories.createdById, ctx.user.id))).limit(1);
      const result = await db.delete(voiceMemories).where(and(eq(voiceMemories.id, input.id), eq(voiceMemories.relationshipId, current.relationship.id), eq(voiceMemories.createdById, ctx.user.id)));
      if (result[0]?.affectedRows === 1 && existing[0]?.fileKey) {
        void storageDelete(existing[0].fileKey, "audio/webm").catch((error) => console.warn("[Storage] Failed to remove Cloudinary voice memory:", error));
      }
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  insights: router({
    trends: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const moodRows = await db.select({ createdAt: feelings.createdAt, mood: feelings.mood }).from(feelings).where(and(eq(feelings.relationshipId, current.relationship.id), or(eq(feelings.authorId, ctx.user.id), eq(feelings.visibility, "partner")))).orderBy(desc(feelings.createdAt)).limit(90);
      const wellnessRows = await db.select({ entryDate: wellnessEntries.entryDate, entryType: wellnessEntries.entryType }).from(wellnessEntries).where(and(eq(wellnessEntries.relationshipId, current.relationship.id), or(eq(wellnessEntries.ownerId, ctx.user.id), eq(wellnessEntries.shareWithPartner, true)))).orderBy(desc(wellnessEntries.entryDate)).limit(90);
      return { moods: moodRows.map((row) => ({ date: new Date(row.createdAt).toISOString().slice(0, 10), mood: row.mood })), wellness: wellnessRows.map((row) => ({ date: new Date(row.entryDate).toISOString().slice(0, 10), type: row.entryType })) };
    }),
  }),

  exportData: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await requireMembership(db, ctx.user.id);
    const relationshipId = current.relationship.id;
    const [memoryRows, feelingRows, wellnessRows, bucketRows, timelineRows, countdownRows, voiceRows] = await Promise.all([
      db.select().from(moments).where(and(eq(moments.relationshipId, relationshipId), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))),
      db.select().from(feelings).where(and(eq(feelings.relationshipId, relationshipId), or(eq(feelings.authorId, ctx.user.id), eq(feelings.visibility, "partner")))),
      db.select().from(wellnessEntries).where(and(eq(wellnessEntries.relationshipId, relationshipId), or(eq(wellnessEntries.ownerId, ctx.user.id), eq(wellnessEntries.shareWithPartner, true)))),
      db.select().from(bucketItems).where(eq(bucketItems.relationshipId, relationshipId)),
      db.select().from(timelineEvents).where(eq(timelineEvents.relationshipId, relationshipId)),
      db.select().from(countdowns).where(eq(countdowns.relationshipId, relationshipId)),
      db.select().from(voiceMemories).where(and(eq(voiceMemories.relationshipId, relationshipId), or(eq(voiceMemories.visibility, "pair"), eq(voiceMemories.createdById, ctx.user.id)))),
    ]);
    return { exportedAt: new Date(), relationship: current.relationship, moments: memoryRows, feelings: feelingRows, wellness: wellnessRows, bucket: bucketRows, timeline: timelineRows, countdowns: countdownRows, voice: voiceRows };
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await createDueReminders(db, current.relationship.id, ctx.user.id);
      return db.select().from(notifications).where(eq(notifications.recipientId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(30);
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.recipientId, ctx.user.id)));
      return { success: true };
    }),
    preferences: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const preference = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.relationshipId, current.relationship.id), eq(notificationPreferences.userId, ctx.user.id))).limit(1);
      return preference[0] ?? null;
    }),
    updatePreferences: protectedProcedure.input(z.object({ memoriesEnabled: z.boolean(), feelingsEnabled: z.boolean(), wellnessEnabled: z.boolean(), remindersEnabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(notificationPreferences).values({ relationshipId: current.relationship.id, userId: ctx.user.id, ...input }).onDuplicateKeyUpdate({ set: input });
      return { success: true };
    }),
  }),
});
