import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helper to decode base64 -> Uint8Array
function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper: sanitize filename
function sanitizeFileName(name: string) {
  // drop path segments and keep last part, replace whitespace
  const last = name.split('/').pop() ?? name;
  return last.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
}

serve(async (req: Request) => {
  try {
    const body = await req.json();

    const {
      reviewData,
      mediaFile, // base64 string
      mediaType,
      fileName: incomingFileName,
      contentType,
      // client may send any of these: supabaseUid, firebaseUid, user_id
      supabaseUid,
      firebaseUid,
      user_id,
    } = body;

    const ownerId = (supabaseUid ?? firebaseUid ?? user_id) ?? null;

    // minimal validation
    if (!mediaFile || !incomingFileName) {
      return new Response(JSON.stringify({ error: 'mediaFile and fileName are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // create admin client with service role key (running in Supabase Functions environment)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server configuration missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // normalize filename and prefix timestamp to avoid collisions
    const baseName = sanitizeFileName(incomingFileName);
    const finalFileName = `${Date.now()}-${baseName}`;

    // upload to storage (service role bypasses storage RLS)
    const decoded = base64ToUint8Array(mediaFile);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('feeds')
      .upload(finalFileName, decoded, {
        contentType: contentType ?? (mediaType === 'image' ? 'image/jpeg' : 'video/mp4'),
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw uploadError;
    }

    if (!uploadData || !uploadData.path) {
      throw new Error('Upload returned no path');
    }

    // get public url (support different shapes across versions)
    const getUrlRes = supabaseAdmin.storage.from('feeds').getPublicUrl(uploadData.path);
    const publicUrl = (getUrlRes as any)?.data?.publicUrl ?? (getUrlRes as any)?.data?.public_url ?? null;

    // Prepare post row
    const postRow: any = {
      ...(reviewData ?? {}),
      media_url: publicUrl,
      media_type: mediaType,
    };
    if (ownerId) postRow.user_id = ownerId;

    // insert post (service role bypasses RLS so this will succeed)
    const { data: postData, error: postError } = await supabaseAdmin
      .from('posts')
      .insert([postRow])
      .select();

    if (postError) {
      console.error('DB insert error:', postError);
      throw postError;
    }

    return new Response(JSON.stringify({ post: postData?.[0] ?? null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in create-post-with-media function:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
