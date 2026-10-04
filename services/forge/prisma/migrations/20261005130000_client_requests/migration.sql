-- CreateTable
CREATE TABLE `ClientRequest` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `request` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `requestedOf` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'RECEIVED', 'DECLINED', 'NOT_NEEDED') NOT NULL DEFAULT 'OPEN',
    `resolvedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientRequest` ADD CONSTRAINT `ClientRequest_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

