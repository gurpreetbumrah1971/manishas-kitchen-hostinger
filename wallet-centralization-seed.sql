-- Reconciles EXISTING per-site cashback balances into the new shared wallet
-- (see wallet-centralization-schema.sql), by summing each mobile number's
-- Manisha's Kitchen balance and Doodees balance into one combined starting
-- balance -- no one loses cashback they already earned on either site.
--
-- IMPORTANT: run each site's block below exactly ONCE, while connected to
-- THAT SITE's own database (so the unqualified `customer` table resolves
-- correctly), with WALLET_DB replaced by the actual name of the new shared
-- database you created from wallet-centralization-schema.sql. Running a
-- site's block twice will double-count that site's balances into the
-- wallet -- if you're unsure whether a block already ran, check
-- WALLET_DB.wallet_transaction for a note mentioning that site before
-- rerunning.
--
-- This requires the database user you're running this as to have grants on
-- WALLET_DB in addition to this site's own database (same MySQL server,
-- same Hostinger account, so a plain GRANT is enough -- no new connection
-- needed).

-- ============================================================
-- Run while connected to Manisha's Kitchen's database
-- ============================================================
INSERT INTO WALLET_DB.wallet_customer (mobileNumber, name, cashbackBalance)
SELECT mobileNumber, name, cashbackBalance
FROM customer
ON DUPLICATE KEY UPDATE
  cashbackBalance = WALLET_DB.wallet_customer.cashbackBalance + VALUES(cashbackBalance),
  name = COALESCE(WALLET_DB.wallet_customer.name, VALUES(name));

INSERT INTO WALLET_DB.wallet_transaction (walletCustomerId, site, type, amount, balanceAfter, note)
SELECT w.id, 'manishas-kitchen', 'ADJUSTED', c.cashbackBalance, w.cashbackBalance,
       'Initial balance migrated from Manisha''s Kitchen during wallet centralization'
FROM customer c
JOIN WALLET_DB.wallet_customer w ON w.mobileNumber = c.mobileNumber
WHERE c.cashbackBalance <> 0;

-- ============================================================
-- Run while connected to Doodees' database
-- ============================================================
INSERT INTO WALLET_DB.wallet_customer (mobileNumber, name, cashbackBalance)
SELECT mobileNumber, name, cashbackBalance
FROM customer
ON DUPLICATE KEY UPDATE
  cashbackBalance = WALLET_DB.wallet_customer.cashbackBalance + VALUES(cashbackBalance),
  name = COALESCE(WALLET_DB.wallet_customer.name, VALUES(name));

INSERT INTO WALLET_DB.wallet_transaction (walletCustomerId, site, type, amount, balanceAfter, note)
SELECT w.id, 'doodees', 'ADJUSTED', c.cashbackBalance, w.cashbackBalance,
       'Initial balance migrated from Doodees during wallet centralization'
FROM customer c
JOIN WALLET_DB.wallet_customer w ON w.mobileNumber = c.mobileNumber
WHERE c.cashbackBalance <> 0;
