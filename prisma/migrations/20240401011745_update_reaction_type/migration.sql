/*
  Warnings:

  - The values [BROKEN_HEART,LAUGH,SAD,SHOCKED,QUESTIONING,SUSPICIOUS] on the enum `ReactionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReactionType_new" AS ENUM ('THUMBS_UP', 'HEART', 'LAUGHING', 'ASTONISHED', 'SMILING', 'PENSIVE', 'RAISING_HANDS', 'HEART_EYES', 'CLAPPING', 'THINKING', 'SUNGLASSES', 'CRYING', 'THUMBS_DOWN', 'ANGRY', 'FEARFUL', 'ROFL', 'PLEADING', 'PRAYING', 'CURSING', 'GRINNING');
ALTER TABLE "Reaction" ALTER COLUMN "type" TYPE "ReactionType_new" USING ("type"::text::"ReactionType_new");
ALTER TYPE "ReactionType" RENAME TO "ReactionType_old";
ALTER TYPE "ReactionType_new" RENAME TO "ReactionType";
DROP TYPE "ReactionType_old";
COMMIT;
