-- CreateTable
CREATE TABLE `Evidence` (
    `sha256` CHAR(64) NOT NULL,
    `size` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `redactedFromSha` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`sha256`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FindingEvidence` (
    `id` VARCHAR(191) NOT NULL,
    `reportFindingId` VARCHAR(191) NOT NULL,
    `evidenceSha` CHAR(64) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `caption` TEXT NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `legacyImageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FindingEvidence_legacyImageId_key`(`legacyImageId`),
    INDEX `FindingEvidence_reportFindingId_position_idx`(`reportFindingId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceCustodyEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `evidenceSha` CHAR(64) NOT NULL,
    `action` ENUM('INGESTED', 'VERIFIED', 'ATTACHED', 'DETACHED', 'REDACTED', 'EXPORTED') NOT NULL,
    `observedSha` CHAR(64) NULL,
    `actor` VARCHAR(191) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EvidenceCustodyEvent_evidenceSha_id_idx`(`evidenceSha`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_redactedFromSha_fkey` FOREIGN KEY (`redactedFromSha`) REFERENCES `Evidence`(`sha256`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FindingEvidence` ADD CONSTRAINT `FindingEvidence_reportFindingId_fkey` FOREIGN KEY (`reportFindingId`) REFERENCES `ReportFinding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FindingEvidence` ADD CONSTRAINT `FindingEvidence_evidenceSha_fkey` FOREIGN KEY (`evidenceSha`) REFERENCES `Evidence`(`sha256`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceCustodyEvent` ADD CONSTRAINT `EvidenceCustodyEvent_evidenceSha_fkey` FOREIGN KEY (`evidenceSha`) REFERENCES `Evidence`(`sha256`) ON DELETE RESTRICT ON UPDATE CASCADE;

