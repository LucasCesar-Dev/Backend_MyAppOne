/*
  Warnings:

  - You are about to alter the column `valor` on the `Compras` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `valor` on the `Vendas` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- AlterTable
ALTER TABLE `Compras` MODIFY `valor` DOUBLE NOT NULL;

-- AlterTable
ALTER TABLE `Vendas` MODIFY `valor` DOUBLE NOT NULL;
