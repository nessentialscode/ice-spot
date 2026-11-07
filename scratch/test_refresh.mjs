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

async function refresh() {
  console.log("Refreshing token using refresh_token...");
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: parsed.refresh_token,
    }),
  });

  const data = await res.json();
  console.log("Refresh response status:", res.status);
  if (data.access_token) {
    console.log("Got fresh access token!");
    // save to scratch/session.json
    fs.writeFileSync("scratch/session.json", JSON.stringify(data, null, 2));
  } else {
    console.log("Refresh error:", data);
  }
}

refresh().catch(console.error);
