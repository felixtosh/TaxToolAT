"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const firestore_1 = require("firebase-admin/firestore");
vitest_1.vi.mock("firebase-admin/firestore", () => ({
    getFirestore: vitest_1.vi.fn(),
    Timestamp: { now: vitest_1.vi.fn(() => "NOW") },
}));
(0, vitest_1.describe)("createLocalPartnerFromGlobal", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("reuses existing local partner by globalPartnerId", async () => {
        const partnersCollection = {
            where: vitest_1.vi.fn().mockReturnThis(),
            limit: vitest_1.vi.fn().mockReturnThis(),
            get: vitest_1.vi.fn().mockResolvedValue({
                empty: false,
                docs: [{ id: "local-existing" }],
            }),
            add: vitest_1.vi.fn(),
        };
        const globalCollection = {
            doc: vitest_1.vi.fn(),
        };
        const db = {
            collection: vitest_1.vi.fn((name) => {
                if (name === "partners")
                    return partnersCollection;
                if (name === "globalPartners")
                    return globalCollection;
                throw new Error(`Unexpected collection: ${name}`);
            }),
        };
        vitest_1.vi.mocked(firestore_1.getFirestore).mockReturnValue(db);
        const { createLocalPartnerFromGlobal } = await Promise.resolve().then(() => __importStar(require("../createLocalPartnerFromGlobal")));
        const result = await createLocalPartnerFromGlobal("user-1", "global-1");
        (0, vitest_1.expect)(result).toBe("local-existing");
        (0, vitest_1.expect)(partnersCollection.add).not.toHaveBeenCalled();
        (0, vitest_1.expect)(globalCollection.doc).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("creates local partner when none exists", async () => {
        const partnersCollection = {
            where: vitest_1.vi.fn().mockReturnThis(),
            limit: vitest_1.vi.fn().mockReturnThis(),
            get: vitest_1.vi.fn().mockResolvedValue({
                empty: true,
                docs: [],
            }),
            add: vitest_1.vi.fn().mockResolvedValue({ id: "local-new" }),
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
            doc: vitest_1.vi.fn().mockReturnValue({
                get: vitest_1.vi.fn().mockResolvedValue(globalDoc),
            }),
        };
        const db = {
            collection: vitest_1.vi.fn((name) => {
                if (name === "partners")
                    return partnersCollection;
                if (name === "globalPartners")
                    return globalCollection;
                throw new Error(`Unexpected collection: ${name}`);
            }),
        };
        vitest_1.vi.mocked(firestore_1.getFirestore).mockReturnValue(db);
        const { createLocalPartnerFromGlobal } = await Promise.resolve().then(() => __importStar(require("../createLocalPartnerFromGlobal")));
        const result = await createLocalPartnerFromGlobal("user-1", "global-1");
        (0, vitest_1.expect)(result).toBe("local-new");
        (0, vitest_1.expect)(partnersCollection.add).toHaveBeenCalledWith({
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
//# sourceMappingURL=createLocalPartnerFromGlobal.test.js.map