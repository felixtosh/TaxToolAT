/**
 * #239: a Match scored against a Transaction's Remainder is a suggestion,
 * whatever its Confidence.
 *
 * The pair this guards is the split part-invoice: a 500,00 bank line already
 * carrying a 285,80 invoice, and a 214,20 document that closes it. Scored
 * against the Remainder it is a cent-exact, same-day, same-partner hit — well
 * past AUTO_MATCH_THRESHOLD — so nothing in the Confidence stops it connecting
 * itself. The gate does, until #242 decides the same-day exception.
 *
 * The matcher calls getFirestore()/getAuth() at import time and registers a
 * trigger, so the Firebase surface is swapped for an in-memory fake, the same
 * shape dismissedSuggestions.test.ts uses. Timestamp/FieldValue stay real —
 * scoring does date math on them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    transactions: [] as Array<{ id: string; data: Record<string, unknown> }>,
    files: new Map<string, Record<string, unknown>>(),
    fileUpdates: [] as Record<string, unknown>[],
    batchWrites: [] as Array<{ collection: string; data: Record<string, unknown> }>,
  };
  return { state };
});

vi.mock("firebase-admin/firestore", async () => {
  const actual = await import("@google-cloud/firestore");
  const { state } = h;

  const snap = (id: string, data: Record<string, unknown> | undefined) => ({
    id,
    exists: data !== undefined,
    data: () => data,
  });

  const query = (collection: string) => {
    // Two filtered reads matter here, both inside loadDocumentedAmounts:
    // `where("transactionId", "in", [...])` over fileConnections, and
    // `where("__name__", "in", [...])` over the files those name. Everything
    // else is answered from the seeded state regardless of the clauses.
    let ids: string[] | null = null;
    let transactionIds: string[] | null = null;
    const q = {
      where: (field: string, _op: string, value: unknown) => {
        if (field === "__name__") ids = value as string[];
        if (field === "transactionId") transactionIds = value as string[];
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        if (collection === "transactions") {
          const docs = state.transactions.map((t) => snap(t.id, t.data));
          return { docs, empty: docs.length === 0 };
        }
        if (collection === "fileConnections") {
          // Connections are materialised from the `fileIds` a test seeds on its
          // transactions: one row per connected File, which is the shape
          // production stores. The seed stays readable, and the code under test
          // still goes through the real `fileConnections` read.
          const wanted = transactionIds;
          const docs = state.transactions
            .filter((t) => !wanted || wanted.includes(t.id))
            .flatMap((t) =>
              ((t.data.fileIds as string[] | undefined) ?? []).map((fileId) =>
                snap(`${t.id}:${fileId}`, { transactionId: t.id, fileId })
              )
            );
          return { docs, empty: docs.length === 0 };
        }
        if (collection === "files" && ids) {
          const docs = ids
            .filter((id) => state.files.has(id))
            .map((id) => snap(id, state.files.get(id)));
          return { docs, empty: docs.length === 0 };
        }
        return { docs: [], empty: true };
      },
    };
    return q;
  };

  const docRef = (collection: string, id: string) => ({
    id,
    _collection: collection,
    get: async () => {
      if (collection === "files") return snap(id, state.files.get(id));
      if (collection === "transactions") {
        return snap(id, state.transactions.find((t) => t.id === id)?.data);
      }
      return snap(id, undefined);
    },
    update: async (data: Record<string, unknown>) => {
      if (collection === "files") state.fileUpdates.push(data);
    },
    set: async () => undefined,
  });

  const collection = (name: string) => ({
    ...query(name),
    doc: (id?: string) => docRef(name, id ?? `generated-${state.batchWrites.length}`),
    add: async () => ({ id: "notification" }),
  });

  return {
    getFirestore: () => ({
      collection,
      batch: () => ({
        set: (ref: { _collection: string }, data: Record<string, unknown>) => {
          state.batchWrites.push({ collection: ref._collection, data });
        },
        update: (ref: { _collection: string }, data: Record<string, unknown>) => {
          if (ref._collection === "files") state.fileUpdates.push(data);
        },
        commit: async () => undefined,
      }),
    }),
    Timestamp: actual.Timestamp,
    FieldValue: actual.FieldValue,
  };
});

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ getUser: async () => ({ customClaims: {} }) }),
}));
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentUpdated: () => ({}),
}));

// Active mode: the auto-connect decision this test is about actually runs.
vi.mock("../../utils/checkAutomationMode", () => ({
  isPassiveMode: async () => false,
}));

// Budget exhausted: the rule-based scoring above is free and unaffected, and
// the agentic follow-up stays out of the way.
vi.mock("../../billing/checkAIBudget", () => ({
  checkAIBudget: async () => ({ allowed: false }),
}));

import { Timestamp } from "@google-cloud/firestore";
import { runTransactionMatching } from "../matchFileTransactions";

const USER = "u1";
const DATE = new Date("2026-07-01T00:00:00Z");

function tx(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      userId: USER,
      date: Timestamp.fromDate(DATE),
      amount: -50000,
      currency: "EUR",
      name: "Hetzner Online GmbH",
      partner: "Hetzner Online GmbH",
      fileIds: [],
      ...over,
    },
  };
}

/** The 214,20 candidate: same day, same partner name, closes the remainder. */
function candidate(over: Record<string, unknown> = {}) {
  return {
    userId: USER,
    fileName: "hetzner-part-2.pdf",
    extractionComplete: true,
    extractedAmount: 21420,
    extractedCurrency: "EUR",
    extractedDate: Timestamp.fromDate(DATE),
    extractedPartner: "Hetzner Online GmbH",
    transactionIds: [],
    ...over,
  };
}

function suggestionsWritten(): Array<{
  transactionId: string;
  confidence: number;
  matchSources: string[];
}> {
  const withSuggestions = h.state.fileUpdates.filter((u) => u.transactionSuggestions);
  return (withSuggestions.at(-1)?.transactionSuggestions ?? []) as Array<{
    transactionId: string;
    confidence: number;
    matchSources: string[];
  }>;
}

function connectionsCreated() {
  return h.state.batchWrites.filter((w) => w.collection === "fileConnections");
}

beforeEach(() => {
  h.state.transactions = [];
  h.state.files.clear();
  h.state.fileUpdates = [];
  h.state.batchWrites = [];
});

describe("runTransactionMatching: a remainder match is a suggestion only (#239)", () => {
  beforeEach(() => {
    // 500,00 line with a 285,80 invoice already on it: 214,20 open.
    h.state.transactions = [tx("t-split", { fileIds: ["f-existing"] })];
    h.state.files.set("f-existing", {
      userId: USER,
      extractedAmount: 28580,
      extractedCurrency: "EUR",
    });
  });

  it("suggests the file that closes the remainder", async () => {
    await runTransactionMatching("f-candidate", candidate());

    const suggested = suggestionsWritten();
    expect(suggested.map((s) => s.transactionId)).toEqual(["t-split"]);
    expect(suggested[0].matchSources).toContain("amount_remainder");
  });

  it("does not auto-connect it, even past the auto-match threshold", async () => {
    await runTransactionMatching("f-candidate", candidate());

    // Cent-exact + same day + partner: comfortably above 85, and still only a
    // suggestion. The Confidence is not what holds it back.
    expect(suggestionsWritten()[0].confidence).toBeGreaterThanOrEqual(85);
    expect(connectionsCreated()).toEqual([]);
    expect(h.state.fileUpdates.some((u) => u.transactionIds)).toBe(false);
  });

  it("still auto-connects the same file to a line that holds nothing", async () => {
    h.state.transactions = [tx("t-open", { amount: -21420 })];
    h.state.files.clear();

    await runTransactionMatching("f-candidate", candidate());

    expect(connectionsCreated()).toHaveLength(1);
    expect(connectionsCreated()[0].data.transactionId).toBe("t-open");
  });

  it("scores a fully documented line on its full amount again", async () => {
    h.state.files.set("f-existing", {
      userId: USER,
      extractedAmount: 50000,
      extractedCurrency: "EUR",
    });

    await runTransactionMatching("f-candidate", candidate());

    // Nothing is left over, so the 214,20 is judged against the whole 500,00
    // and earns no amount points at all. It survives on date and partner, and
    // is not a Remainder Match — the Coverage gate keeps it from connecting.
    const suggested = suggestionsWritten();
    expect(suggested.map((s) => s.transactionId)).toEqual(["t-split"]);
    expect(suggested[0].matchSources).not.toContain("amount_remainder");
    expect(suggested[0].matchSources).not.toContain("amount_exact");
    expect(connectionsCreated()).toEqual([]);
  });
});
