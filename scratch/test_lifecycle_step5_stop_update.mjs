import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anon = env.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim();
const rawCookie = process.env.TEST_RAW_SESSION_COOKIE || "";
if (!rawCookie) {
  console.error("FATAL: TEST_RAW_SESSION_COOKIE environment variable is not defined.");
  process.exit(1);
}
const parsed = JSON.parse(Buffer.from(rawCookie, "base64").toString());
const token = parsed.access_token;

const DISPATCH_ID = "0680560c-5932-43a1-ad4c-9e9b875702e6";
const ORDER_ID = "5b38df8e-1003-404b-9913-6b37f15fad00";

async function run() {
  console.log("=== Testing Lifecycle Step 5: Stop Status Update ===");
  console.log("Dispatch ID:", DISPATCH_ID);
  console.log("Order ID:", ORDER_ID);

  // 1. Transition stop to 'reached'
  console.log("\n1. Calling rpc_update_delivery_stop to 'reached'...");
  let res = await fetch(`${url}/rest/v1/rpc/rpc_update_delivery_stop`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_dispatch_id: DISPATCH_ID,
      p_order_id: ORDER_ID,
      p_status: "reached",
      p_notes: "Vehicle arrived at Ollur branch gate",
      p_delivered_items: null,
    }),
  });

  let data = await res.json();
  console.log("Status response (reached):", res.status, data);

  // 2. Query dispatch_orders to confirm stop status in ice_spot_dev
  const checkStopRes = await fetch(
    `${url}/rest/v1/dispatch_orders?dispatch_id=eq.${DISPATCH_ID}&order_id=eq.${ORDER_ID}`,
    {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const stopRows = await checkStopRes.json();
  console.log("dispatch_orders row:", stopRows);

  // 3. Transition stop to 'delivered'
  console.log("\n2. Calling rpc_update_delivery_stop to 'delivered'...");
  res = await fetch(`${url}/rest/v1/rpc/rpc_update_delivery_stop`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_dispatch_id: DISPATCH_ID,
      p_order_id: ORDER_ID,
      p_status: "delivered",
      p_notes: "All 126 crates delivered intact to cold room",
      p_delivered_items: null,
    }),
  });

  data = await res.json();
  console.log("Status response (delivered):", res.status, data);

  // 4. Query orders table to verify status synchronization
  const checkOrderRes = await fetch(`${url}/rest/v1/orders?id=eq.${ORDER_ID}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
  });
  const orderRows = await checkOrderRes.json();
  console.log("orders row status:", orderRows[0]?.status, "updated_at:", orderRows[0]?.updated_at);
}

run().catch(console.error);
