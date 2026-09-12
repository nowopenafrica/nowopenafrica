-- 20260913000000_fix_workforce_agent_keys.sql
-- The workforce runner records scheduled runs against the schedule keys
-- ('trust-safety', 'customer-success', 'chief-of-staff', 'growth-director').
-- The roster seeds (os_workforce, work items and the frontend seed) shipped the
-- legacy spellings 'trust-safety-agent' and 'customer-success-manager', so
-- record_scheduled_run's `UPDATE os_workforce ... WHERE agent_key = <run key>`
-- never touched those two roster rows: the agents ran, the roster never moved.
-- Normalise the roster rows to the engine keys; run data already uses them.

UPDATE public.os_workforce
   SET agent_key = 'trust-safety'
 WHERE agent_key = 'trust-safety-agent'
   AND kind = 'ai';

UPDATE public.os_workforce
   SET agent_key = 'customer-success'
 WHERE agent_key = 'customer-success-manager'
   AND kind = 'ai';