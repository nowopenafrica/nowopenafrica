-- The review queue's own index.
--
-- MEASURED 2026-09-23: a discovery run produced 1,326 new results. The queue
-- fetches them with
--
--   where status in ('pending','review') order by created_at desc limit 200
--
-- and the only matching index is (status, confidence DESC, created_at DESC).
-- Postgres can use it to FIND the rows but not to ORDER them — created_at is
-- the third column, behind confidence — so every load sorts the whole matching
-- set to return a screenful.
--
-- Newest-first is the right default here: after a run, a reviewer wants what
-- just arrived. The confidence index stays for the ranked views that want it;
-- this one serves the queue as the queue is actually read.
--
-- Partial, because the queue is the only thing that reads this way and the
-- other 3,668 rows are settled. The index stays small as the table grows.

create index if not exists idx_radar_candidates_status_created
  on public.radar_candidates (status, created_at desc)
  where status in ('pending', 'review', 'held');
