import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
  Timestamp: { now: vi.fn(() => "NOW") },
}));

describe("createLocalPartnerFromGlobal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reuses existing local partner by globalPartnerId", async () => {
    const partnersCollection = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ id: "local-existing" }],
      }),
      add: vi.fn(),
    };

    const globalCollection = {
      doc: vi.fn(),
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === "partners") return partnersCollection;
        if (name === "globalPartners") return globalCollection;
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    vi.mocked(getFirestore).mockReturnValue(db as unknown as FirebaseFirestore.Firestore);

    const { createLocalPartnerFromGlobal } = await import("../createLocalPartnerFromGlobal");

    const result = await createLocalPartnerFromGlobal("user-1", "global-1");

    expect(result).toBe("local-existing");
    expect(partnersCollection.add).not.toHaveBeenCalled();
    expect(globalCollection.doc).not.toHaveBeenCalled();
  });

  it("creates local partner when none exists", async () => {
    const partnersCollection = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: true,
        docs: [],
      }),
      add: vi.fn().mockResolvedValue({ id: "local-new" }),
    };

    const globalDoc = {
      exists: true,
      data: () => ({
        name: "Global Co",
        aliases: ["Global"],
        website: "global.test",
        vatId: "VAT123",
        country: "DE",
        ibans: ["DE123"],
        address: "Main Street 1",
      }),
    };

    const globalCollection = {
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(globalDoc),
      }),
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === "partners") return partnersCollection;
        if (name === "globalPartners") return globalCollection;
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };

    vi.mocked(getFirestore).mockReturnValue(db as unknown as FirebaseFirestore.Firestore);

    const { createLocalPartnerFromGlobal } = await import("../createLocalPartnerFromGlobal");

    const result = await createLocalPartnerFromGlobal("user-1", "global-1");

    expect(result).toBe("local-new");
    expect(partnersCollection.add).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Global Co",
      aliases: ["Global"],
      website: "global.test",
      vatId: "VAT123",
      country: "DE",
      ibans: ["DE123"],
      address: "Main Street 1",
      isActive: true,
      globalPartnerId: "global-1",
      createdAt: "NOW",
      updatedAt: "NOW",
      createdBy: "auto_partner_match",
    });
  });
});
