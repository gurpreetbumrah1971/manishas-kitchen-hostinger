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
-- Safe to run once on the live database via phpMyAdmin's SQL tab.
-- Re-running it is harmless: ADD COLUMN IF NOT EXISTS is a no-op if already
-- applied, and the backfill UPDATE recomputes the same value each time.

ALTER TABLE `order`
  ADD COLUMN IF NOT EXISTS deliveryCharge DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discountAmount;

-- Backfill: grandTotal = (totalAmount + gstAmount - discountAmount - cashbackRedeemed) + deliveryCharge
-- so deliveryCharge = grandTotal - that bracket, for orders placed as DELIVERY.
UPDATE `order`
SET deliveryCharge = GREATEST(0, grandTotal - (totalAmount + gstAmount - discountAmount - cashbackRedeemed))
WHERE orderType = 'DELIVERY';
