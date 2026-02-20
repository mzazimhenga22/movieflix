require('dotenv').config();
const fetch = require('node-fetch');

async function main() {
  console.log('--- Debugging Admin Payments ---');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log('Checking Environment Variables...');
  if (!supabaseUrl) {
    console.error('❌ EXPO_PUBLIC_SUPABASE_URL is missing.');
  } else {
    console.log(`✅ EXPO_PUBLIC_SUPABASE_URL found: ${supabaseUrl}`);
  }

  if (!supabaseKey) {
    console.error('❌ EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.');
  } else {
    console.log('✅ EXPO_PUBLIC_SUPABASE_ANON_KEY found.');
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️ Cannot proceed with Supabase connectivity test without env vars.');
    return;
  }

  const cleanUrl = supabaseUrl.replace(/\/$/, '');
  const functionUrl = `${cleanUrl}/functions/v1/paybill`;

  console.log(`\nTesting connectivity to: ${functionUrl}`);

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'ping' }),
    });

    console.log(`Response Status: ${res.status} ${res.statusText}`);

    if (res.status === 404) {
      console.error('❌ Error: The "paybill" function was not found (404). Is it deployed?');
    } else if (res.status === 503) {
      console.error('❌ Error: Service Unavailable (503). Supabase might be paused or restarting.');
    } else if (res.status >= 500) {
      console.error('❌ Error: Server Error. The function might be crashing.');
    } else if (res.status === 401 || res.status === 403) {
      console.log('✅ Connectivity confirmed (401/403 is expected without valid auth).');
    } else if (res.status === 400) {
      console.log('✅ Connectivity confirmed (400 is expected for invalid payload).');
    } else {
      console.log('✅ Connectivity confirmed (Received valid response).');
    }

    const text = await res.text();
    console.log('Response Body:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));

  } catch (err) {
    console.error('❌ Network request failed:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}

main().catch(console.error);
