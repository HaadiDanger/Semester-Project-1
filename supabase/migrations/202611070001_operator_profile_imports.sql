-- Attribute owner-requested directory imports to the actual repository operator.
-- Browser clients still use the existing account/profile RPCs and private media gateway.
alter table private.account_controls add column eligibility_decided_by_operator text
  check (length(btrim(eligibility_decided_by_operator)) between 1 and 100);
alter table private.account_controls drop constraint account_controls_check;
alter table private.account_controls add constraint account_eligibility_attribution check (
  eligibility_status = 'pending' or (
    num_nonnulls(eligibility_decided_by, eligibility_decided_by_operator) = 1
    and eligibility_decided_at is not null and eligibility_basis is not null and length(btrim(eligibility_basis)) > 0
  )
);

alter table private.profile_moderation add column reviewed_by_operator text
  check (length(btrim(reviewed_by_operator)) between 1 and 100);
alter table private.profile_moderation drop constraint profile_moderation_check1;
alter table private.profile_moderation add constraint profile_approval_attribution check (
  status <> 'approved' or (
    reviewed_version is not null and reviewed_at is not null
    and num_nonnulls(reviewed_by, reviewed_by_operator) = 1
  )
);

create function private.clear_operator_eligibility() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.eligibility_status = 'pending' or new.eligibility_decided_by is not null then
    new.eligibility_decided_by_operator := null;
  end if;
  return new;
end $$;
create trigger clear_operator_eligibility before insert or update on private.account_controls
  for each row execute function private.clear_operator_eligibility();

create function private.clear_operator_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'approved' or new.reviewed_at is null or new.reviewed_by is not null then
    new.reviewed_by_operator := null;
  end if;
  return new;
end $$;
create trigger clear_operator_review before insert or update on private.profile_moderation
  for each row execute function private.clear_operator_review();

revoke execute on function private.clear_operator_eligibility(),private.clear_operator_review() from public,anon,authenticated;
