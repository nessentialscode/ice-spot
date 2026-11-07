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

async function approveTest() {
  console.log('--- Calling rpc_approve_order on Order #10048 ---');
  // Pass null for p_approved_items to approve in full
  const rpcRes = await fetch(`${url}/rest/v1/rpc/rpc_approve_order`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_approved_items: null,
      p_notes: 'Approved during Phase 5 E2E Audit'
    })
  });

  const status = rpcRes.status;
  const result = await rpcRes.json();
  console.log('HTTP status:', status);
  console.log('RPC result:', JSON.stringify(result, null, 2));

  // Check updated order
  const ordRes = await fetch(`${url}/rest/v1/orders?id=eq.${orderId}&select=*`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  console.log('\nUpdated order:', await ordRes.json());

  // Check generated invoice
  const invRes = await fetch(`${url}/rest/v1/invoices?order_id=eq.${orderId}&select=*,invoice_items(*)`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  console.log('\nGenerated invoice & items:', JSON.stringify(await invRes.json(), null, 2));
}

approveTest();
