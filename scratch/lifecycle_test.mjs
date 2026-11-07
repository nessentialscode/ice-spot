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

async function checkState() {
  console.log('--- 1. ORDER 10048 STATUS ---');
  const ordRes = await fetch(`${url}/rest/v1/orders?id=eq.5b38df8e-1003-404b-9913-6b37f15fad00&select=*`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  const orders = await ordRes.json();
  console.log(orders[0]);

  console.log('\n--- 2. FACTORY INVENTORY (branch_id is null) ---');
  const invRes = await fetch(`${url}/rest/v1/inventory?branch_id=is.null&select=product_id,quantity,reserved_quantity`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  const inv = await invRes.json();
  console.log('Factory inventory items count:', inv.length);
  if (inv.length > 0) {
    console.log(inv.slice(0, 5));
  }
}

checkState();
