-- Adds a `specialInstructions` column to `order` so the free-text food
-- instructions customers enter at checkout (e.g. "less spicy, no onions")
-- are actually stored and visible to admin/kitchen staff, instead of being
-- silently dropped.
--
-- Run this once on the live database via phpMyAdmin's SQL tab. As with
-- add-delivery-charge-column.sql and add-orderitem-addon-column.sql, this
-- intentionally avoids "IF NOT EXISTS" since it requires MySQL 8.0.29+ and
-- is a syntax error on older MySQL/MariaDB.

ALTER TABLE `order`
  ADD COLUMN specialInstructions TEXT NULL AFTER tableNumber;

-- No backfill: instructions were never recorded for past orders, so there
-- is nothing to recover for existing rows.
