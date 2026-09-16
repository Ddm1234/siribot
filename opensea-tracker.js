const OPENSEA_API = 'https://api.opensea.io/api/v2';

const WALLETS = [
  {
    name: 'Siri',
    address: '0xce255af73049a3402a500b4cbb2efdbeddd0c998',
    pat: process.env.OPENSEA_WALLET1_PAT,
    apiKey: process.env.OPENSEA_SIRI_API_KEY,
    webhook: process.env.DISCORD_WEBHOOK_SIRI,
  },
  {
    name: 'Dharam',
    address: '0x273a9814591076e6e0e5f60715e5ece252c23374',
    pat: process.env.OPENSEA_WALLET2_PAT,
    apiKey: process.env.OPENSEA_DHARAM_API_KEY,
    webhook: process.env.DISCORD_WEBHOOK_DHARAM,
  },
];

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function exchangeToken(wallet) {
  required(wallet.pat, `${wallet.name} PAT`);

  const response = await fetch(`${OPENSEA_API}/auth/tokens/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subjectToken: wallet.pat,
      subjectTokenType: 'ACCESS_TOKEN',
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `${wallet.name} token exchange failed: HTTP ${response.status}`
    );
  }

  const data = JSON.parse(body);

  if (!data.accessToken) {
    throw new Error(`${wallet.name}: no accessToken returned`);
  }

  return data.accessToken;
}

async function openSeaGet(path, apiKey, accessToken = null) {
  const headers = {
    'X-API-KEY': required(apiKey, 'OpenSea API key'),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${OPENSEA_API}${path}`, { headers });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`OpenSea GET ${path} failed: HTTP ${response.status}`);
  }

  return JSON.parse(body);
}

async function getUpcomingDrops(apiKey) {
  const drops = [];
  let cursor = null;

  for (let page = 0; page < 5; page++) {
    let path = '/drops?type=upcoming&limit=100';

    if (cursor) {
      path += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const data = await openSeaGet(path, apiKey);

    if (Array.isArray(data.drops)) {
      drops.push(...data.drops);
    }

    cursor = data.next;

    if (!cursor) {
      break;
    }
  }

  return drops;
}

function normalizeId(value) {
  return String(value || '')
    .replaceAll('-', '')
    .toLowerCase();
}

function findStage(drop, stageId) {
  const wanted = normalizeId(stageId);

  return (drop.stages || []).find(
    stage => normalizeId(stage.stageId || stage.id || stage.uuid || stage.stage_uuid) === wanted
  );
}

function isPrivateStage(stage) {
  if (!stage) return false;

  const type = String(stage.stageType || stage.stage_type || '').toLowerCase();

  return type === 'signed_presale';
}

function formatPrice(stage) {
  const price = stage.price;

  if (price === undefined || price === null || price === '') {
    return 'Price unavailable';
  }

  if (typeof price === 'number') {
    return String(price);
  }

  if (typeof price === 'object') {
    if (price.amount !== undefined) {
      return `${price.amount} ${price.currency || ''}`.trim();
    }

    if (price.value !== undefined) {
      return `${price.value} ${price.currency || ''}`.trim();
    }
  }

  return String(price);
}

function stageLabel(stage) {
  return (
    stage.label ||
    stage.name ||
    stage.stageName ||
    stage.stageType ||
    'Private / WL'
  );
}

function dropName(drop) {
  return (
    drop.name ||
    drop.collectionName ||
    drop.collection?.name ||
    'Unknown OpenSea drop'
  );
}

function dropChain(drop) {
  const chain =
    drop.chain ||
    drop.chainName ||
    drop.chain_name ||
    drop.network ||
    drop.collection?.chain ||
    drop.collection?.chainName ||
    drop.collection?.chain_name ||
    'Unknown';

  const names = {
    ethereum: 'Ethereum',
    robinhood: 'Robinhood',
  };

  return names[String(chain).toLowerCase()] || String(chain);
}

function dropImage(drop) {
  return (
    drop.imageUrl ||
    drop.image_url ||
    drop.image ||
    drop.collection?.imageUrl ||
    drop.collection?.image_url ||
    null
  );
}

function dropUrl(drop) {
  if (drop.openseaUrl) return drop.openseaUrl;
  if (drop.opensea_url) return drop.opensea_url;

  const slug = drop.slug || drop.collectionSlug || drop.collection?.slug;

  return slug ? `https://opensea.io/drops/${slug}` : null;
}

function projectWebsite(drop) {
  return (
    drop.projectUrl ||
    drop.project_url ||
    drop.website ||
    drop.collection?.projectUrl ||
    drop.collection?.project_url ||
    null
  );
}

function projectSocial(drop) {
  return (
    drop.twitterUsername ||
    drop.twitter_username ||
    drop.collection?.twitterUsername ||
    drop.collection?.twitter_username ||
    null
  );
}

function stageStart(stage) {
  return (
    stage.startTime ||
    stage.start_time ||
    stage.startDate ||
    stage.start_date ||
    null
  );
}

function stageEnd(stage) {
  return (
    stage.endTime ||
    stage.end_time ||
    stage.endDate ||
    stage.end_date ||
    null
  );
}

function scheduleText(stage) {
  const start = stageStart(stage);
  const end = stageEnd(stage);

  if (!start && !end) return 'Schedule unavailable';

  if (start && end) {
    return `${start} → ${end}`;
  }

  return start ? `Starts: ${start}` : `Ends: ${end}`;
}

async function getWalletEligibility(wallet, accessToken, dropSlug) {
  return openSeaGet(
    `/drops/${encodeURIComponent(dropSlug)}/eligibility`,
    wallet.apiKey,
    accessToken
  );
}

async function sendDiscord(wallet, notification) {
  required(wallet.webhook, `${wallet.name} Discord webhook`);

  const fields = [
    {
      name: 'Wallet',
      value: `\`${wallet.address}\``,
      inline: false,
    },
    {
      name: 'WL Phase',
      value: notification.phase,
      inline: true,
    },
    {
      name: 'Price',
      value: notification.price,
      inline: true,
    },
    {
      name: 'Max Per Wallet',
      value: notification.maxPerWallet,
      inline: true,
    },
    {
      name: 'Schedule',
      value: notification.schedule,
      inline: false,
    },
  ];

  if (notification.website) {
    fields.push({
      name: 'Official Website',
      value: notification.website,
      inline: false,
    });
  }

  if (notification.twitter) {
    fields.push({
      name: 'X / Twitter',
      value: notification.twitter.startsWith('http')
        ? notification.twitter
        : `https://x.com/${notification.twitter.replace(/^@/, '')}`,
      inline: false,
    });
  }

  const payload = {
    username: 'OpenSea WL Tracker',
    embeds: [
      {
        title: `WL Eligible: ${notification.name}`,
        url: notification.url || undefined,
        description:
          `Wallet **${wallet.name}** is eligible for a private OpenSea mint phase.`,
        fields,
        thumbnail: notification.image
          ? { url: notification.image }
          : undefined,
      },
    ],
  };

  const response = await fetch(wallet.webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `${wallet.name} Discord notification failed: HTTP ${response.status}`
    );
  }
}

async function checkWallet(wallet, accessToken, drops) {
  const notifications = [];

  for (const summaryDrop of drops) {
    const slug =
      summaryDrop.collection_slug || summaryDrop.slug ||
      summaryDrop.collectionSlug ||
      summaryDrop.collection?.slug;

    if (!slug) continue;

    try {
      const details = await openSeaGet(
        `/drops/${encodeURIComponent(slug)}`,
        wallet.apiKey
      );

      const eligibility = await getWalletEligibility(
        wallet,
        accessToken,
        slug
      );

      const eligibleStages =
        eligibility.stages ||
        eligibility.eligibleStages ||
        eligibility.data ||
        [];

      for (const eligible of eligibleStages) {
        const eligibleId =
          eligible.stageId ||
          eligible.stage_id ||
          eligible.stage_uuid ||
          eligible.id ||
          eligible.uuid;

        const stage = findStage(details, eligibleId);

        if (!isPrivateStage(stage)) {
          continue;
        }

        notifications.push({
          name: dropName(details),
          chain: dropChain(details),
          slug,
          url: dropUrl(details),
          image: dropImage(details),
          website: projectWebsite(details),
          twitter: projectSocial(details),
          phase: stageLabel(stage),
          price: formatPrice(stage),
          maxPerWallet: String(
            stage.maxPerWallet ??
              stage.max_per_wallet ??
              eligible.maxPerWallet ??
              eligible.max_per_wallet ??
              'Unavailable'
          ),
          schedule: scheduleText(stage),
        });
      }
    } catch (error) {
      console.log(
        `[${wallet.name}] Skipping ${slug}: ${error.message}`
      );
    }
  }

  return notifications;
}

async function main() {
  console.log('OpenSea WL Tracker started');
  console.log('Read-only mode: no minting or transactions');

  const activeWallets = WALLETS.filter(
    wallet => wallet.pat && wallet.apiKey && wallet.webhook
  );

  if (activeWallets.length !== 2) {
    throw new Error(
      `Expected 2 configured wallets, found ${activeWallets.length}`
    );
  }

  const tokens = new Map();

  for (const wallet of activeWallets) {
    tokens.set(wallet.name, await exchangeToken(wallet));
    console.log(`[${wallet.name}] authentication successful`);
  }

  const discoveryKey = activeWallets[0].apiKey;
  const drops = await getUpcomingDrops(discoveryKey);

  console.log(`Upcoming drops discovered: ${drops.length}`);
  console.log("First drop keys:", Object.keys(drops[0] || {}).join(", "));

  for (const wallet of activeWallets) {
    const notifications = await checkWallet(
      wallet,
      tokens.get(wallet.name),
      drops
    );

    console.log(
      `[${wallet.name}] private eligible stages found: ${notifications.length}`
    );

    for (const notification of notifications) {
      console.log(
        `[${wallet.name}] ${notification.name} | ${notification.phase}`
      );

      // Notification sending will be connected to persistent
      // deduplication state in the GitHub Actions workflow.
    }
  }

  console.log('Tracker check completed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
