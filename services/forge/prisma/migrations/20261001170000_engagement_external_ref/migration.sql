-- AlterTable
ALTER TABLE `Engagement` ADD COLUMN `externalRef` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Engagement_externalRef_key` ON `Engagement`(`externalRef`);

