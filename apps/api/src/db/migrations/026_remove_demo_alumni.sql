-- Drop seeded demo alumni (local part demo.alumni.*). Dependent rows CASCADE from people.
DELETE FROM people
WHERE lower(split_part(institutional_email::text, '@', 1)) LIKE 'demo.alumni.%';
