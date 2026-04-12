-- Reset all contacted prospects to be re-sent after warmup
-- Their emails are already generated (V1, V2, V3) — just need to resend
UPDATE prospects
SET stage = 'Sin contactar',
    emails_sent = 0,
    email_opened = false,
    email_opened_at = null,
    resend_id = null
WHERE stage = 'Contactado';

-- Clear the agent lock
DELETE FROM agent_lock WHERE id = 'prospect-agent';
