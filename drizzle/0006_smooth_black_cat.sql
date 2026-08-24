CREATE TABLE `galleryAlbumMilestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`albumId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`note` varchar(800),
	`milestoneDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `galleryAlbumMilestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `galleryAlbums` (
	`id` int AUTO_INCREMENT NOT NULL,
	`relationshipId` int NOT NULL,
	`createdById` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `galleryAlbums_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `moments` ADD `quote` varchar(280);--> statement-breakpoint
ALTER TABLE `moments` ADD `albumId` int;--> statement-breakpoint
ALTER TABLE `relationships` ADD `featuredMomentId` int;--> statement-breakpoint
ALTER TABLE `relationships` ADD `featuredRotationMode` enum('manual','weekly','monthly','anniversary') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `relationships` ADD `featuredRotationEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `relationships` ADD `featuredRotatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `galleryAlbumMilestones` ADD CONSTRAINT `galleryAlbumMilestones_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `galleryAlbumMilestones` ADD CONSTRAINT `galleryAlbumMilestones_albumId_galleryAlbums_id_fk` FOREIGN KEY (`albumId`) REFERENCES `galleryAlbums`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `galleryAlbumMilestones` ADD CONSTRAINT `galleryAlbumMilestones_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `galleryAlbums` ADD CONSTRAINT `galleryAlbums_relationshipId_relationships_id_fk` FOREIGN KEY (`relationshipId`) REFERENCES `relationships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `galleryAlbums` ADD CONSTRAINT `galleryAlbums_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `gallery_album_milestones_album_idx` ON `galleryAlbumMilestones` (`albumId`,`milestoneDate`);--> statement-breakpoint
CREATE INDEX `gallery_albums_relationship_idx` ON `galleryAlbums` (`relationshipId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `moments` ADD CONSTRAINT `moments_albumId_galleryAlbums_id_fk` FOREIGN KEY (`albumId`) REFERENCES `galleryAlbums`(`id`) ON DELETE no action ON UPDATE no action;