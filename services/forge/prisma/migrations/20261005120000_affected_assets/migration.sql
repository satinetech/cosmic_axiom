-- CreateTable
CREATE TABLE `AffectedAsset` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `kind` ENUM('HOST', 'ACCOUNT', 'MAILBOX', 'APPLICATION', 'CLOUD_RESOURCE', 'NETWORK', 'OTHER') NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('CONFIRMED_COMPROMISED', 'SUSPECTED', 'CONTAINED', 'REMEDIATED', 'NOT_AFFECTED') NOT NULL DEFAULT 'SUSPECTED',
    `firstCompromisedAt` DATETIME(3) NULL,
    `containedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AffectedAsset_engagementId_kind_identifier_key`(`engagementId`, `kind`, `identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AffectedAsset` ADD CONSTRAINT `AffectedAsset_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

