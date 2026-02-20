-- Storage policies for the "stories" bucket in Supabase
-- Run this SQL in the Supabase SQL editor for your project.

-- 1) Allow public read access for the "stories" bucket
create policy "stories_public_read"
on storage.objects
for select
to public
using (bucket_id = 'stories');

-- 2) Allow authenticated users to upload to the "stories" bucket
create policy "stories_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'stories');

-- 3) Allow anonymous clients (anon key) to upload to "stories"
-- This is important when posting stories from Expo Go without logging in.
create policy "stories_anon_insert"
on storage.objects
for insert
to anon
with check (bucket_id = 'stories');
