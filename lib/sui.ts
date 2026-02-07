import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";

const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const MODULE = "badge";
const RPC_URL = getJsonRpcFullnodeUrl("testnet");

function getClient() {
  return new SuiJsonRpcClient({ url: RPC_URL });
}

function getAdminKeypair(): Ed25519Keypair {
  const secretKey = process.env.SUI_ADMIN_SECRET_KEY;
  if (!secretKey) throw new Error("Missing SUI_ADMIN_SECRET_KEY");
  const raw = fromBase64(secretKey);
  // Sui keystore format: first byte is scheme flag (0 = Ed25519), rest is the 32-byte secret key
  return Ed25519Keypair.fromSecretKey(raw.slice(1));
}

export async function mintBadge(artistAddress: string): Promise<{
  digest: string;
  badgeId: string | null;
}> {
  const client = getClient();
  const keypair = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::mint_badge`,
    arguments: [tx.pure.address(artistAddress)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  // Wait for transaction to finalize and get created objects
  const txDetails = await client.waitForTransaction({
    digest: result.digest,
    options: { showObjectChanges: true },
  });

  // Find the created FanBadge object ID
  let badgeId: string | null = null;
  if (txDetails.objectChanges) {
    for (const change of txDetails.objectChanges) {
      if (
        change.type === "created" &&
        change.objectType.includes("::badge::FanBadge")
      ) {
        badgeId = change.objectId;
        break;
      }
    }
  }

  return { digest: result.digest, badgeId };
}

export async function addListenTime(
  badgeObjectId: string,
  seconds: number
): Promise<string> {
  const client = getClient();
  const keypair = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::add_listen_time`,
    arguments: [tx.object(badgeObjectId), tx.pure.u64(seconds)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

export async function updateTier(badgeObjectId: string): Promise<string> {
  const client = getClient();
  const keypair = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::update_tier`,
    arguments: [tx.object(badgeObjectId)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

export async function getBadge(badgeObjectId: string) {
  const client = getClient();
  const result = await client.getObject({
    id: badgeObjectId,
    options: { showContent: true },
  });

  if (!result.data?.content || result.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = result.data.content.fields as Record<string, unknown>;
  return {
    id: badgeObjectId,
    artistId: fields.artist_id as string,
    fan: fields.fan as string,
    listenSeconds: parseInt(fields.listen_seconds as string),
    tier: parseInt(fields.tier as string),
  };
}

export async function getOwnedBadges(ownerAddress: string) {
  const client = getClient();
  const result = await client.getOwnedObjects({
    owner: ownerAddress,
    filter: {
      StructType: `${PACKAGE_ID}::${MODULE}::FanBadge`,
    },
    options: { showContent: true },
  });

  return result.data
    .filter(
      (obj) =>
        obj.data?.content && obj.data.content.dataType === "moveObject"
    )
    .map((obj) => {
      const fields = (obj.data!.content as { fields: Record<string, unknown> })
        .fields;
      return {
        id: obj.data!.objectId,
        artistId: fields.artist_id as string,
        fan: fields.fan as string,
        listenSeconds: parseInt(fields.listen_seconds as string),
        tier: parseInt(fields.tier as string),
      };
    });
}

// Badge tier thresholds in seconds
export const BADGE_THRESHOLDS = {
  bronze: 60, // 1 minute
  silver: 3600, // 1 hour
  gold: 36000, // 10 hours
} as const;

export function getTierForSeconds(seconds: number): number {
  if (seconds >= BADGE_THRESHOLDS.gold) return 3;
  if (seconds >= BADGE_THRESHOLDS.silver) return 2;
  if (seconds >= BADGE_THRESHOLDS.bronze) return 1;
  return 0; // no badge yet
}

export function getTierName(tier: number): string {
  switch (tier) {
    case 1:
      return "Bronze";
    case 2:
      return "Silver";
    case 3:
      return "Gold";
    default:
      return "None";
  }
}
