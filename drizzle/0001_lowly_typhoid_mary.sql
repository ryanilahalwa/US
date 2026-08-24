CREATE TABLE `feelingResponses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feelingId` int NOT NULL,
	`authorId` int NOT NULL,
	`message` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feelingResponses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feelings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`authorId` int NOT NULL,
	`mood` varchar(32) NOT NULL,
	`note` varchar(800) NOT NULL,
	`visibility` enum('partner','private') NOT NULL DEFAULT 'partner',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feelings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`userId` int NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`accuracyMeters` int,
	`sharingEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `location_owner_unique` UNIQUE(`relationshipId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `moments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`mediaType` enum('photo','video') NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mediaUrl` varchar(1024) NOT NULL,
	`caption` varchar(500),
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `moments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`userId` int NOT NULL,
	`memoriesEnabled` boolean NOT NULL DEFAULT true,
	`feelingsEnabled` boolean NOT NULL DEFAULT true,
	`wellnessEnabled` boolean NOT NULL DEFAULT false,
	`remindersEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_pair_user_unique` UNIQUE(`relationshipId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`recipientId` int NOT NULL,
	`type` enum('partner','moment','feeling','wellness','reminder') NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` varchar(500) NOT NULL,
	`targetPath` varchar(200),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relationshipInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedById` int,
	`acceptedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationshipInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `relationshipInvites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `relationshipMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','partner') NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationshipMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `relationship_member_unique` UNIQUE(`relationshipId`,`userId`),
	CONSTRAINT `user_one_relationship_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`displayName` varchar(80) NOT NULL DEFAULT 'Our Orbit',
	`startDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wellnessEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`ownerId` int NOT NULL,
	`entryDate` date NOT NULL,
	`entryType` enum('cycle','mood','wellness') NOT NULL,
	`value` varchar(80) NOT NULL,
	`note` varchar(800),
	`shareWithPartner` boolean NOT NULL DEFAULT false,
	`reminderAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wellnessEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `feelingResponses` ADD CONSTRAINT `feelingResponses_feelingId_feelings_id_fk` FOREIGN KEY (`feelingId`) REFERENCES `feelings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feelingResponses` ADD CONSTRAINT `feelingResponses_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feelings` ADD CONSTRAINT `feelings_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feelings` ADD CONSTRAINT `feelings_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moments` ADD CONSTRAINT `moments_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moments` ADD CONSTRAINT `moments_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD CONSTRAINT `notificationPreferences_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD CONSTRAINT `notificationPreferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientId_users_id_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipInvites` ADD CONSTRAINT `relationshipInvites_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipInvites` ADD CONSTRAINT `relationshipInvites_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipInvites` ADD CONSTRAINT `relationshipInvites_acceptedById_users_id_fk` FOREIGN KEY (`acceptedById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipMembers` ADD CONSTRAINT `relationshipMembers_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipMembers` ADD CONSTRAINT `relationshipMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wellnessEntries` ADD CONSTRAINT `wellnessEntries_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wellnessEntries` ADD CONSTRAINT `wellnessEntries_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `feeling_responses_feeling_idx` ON `feelingResponses` (`feelingId`);--> statement-breakpoint
CREATE INDEX `feelings_relationship_created_idx` ON `feelings` (`relationshipId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `locations_relationship_idx` ON `locations` (`relationshipId`);--> statement-breakpoint
CREATE INDEX `moments_relationship_created_idx` ON `moments` (`relationshipId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `relationship_invites_relationship_idx` ON `relationshipInvites` (`relationshipId`);--> statement-breakpoint
CREATE INDEX `relationship_members_relationship_idx` ON `relationshipMembers` (`relationshipId`);--> statement-breakpoint
CREATE INDEX `relationships_owner_idx` ON `relationships` (`ownerId`);--> statement-breakpoint
CREATE INDEX `wellness_owner_date_idx` ON `wellnessEntries` (`ownerId`,`entryDate`);