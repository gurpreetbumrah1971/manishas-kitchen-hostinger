-- Centralized cashback wallet, shared between manishas-kitchen.food and
-- doodees.food. This is a NEW, separate database -- it does not live inside
-- either site's existing database. Run this once, while connected to that
-- new (empty) database in phpMyAdmin.
--
-- Scope is deliberately narrow: only the cashback balance and its ledger
-- move here. Each site keeps its own `customer`, `order`, and referral-code
-- logic untouched -- those remain fully site-local. Only the number that
-- answers "how much cashback does this mobile number have" becomes shared.

CREATE TABLE wallet_customer (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mobileNumber VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(160) NULL,
  cashbackBalance DECIMAL(10,2) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- `site` identifies which storefront the transaction happened on
-- ('manishas-kitchen' or 'doodees'); `siteOrderReference` stores that
-- site's own orderNumber for traceability, not a cross-site order id.
CREATE TABLE wallet_transaction (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  walletCustomerId INT UNSIGNED NOT NULL,
  site VARCHAR(40) NOT NULL,
  siteOrderReference VARCHAR(60) NULL,
  type ENUM('EARNED','REDEEMED','ADJUSTED') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balanceAfter DECIMAL(10,2) NOT NULL,
  note VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX wallet_customer_tx (walletCustomerId, createdAt),
  CONSTRAINT fk_wallet_tx_customer FOREIGN KEY (walletCustomerId) REFERENCES wallet_customer(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
