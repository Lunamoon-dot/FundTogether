UPDATE reward_campaigns
SET review_started_at = COALESCE(review_started_at, updated_at),
    review_deadline_at = COALESCE(review_deadline_at, COALESCE(review_started_at, updated_at) + interval '24 hours')
WHERE status = 'UNDER_REVIEW'
  AND (review_started_at IS NULL OR review_deadline_at IS NULL);
