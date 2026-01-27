#!/bin/bash
# Hook to remind Claude to update test data when transaction structure changes

# Parse JSON from stdin
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
    exit 0
fi

# Transaction-related files that affect data structure
transaction_files=(
    "types/transaction.ts"
    "types/source.ts"
    "lib/import/field-definitions.ts"
)

# Check if the modified file is a transaction structure file
for pattern in "${transaction_files[@]}"; do
    if [[ "$file_path" == *"$pattern"* ]]; then
        cat <<'EOF'
REMINDER: You modified a transaction-related type or structure file.

Please also update the test data generator to match:
  - /lib/test-data/generate-test-transactions.ts

Ensure all Transaction fields are properly generated in test data.
EOF
        exit 0
    fi
done

exit 0
