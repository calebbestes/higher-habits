-- Move all medium priority goals to low
UPDATE goals SET priority = 'low' WHERE priority = 'medium';

-- Recreate the enum without 'medium'
ALTER TYPE goal_priority RENAME TO goal_priority_old;
CREATE TYPE goal_priority AS ENUM ('high', 'low');
ALTER TABLE goals ALTER COLUMN priority TYPE goal_priority USING priority::text::goal_priority;
DROP TYPE goal_priority_old;
