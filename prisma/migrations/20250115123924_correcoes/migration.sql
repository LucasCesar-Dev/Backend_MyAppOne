/*
  Warnings:

  - A unique constraint covering the columns `[idTiny]` on the table `Fornecedores` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Compras` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Compras` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Fornecedores_idTiny_key` ON `Fornecedores`(`idTiny`);
