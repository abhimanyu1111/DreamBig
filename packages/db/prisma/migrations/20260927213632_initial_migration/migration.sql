/*
  Warnings:

  - The values [Buy,Sell,Split,Merge] on the enum `OrderType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `resoluion` on the `Market` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,marketId,type]` on the table `Position` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `positionType` to the `OrderHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qty` to the `Position` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderType_new" AS ENUM ('BUY', 'SELL', 'SPLIT', 'MERGE');
ALTER TABLE "OrderHistory" ALTER COLUMN "orderType" TYPE "OrderType_new" USING ("orderType"::text::"OrderType_new");
ALTER TYPE "OrderType" RENAME TO "OrderType_old";
ALTER TYPE "OrderType_new" RENAME TO "OrderType";
DROP TYPE "public"."OrderType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Market" DROP COLUMN "resoluion",
ADD COLUMN     "resolution" "PositionType";

-- AlterTable
ALTER TABLE "OrderHistory" ADD COLUMN     "positionType" "PositionType" NOT NULL;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "qty" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_marketId_type_key" ON "Position"("userId", "marketId", "type");
