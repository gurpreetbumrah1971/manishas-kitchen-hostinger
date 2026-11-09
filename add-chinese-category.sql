-- Run this once in Hostinger phpMyAdmin (SQL tab) against the production
-- database, after the Git deploy of commit 12777e7 has gone live.
-- Verified against production on 2026-11-09: category id 43 and fooditem
-- ids 263-266 are free (production categories/fooditem ids diverge from
-- the local dev database, so these were checked via the live /api/menu
-- and /api/categories endpoints before picking them).

INSERT IGNORE INTO `category` (id, name, image, createdAt) VALUES
(43, 'Chinese', '/food/photo-updates/veg-fried-rice.jpeg', NOW());

INSERT IGNORE INTO `fooditem` (id, categoryId, name, description, price, image, isVeg, isAvailable, createdAt, updatedAt) VALUES
(263, 43, 'Veg Fried Rice', 'Wok-tossed rice with fresh mixed vegetables.', 180.00, '/food/photo-updates/veg-fried-rice.jpeg', 1, 1, NOW(), NOW()),
(264, 43, 'Egg Fried Rice', 'Wok-tossed rice with scrambled egg and spring onion.', 180.00, '/food/photo-updates/egg-fried-rice.jpeg', 0, 1, NOW(), NOW()),
(265, 43, 'Chicken Fried Rice', 'Wok-tossed rice with tender chicken and spring onion.', 220.00, '/food/photo-updates/chicken-fried-rice.jpeg', 0, 1, NOW(), NOW()),
(266, 43, 'Paneer Fried Rice', 'Wok-tossed rice with spiced paneer and spring onion.', 220.00, '/food/photo-updates/paneer-fried-rice.jpeg', 1, 1, NOW(), NOW());
