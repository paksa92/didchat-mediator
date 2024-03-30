/*
  Warnings:

  - Added the required column `displayPicture` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "coverPicture" VARCHAR(255),
ADD COLUMN     "displayPicture" VARCHAR(255) NOT NULL;
