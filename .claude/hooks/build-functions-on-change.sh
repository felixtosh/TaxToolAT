#!/bin/bash
# Hook: Auto-build Cloud Functions when source files change
#
# Triggers on Edit|Write for files in functions/src/
# Runs npm run build in the functions directory

# Parse JSON from stdin
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

# Only process if file is in functions/src/
if [[ "$file_path" != *"functions/src/"* ]]; then
    exit 0
fi

# Run build in background to not block Claude
cd "$(dirname "$0")/../../functions" || exit 0

echo "Building Cloud Functions..."
npm run build 2>&1 | tail -5

if [ $? -eq 0 ]; then
    echo "Cloud Functions built successfully."
else
    echo "WARNING: Cloud Functions build failed!"
fi

exit 0
