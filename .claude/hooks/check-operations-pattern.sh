#!/bin/bash

# Check if the edited file is in /hooks/ directory
if [[ "$CLAUDE_FILE_PATH" == *"/hooks/"* ]]; then
  # Check if the file contains direct Firestore mutation imports (excluding onSnapshot which is allowed)
  if grep -qE "import.*\{[^}]*(getDocs|getDoc|addDoc|updateDoc|deleteDoc|setDoc|writeBatch)[^}]*\}.*from ['\"]firebase/firestore['\"]" "$CLAUDE_FILE_PATH" 2>/dev/null; then
    echo "WARNING: Direct Firestore mutations detected in hooks file!"
    echo ""
    echo "This project uses an operations layer pattern. Please:"
    echo "1. Move Firestore logic to /lib/operations/*-ops.ts"
    echo "2. Import and call operations from the hook"
    echo ""
    echo "See CLAUDE.md for the full pattern."
  fi
fi

# Check if a new hook file was created without using operations
if [[ "$CLAUDE_FILE_PATH" == *"/hooks/use-"* ]] && [[ "$CLAUDE_TOOL" == "Write" ]]; then
  if ! grep -q "from ['\"]@/lib/operations" "$CLAUDE_FILE_PATH" 2>/dev/null; then
    if grep -qE "from ['\"]firebase/firestore['\"]" "$CLAUDE_FILE_PATH" 2>/dev/null; then
      echo "REMINDER: New hook created with direct Firestore access."
      echo ""
      echo "Consider using the operations layer pattern:"
      echo "1. Create /lib/operations/[entity]-ops.ts"
      echo "2. Import operations in the hook"
      echo "3. Add MCP tools to /mcp-server/src/tools/"
      echo ""
      echo "This ensures the feature is accessible via AI/MCP."
    fi
  fi
fi
