"use strict";
/**
 * Test Setup for Cloud Functions
 *
 * Provides utilities for mocking Firebase services and testing callable functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = exports.InMemoryStore = void 0;
exports.createMockFirestore = createMockFirestore;
exports.createTestContext = createTestContext;
exports.setupTestHooks = setupTestHooks;
exports.createTestTransaction = createTestTransaction;
exports.createTestFile = createTestFile;
exports.createTestPartner = createTestPartner;
exports.createTestSource = createTestSource;
const vitest_1 = require("vitest");
// FieldValue imported for type reference only - not used directly in mocks
// ============================================================================
// FieldValue Handling
// ============================================================================
/**
 * Process FieldValue operations in update data
 */
function processFieldValues(existing, updates) {
    const result = { ...existing };
    for (const [key, value] of Object.entries(updates)) {
        if (value && typeof value === "object") {
            const constructorName = value.constructor?.name || "";
            if (constructorName === "ArrayUnionTransform" || constructorName.includes("ArrayUnion")) {
                // Handle FieldValue.arrayUnion
                const elements = value.elements || [];
                const currentArray = Array.isArray(result[key]) ? result[key] : [];
                result[key] = [...new Set([...currentArray, ...elements])];
            }
            else if (constructorName === "ArrayRemoveTransform" || constructorName.includes("ArrayRemove")) {
                // Handle FieldValue.arrayRemove
                const elements = value.elements || [];
                const currentArray = Array.isArray(result[key]) ? result[key] : [];
                result[key] = currentArray.filter((item) => !elements.includes(item));
            }
            else if (constructorName === "ServerTimestampTransform" || constructorName.includes("Timestamp")) {
                result[key] = new Date();
            }
            else if (constructorName === "DeleteTransform" || constructorName.includes("Delete")) {
                delete result[key];
            }
            else {
                // Regular object value
                result[key] = value;
            }
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
// ============================================================================
// In-Memory Store
// ============================================================================
/**
 * In-memory document store for testing
 */
class InMemoryStore {
    constructor() {
        this.collections = new Map();
        this.autoIdCounter = 0;
    }
    clear() {
        this.collections.clear();
        this.autoIdCounter = 0;
    }
    getCollection(name) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new Map());
        }
        return this.collections.get(name);
    }
    generateId() {
        return `auto_${++this.autoIdCounter}`;
    }
    setDoc(collection, id, data) {
        this.getCollection(collection).set(id, { ...data });
    }
    getDoc(collection, id) {
        return this.getCollection(collection).get(id);
    }
    deleteDoc(collection, id) {
        this.getCollection(collection).delete(id);
    }
    queryDocs(collection, filters) {
        const col = this.getCollection(collection);
        const results = [];
        for (const [id, data] of col) {
            let matches = true;
            if (filters) {
                for (const filter of filters) {
                    const fieldValue = data[filter.field];
                    switch (filter.op) {
                        case "==":
                            if (fieldValue !== filter.value)
                                matches = false;
                            break;
                        case "!=":
                            if (fieldValue === filter.value)
                                matches = false;
                            break;
                        case ">":
                            if (!(fieldValue > filter.value))
                                matches = false;
                            break;
                        case "<":
                            if (!(fieldValue < filter.value))
                                matches = false;
                            break;
                        case "array-contains":
                            if (!Array.isArray(fieldValue) || !fieldValue.includes(filter.value))
                                matches = false;
                            break;
                    }
                }
            }
            if (matches) {
                results.push({ id, data: { ...data } });
            }
        }
        return results;
    }
}
exports.InMemoryStore = InMemoryStore;
// Global store instance
exports.store = new InMemoryStore();
// ============================================================================
// Create Mock Firestore
// ============================================================================
function createMockFirestore() {
    const createDocRef = (collection, id) => ({
        id,
        _collection: collection, // Track collection for batch operations
        get: async () => {
            const data = exports.store.getDoc(collection, id);
            return {
                id,
                exists: !!data,
                data: () => data,
                ref: createDocRef(collection, id),
            };
        },
        set: async (data) => {
            exports.store.setDoc(collection, id, data);
        },
        update: async (data) => {
            const existing = exports.store.getDoc(collection, id);
            if (existing) {
                exports.store.setDoc(collection, id, processFieldValues(existing, data));
            }
        },
        delete: async () => {
            exports.store.deleteDoc(collection, id);
        },
    });
    const createQuery = (collection, filters = []) => ({
        where: (field, op, value) => {
            return createQuery(collection, [...filters, { field, op, value }]);
        },
        orderBy: () => createQuery(collection, filters),
        limit: () => createQuery(collection, filters),
        get: async () => {
            const results = exports.store.queryDocs(collection, filters);
            return {
                empty: results.length === 0,
                size: results.length,
                docs: results.map((r) => ({
                    id: r.id,
                    exists: true,
                    data: () => r.data,
                    ref: createDocRef(collection, r.id),
                })),
            };
        },
    });
    const createCollectionRef = (name) => ({
        doc: (id) => createDocRef(name, id || exports.store.generateId()),
        add: async (data) => {
            const id = exports.store.generateId();
            exports.store.setDoc(name, id, data);
            return createDocRef(name, id);
        },
        where: (field, op, value) => createQuery(name, [{ field, op, value }]),
    });
    return {
        collection: (name) => createCollectionRef(name),
        batch: () => {
            const operations = [];
            const batch = {
                set: (ref, data) => {
                    const collection = ref._collection || "unknown";
                    operations.push(() => exports.store.setDoc(collection, ref.id, data));
                    return batch;
                },
                update: (ref, data) => {
                    const collection = ref._collection || "unknown";
                    operations.push(() => {
                        const existing = exports.store.getDoc(collection, ref.id);
                        if (existing) {
                            exports.store.setDoc(collection, ref.id, processFieldValues(existing, data));
                        }
                    });
                    return batch;
                },
                delete: (ref) => {
                    const collection = ref._collection || "unknown";
                    operations.push(() => exports.store.deleteDoc(collection, ref.id));
                    return batch;
                },
                commit: async () => {
                    for (const op of operations) {
                        op();
                    }
                },
            };
            return batch;
        },
        runTransaction: async (fn) => {
            const tx = {
                get: async (ref) => ref.get(),
                set: (ref, data) => {
                    const collection = ref._collection || "unknown";
                    exports.store.setDoc(collection, ref.id, data);
                    return tx;
                },
                update: (ref, data) => {
                    const collection = ref._collection || "unknown";
                    const existing = exports.store.getDoc(collection, ref.id);
                    if (existing) {
                        exports.store.setDoc(collection, ref.id, processFieldValues(existing, data));
                    }
                    return tx;
                },
                delete: (ref) => {
                    const collection = ref._collection || "unknown";
                    exports.store.deleteDoc(collection, ref.id);
                    return tx;
                },
            };
            return fn(tx);
        },
    };
}
function createTestContext(userId, data = {}) {
    return {
        userId,
        db: createMockFirestore(),
        request: {
            auth: { uid: userId },
            data,
        },
        logAIUsage: vitest_1.vi.fn(),
    };
}
// ============================================================================
// Test Lifecycle Hooks
// ============================================================================
function setupTestHooks() {
    (0, vitest_1.beforeEach)(() => {
        exports.store.clear();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
}
// ============================================================================
// Test Data Generators
// ============================================================================
function createTestTransaction(overrides = {}) {
    return {
        userId: "test-user",
        sourceId: "test-source",
        date: new Date("2024-01-15"),
        amount: -100,
        currency: "EUR",
        name: "Test Transaction",
        description: null,
        partner: "Test Partner",
        reference: "REF123",
        partnerIban: null,
        dedupeHash: "hash123",
        fileIds: [],
        isComplete: false,
        partnerId: null,
        partnerType: null,
        partnerMatchedBy: null,
        partnerMatchConfidence: null,
        partnerSuggestions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
function createTestFile(overrides = {}) {
    return {
        userId: "test-user",
        fileName: "test-invoice.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
        storagePath: "files/test-user/test.pdf",
        downloadUrl: "https://storage.example.com/test.pdf",
        extractionComplete: false,
        transactionIds: [],
        uploadedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
function createTestPartner(overrides = {}) {
    return {
        userId: "test-user",
        name: "Test Partner",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
function createTestSource(overrides = {}) {
    return {
        userId: "test-user",
        name: "Test Bank Account",
        accountKind: "checking",
        iban: "DE89370400440532013000",
        currency: "EUR",
        type: "manual",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
//# sourceMappingURL=setup.js.map