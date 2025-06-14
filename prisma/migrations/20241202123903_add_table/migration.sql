-- CreateTable
CREATE TABLE `HoraAlteracao` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `day` DOUBLE NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,

    INDEX `HoraAlteracao_produtoId_idx`(`produtoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HoraAlteracao` ADD CONSTRAINT `HoraAlteracao_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
