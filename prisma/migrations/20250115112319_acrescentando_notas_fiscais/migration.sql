-- CreateTable
CREATE TABLE `Compras` (
    `id` VARCHAR(191) NOT NULL,
    `cnpjTiny` VARCHAR(191) NOT NULL,
    `idIntegracao` VARCHAR(191) NOT NULL,
    `idNota` VARCHAR(191) NOT NULL,
    `numeroNota` VARCHAR(191) NOT NULL,
    `dataEmissao` DATETIME(3) NOT NULL,
    `dataEntrada` DATETIME(3) NOT NULL,
    `natureza` VARCHAR(191) NOT NULL,
    `fornecedorId` INTEGER NOT NULL,

    UNIQUE INDEX `Compras_idNota_key`(`idNota`),
    INDEX `Compras_fornecedorId_idx`(`fornecedorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fornecedores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `cpfCnpj` VARCHAR(191) NOT NULL,
    `idTiny` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdutosOnCompras` (
    `produtoId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `compraId` VARCHAR(191) NOT NULL,
    `valor` DOUBLE NOT NULL,
    `valorTotal` DOUBLE NOT NULL,

    PRIMARY KEY (`compraId`, `produtoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Compras` ADD CONSTRAINT `Compras_fornecedorId_fkey` FOREIGN KEY (`fornecedorId`) REFERENCES `Fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutosOnCompras` ADD CONSTRAINT `ProdutosOnCompras_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutosOnCompras` ADD CONSTRAINT `ProdutosOnCompras_compraId_fkey` FOREIGN KEY (`compraId`) REFERENCES `Compras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
