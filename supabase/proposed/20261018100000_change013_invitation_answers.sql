-- Change 13 (JoyChange001): invitation alerts. The team-status answer also lists the invitations I sent that the other
-- agent accepted or declined in the last 7 days, so my phone can tell me. Nothing else changes: same function, one more
-- key ("invites_answered"). Apply AFTER 20261016000000_change010_team_sharing_audit.sql. Safe to run twice.
-- Undo: 20261018100000_change013_rollback.sql

create or replace function public.eab_team_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); tm uuid; out jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  tm := public.eab_my_team();
  select jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'created_by', t.created_by, 'created_at', t.created_at) from public.eab_teams t where t.id = tm),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'name', m.name, 'joined_at', m.joined_at) order by m.joined_at)
                         from public.eab_team_members m where m.team_id = tm and m.left_at is null), '[]'::jsonb),
    'invites_sent', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at))
                         from public.eab_team_invites i where i.team_id = tm and i.status = 'pending' and i.expires_at > now()), '[]'::jsonb),
    'invites_for_me', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from_email', fm.email, 'from_name', fm.name, 'created_at', i.created_at, 'expires_at', i.expires_at))
                         from public.eab_team_invites i join public.eab_team_members fm on fm.team_id = i.team_id and fm.user_id = i.invited_by
                         where i.status = 'pending' and i.expires_at > now() and i.email = em and i.invited_by <> uid), '[]'::jsonb),
    'shares_given', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', s.workspace_id, 'collection', s.collection, 'record_id', s.record_id, 'level', s.level, 'recipient_id', s.recipient_id, 'granted_at', s.granted_at))
                         from public.eab_shares s where s.team_id = tm and s.owner_id = uid and s.revoked_at is null), '[]'::jsonb),
    'share_all_given', coalesce((select jsonb_agg(jsonb_build_object('scope', a.scope, 'level', a.level, 'recipient_id', a.recipient_id, 'started_at', a.started_at))
                         from public.eab_share_all a where a.team_id = tm and a.owner_id = uid and a.ended_at is null), '[]'::jsonb),
    'share_all_received', coalesce((select jsonb_agg(jsonb_build_object('scope', a.scope, 'level', a.level, 'owner_id', a.owner_id))
                         from public.eab_share_all a where a.team_id = tm and a.recipient_id = uid and a.ended_at is null), '[]'::jsonb),
    -- Change 13: invitations I sent that the other agent has answered in the last 7 days (so I can be told "accepted" / "declined").
    'invites_answered', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'email', coalesce(m.email, i.email), 'name', m.name, 'answered_at', i.responded_at) order by i.responded_at)
                         from public.eab_team_invites i left join public.eab_team_members m on m.team_id = i.team_id and m.user_id = i.responded_by
                         where i.invited_by = uid and i.status in ('accepted', 'declined') and i.responded_at > now() - interval '7 days'), '[]'::jsonb),
    'delete_requests', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'workspace_id', d.workspace_id, 'collection', d.collection, 'record_id', d.record_id,
                                  'owner_id', d.owner_id, 'requester_id', d.requester_id, 'created_at', d.created_at) order by d.created_at)
                         from public.eab_delete_requests d where d.team_id = tm and d.status = 'pending' and (d.owner_id = uid or d.requester_id = uid)), '[]'::jsonb)
  ) into out;
  return out;
end $$;
