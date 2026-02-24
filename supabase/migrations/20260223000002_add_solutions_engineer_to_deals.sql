alter table deals add column if not exists solutions_engineer_id uuid references auth.users;
