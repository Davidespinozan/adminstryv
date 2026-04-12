-- Delete bounced prospects — bad emails, no point keeping them
DELETE FROM prospects
WHERE stage = 'Descartado'
  AND (notes LIKE '%bounced%' OR notes LIKE '%Spam complaint%');

-- Reset delivered prospects to be re-sent after warmup
-- Only reset those with valid emails and generated content
UPDATE prospects
SET stage = 'Sin contactar',
    emails_sent = 0,
    email_opened = false,
    email_opened_at = null,
    resend_id = null
WHERE stage = 'Contactado'
  AND email IS NOT NULL
  AND email != ''
  AND email_v1 IS NOT NULL
  AND email_v1 != '';

-- Clear the agent lock
DELETE FROM agent_lock WHERE id = 'prospect-agent';
