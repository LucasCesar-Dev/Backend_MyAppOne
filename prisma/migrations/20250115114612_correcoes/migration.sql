/*
  Warnings:

  - You are about to alter the column `idNota` on the `Compras` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Double`.

*/
-- AlterTable
ALTER TABLE `Compras` MODIFY `idNota` DOUBLE NOT NULL;
