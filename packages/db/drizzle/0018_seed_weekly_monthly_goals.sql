INSERT INTO "goals" ("name", "frequency_goal", "period", "category_id", "priority", "icon_key", "hidden")

-- Spiritual
SELECT 'Temple',              4, NULL::goal_period, c.id, 'high'::goal_priority,   'mdi:temple-hindu',           false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Host come follow me', 4, NULL::goal_period, c.id, 'high'::goal_priority,   'mdi:account-group-outline',  false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Volunteer service',   4, NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:handshake-outline',      false FROM categories c WHERE c.name = 'Spiritual' UNION ALL
SELECT 'Ministering visit',   1, 'monthly'::goal_period, c.id, 'high'::goal_priority,   'mdi:home-heart',             false FROM categories c WHERE c.name = 'Spiritual' UNION ALL

-- Physical
SELECT 'Climb',               2, NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:image-filter-hdr',       false FROM categories c WHERE c.name = 'Physical' UNION ALL
SELECT 'Tennis',              2, NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:tennis-ball',            false FROM categories c WHERE c.name = 'Physical' UNION ALL

-- Work
SELECT 'Financial Planning',  1, 'monthly'::goal_period, c.id, 'high'::goal_priority,   'mdi:chart-line',             false FROM categories c WHERE c.name = 'Work' UNION ALL

-- Custom (social / personal)
SELECT 'Date',                4, NULL::goal_period, c.id, 'high'::goal_priority,   'mdi:heart-outline',          false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Host party',          4, NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:party-popper',           false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Lunch with new friend',4,NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:silverware-fork-knife',  false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Call family member',  4, NULL::goal_period, c.id, 'high'::goal_priority,   'mdi:phone-outline',          false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Cook',                4, NULL::goal_period, c.id, 'low'::goal_priority,    'mdi:chef-hat',               false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Piano',               4, NULL::goal_period, c.id, 'medium'::goal_priority, 'mdi:piano',                  false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Camp',                1, 'monthly'::goal_period, c.id, 'medium'::goal_priority, 'mdi:tent',                   false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Finish a book',       1, 'monthly'::goal_period, c.id, 'medium'::goal_priority, 'mdi:book-open-page-variant', false FROM categories c WHERE c.name = 'Custom' UNION ALL
SELECT 'Call Czech friend',   1, 'monthly'::goal_period, c.id, 'medium'::goal_priority, 'mdi:earth',                  false FROM categories c WHERE c.name = 'Custom';
