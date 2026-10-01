-- CreateTable
CREATE TABLE `OperatorLogEntry` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `backdated` BOOLEAN NOT NULL,
    `operator` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `command` TEXT NULL,
    `output` TEXT NULL,
    `tool` VARCHAR(191) NULL,
    `targetAddress` VARCHAR(191) NULL,
    `scopeVerdict` ENUM('IN_SCOPE', 'OUT_OF_SCOPE', 'NOT_LISTED') NULL,
    `correctsSeq` INTEGER NULL,
    `prevDigest` CHAR(64) NOT NULL,
    `entryDigest` CHAR(64) NOT NULL,

    UNIQUE INDEX `OperatorLogEntry_entryDigest_key`(`entryDigest`),
    UNIQUE INDEX `OperatorLogEntry_engagementId_seq_key`(`engagementId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OplogAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `label` VARCHAR(191) NULL,

    INDEX `OplogAttachment_entryId_idx`(`entryId`),
    INDEX `OplogAttachment_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OperatorLogEntry` ADD CONSTRAINT `OperatorLogEntry_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OplogAttachment` ADD CONSTRAINT `OplogAttachment_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `OperatorLogEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

