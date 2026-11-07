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

async function testDispatchCreation() {
  console.log('--- 1. Creating Dispatch Manifest for Order #10048 ---');
  const manifestNum = `DSP-VRV-${Math.floor(100 + Math.random() * 900)}`;

  // 1. Insert Dispatch
  const dspRes = await fetch(`${url}/rest/v1/dispatches`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      manifest_number: manifestNum,
      vehicle_number: 'KL-08-AX-4412',
      driver_id: driverId,
      driver_name: 'Ice Spot Delivery Staff',
      driver_phone: '+91 98460 11223',
      dispatch_date: new Date().toISOString().split('T')[0],
      status: 'scheduled',
      notes: 'Phase 5 Lifecycle Dispatch Audit'
    })
  });

  const dspData = await dspRes.json();
  console.log('Dispatch created:', dspData);
  const dispatchId = dspData[0].id;

  // 2. Insert Route Stop in dispatch_orders
  const stopRes = await fetch(`${url}/rest/v1/dispatch_orders`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      dispatch_id: dispatchId,
      order_id: orderId,
      sequence: 1,
      status: 'pending'
    })
  });
  console.log('Stop created:', await stopRes.json());

  // 3. Update order status to dispatched
  const ordUpd = await fetch(`${url}/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      status: 'dispatched',
      assigned_dispatch_id: dispatchId,
      updated_at: new Date().toISOString()
    })
  });
  console.log('Order updated to dispatched:', await ordUpd.json());

  // 4. Audit Log
  const auditRes = await fetch(`${url}/rest/v1/audit_logs`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      actor_id: parsed.user.id,
      action: 'CREATE_DISPATCH',
      entity_type: 'dispatch',
      entity_id: dispatchId,
      details: { manifestNumber: manifestNum, orderIds: [orderId] }
    })
  });
  console.log('Audit log inserted:', auditRes.status);
}

testDispatchCreation();
