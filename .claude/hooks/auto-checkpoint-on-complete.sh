#!/bin/bash
# Hook: Auto-checkpoint when tasks are marked complete
#
# Triggers on TodoWrite - when a task is marked "completed":
# - Visual changes (components, styles, loading.tsx) → ask user for OK first
# - Non-visual changes (functions, lib logic) → commit immediately

# Parse JSON from stdin
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)

# Only process TodoWrite
if [ "$tool_name" != "TodoWrite" ]; then
    exit 0
fi

# Check if any task was just marked completed
todos=$(echo "$input" | jq -r '.tool_input.todos // empty' 2>/dev/null)
if [ -z "$todos" ]; then
    exit 0
fi

# Count completed tasks
completed_count=$(echo "$todos" | jq '[.[] | select(.status == "completed")] | length' 2>/dev/null)
if [ "$completed_count" == "0" ] || [ -z "$completed_count" ]; then
    exit 0
fi

# Check if there are staged or unstaged changes to commit
staged=$(git diff --cached --name-only 2>/dev/null)
unstaged=$(git diff --name-only 2>/dev/null)

if [ -z "$staged" ] && [ -z "$unstaged" ]; then
    # Nothing to commit
    exit 0
fi

# Combine all changed files
all_changes="$staged"$'\n'"$unstaged"

# Check if any changes are visual (need user confirmation)
visual_patterns="components/|/loading\.tsx|\.css$|tailwind|design-system/|/page\.tsx"
has_visual_changes=$(echo "$all_changes" | grep -E "$visual_patterns" | head -1)

# Get the most recently completed task name for commit message
last_completed=$(echo "$todos" | jq -r '[.[] | select(.status == "completed")] | last | .content // "Task completed"' 2>/dev/null)

if [ -n "$has_visual_changes" ]; then
    # Visual changes detected - request user confirmation
    cat <<EOF
CHECKPOINT_READY: Visual changes detected for completed task.

Task: $last_completed
Changed files include UI components that may need visual verification.

Please confirm the changes look correct, then I'll commit.
[Waiting for user OK before committing]
EOF
else
    # Non-visual changes - output message for Claude to commit
    cat <<EOF
CHECKPOINT_READY: Task completed with non-visual changes.

Task: $last_completed
Ready for automatic checkpoint commit.
EOF
fi

exit 0
