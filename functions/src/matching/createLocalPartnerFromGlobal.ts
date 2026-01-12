import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

/**
 * Create a local user partner copy from a global partner.
 */
export async function createLocalPartnerFromGlobal(
  userId: string,
  globalPartnerId: string
): Promise<string> {
  const existingSnapshot = await db
    .collection("partners")
    .where("userId", "==", userId)
    .where("globalPartnerId", "==", globalPartnerId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!existingSnapshot.empty) {
    return existingSnapshot.docs[0].id;
  }

  const globalDoc = await db.collection("globalPartners").doc(globalPartnerId).get();
  if (!globalDoc.exists) {
    throw new Error(`Global partner ${globalPartnerId} not found`);
  }

  const globalData = globalDoc.data()!;

  const partnerData: Record<string, unknown> = {
    userId,
    name: globalData.name,
    aliases: globalData.aliases || [],
    website: globalData.website || null,
    vatId: globalData.vatId || null,
    country: globalData.country || null,
    ibans: globalData.ibans || [],
    address: globalData.address || null,
    isActive: true,
    globalPartnerId: globalPartnerId, // Link to global
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "auto_partner_match",
  };

  const docRef = await db.collection("partners").add(partnerData);
  console.log(`[PartnerMatch] Created local partner ${docRef.id} from global ${globalPartnerId}`);
  return docRef.id;
}
