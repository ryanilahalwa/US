import { boolean, date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const relationships = mysqlTable("relationships", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id),
  displayName: varchar("displayName", { length: 80 }).notNull().default("Our Orbit"),
  startDate: timestamp("startDate").notNull(),
  coverMomentId: int("coverMomentId"),
  coverRotationMode: mysqlEnum("coverRotationMode", ["manual", "weekly", "monthly", "anniversary"]).notNull().default("manual"),
  coverRotationEnabled: boolean("coverRotationEnabled").notNull().default(false),
  coverRotatedAt: timestamp("coverRotatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("relationships_owner_idx").on(table.ownerId)]);

export const relationshipMembers = mysqlTable("relationshipMembers", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["owner", "partner"]).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("relationship_member_unique").on(table.relationshipId, table.userId),
  uniqueIndex("relationship_member_role_unique").on(table.relationshipId, table.role),
  uniqueIndex("user_one_relationship_unique").on(table.userId),
  index("relationship_members_relationship_idx").on(table.relationshipId),
]);

export const relationshipInvites = mysqlTable("relationshipInvites", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedById: int("acceptedById").references(() => users.id),
  acceptedAt: timestamp("acceptedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("relationship_invites_relationship_idx").on(table.relationshipId)]);

export const moments = mysqlTable("moments", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  mediaType: mysqlEnum("mediaType", ["photo", "video"]).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mediaUrl: varchar("mediaUrl", { length: 1024 }).notNull(),
  caption: varchar("caption", { length: 500 }),
  visibility: mysqlEnum("visibility", ["pair", "private"]).notNull().default("pair"),
  favorite: boolean("favorite").notNull().default(false),
  fileSizeBytes: int("fileSizeBytes"),
  occurredAt: timestamp("occurredAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("moments_relationship_created_idx").on(table.relationshipId, table.createdAt)]);

export const feelings = mysqlTable("feelings", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  authorId: int("authorId").notNull().references(() => users.id),
  mood: varchar("mood", { length: 32 }).notNull(),
  note: varchar("note", { length: 800 }).notNull(),
  visibility: mysqlEnum("visibility", ["partner", "private"]).notNull().default("partner"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("feelings_relationship_created_idx").on(table.relationshipId, table.createdAt)]);

export const feelingResponses = mysqlTable("feelingResponses", {
  id: int("id").autoincrement().primaryKey(),
  feelingId: int("feelingId").notNull().references(() => feelings.id),
  authorId: int("authorId").notNull().references(() => users.id),
  message: varchar("message", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("feeling_responses_feeling_idx").on(table.feelingId)]);

export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  userId: int("userId").notNull().references(() => users.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  accuracyMeters: int("accuracyMeters"),
  sharingEnabled: boolean("sharingEnabled").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("location_owner_unique").on(table.relationshipId, table.userId),
  index("locations_relationship_idx").on(table.relationshipId),
]);

export const wellnessEntries = mysqlTable("wellnessEntries", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  ownerId: int("ownerId").notNull().references(() => users.id),
  entryDate: date("entryDate").notNull(),
  periodEndDate: date("periodEndDate"),
  cycleLength: int("cycleLength"),
  entryType: mysqlEnum("entryType", ["cycle", "mood", "wellness"]).notNull(),
  value: varchar("value", { length: 80 }).notNull(),
  note: varchar("note", { length: 800 }),
  shareWithPartner: boolean("shareWithPartner").notNull().default(false),
  reminderAt: timestamp("reminderAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("wellness_owner_date_idx").on(table.ownerId, table.entryDate)]);

export const momentReactions = mysqlTable("momentReactions", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  momentId: int("momentId").notNull().references(() => moments.id),
  userId: int("userId").notNull().references(() => users.id),
  kind: mysqlEnum("kind", ["heart", "smile", "remember"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("moment_reaction_unique").on(table.momentId, table.userId, table.kind), index("moment_reactions_moment_idx").on(table.momentId)]);

export const bucketItems = mysqlTable("bucketItems", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  note: varchar("note", { length: 500 }),
  category: varchar("category", { length: 40 }).notNull().default("together"),
  targetDate: date("targetDate"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("bucket_items_relationship_idx").on(table.relationshipId, table.completedAt)]);

export const timelineEvents = mysqlTable("timelineEvents", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  note: varchar("note", { length: 800 }),
  eventDate: timestamp("eventDate").notNull(),
  momentId: int("momentId").references(() => moments.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("timeline_events_relationship_date_idx").on(table.relationshipId, table.eventDate)]);

export const countdowns = mysqlTable("countdowns", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  title: varchar("title", { length: 120 }).notNull(),
  note: varchar("note", { length: 500 }),
  targetAt: timestamp("targetAt").notNull(),
  reminderEnabled: boolean("reminderEnabled").notNull().default(false),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("countdowns_relationship_target_idx").on(table.relationshipId, table.targetAt)]);

export const voiceMemories = mysqlTable("voiceMemories", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  createdById: int("createdById").notNull().references(() => users.id),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mediaUrl: varchar("mediaUrl", { length: 1024 }).notNull(),
  caption: varchar("caption", { length: 500 }),
  transcript: text("transcript"),
  visibility: mysqlEnum("visibility", ["pair", "private"]).notNull().default("pair"),
  occurredAt: timestamp("occurredAt").notNull(),
  durationSeconds: int("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("voice_memories_relationship_created_idx").on(table.relationshipId, table.createdAt)]);

export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  userId: int("userId").notNull().references(() => users.id),
  memoriesEnabled: boolean("memoriesEnabled").notNull().default(true),
  feelingsEnabled: boolean("feelingsEnabled").notNull().default(true),
  wellnessEnabled: boolean("wellnessEnabled").notNull().default(false),
  remindersEnabled: boolean("remindersEnabled").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("notification_preferences_pair_user_unique").on(table.relationshipId, table.userId)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull().references(() => relationships.id),
  recipientId: int("recipientId").notNull().references(() => users.id),
  type: mysqlEnum("type", ["partner", "moment", "feeling", "wellness", "reminder"]).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  targetPath: varchar("targetPath", { length: 200 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("notifications_recipient_created_idx").on(table.recipientId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
