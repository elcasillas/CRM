alter table deals
  drop constraint if exists deals_solutions_engineer_id_fkey;

alter table deals
  add constraint deals_solutions_engineer_id_fkey
  foreign key (solutions_engineer_id) references public.profiles(id);
