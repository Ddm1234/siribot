import fs from "fs";
import os from "os";
import path from "path";

const authFile = path.join(os.homedir(), ".opensea", "auth.json");
const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));

const wallets = Object.values(auth.tokens);
const slug = process.argv[2];

if (!slug) {
  console.log("Usage: node wallet-check.js <drop-slug>");
  process.exit(1);
}

// Get stage names/details
const dropResponse = await fetch(
  `https://api.opensea.io/api/v2/drops/${slug}`,
  {
    headers: {
      "X-API-KEY": process.env.OPENSEA_API_KEY
    }
  }
);

const dropData = await dropResponse.json();

if (!dropResponse.ok) {
  console.log("Drop details error:", dropResponse.status);
  process.exit(1);
}

const normalizeUuid = value =>
  String(value ?? "").replaceAll("-", "").toLowerCase();

const stages = new Map(
  (dropData.stages ?? []).map(stage => [
    normalizeUuid(stage.uuid ?? stage.stageUuid ?? stage.stage_uuid),
    stage
  ])
);

for (const wallet of wallets) {
  const response = await fetch(
    `https://api.opensea.io/api/v2/drops/${slug}/eligibility`,
    {
      headers: {
        "X-API-KEY": process.env.OPENSEA_API_KEY,
        "Authorization": `Bearer ${wallet.accessToken}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.log(`\nChecking: ${wallet.address}`);
    console.log("Error:", response.status);
    continue;
  }

  for (const stage of data.stages ?? []) {
    const details = stages.get(normalizeUuid(stage.stage_uuid));

    if (!stage.is_eligible || details?.stage_type === "public_sale") {
      continue;
    }

    console.log("\n🔔 WL ELIGIBLE");
    console.log("Wallet:", wallet.address);
    console.log("Phase:", details?.label ?? "Unknown");
    console.log("Stage type:", details?.stage_type ?? "Unknown");
    console.log("Price:", stage.price);
    console.log("Max:", stage.max_total_mintable_by_wallet);
  }
}
