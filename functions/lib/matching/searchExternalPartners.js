"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchExternalPartners = void 0;
const https_1 = require("firebase-functions/v2/https");
/**
 * Search external registries for company information
 *
 * Supported registries:
 * - JustizOnline (Austrian Firmenbuch) - for Austrian companies
 * - EU Company Registry (BRIS) - for EU companies
 *
 * TODO: Implement actual API calls to external registries
 */
exports.searchExternalPartners = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { query, country, registryType } = request.data;
    if (!query || query.length < 3) {
        throw new https_1.HttpsError("invalid-argument", "Search query must be at least 3 characters");
    }
    console.log("External partner search:", { query, country, registryType });
    // TODO: Implement actual registry searches
    // This is a stub that will be implemented later with:
    //
    // 1. JustizOnline (Austrian Firmenbuch):
    //    - API endpoint: https://justizonline.gv.at/jop/service/fba/search
    //    - Rate limited, requires careful handling
    //
    // 2. EU Company Registry (BRIS):
    //    - European Business Registers' Interconnection System
    //    - Requires API key and registration
    //
    // 3. VIES (VAT Information Exchange System):
    //    - For validating VAT numbers across EU
    //    - Can be used to verify company existence
    // For now, return empty results
    // The JustizOnline implementation provided by user should be integrated here
    const results = [];
    return {
        results,
        source: registryType || "none",
    };
});
//# sourceMappingURL=searchExternalPartners.js.map