-- Adds an `addon` column to orderitem so the "+ Cheese" add-on customers pay
-- for at checkout is actually recorded on the order, instead of being
-- silently dropped.
--
-- Previously assets/app.js sent a cart line like
-- { name: "Corn Cheese Paratha + Cheese", unitPrice: basePrice + 19 } but
-- api/index.php's orderItemsFromPayload() stripped the "+ Cheese" suffix,
-- looked the item up by its base name, and re-priced it from fooditem.price
-- -- discarding both the Rs. 19 surcharge and any record that cheese was
-- requested. Kitchen/admin had no way to see the add-on, and the stored
-- order total undercounted what the customer paid.
--
-- Run this once on the live database via phpMyAdmin's SQL tab. As with
-- add-delivery-charge-column.sql, this intentionally avoids "IF NOT EXISTS"
-- since it requires MySQL 8.0.29+ and is a syntax error on older
-- MySQL/MariaDB.

ALTER TABLE orderitem
  ADD COLUMN addon VARCHAR(30) NULL AFTER foodItemId;

-- No backfill: the add-on was never recorded for past orders, so there is
-- nothing to recover for existing rows.
