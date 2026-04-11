-- Remove searches that Claude always skips
DELETE FROM prospect_searches WHERE query IN (
  'escuelas privadas',
  'guarderías',
  'academias de idiomas',
  'academias de baile',
  'farmacias'
);

-- Clear the lock
DELETE FROM agent_lock WHERE id = 'prospect-agent';
