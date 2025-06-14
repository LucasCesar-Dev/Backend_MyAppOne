-- CreateTable
CREATE TABLE `RegraMarca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produtoId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HoraAlteracao` (
    `action` VARCHAR(191) NOT NULL,
    `regraId` INTEGER NOT NULL,

    PRIMARY KEY (`regraId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RegraMarca` ADD CONSTRAINT `RegraMarca_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HoraAlteracao` ADD CONSTRAINT `HoraAlteracao_regraId_fkey` FOREIGN KEY (`regraId`) REFERENCES `RegraMarca`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
