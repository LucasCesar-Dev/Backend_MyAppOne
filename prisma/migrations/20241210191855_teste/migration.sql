/*
  Warnings:

  - A unique constraint covering the columns `[produtoId]` on the table `roboRegraMarca` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `roboRegraMarca_produtoId_key` ON `roboRegraMarca`(`produtoId`);
