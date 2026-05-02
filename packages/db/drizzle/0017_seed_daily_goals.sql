INSERT INTO "goals" ("name", "frequency_goal", "period", "category_id", "priority", "icon_key", "hidden")

-- Spiritual
SELECT 'Prayer',            1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:hands-pray',        false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Scriptures',        1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:book-open-variant', false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Clean Room',        1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:broom',             false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Resist Temptation', 1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:shield-check',      false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'No Phone Walk',     1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:walk',              false FROM categories c WHERE c.name = 'Spiritual' UNION ALL

-- Physical
SELECT 'Gym',                          1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:dumbbell',         false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Meditate & Stretch',           1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:yoga',             false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Calories < 2300',              1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:food-apple',       false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Wake Up at 7',                 1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:alarm',            false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'No Phone in Bathroom/Bed/Car', 1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:phone-off',        false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Fruit & Veggies',              1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:fruit-watermelon', false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Creatine & Protein',           1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:pill',             false FROM categories c WHERE c.name = 'Physical' UNION ALL

-- Work
SELECT 'Cold Emails',         1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:email-outline', false FROM categories c WHERE c.name = 'Work' UNION ALL
SELECT 'LinkedIn Messages',   1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:linkedin',      false FROM categories c WHERE c.name = 'Work' UNION ALL
SELECT 'Prospective Clients', 1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:account-group', false FROM categories c WHERE c.name = 'Work' UNION ALL
SELECT 'Cold Call or Visit',  1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:phone',         false FROM categories c WHERE c.name = 'Work' UNION ALL
SELECT 'Study Coding',        1, 'daily'::goal_period, c.id, 'medium'::goal_priority, 'mdi:code-braces',   false FROM categories c WHERE c.name = 'Work' UNION ALL
SELECT 'Work for EY',         1, 'daily'::goal_period, c.id, 'high'::goal_priority,   'mdi:briefcase',     false FROM categories c WHERE c.name = 'Work';
