/*
  Warnings:

  - You are about to drop the `HoraAlteracao` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RegraMarca` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `HoraAlteracao` DROP FOREIGN KEY `HoraAlteracao_regraId_fkey`;

-- DropForeignKey
ALTER TABLE `RegraMarca` DROP FOREIGN KEY `RegraMarca_produtoId_fkey`;

-- DropTable
DROP TABLE `HoraAlteracao`;

-- DropTable
DROP TABLE `RegraMarca`;
