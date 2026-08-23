-- Migrates the Hostinger production database from the old snake_case schema
-- (admins, customers, food_items, orders, order_items, customer_addresses,
-- cashback_transactions) to the schema api/index.php now queries (admin,
-- customer, fooditem, order, orderitem, customeraddress, cashbacktransaction
-- with camelCase columns).
--
-- Every change below is a pure rename: each column keeps its original type
-- and attributes exactly, only the name changes. This keeps every ALTER
-- TABLE statement ALGORITHM=INPLACE-compatible (mixing a real type change
-- into the same statement as a foreign-key column rename fails on MariaDB
-- 10.4 with either algorithm) and avoids any data conversion risk.
--
-- BEFORE RUNNING:
--   1. Take a full backup (hPanel > Databases > phpMyAdmin > Export, or
--      mysqldump) of the production database. This migration is not
--      reversible by re-running it.
--   2. Run this during low-traffic hours. Renaming a table briefly makes it
--      unavailable to any in-flight request.
--   3. Run it in phpMyAdmin's SQL tab as ONE script. If any statement
--      errors partway through, STOP and do not re-run from the top --
--      check which tables were already renamed first (a second RENAME on an
--      already-renamed table will fail).
--
-- This intentionally does NOT add columns/tables the code never reads
-- (order.birthday/anniversary/whatsappMessageId/whatsappStatus*, the unused
-- customerotp table, category.updatedAt) -- keeping this to exactly what
-- api/index.php needs minimizes risk on a live database with real orders.
-- Validated end-to-end against a scratch copy of database.sql before use.

-- Step 1: rename tables (MySQL/MariaDB updates existing foreign keys automatically).
RENAME TABLE `admins` TO `admin`;
RENAME TABLE `categories` TO `category`;
RENAME TABLE `food_items` TO `fooditem`;
RENAME TABLE `customers` TO `customer`;
RENAME TABLE `customer_addresses` TO `customeraddress`;
RENAME TABLE `orders` TO `order`;
RENAME TABLE `cashback_transactions` TO `cashbacktransaction`;
RENAME TABLE `order_items` TO `orderitem`;

-- Step 2: rename columns to camelCase within each renamed table (pure renames only).

ALTER TABLE `admin`
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `category`
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `fooditem`
  CHANGE COLUMN `category_id` `categoryId` INT UNSIGNED NOT NULL,
  CHANGE COLUMN `is_veg` `isVeg` TINYINT(1) NOT NULL DEFAULT 1,
  CHANGE COLUMN `is_available` `isAvailable` TINYINT(1) NOT NULL DEFAULT 1,
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updated_at` `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `customer`
  CHANGE COLUMN `mobile_number` `mobileNumber` VARCHAR(20) NOT NULL,
  CHANGE COLUMN `referral_code` `referralCode` VARCHAR(32) NULL,
  CHANGE COLUMN `cashback_balance` `cashbackBalance` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updated_at` `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `customeraddress`
  CHANGE COLUMN `customer_id` `customerId` INT UNSIGNED NOT NULL,
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHANGE COLUMN `updated_at` `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `order`
  CHANGE COLUMN `order_number` `orderNumber` VARCHAR(40) NOT NULL,
  CHANGE COLUMN `customer_id` `customerId` INT UNSIGNED NULL,
  CHANGE COLUMN `customer_name` `customerName` VARCHAR(160) NOT NULL,
  CHANGE COLUMN `mobile_number` `mobileNumber` VARCHAR(20) NOT NULL,
  CHANGE COLUMN `whatsapp_number` `whatsappNumber` VARCHAR(20) NULL,
  CHANGE COLUMN `table_number` `tableNumber` VARCHAR(40) NULL,
  CHANGE COLUMN `order_type` `orderType` ENUM('DINE_IN','TAKEAWAY','DELIVERY') NOT NULL DEFAULT 'DINE_IN',
  CHANGE COLUMN `payment_method` `paymentMethod` ENUM('CASH','UPI','CARD') NOT NULL DEFAULT 'UPI',
  CHANGE COLUMN `total_amount` `totalAmount` DECIMAL(10,2) NOT NULL,
  CHANGE COLUMN `gst_amount` `gstAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `discount_amount` `discountAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `cashback_redeemed` `cashbackRedeemed` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `cashback_earned` `cashbackEarned` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `grand_total` `grandTotal` DECIMAL(10,2) NOT NULL,
  CHANGE COLUMN `referral_code` `referralCode` VARCHAR(32) NULL,
  CHANGE COLUMN `referrer_id` `referrerId` INT UNSIGNED NULL,
  CHANGE COLUMN `referral_discount` `referralDiscount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `confirmed_at` `confirmedAt` DATETIME NULL,
  CHANGE COLUMN `preparation_started_at` `preparationStartedAt` DATETIME NULL,
  CHANGE COLUMN `preparation_minutes` `preparationMinutes` INT NULL,
  CHANGE COLUMN `ready_at` `readyAt` DATETIME NULL,
  CHANGE COLUMN `delivered_at` `deliveredAt` DATETIME NULL,
  CHANGE COLUMN `session_token` `customerSessionToken` VARCHAR(80) NOT NULL,
  CHANGE COLUMN `session_expires_at` `customerSessionExpiresAt` DATETIME NOT NULL,
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `cashbacktransaction`
  CHANGE COLUMN `customer_id` `customerId` INT UNSIGNED NOT NULL,
  CHANGE COLUMN `order_id` `orderId` INT UNSIGNED NULL,
  CHANGE COLUMN `balance_after` `balanceAfter` DECIMAL(10,2) NOT NULL,
  CHANGE COLUMN `created_at` `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE;

ALTER TABLE `orderitem`
  CHANGE COLUMN `order_id` `orderId` INT UNSIGNED NOT NULL,
  CHANGE COLUMN `food_item_id` `foodItemId` INT UNSIGNED NOT NULL,
  CHANGE COLUMN `unit_price` `unitPrice` DECIMAL(10,2) NOT NULL, ALGORITHM=INPLACE;

-- Step 3: verify (run these SELECTs after the above completes without error).
-- SELECT COUNT(*) FROM `admin`;
-- SELECT COUNT(*) FROM `order`;
-- SELECT COUNT(*) FROM `customer`;
-- SELECT id, orderNumber, customerName, mobileNumber, grandTotal, orderType FROM `order` ORDER BY id DESC LIMIT 5;
