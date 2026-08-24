CREATE TABLE `bucketItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`note` varchar(500),
	`category` varchar(40) NOT NULL DEFAULT 'together',
	`targetDate` date,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bucketItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `countdowns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`note` varchar(500),
	`targetAt` timestamp NOT NULL,
	`reminderEnabled` boolean NOT NULL DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `countdowns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `momentReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`momentId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('heart','smile','remember') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `momentReactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `moment_reaction_unique` UNIQUE(`momentId`,`userId`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `timelineEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`note` varchar(800),
	`eventDate` timestamp NOT NULL,
	`momentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timelineEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voiceMemories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mediaUrl` varchar(1024) NOT NULL,
	`caption` varchar(500),
	`transcript` text,
	`visibility` enum('pair','private') NOT NULL DEFAULT 'pair',
	`occurredAt` timestamp NOT NULL,
	`durationSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voiceMemories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `moments` ADD `visibility` enum('pair','private') DEFAULT 'pair' NOT NULL;--> statement-breakpoint
ALTER TABLE `moments` ADD `favorite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `moments` ADD `fileSizeBytes` int;--> statement-breakpoint
ALTER TABLE `relationships` ADD `coverRotationMode` enum('manual','weekly','monthly','anniversary') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `relationships` ADD `coverRotationEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `relationships` ADD `coverRotatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `bucketItems` ADD CONSTRAINT `bucketItems_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bucketItems` ADD CONSTRAINT `bucketItems_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `countdowns` ADD CONSTRAINT `countdowns_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `countdowns` ADD CONSTRAINT `countdowns_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReactions` ADD CONSTRAINT `momentReactions_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReactions` ADD CONSTRAINT `momentReactions_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReactions` ADD CONSTRAINT `momentReactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timelineEvents` ADD CONSTRAINT `timelineEvents_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timelineEvents` ADD CONSTRAINT `timelineEvents_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timelineEvents` ADD CONSTRAINT `timelineEvents_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `voiceMemories` ADD CONSTRAINT `voiceMemories_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `voiceMemories` ADD CONSTRAINT `voiceMemories_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `bucket_items_relationship_idx` ON `bucketItems` (`relationshipId`,`completedAt`);--> statement-breakpoint
CREATE INDEX `countdowns_relationship_target_idx` ON `countdowns` (`relationshipId`,`targetAt`);--> statement-breakpoint
CREATE INDEX `moment_reactions_moment_idx` ON `momentReactions` (`momentId`);--> statement-breakpoint
CREATE INDEX `timeline_events_relationship_date_idx` ON `timelineEvents` (`relationshipId`,`eventDate`);--> statement-breakpoint
CREATE INDEX `voice_memories_relationship_created_idx` ON `voiceMemories` (`relationshipId`,`createdAt`);