CREATE TABLE `relationshipPlaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`address` varchar(500),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`visitedAt` timestamp,
	`note` varchar(800),
	`momentId` int,
	`visibility` enum('pair','private') NOT NULL DEFAULT 'pair',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationshipPlaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `surpriseDrops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`recipientId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`message` varchar(2000) NOT NULL,
	`quote` varchar(280),
	`revealAt` timestamp NOT NULL,
	`openedAt` timestamp,
	`momentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `surpriseDrops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `relationshipPlaces` ADD CONSTRAINT `relationshipPlaces_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipPlaces` ADD CONSTRAINT `relationshipPlaces_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationshipPlaces` ADD CONSTRAINT `relationshipPlaces_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `surpriseDrops` ADD CONSTRAINT `surpriseDrops_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `surpriseDrops` ADD CONSTRAINT `surpriseDrops_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `surpriseDrops` ADD CONSTRAINT `surpriseDrops_recipientId_users_id_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `surpriseDrops` ADD CONSTRAINT `surpriseDrops_momentId_moments_id_fk` FOREIGN KEY (`momentId`) REFERENCES `moments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `relationship_places_relationship_created_idx` ON `relationshipPlaces` (`relationshipId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `surprise_drops_recipient_reveal_idx` ON `surpriseDrops` (`recipientId`,`revealAt`);--> statement-breakpoint
CREATE INDEX `surprise_drops_relationship_idx` ON `surpriseDrops` (`relationshipId`,`createdAt`);