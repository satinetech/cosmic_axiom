-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `customerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Engagement` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PLANNED',
    `type` ENUM('NETWORK_PENTEST', 'WEB_APP_PENTEST', 'MOBILE_APP_PENTEST', 'API_PENTEST', 'CLOUD_SECURITY', 'IOT_PENTEST', 'PHYSICAL_SECURITY', 'SOCIAL_ENGINEERING', 'RED_TEAM', 'PURPLE_TEAM', 'VULNERABILITY_ASSESSMENT', 'COMPLIANCE_AUDIT') NOT NULL DEFAULT 'NETWORK_PENTEST',
    `methodology` ENUM('BLACK_BOX', 'GRAY_BOX', 'WHITE_BOX', 'HYBRID') NOT NULL DEFAULT 'BLACK_BOX',
    `complianceFrameworks` JSON NOT NULL,
    `riskTolerance` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `businessCriticalHours` JSON NULL,
    `criticalSystems` JSON NOT NULL,
    `previousEngagements` JSON NOT NULL,
    `budgetHours` INTEGER NULL,
    `maxConcurrentTesters` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scope` (
    `id` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `inScope` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,
    `environment` ENUM('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'QA', 'DR', 'SANDBOX') NOT NULL DEFAULT 'PRODUCTION',
    `criticality` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `assetType` ENUM('NETWORK', 'WEB_APPLICATION', 'API', 'DATABASE', 'CLOUD_RESOURCE', 'IOT_DEVICE', 'MOBILE_APP', 'INFRASTRUCTURE', 'ENDPOINT') NOT NULL DEFAULT 'NETWORK',
    `techStack` JSON NOT NULL,
    `authBoundary` VARCHAR(191) NULL,
    `dataClassification` ENUM('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET') NOT NULL DEFAULT 'INTERNAL',
    `geoRestrictions` JSON NULL,
    `thirdPartyDeps` JSON NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestingParameters` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `automatedScanningAllowed` BOOLEAN NOT NULL DEFAULT true,
    `manualTestingAllowed` BOOLEAN NOT NULL DEFAULT true,
    `maxRequestsPerSecond` INTEGER NULL,
    `maxConcurrentConnections` INTEGER NULL,
    `loadTestingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `stressTestingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `socialEngineeringAllowed` BOOLEAN NOT NULL DEFAULT false,
    `phishingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `vishingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `physicalTestingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `bruteForceAllowed` BOOLEAN NOT NULL DEFAULT false,
    `passwordSprayingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `credentialStuffingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `defaultCredsTestingAllowed` BOOLEAN NOT NULL DEFAULT true,
    `dataExfiltrationAllowed` BOOLEAN NOT NULL DEFAULT false,
    `maxDataExfilSize` VARCHAR(191) NULL,
    `screenshotAllowed` BOOLEAN NOT NULL DEFAULT true,
    `dosTestingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `disruptiveTestingAllowed` BOOLEAN NOT NULL DEFAULT false,
    `customRestrictions` JSON NOT NULL,
    `testingWindowEnabled` BOOLEAN NOT NULL DEFAULT false,
    `allowedDays` JSON NOT NULL,
    `testingStartTime` VARCHAR(191) NULL,
    `testingEndTime` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'EST',
    `disruptiveTestingWindow` JSON NOT NULL,
    `emergencyContactRequired` BOOLEAN NOT NULL DEFAULT false,
    `blackoutDates` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TestingParameters_engagementId_key`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Engagement` ADD CONSTRAINT `Engagement_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scope` ADD CONSTRAINT `Scope_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestingParameters` ADD CONSTRAINT `TestingParameters_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

