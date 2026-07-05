-- Add attempts column to password_resets for brute-force protection
alter table password_resets add column if not exists attempts integer default 0;

-- Add index on code for faster lookups during reset attempts
create index if not exists idx_password_resets_code_attempts on password_resets(code, attempts);
