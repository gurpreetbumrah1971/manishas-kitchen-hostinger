CREATE TABLE admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
  image VARCHAR(500) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE food_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, category_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL UNIQUE, description TEXT NULL, price DECIMAL(10,2) NOT NULL,
  image VARCHAR(500) NULL, is_veg TINYINT(1) NOT NULL DEFAULT 1,
  is_available TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_food_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, mobile_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(160) NULL, birthday DATE NULL, anniversary DATE NULL,
  referral_code VARCHAR(32) NULL UNIQUE, cashback_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_addresses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, customer_id INT UNSIGNED NOT NULL,
  label VARCHAR(40) NOT NULL, address TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY customer_address_label (customer_id,label), CONSTRAINT fk_address_customer FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NULL, customer_name VARCHAR(160) NOT NULL, mobile_number VARCHAR(20) NOT NULL,
  whatsapp_number VARCHAR(20) NULL, email VARCHAR(190) NULL, address TEXT NULL, table_number VARCHAR(40) NULL,
  order_type ENUM('DINE_IN','TAKEAWAY','DELIVERY') NOT NULL DEFAULT 'DINE_IN',
  payment_method ENUM('CASH','UPI','CARD') NOT NULL DEFAULT 'UPI',
  total_amount DECIMAL(10,2) NOT NULL, gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0, cashback_redeemed DECIMAL(10,2) NOT NULL DEFAULT 0,
  cashback_earned DECIMAL(10,2) NOT NULL DEFAULT 0, grand_total DECIMAL(10,2) NOT NULL,
  referral_code VARCHAR(32) NULL, referrer_id INT UNSIGNED NULL, referral_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('PENDING','PREPARING','COMPLETED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  confirmed_at DATETIME NULL, preparation_started_at DATETIME NULL, preparation_minutes INT NULL,
  ready_at DATETIME NULL, delivered_at DATETIME NULL, session_token VARCHAR(80) NOT NULL,
  session_expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_customer FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_referrer FOREIGN KEY(referrer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cashback_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, customer_id INT UNSIGNED NOT NULL, order_id INT UNSIGNED NULL,
  type ENUM('EARNED','REDEEMED','ADJUSTED') NOT NULL, amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL, note VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX customer_transactions (customer_id, created_at),
  CONSTRAINT fk_cashback_customer FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_cashback_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id INT UNSIGNED NOT NULL, food_item_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_item_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_food FOREIGN KEY(food_item_id) REFERENCES food_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO categories (name) VALUES ('Parathas'),('Frankies'),('Kebabs'),('Pakodas'),('Egg Dishes'),('Snacks'),('Beverages');
INSERT INTO food_items (category_id,name,price,is_veg,image) VALUES
((SELECT id FROM categories WHERE name='Beverages'),'Tea',29,1,'/food/tea.png'),
((SELECT id FROM categories WHERE name='Beverages'),'Lemon Tea',39,1,'/food/lemon-tea.png'),
((SELECT id FROM categories WHERE name='Beverages'),'Iced Tea',69,1,'/food/iced-tea.png'),
((SELECT id FROM categories WHERE name='Snacks'),'Poha',49,1,'/food/poha.png'),
((SELECT id FROM categories WHERE name='Snacks'),'Chole Puri',130,1,'/food/chole-puri.png'),
((SELECT id FROM categories WHERE name='Snacks'),'Dhokla (Half)',40,1,'/food/dhokla.jpeg'),
((SELECT id FROM categories WHERE name='Parathas'),'Aloo Paratha',69,1,NULL),
((SELECT id FROM categories WHERE name='Parathas'),'Paneer Paratha',109,1,NULL),
((SELECT id FROM categories WHERE name='Frankies'),'Paneer Frankie',139,1,NULL),
((SELECT id FROM categories WHERE name='Kebabs'),'Chicken Galouti Kebab',199,0,NULL),
((SELECT id FROM categories WHERE name='Pakodas'),'Onion Pakoda',69,1,NULL),
((SELECT id FROM categories WHERE name='Egg Dishes'),'Single Egg Omelet + 2 Butter Pav',79,0,NULL);
