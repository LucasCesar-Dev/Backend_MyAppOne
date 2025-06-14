/*
  Warnings:

  - You are about to drop the `Compras` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Fornecedores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProdutosOnCompras` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Compras` DROP FOREIGN KEY `Compras_fornecedorId_fkey`;

-- DropForeignKey
ALTER TABLE `ProdutosOnCompras` DROP FOREIGN KEY `ProdutosOnCompras_compraId_fkey`;

-- DropForeignKey
ALTER TABLE `ProdutosOnCompras` DROP FOREIGN KEY `ProdutosOnCompras_produtoId_fkey`;

-- DropTable
DROP TABLE `Compras`;

-- DropTable
DROP TABLE `Fornecedores`;

-- DropTable
DROP TABLE `ProdutosOnCompras`;
