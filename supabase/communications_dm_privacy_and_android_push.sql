-- Tighten Communications direct-message privacy and support the Android push/PWA cleanup.
-- Run this in TITAN Supabase SQL Editor after deployment.

create or replace function public.communications_can_read_conversation(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = target_conversation_id
        and cm.user_id = (select auth.uid())
        and cm.removed_at is null
    )
    or (
      public.communications_is_admin()
      and exists (
        select 1
        from public.conversations c
        where c.id = target_conversation_id
          and c.conversation_type <> 'direct'
      )
    ),
    false
  );
$$;

drop policy if exists "communications conversations read member" on public.conversations;
create policy "communications conversations read member"
on public.conversations for select to authenticated
using (public.communications_can_read_conversation(id));

drop policy if exists "communications members read conversation" on public.conversation_members;
create policy "communications members read conversation"
on public.conversation_members for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications messages read member" on public.messages;
create policy "communications messages read member"
on public.messages for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications attachments read member" on public.message_attachments;
create policy "communications attachments read member"
on public.message_attachments for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications tasks read member" on public.communication_tasks;
create policy "communications tasks read member"
on public.communication_tasks for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications read receipts own" on public.message_read_receipts;
create policy "communications read receipts own"
on public.message_read_receipts for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (
  user_id = (select auth.uid())
  and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id))
);

drop policy if exists "communications reactions member" on public.message_reactions;
create policy "communications reactions member"
on public.message_reactions for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (
  user_id = (select auth.uid())
  and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id))
);

drop policy if exists "communications acknowledgements member" on public.message_acknowledgements;
create policy "communications acknowledgements member"
on public.message_acknowledgements for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (
  user_id = (select auth.uid())
  and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id))
);

drop policy if exists "communication attachments storage read" on storage.objects;
create policy "communication attachments storage read"
on storage.objects for select to authenticated
using (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
);

drop policy if exists "communication attachments storage update" on storage.objects;
create policy "communication attachments storage update"
on storage.objects for update to authenticated
using (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
);
