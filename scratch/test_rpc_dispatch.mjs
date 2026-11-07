import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anon = env.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim();
const rawCookie = process.env.TEST_RAW_SESSION_COOKIE || '';
if (!rawCookie) {
  console.error("FATAL: TEST_RAW_SESSION_COOKIE environment variable is not defined.");
  process.exit(1);
}
const parsed = JSON.parse(Buffer.from(rawCookie, 'base64').toString());
const token = parsed.access_token;
const orderId = '5b38df8e-1003-404b-9913-6b37f15fad00';
const driverId = '8d0ddf94-9a2b-4ecf-816e-093f250f11c5';

async function testDispatch() {
  console.log('Testing rpc_create_dispatch with auto-aggregated items:');
  const res = await fetch(`${url}/rest/v1/rpc/rpc_create_dispatch`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_order_ids: [orderId],
      p_delivery_staff_id: driverId,
      p_notes: 'Phase 5 Lifecycle E2E Dispatch',
      p_items: null,
      p_vehicle_number: 'KL-08-AX-4412',
      p_departure_time: '07:45 AM',
      p_loading_bay: 'Bay #2'
    })
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

testDispatch();
