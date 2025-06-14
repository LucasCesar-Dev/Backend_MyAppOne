-- CreateTable
CREATE TABLE `Vendas` (
    `id` VARCHAR(191) NOT NULL,
    `cnpjTiny` VARCHAR(191) NOT NULL,
    `idIntegracao` VARCHAR(191) NOT NULL,
    `idNota` DOUBLE NOT NULL,
    `numeroNota` VARCHAR(191) NOT NULL,
    `dataEmissao` DATETIME(3) NOT NULL,
    `dataInclusao` DATETIME(3) NOT NULL,
    `valor` DOUBLE NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `ecommerceId` INTEGER NOT NULL,
    `ecommerceNome` VARCHAR(191) NOT NULL,
    `numeroPedidoEcommerce` VARCHAR(191) NOT NULL,
    `temProdutosNovos` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vendas_idNota_key`(`idNota`),
    INDEX `Vendas_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `cpfCnpj` VARCHAR(191) NOT NULL,
    `idTiny` INTEGER NOT NULL,
    `endereco` VARCHAR(191) NOT NULL,
    `numero` VARCHAR(191) NOT NULL,
    `complemento` VARCHAR(191) NOT NULL,
    `bairro` VARCHAR(191) NOT NULL,
    `municipio` VARCHAR(191) NOT NULL,
    `cep` VARCHAR(191) NOT NULL,
    `uf` VARCHAR(191) NOT NULL,
    `pais` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Clientes_cpfCnpj_key`(`cpfCnpj`),
    UNIQUE INDEX `Clientes_idTiny_key`(`idTiny`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdutosOnVendas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produtoId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `vendaId` VARCHAR(191) NOT NULL,
    `valor` DOUBLE NOT NULL,
    `valorTotal` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProdutosEstranhos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idTiny` INTEGER NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `unidade` VARCHAR(191) NOT NULL,
    `quantidade` DOUBLE NOT NULL,
    `valorUnitario` DOUBLE NOT NULL,
    `valorTotal` DOUBLE NOT NULL,
    `vendaId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Vendas` ADD CONSTRAINT `Vendas_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutosOnVendas` ADD CONSTRAINT `ProdutosOnVendas_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutosOnVendas` ADD CONSTRAINT `ProdutosOnVendas_vendaId_fkey` FOREIGN KEY (`vendaId`) REFERENCES `Vendas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProdutosEstranhos` ADD CONSTRAINT `ProdutosEstranhos_vendaId_fkey` FOREIGN KEY (`vendaId`) REFERENCES `Vendas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
