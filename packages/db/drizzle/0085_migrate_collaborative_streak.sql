UPDATE "shared_goals"
SET
  "scoring_type" = 'shared_streak',
  "target" = COALESCE("target", 7)
WHERE "scoring_type" = 'everyone_completes';
