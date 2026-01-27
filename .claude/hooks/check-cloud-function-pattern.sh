#!/bin/bash
# Hook to enforce that scoring/matching logic uses Cloud Functions, not local implementations
#
# This ensures frontend and AI/agent tools use the same algorithms.

# Parse JSON from stdin
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
    exit 0
fi

# Only check frontend files (hooks, components, lib - but not operations or api routes)
if [[ "$file_path" != *"/hooks/"* ]] && \
   [[ "$file_path" != *"/components/"* ]] && \
   [[ "$file_path" != *"/lib/"* ]]; then
    exit 0
fi

# Skip files that ARE supposed to have this logic
if [[ "$file_path" == *"/lib/operations/"* ]] || \
   [[ "$file_path" == *"/lib/api/"* ]] || \
   [[ "$file_path" == *"/lib/agent/"* ]] || \
   [[ "$file_path" == *"/app/api/"* ]] || \
   [[ "$file_path" == *"/functions/"* ]]; then
    exit 0
fi

# Check for local scoring/matching implementations that should use Cloud Functions
warnings=""

# Pattern 1: Local scoring functions (amount/date/partner scoring logic)
if grep -qE "function.*(score|Score).*\(" "$file_path" 2>/dev/null; then
    if grep -qE "(amount|Amount).*\+=" "$file_path" 2>/dev/null || \
       grep -qE "(date|Date).*diff" "$file_path" 2>/dev/null; then
        warnings+="- Local scoring function detected. Use /api/matching/score-files or scoreAttachmentMatchCallable instead.\n"
    fi
fi

# Pattern 2: Direct amount/date comparison logic for matching
if grep -qE "Math\.abs.*amount.*-.*amount" "$file_path" 2>/dev/null || \
   grep -qE "differenceInDays.*score" "$file_path" 2>/dev/null; then
    warnings+="- Direct amount/date comparison for scoring detected. Use Cloud Function scoring for consistency.\n"
fi

# Pattern 3: Building score reasons/labels locally
if grep -qE "(matchReasons|scoreReasons).*push" "$file_path" 2>/dev/null && \
   grep -qE "score.*\+=" "$file_path" 2>/dev/null; then
    warnings+="- Local score calculation with reasons detected. Call scoreAttachmentMatchCallable for unified scoring.\n"
fi

# Pattern 4: Reimplementing transactionScoring or scoreAttachmentMatch logic
if grep -qE "(amount_exact|amount_close|date_exact|date_close)" "$file_path" 2>/dev/null && \
   [[ "$file_path" != *"transactionScoring"* ]] && \
   [[ "$file_path" != *"scoreAttachmentMatch"* ]]; then
    warnings+="- Match source labels detected outside scoring module. Ensure you're using the shared scoring functions.\n"
fi

if [ -n "$warnings" ]; then
    cat <<EOF
WARNING: Potential local scoring/matching logic detected in frontend code.

$warnings
To ensure consistency between UI and AI/agent tools:
1. Scoring should call /api/matching/score-files (which calls scoreAttachmentMatchCallable)
2. Transaction matching should use findTransactionMatchesForFile callable
3. Pre-computed scores are in file.transactionSuggestions (from matchFileTransactions)

See CLAUDE.md "Server-Side Scoring Only" section.
EOF
fi

exit 0
