-- CreateTable
CREATE TABLE `Indicator` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `type` ENUM('IP', 'DOMAIN', 'URL', 'EMAIL', 'HASH_MD5', 'HASH_SHA1', 'HASH_SHA256', 'FILE_NAME', 'ACCOUNT', 'OTHER') NOT NULL,
    `value` VARCHAR(512) NOT NULL,
    `description` TEXT NULL,
    `firstSeen` DATETIME(3) NULL,
    `lastSeen` DATETIME(3) NULL,
    `confidence` ENUM('CONFIRMED', 'LIKELY', 'POSSIBLE') NOT NULL DEFAULT 'LIKELY',
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Indicator_engagementId_type_value_key`(`engagementId`, `type`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Indicator` ADD CONSTRAINT `Indicator_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

