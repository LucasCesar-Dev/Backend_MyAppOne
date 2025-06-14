-- CreateTable
CREATE TABLE `Produtos` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `tinyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `photo` VARCHAR(191) NULL,
    `cost` DOUBLE NULL,
    `gtin` VARCHAR(191) NULL,
    `searchform` VARCHAR(191) NULL,
    `confirmform` VARCHAR(191) NULL,
    `ignoreform` VARCHAR(191) NULL,
    `ncm` VARCHAR(191) NULL,
    `brandrule` VARCHAR(191) NULL,
    `brandrulePremium` VARCHAR(191) NULL,
    `group` VARCHAR(191) NULL,
    `fullrule` VARCHAR(191) NULL,
    `weight` DOUBLE NULL,
    `heigth` DOUBLE NULL,
    `width` DOUBLE NULL,
    `length` DOUBLE NULL,
    `catalog_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `pickingId` INTEGER NULL,
    `categoriaId` INTEGER NULL,
    `brandId` INTEGER NULL,

    UNIQUE INDEX `Produtos_sku_key`(`sku`),
    UNIQUE INDEX `Produtos_tinyId_key`(`tinyId`),
    UNIQUE INDEX `Produtos_gtin_key`(`gtin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Combos` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `idTiny` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `photo` VARCHAR(191) NULL,
    `gtin` VARCHAR(191) NULL,
    `catalog_id` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Combos_sku_key`(`sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Kits` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `idTiny` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `photo` VARCHAR(191) NULL,
    `gtin` VARCHAR(191) NULL,
    `catalog_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Kits_sku_key`(`sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pickings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rua` VARCHAR(191) NOT NULL,
    `coluna` VARCHAR(191) NOT NULL,
    `display` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `isLocate` BOOLEAN NOT NULL,
    `limit` INTEGER NOT NULL,
    `endereco` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Pickings_endereco_key`(`endereco`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdutoLogs` (
    `id` VARCHAR(191) NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `type` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `user` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortaPallets` (
    `id` VARCHAR(191) NOT NULL,
    `isUsing` BOOLEAN NOT NULL,
    `rua` VARCHAR(191) NOT NULL,
    `coluna` VARCHAR(191) NOT NULL,
    `andar` VARCHAR(191) NOT NULL,
    `endereco` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produtos_on_kit` (
    `quantity` INTEGER NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,
    `kitId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`kitId`, `produtoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produtos_on_pp` (
    `quantidade` INTEGER NOT NULL,
    `produtoId` VARCHAR(191) NOT NULL,
    `portaPalletId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`produtoId`, `portaPalletId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Categorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `isSpecial` BOOLEAN NOT NULL,

    UNIQUE INDEX `Categorias_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Marcas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Marcas_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Produtos` ADD CONSTRAINT `Produtos_pickingId_fkey` FOREIGN KEY (`pickingId`) REFERENCES `Pickings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Produtos` ADD CONSTRAINT `Produtos_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `Categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Produtos` ADD CONSTRAINT `Produtos_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Marcas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Combos` ADD CONSTRAINT `Combos_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutoLogs` ADD CONSTRAINT `ProdutoLogs_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos_on_kit` ADD CONSTRAINT `produtos_on_kit_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos_on_kit` ADD CONSTRAINT `produtos_on_kit_kitId_fkey` FOREIGN KEY (`kitId`) REFERENCES `Kits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos_on_pp` ADD CONSTRAINT `produtos_on_pp_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos_on_pp` ADD CONSTRAINT `produtos_on_pp_portaPalletId_fkey` FOREIGN KEY (`portaPalletId`) REFERENCES `PortaPallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
