-- CreateTable
CREATE TABLE `TimelineEvent` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `confidence` ENUM('CONFIRMED', 'LIKELY', 'POSSIBLE') NOT NULL DEFAULT 'LIKELY',
    `tactic` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TimelineEvent_engagementId_occurredAt_idx`(`engagementId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TimelineEvent` ADD CONSTRAINT `TimelineEvent_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

