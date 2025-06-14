/*
  Warnings:

  - Added the required column `date` to the `HoraAlteracao` table without a default value. This is not possible if the table is not empty.
  - Added the required column `day` to the `HoraAlteracao` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `HoraAlteracao` ADD COLUMN `date` DATETIME(3) NOT NULL,
    ADD COLUMN `day` DOUBLE NOT NULL;
