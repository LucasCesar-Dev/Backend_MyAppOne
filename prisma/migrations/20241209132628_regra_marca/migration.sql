-- CreateTable
CREATE TABLE `roboRegraMarca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `classico` DOUBLE NOT NULL,
    `premium` DOUBLE NOT NULL,
    `catalogo` DOUBLE NOT NULL,
    `full` DOUBLE NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `roboRegraMarca` ADD CONSTRAINT `roboRegraMarca_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
