/*
  Warnings:

  - You are about to drop the `Clientes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProdutosEstranhos` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProdutosOnVendas` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vendas` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `ProdutosEstranhos` DROP FOREIGN KEY `ProdutosEstranhos_vendaId_fkey`;

-- DropForeignKey
ALTER TABLE `ProdutosOnVendas` DROP FOREIGN KEY `ProdutosOnVendas_produtoId_fkey`;

-- DropForeignKey
ALTER TABLE `ProdutosOnVendas` DROP FOREIGN KEY `ProdutosOnVendas_vendaId_fkey`;

-- DropForeignKey
ALTER TABLE `Vendas` DROP FOREIGN KEY `Vendas_clienteId_fkey`;

-- DropTable
DROP TABLE `Clientes`;

-- DropTable
DROP TABLE `ProdutosEstranhos`;

-- DropTable
DROP TABLE `ProdutosOnVendas`;

-- DropTable
DROP TABLE `Vendas`;
