CREATE TABLE `memoryCapsules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`message` varchar(2000) NOT NULL,
	`quote` varchar(280),
	`revealAt` timestamp NOT NULL,
	`momentId` int,
	`albumId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memoryCapsules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `momentComparisons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`olderMomentId` int NOT NULL,
	`newerMomentId` int NOT NULL,
	`createdById` int NOT NULL,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `momentComparisons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `momentReplies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`momentId` int NOT NULL,
	`createdById` int NOT NULL,
	`body` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `momentReplies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promptResponses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`prompt` varchar(280) NOT NULL,
	`response` varchar(1200) NOT NULL,
	`visibility` enum('pair','private') NOT NULL DEFAULT 'pair',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promptResponses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rituals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`cadence` enum('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
	`note` varchar(500),
	`nextDueAt` timestamp NOT NULL,
	`lastCompletedAt` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rituals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `traditions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`detail` varchar(800),
	`season` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `traditions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `galleryAlbums` ADD `coverMomentId` int;--> statement-breakpoint
ALTER TABLE `galleryAlbums` ADD `startedAt` timestamp;--> statement-breakpoint
ALTER TABLE `galleryAlbums` ADD `endedAt` timestamp;--> statement-breakpoint
ALTER TABLE `moments` ADD `songTitle` varchar(160);--> statement-breakpoint
ALTER TABLE `moments` ADD `songArtist` varchar(160);--> statement-breakpoint
ALTER TABLE `moments` ADD `songUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `memoryCapsules` ADD CONSTRAINT `memoryCapsules_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memoryCapsules` ADD CONSTRAINT `memoryCapsules_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memoryCapsules` ADD CONSTRAINT `memoryCapsules_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memoryCapsules` ADD CONSTRAINT `memoryCapsules_albumId_galleryAlbums_id_fk` FOREIGN KEY (`albumId`) REFERENCES `galleryAlbums`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentComparisons` ADD CONSTRAINT `momentComparisons_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentComparisons` ADD CONSTRAINT `momentComparisons_olderMomentId_moments_id_fk` FOREIGN KEY (`olderMomentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentComparisons` ADD CONSTRAINT `momentComparisons_newerMomentId_moments_id_fk` FOREIGN KEY (`newerMomentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentComparisons` ADD CONSTRAINT `momentComparisons_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReplies` ADD CONSTRAINT `momentReplies_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReplies` ADD CONSTRAINT `momentReplies_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `momentReplies` ADD CONSTRAINT `momentReplies_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `promptResponses` ADD CONSTRAINT `promptResponses_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `promptResponses` ADD CONSTRAINT `promptResponses_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rituals` ADD CONSTRAINT `rituals_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rituals` ADD CONSTRAINT `rituals_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `traditions` ADD CONSTRAINT `traditions_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `traditions` ADD CONSTRAINT `traditions_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `memory_capsules_relationship_reveal_idx` ON `memoryCapsules` (`relationshipId`,`revealAt`);--> statement-breakpoint
CREATE INDEX `moment_comparisons_relationship_idx` ON `momentComparisons` (`relationshipId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `moment_replies_moment_created_idx` ON `momentReplies` (`momentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `prompt_responses_relationship_created_idx` ON `promptResponses` (`relationshipId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `rituals_relationship_due_idx` ON `rituals` (`relationshipId`,`nextDueAt`);--> statement-breakpoint
CREATE INDEX `traditions_relationship_created_idx` ON `traditions` (`relationshipId`,`createdAt`);