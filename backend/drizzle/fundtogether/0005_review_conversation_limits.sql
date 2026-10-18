ALTER TABLE campaigns_review_threads
  ADD COLUMN message_count integer NOT NULL DEFAULT 0;

UPDATE campaigns_review_threads AS threads
SET message_count = counts.message_count
FROM (
  SELECT thread_id, COUNT(*)::integer AS message_count
  FROM campaigns_review_messages
  GROUP BY thread_id
) AS counts
WHERE counts.thread_id = threads.id;

ALTER TABLE campaigns_review_threads
  ADD CONSTRAINT campaigns_review_thread_message_count_check
  CHECK (message_count BETWEEN 0 AND 200);

CREATE INDEX campaigns_review_message_thread_cursor_idx
  ON campaigns_review_messages (thread_id, created_at, id);
