-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `filename` VARCHAR(191) NULL,
    `executiveSummary` TEXT NULL,
    `methodology` TEXT NULL,
    `toolsAndTechniques` TEXT NULL,
    `conclusion` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Section` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `type` ENUM('FINDING', 'CONNECTIVITY', 'CUSTOM') NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `reportFindingId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportFinding` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `recommendation` TEXT NOT NULL,
    `impact` TEXT NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `reference` VARCHAR(191) NULL,
    `tags` JSON NOT NULL,
    `affectedSystems` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FindingImage` (
    `id` VARCHAR(191) NOT NULL,
    `reportFindingId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `caption` TEXT NOT NULL,
    `imageData` LONGTEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DefaultReportTemplate` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'singleton',
    `executiveSummary` TEXT NOT NULL,
    `methodology` TEXT NOT NULL,
    `toolsAndTechniques` TEXT NOT NULL,
    `conclusion` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RulesOfEngagement` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL DEFAULT '1.0',
    `status` ENUM('DRAFT', 'APPROVED', 'ACTIVE', 'EXPIRED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `authorizedBy` VARCHAR(191) NULL,
    `authorizedTitle` VARCHAR(191) NULL,
    `authorizedDate` DATETIME(3) NULL,
    `classification` VARCHAR(191) NULL DEFAULT 'CONFIDENTIAL',
    `filename` VARCHAR(191) NULL,
    `testingWindow` JSON NULL,
    `emergencyContact` JSON NULL,

    INDEX `RulesOfEngagement_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoeSection` (
    `id` VARCHAR(191) NOT NULL,
    `roeId` VARCHAR(191) NOT NULL,
    `type` ENUM('AUTHORIZATION', 'SCOPE', 'TESTING_WINDOW', 'METHODOLOGY', 'RESTRICTIONS', 'COMMUNICATION', 'EMERGENCY', 'LEGAL', 'CUSTOM') NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RoeSection_roeId_position_idx`(`roeId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoeTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sections` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RoeTemplate_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoeSectionTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `sectionType` ENUM('AUTHORIZATION', 'SCOPE', 'TESTING_WINDOW', 'METHODOLOGY', 'RESTRICTIONS', 'COMMUNICATION', 'EMERGENCY', 'LEGAL', 'CUSTOM') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RoeSectionTemplate_sectionType_key`(`sectionType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_reportFindingId_fkey` FOREIGN KEY (`reportFindingId`) REFERENCES `ReportFinding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportFinding` ADD CONSTRAINT `ReportFinding_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FindingImage` ADD CONSTRAINT `FindingImage_reportFindingId_fkey` FOREIGN KEY (`reportFindingId`) REFERENCES `ReportFinding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoeSection` ADD CONSTRAINT `RoeSection_roeId_fkey` FOREIGN KEY (`roeId`) REFERENCES `RulesOfEngagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

