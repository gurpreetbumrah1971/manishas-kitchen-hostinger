-- Adds the missing deliveryCharge column to `order` and backfills it for
-- existing DELIVERY orders, so the admin dashboard's order summary can show
-- the delivery fee instead of only the blended grandTotal.
--
-- Previously the delivery fee was computed at checkout and folded straight
-- into grandTotal without ever being stored on its own, so there was no
-- value for the admin UI to display. This does not change any grandTotal,
-- totalAmount, or other stored figure -- it only adds a new column and
-- derives its value for past rows from ones that already exist.
--
-- Run this once on the live database via phpMyAdmin's SQL tab. The ALTER
-- TABLE below intentionally avoids "IF NOT EXISTS" -- that clause requires
-- MySQL 8.0.29+ and is a syntax error on older MySQL/MariaDB, which is why
-- an earlier version of this file silently failed to add the column. If
-- you already have a deliveryCharge column (e.g. a previous run of this
-- file got as far as the ALTER before failing on something else), skip the
-- ALTER statement and only run the backfill UPDATE below.

ALTER TABLE `order`
  ADD COLUMN deliveryCharge DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discountAmount;

-- Backfill: grandTotal = (totalAmount + gstAmount - discountAmount - cashbackRedeemed) + deliveryCharge
-- so deliveryCharge = grandTotal - that bracket, for orders placed as DELIVERY.
UPDATE `order`
SET deliveryCharge = GREATEST(0, grandTotal - (totalAmount + gstAmount - discountAmount - cashbackRedeemed))
WHERE orderType = 'DELIVERY';
