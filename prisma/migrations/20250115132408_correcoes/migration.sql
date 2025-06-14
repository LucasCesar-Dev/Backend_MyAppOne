/*
  Warnings:

  - You are about to drop the column `natureza` on the `Compras` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[cpfCnpj]` on the table `Fornecedores` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Compras` DROP COLUMN `natureza`;

-- CreateIndex
CREATE UNIQUE INDEX `Fornecedores_cpfCnpj_key` ON `Fornecedores`(`cpfCnpj`);
