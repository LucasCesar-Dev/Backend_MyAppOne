/*
  Warnings:

  - Added the required column `valor` to the `Compras` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Compras` ADD COLUMN `valor` INTEGER NOT NULL;
