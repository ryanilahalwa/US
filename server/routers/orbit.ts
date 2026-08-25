import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNotNull, isNull, like, lte, ne, or } from "drizzle-orm";
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
  galleryAlbums,
  galleryAlbumMilestones,
  memoryCapsules,
  surpriseDrops,
  relationshipPlaces,
  promptResponses,
  rituals,
  momentReplies,
  momentComparisons,
  traditions,
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
const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"] as const;
const videoMimeTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const;
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
  const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif", "image/heic": ".heic", "image/heif": ".heif", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/x-m4v": ".m4v" };
  return `${sanitized || "memory"}${extensions[mimeType] ?? ""}`;
}

function nextRitualDate(cadence: "daily" | "weekly" | "monthly", from = new Date()) {
  const next = new Date(from);
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
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
    create: protectedProcedure.input(z.object({ filename: z.string().min(1).max(160), mimeType: z.enum([...imageMimeTypes, ...videoMimeTypes]), fileKey: z.string().min(1).max(512), mediaUrl: z.string().min(1).max(1024), caption: z.string().trim().max(500).optional(), quote: z.string().trim().max(280).optional(), albumId: z.number().int().positive().optional(), songTitle: z.string().trim().max(160).optional(), songArtist: z.string().trim().max(160).optional(), songUrl: z.string().url().max(1024).optional(), visibility: z.enum(["pair", "private"]).default("pair"), favorite: z.boolean().default(false), fileSizeBytes: z.number().int().min(0).max(100_000_000).optional(), occurredAt: z.coerce.date() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const expectedPrefix = `orbit/${current.relationship.id}/moments/`;
      if (!input.fileKey.startsWith(expectedPrefix) || ![`/media/${input.fileKey}`, `/manus-storage/${input.fileKey}`].includes(input.mediaUrl)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file does not belong to this private orbit." });
      }
      if (input.albumId) {
        const album = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, input.albumId), eq(galleryAlbums.relationshipId, current.relationship.id))).limit(1);
        if (!album[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
      }
      const mediaType = input.mimeType.startsWith("video/") ? "video" : "photo";
      const created = await db.insert(moments).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, mediaType, fileKey: input.fileKey, mediaUrl: input.mediaUrl, caption: input.caption || null, quote: input.quote || null, albumId: input.albumId ?? null, songTitle: input.songTitle || null, songArtist: input.songArtist || null, songUrl: input.songUrl || null, visibility: input.visibility, favorite: input.favorite, fileSizeBytes: input.fileSizeBytes ?? null, occurredAt: input.occurredAt }).$returningId();
      await notifyPartner(db, current.relationship.id, ctx.user.id, "memories", "moment", "A new memory was added", input.caption || input.quote || "A private moment is waiting in your orbit.", "/moments");
      return { success: true, id: created[0]?.id ?? null };
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
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), caption: z.string().trim().max(500).optional(), quote: z.string().trim().max(280).optional(), albumId: z.number().int().positive().nullable().optional(), songTitle: z.string().trim().max(160).optional(), songArtist: z.string().trim().max(160).optional(), songUrl: z.string().url().max(1024).optional(), occurredAt: z.coerce.date(), visibility: z.enum(["pair", "private"]).optional(), favorite: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const { id, ...values } = input;
      if (values.albumId) {
        const album = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, values.albumId), eq(galleryAlbums.relationshipId, current.relationship.id))).limit(1);
        if (!album[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
      }
      const updateSet: Record<string, unknown> = { occurredAt: values.occurredAt };
      if (values.caption !== undefined) updateSet.caption = values.caption || null;
      if (values.quote !== undefined) updateSet.quote = values.quote || null;
      if (values.albumId !== undefined) updateSet.albumId = values.albumId;
      if (values.songTitle !== undefined) updateSet.songTitle = values.songTitle || null;
      if (values.songArtist !== undefined) updateSet.songArtist = values.songArtist || null;
      if (values.songUrl !== undefined) updateSet.songUrl = values.songUrl || null;
      if (values.visibility !== undefined) updateSet.visibility = values.visibility;
      if (values.favorite !== undefined) updateSet.favorite = values.favorite;
      const result = await db.update(moments).set(updateSet).where(and(eq(moments.id, id), eq(moments.relationshipId, current.relationship.id), eq(moments.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
    setCover: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: moments.id }).from(moments).where(and(
        eq(moments.id, input.id),
        eq(moments.relationshipId, current.relationship.id),
        eq(moments.mediaType, "photo"),
        eq(moments.visibility, "pair"),
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
      if (deleted[0]?.affectedRows === 1 && (current.relationship.coverMomentId === input.id || current.relationship.featuredMomentId === input.id)) {
        await db.update(relationships).set({
          ...(current.relationship.coverMomentId === input.id ? { coverMomentId: null } : {}),
          ...(current.relationship.featuredMomentId === input.id ? { featuredMomentId: null } : {}),
        }).where(eq(relationships.id, current.relationship.id));
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
    updateFeaturedRotation: protectedProcedure.input(z.object({ enabled: z.boolean(), mode: z.enum(["manual", "weekly", "monthly", "anniversary"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.update(relationships).set({ featuredRotationEnabled: input.enabled, featuredRotationMode: input.mode }).where(eq(relationships.id, current.relationship.id));
      return { success: true };
    }),
    rotateFeatured: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const photos = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), eq(moments.mediaType, "photo"), eq(moments.visibility, "pair"))).orderBy(desc(moments.occurredAt));
      if (!photos.length) throw new TRPCError({ code: "NOT_FOUND", message: "Add a shared photo before featuring a memory." });
      const currentIndex = photos.findIndex((photo) => photo.id === current.relationship.featuredMomentId);
      const next = photos[(currentIndex + 1 + photos.length) % photos.length] ?? photos[0];
      await db.update(relationships).set({ featuredMomentId: next.id, featuredRotatedAt: new Date() }).where(eq(relationships.id, current.relationship.id));
      return { id: next.id };
    }),
    setFeatured: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.id), eq(moments.relationshipId, current.relationship.id), eq(moments.mediaType, "photo"), eq(moments.visibility, "pair"))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Only shared photos can be featured for both of us." });
      await db.update(relationships).set({ featuredMomentId: input.id, featuredRotatedAt: new Date() }).where(eq(relationships.id, current.relationship.id));
      return { success: true };
    }),
  }),

  albums: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const rows = await db.select().from(galleryAlbums).where(eq(galleryAlbums.relationshipId, current.relationship.id)).orderBy(desc(galleryAlbums.createdAt)).limit(50);
      const momentRows = await db.select({ id: moments.id, albumId: moments.albumId }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id))));
      const milestoneRows = await db.select({ id: galleryAlbumMilestones.id, albumId: galleryAlbumMilestones.albumId }).from(galleryAlbumMilestones).where(eq(galleryAlbumMilestones.relationshipId, current.relationship.id));
      return rows.map((album) => ({ album, momentCount: momentRows.filter((moment) => moment.albumId === album.id).length, milestoneCount: milestoneRows.filter((milestone) => milestone.albumId === album.id).length }));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(), coverMomentId: z.number().int().positive().optional(), startedAt: z.coerce.date().optional(), endedAt: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.startedAt && input.endedAt && input.endedAt.getTime() < input.startedAt.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "An album chapter cannot end before it starts." });
      if (input.coverMomentId) {
        const cover = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.coverMomentId), eq(moments.relationshipId, current.relationship.id), eq(moments.mediaType, "photo"), eq(moments.visibility, "pair"))).limit(1);
        if (!cover[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a shared photo for the album cover." });
      }
      const created = await db.insert(galleryAlbums).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, name: input.name, description: input.description || null, coverMomentId: input.coverMomentId ?? null, startedAt: input.startedAt ?? null, endedAt: input.endedAt ?? null }).$returningId();
      return { id: created[0]?.id };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(), coverMomentId: z.number().int().positive().nullable().optional(), startedAt: z.coerce.date().nullable().optional(), endedAt: z.coerce.date().nullable().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.startedAt && input.endedAt && input.endedAt.getTime() < input.startedAt.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "An album chapter cannot end before it starts." });
      if (input.coverMomentId) {
        const cover = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.coverMomentId), eq(moments.relationshipId, current.relationship.id), eq(moments.mediaType, "photo"), eq(moments.visibility, "pair"))).limit(1);
        if (!cover[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a shared photo for the album cover." });
      }
      const result = await db.update(galleryAlbums).set({ name: input.name, description: input.description || null, ...(input.coverMomentId !== undefined ? { coverMomentId: input.coverMomentId } : {}), ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}), ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}) }).where(and(eq(galleryAlbums.id, input.id), eq(galleryAlbums.relationshipId, current.relationship.id), eq(galleryAlbums.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, input.id), eq(galleryAlbums.relationshipId, current.relationship.id), eq(galleryAlbums.createdById, ctx.user.id))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
      await db.update(moments).set({ albumId: null }).where(and(eq(moments.relationshipId, current.relationship.id), eq(moments.albumId, input.id)));
      await db.delete(galleryAlbumMilestones).where(and(eq(galleryAlbumMilestones.relationshipId, current.relationship.id), eq(galleryAlbumMilestones.albumId, input.id)));
      await db.delete(galleryAlbums).where(eq(galleryAlbums.id, input.id));
      return { success: true };
    }),
    milestones: router({
      list: protectedProcedure.input(z.object({ albumId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const current = await requireMembership(db, ctx.user.id);
        const album = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, input.albumId), eq(galleryAlbums.relationshipId, current.relationship.id))).limit(1);
        if (!album[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
        return db.select({ milestone: galleryAlbumMilestones, authorName: users.name }).from(galleryAlbumMilestones).innerJoin(users, eq(galleryAlbumMilestones.createdById, users.id)).where(and(eq(galleryAlbumMilestones.albumId, input.albumId), eq(galleryAlbumMilestones.relationshipId, current.relationship.id))).orderBy(desc(galleryAlbumMilestones.milestoneDate)).limit(100);
      }),
      create: protectedProcedure.input(z.object({ albumId: z.number().int().positive(), title: z.string().trim().min(1).max(160), note: z.string().trim().max(800).optional(), milestoneDate: z.coerce.date() })).mutation(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const current = await requireMembership(db, ctx.user.id);
        const album = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, input.albumId), eq(galleryAlbums.relationshipId, current.relationship.id))).limit(1);
        if (!album[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
        await db.insert(galleryAlbumMilestones).values({ relationshipId: current.relationship.id, albumId: input.albumId, createdById: ctx.user.id, title: input.title, note: input.note || null, milestoneDate: input.milestoneDate });
        return { success: true };
      }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const current = await requireMembership(db, ctx.user.id);
        const result = await db.delete(galleryAlbumMilestones).where(and(eq(galleryAlbumMilestones.id, input.id), eq(galleryAlbumMilestones.relationshipId, current.relationship.id), eq(galleryAlbumMilestones.createdById, ctx.user.id)));
        return { success: result[0]?.affectedRows === 1 };
      }),
    }),
  }),

  surpriseDrops: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const rows = await db.select({ drop: surpriseDrops, recipientName: users.name }).from(surpriseDrops).innerJoin(users, eq(surpriseDrops.recipientId, users.id)).where(eq(surpriseDrops.relationshipId, current.relationship.id)).orderBy(desc(surpriseDrops.revealAt)).limit(100);
      const now = Date.now();
      return { received: rows.filter(({ drop }) => drop.recipientId === ctx.user.id && new Date(drop.revealAt).getTime() <= now), sent: rows.filter(({ drop }) => drop.createdById === ctx.user.id), sealedCount: rows.filter(({ drop }) => drop.createdById === ctx.user.id && new Date(drop.revealAt).getTime() > now).length };
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), message: z.string().trim().min(1).max(2000), quote: z.string().trim().max(280).optional(), revealAt: z.coerce.date(), momentId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      if (input.revealAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a future reveal date." });
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const recipientId = await getPartnerId(db, current.relationship.id, ctx.user.id);
      if (!recipientId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Link your partner before sending a surprise drop." });
      if (input.momentId) {
        const selected = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id), eq(moments.visibility, "pair"))).limit(1);
        if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a shared memory for this surprise drop." });
      }
      await db.insert(surpriseDrops).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, recipientId, title: input.title, message: input.message, quote: input.quote || null, revealAt: input.revealAt, momentId: input.momentId ?? null });
      return { success: true };
    }),
    open: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ id: surpriseDrops.id, revealAt: surpriseDrops.revealAt }).from(surpriseDrops).where(and(eq(surpriseDrops.id, input.id), eq(surpriseDrops.relationshipId, current.relationship.id), eq(surpriseDrops.recipientId, ctx.user.id))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That surprise drop is not available." });
      if (new Date(selected[0].revealAt).getTime() > Date.now()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This surprise drop is still sealed." });
      await db.update(surpriseDrops).set({ openedAt: new Date() }).where(eq(surpriseDrops.id, input.id));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(surpriseDrops).where(and(eq(surpriseDrops.id, input.id), eq(surpriseDrops.relationshipId, current.relationship.id), eq(surpriseDrops.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  places: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ place: relationshipPlaces, authorName: users.name }).from(relationshipPlaces).innerJoin(users, eq(relationshipPlaces.createdById, users.id)).where(and(eq(relationshipPlaces.relationshipId, current.relationship.id), or(eq(relationshipPlaces.visibility, "pair"), eq(relationshipPlaces.createdById, ctx.user.id)))).orderBy(desc(relationshipPlaces.visitedAt), desc(relationshipPlaces.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), address: z.string().trim().max(500).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), visitedAt: z.coerce.date().optional(), note: z.string().trim().max(800).optional(), momentId: z.number().int().positive().optional(), visibility: z.enum(["pair", "private"]).default("pair") })).mutation(async ({ ctx, input }) => {
      if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new TRPCError({ code: "BAD_REQUEST", message: "Add both latitude and longitude, or leave both blank." });
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.momentId) {
        const selected = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
        if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available for this place." });
      }
      await db.insert(relationshipPlaces).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, address: input.address || null, latitude: input.latitude === undefined ? null : input.latitude.toString(), longitude: input.longitude === undefined ? null : input.longitude.toString(), visitedAt: input.visitedAt ?? null, note: input.note || null, momentId: input.momentId ?? null, visibility: input.visibility });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(relationshipPlaces).where(and(eq(relationshipPlaces.id, input.id), eq(relationshipPlaces.relationshipId, current.relationship.id), eq(relationshipPlaces.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  anniversary: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await requireMembership(db, ctx.user.id);
    const start = new Date(current.relationship.startDate);
    const now = new Date();
    const next = new Date(now.getFullYear(), start.getMonth(), start.getDate());
    if (start.getMonth() === 1 && start.getDate() === 29 && next.getMonth() !== 1) next.setDate(28);
    if (next.getTime() < now.getTime()) { next.setFullYear(next.getFullYear() + 1); if (start.getMonth() === 1 && start.getDate() === 29 && next.getMonth() !== 1) next.setDate(28); }
    const yearsTogether = next.getFullYear() - start.getFullYear();
    const [milestoneRows, favoriteRows, traditionRows] = await Promise.all([
      db.select({ id: galleryAlbumMilestones.id, title: galleryAlbumMilestones.title, milestoneDate: galleryAlbumMilestones.milestoneDate }).from(galleryAlbumMilestones).where(eq(galleryAlbumMilestones.relationshipId, current.relationship.id)).orderBy(desc(galleryAlbumMilestones.milestoneDate)).limit(6),
      db.select({ id: moments.id, caption: moments.caption, mediaUrl: moments.mediaUrl, occurredAt: moments.occurredAt }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), eq(moments.favorite, true), eq(moments.visibility, "pair"))).orderBy(desc(moments.occurredAt)).limit(6),
      db.select({ id: traditions.id, title: traditions.title, detail: traditions.detail }).from(traditions).where(eq(traditions.relationshipId, current.relationship.id)).orderBy(desc(traditions.createdAt)).limit(6),
    ]);
    return { displayName: current.relationship.displayName, startDate: start, nextAnniversary: next, yearsTogether, daysUntil: Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 86_400_000)), milestones: milestoneRows, favorites: favoriteRows, traditions: traditionRows };
  }),

  capsules: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const rows = await db.select().from(memoryCapsules).where(eq(memoryCapsules.relationshipId, current.relationship.id)).orderBy(desc(memoryCapsules.revealAt)).limit(100);
      const now = Date.now();
      return { capsules: rows.filter((capsule) => new Date(capsule.revealAt).getTime() <= now), sealedCount: rows.filter((capsule) => new Date(capsule.revealAt).getTime() > now).length };
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), message: z.string().trim().min(1).max(2000), quote: z.string().trim().max(280).optional(), revealAt: z.coerce.date(), momentId: z.number().int().positive().optional(), albumId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.revealAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a future reveal date for this capsule." });
      if (input.momentId) {
        const moment = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
        if (!moment[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available for this capsule." });
      }
      if (input.albumId) {
        const album = await db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(and(eq(galleryAlbums.id, input.albumId), eq(galleryAlbums.relationshipId, current.relationship.id))).limit(1);
        if (!album[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That private album is not available." });
      }
      await db.insert(memoryCapsules).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, message: input.message, quote: input.quote || null, revealAt: input.revealAt, momentId: input.momentId ?? null, albumId: input.albumId ?? null });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(memoryCapsules).where(and(eq(memoryCapsules.id, input.id), eq(memoryCapsules.relationshipId, current.relationship.id), eq(memoryCapsules.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  prompts: router({
    today: protectedProcedure.query(async () => {
      const promptBank = ["What tiny thing made you feel cared for today?", "What should we remember about this season of us?", "Where would you take us for one quiet afternoon?", "What is one ordinary moment you never want to lose?", "What are you looking forward to sharing next?"];
      const dayIndex = Math.floor(Date.now() / 86_400_000) % promptBank.length;
      return { prompt: promptBank[dayIndex] };
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ response: promptResponses, authorName: users.name }).from(promptResponses).innerJoin(users, eq(promptResponses.createdById, users.id)).where(and(eq(promptResponses.relationshipId, current.relationship.id), or(eq(promptResponses.visibility, "pair"), eq(promptResponses.createdById, ctx.user.id)))).orderBy(desc(promptResponses.createdAt)).limit(100);
    }),
    respond: protectedProcedure.input(z.object({ prompt: z.string().trim().min(1).max(280), response: z.string().trim().min(1).max(1200), visibility: z.enum(["pair", "private"]).default("pair") })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(promptResponses).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, prompt: input.prompt, response: input.response, visibility: input.visibility });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(promptResponses).where(and(eq(promptResponses.id, input.id), eq(promptResponses.relationshipId, current.relationship.id), eq(promptResponses.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  rituals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ ritual: rituals, authorName: users.name }).from(rituals).innerJoin(users, eq(rituals.createdById, users.id)).where(eq(rituals.relationshipId, current.relationship.id)).orderBy(desc(rituals.nextDueAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"), note: z.string().trim().max(500).optional(), nextDueAt: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(rituals).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, name: input.name, cadence: input.cadence, note: input.note || null, nextDueAt: input.nextDueAt ?? new Date() });
      return { success: true };
    }),
    complete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const selected = await db.select({ cadence: rituals.cadence }).from(rituals).where(and(eq(rituals.id, input.id), eq(rituals.relationshipId, current.relationship.id))).limit(1);
      if (!selected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That ritual is not available." });
      await db.update(rituals).set({ lastCompletedAt: new Date(), nextDueAt: nextRitualDate(selected[0].cadence) }).where(eq(rituals.id, input.id));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(rituals).where(and(eq(rituals.id, input.id), eq(rituals.relationshipId, current.relationship.id), eq(rituals.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  threads: router({
    list: protectedProcedure.input(z.object({ momentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const moment = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
      if (!moment[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available." });
      return db.select({ reply: momentReplies, authorName: users.name }).from(momentReplies).innerJoin(users, eq(momentReplies.createdById, users.id)).where(and(eq(momentReplies.momentId, input.momentId), eq(momentReplies.relationshipId, current.relationship.id))).orderBy(desc(momentReplies.createdAt)).limit(100);
    }),
    add: protectedProcedure.input(z.object({ momentId: z.number().int().positive(), body: z.string().trim().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const moment = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.id, input.momentId), eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))).limit(1);
      if (!moment[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That memory is not available." });
      await db.insert(momentReplies).values({ relationshipId: current.relationship.id, momentId: input.momentId, createdById: ctx.user.id, body: input.body });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(momentReplies).where(and(eq(momentReplies.id, input.id), eq(momentReplies.relationshipId, current.relationship.id), eq(momentReplies.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  comparisons: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select().from(momentComparisons).where(eq(momentComparisons.relationshipId, current.relationship.id)).orderBy(desc(momentComparisons.createdAt)).limit(50);
    }),
    create: protectedProcedure.input(z.object({ olderMomentId: z.number().int().positive(), newerMomentId: z.number().int().positive(), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      if (input.olderMomentId === input.newerMomentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two different memories for a comparison." });
      const selected = await db.select({ id: moments.id }).from(moments).where(and(eq(moments.relationshipId, current.relationship.id), or(eq(moments.id, input.olderMomentId), eq(moments.id, input.newerMomentId)), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id))));
      if (selected.length !== 2) throw new TRPCError({ code: "NOT_FOUND", message: "Both memories must be visible inside this orbit." });
      await db.insert(momentComparisons).values({ relationshipId: current.relationship.id, olderMomentId: input.olderMomentId, newerMomentId: input.newerMomentId, createdById: ctx.user.id, note: input.note || null });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(momentComparisons).where(and(eq(momentComparisons.id, input.id), eq(momentComparisons.relationshipId, current.relationship.id), eq(momentComparisons.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  traditions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      return db.select({ tradition: traditions, authorName: users.name }).from(traditions).innerJoin(users, eq(traditions.createdById, users.id)).where(eq(traditions.relationshipId, current.relationship.id)).orderBy(desc(traditions.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), detail: z.string().trim().max(800).optional(), season: z.string().trim().max(80).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      await db.insert(traditions).values({ relationshipId: current.relationship.id, createdById: ctx.user.id, title: input.title, detail: input.detail || null, season: input.season || null });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const current = await requireMembership(db, ctx.user.id);
      const result = await db.delete(traditions).where(and(eq(traditions.id, input.id), eq(traditions.relationshipId, current.relationship.id), eq(traditions.createdById, ctx.user.id)));
      return { success: result[0]?.affectedRows === 1 };
    }),
  }),

  recap: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await requireMembership(db, ctx.user.id);
    const relationshipId = current.relationship.id;
    const [momentRows, albumRows, milestoneRows, favoriteRows, feelingRows, ritualRows] = await Promise.all([
      db.select({ occurredAt: moments.occurredAt }).from(moments).where(and(eq(moments.relationshipId, relationshipId), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))),
      db.select({ id: galleryAlbums.id }).from(galleryAlbums).where(eq(galleryAlbums.relationshipId, relationshipId)),
      db.select({ id: galleryAlbumMilestones.id }).from(galleryAlbumMilestones).where(eq(galleryAlbumMilestones.relationshipId, relationshipId)),
      db.select({ id: moments.id }).from(moments).where(and(eq(moments.relationshipId, relationshipId), eq(moments.favorite, true), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))),
      db.select({ mood: feelings.mood }).from(feelings).where(and(eq(feelings.relationshipId, relationshipId), or(eq(feelings.authorId, ctx.user.id), eq(feelings.visibility, "partner")))),
      db.select({ id: rituals.id }).from(rituals).where(and(eq(rituals.relationshipId, relationshipId), eq(rituals.active, true))),
    ]);
    const moodCounts = feelingRows.reduce<Record<string, number>>((counts, row) => { counts[row.mood] = (counts[row.mood] ?? 0) + 1; return counts; }, {});
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { moments: momentRows.length, albums: albumRows.length, milestones: milestoneRows.length, favorites: favoriteRows.length, activeRituals: ritualRows.length, topMood, firstMemoryAt: momentRows.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())[0]?.occurredAt ?? null };
  }),

  search: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(80) })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const current = await requireMembership(db, ctx.user.id);
    const pattern = `%${input.query}%`;
    const [momentRows, albumRows, milestoneRows] = await Promise.all([
      db.select({ moment: moments, authorName: users.name }).from(moments).innerJoin(users, eq(moments.createdById, users.id)).where(and(eq(moments.relationshipId, current.relationship.id), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)), or(like(moments.caption, pattern), like(moments.quote, pattern), like(moments.songTitle, pattern), like(moments.songArtist, pattern)))).orderBy(desc(moments.occurredAt)).limit(50),
      db.select().from(galleryAlbums).where(and(eq(galleryAlbums.relationshipId, current.relationship.id), like(galleryAlbums.name, pattern))).limit(30),
      db.select().from(galleryAlbumMilestones).where(and(eq(galleryAlbumMilestones.relationshipId, current.relationship.id), like(galleryAlbumMilestones.title, pattern))).limit(50),
    ]);
    return { moments: momentRows, albums: albumRows, milestones: milestoneRows };
  }),

  consent: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await requireMembership(db, ctx.user.id);
    const relationshipId = current.relationship.id;
    const [momentRows, voiceRows, promptRows, members] = await Promise.all([
      db.select({ visibility: moments.visibility }).from(moments).where(and(eq(moments.relationshipId, relationshipId), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))),
      db.select({ visibility: voiceMemories.visibility }).from(voiceMemories).where(and(eq(voiceMemories.relationshipId, relationshipId), or(eq(voiceMemories.visibility, "pair"), eq(voiceMemories.createdById, ctx.user.id)))),
      db.select({ visibility: promptResponses.visibility }).from(promptResponses).where(and(eq(promptResponses.relationshipId, relationshipId), or(eq(promptResponses.visibility, "pair"), eq(promptResponses.createdById, ctx.user.id)))),
      db.select({ userId: relationshipMembers.userId, role: relationshipMembers.role }).from(relationshipMembers).where(eq(relationshipMembers.relationshipId, relationshipId)),
    ]);
    return { members: members.length, moments: { shared: momentRows.filter((row) => row.visibility === "pair").length, private: momentRows.filter((row) => row.visibility === "private").length }, voice: { shared: voiceRows.filter((row) => row.visibility === "pair").length, private: voiceRows.filter((row) => row.visibility === "private").length }, prompts: { shared: promptRows.filter((row) => row.visibility === "pair").length, private: promptRows.filter((row) => row.visibility === "private").length } };
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
    const [memoryRows, feelingRows, wellnessRows, bucketRows, timelineRows, countdownRows, voiceRows, albumRows, albumMilestoneRows] = await Promise.all([
      db.select().from(moments).where(and(eq(moments.relationshipId, relationshipId), or(eq(moments.visibility, "pair"), eq(moments.createdById, ctx.user.id)))),
      db.select().from(feelings).where(and(eq(feelings.relationshipId, relationshipId), or(eq(feelings.authorId, ctx.user.id), eq(feelings.visibility, "partner")))),
      db.select().from(wellnessEntries).where(and(eq(wellnessEntries.relationshipId, relationshipId), or(eq(wellnessEntries.ownerId, ctx.user.id), eq(wellnessEntries.shareWithPartner, true)))),
      db.select().from(bucketItems).where(eq(bucketItems.relationshipId, relationshipId)),
      db.select().from(timelineEvents).where(eq(timelineEvents.relationshipId, relationshipId)),
      db.select().from(countdowns).where(eq(countdowns.relationshipId, relationshipId)),
      db.select().from(voiceMemories).where(and(eq(voiceMemories.relationshipId, relationshipId), or(eq(voiceMemories.visibility, "pair"), eq(voiceMemories.createdById, ctx.user.id)))),
      db.select().from(galleryAlbums).where(eq(galleryAlbums.relationshipId, relationshipId)),
      db.select().from(galleryAlbumMilestones).where(eq(galleryAlbumMilestones.relationshipId, relationshipId)),
    ]);
    return { exportedAt: new Date(), relationship: current.relationship, moments: memoryRows, feelings: feelingRows, wellness: wellnessRows, bucket: bucketRows, timeline: timelineRows, countdowns: countdownRows, voice: voiceRows, albums: albumRows, albumMilestones: albumMilestoneRows };
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
