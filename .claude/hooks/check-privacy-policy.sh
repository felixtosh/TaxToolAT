#!/bin/bash
# Hook to warn when new services are added but privacy policy may not be updated
#
# Triggers when:
# - New environment variables are added that look like API keys/secrets
# - New SDK imports are detected (e.g., @google-cloud/*, @anthropic-ai/*)
# - New service initialization code is added

# Parse JSON from stdin
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
    exit 0
fi

# Only check relevant files
if [[ "$file_path" != *"/lib/"* ]] && \
   [[ "$file_path" != *"/functions/src/"* ]] && \
   [[ "$file_path" != *".env"* ]] && \
   [[ "$file_path" != *"package.json"* ]] && \
   [[ "$file_path" != *"/app/api/"* ]]; then
    exit 0
fi

# Skip privacy policy and translation files themselves
if [[ "$file_path" == *"/privacy/"* ]] || \
   [[ "$file_path" == *"/messages/"* ]]; then
    exit 0
fi

warnings=""

# Known services already in privacy policy (add new services here when updating privacy policy)
KNOWN_SERVICES="ANTHROPIC|LANGFUSE|TRUELAYER|GOCARDLESS|FIREBASE|GOOGLE|VERTEX|GMAIL|VISION"

# Pattern 1: New environment variables that look like API keys
if grep -qE "process\.env\.(.*_API_KEY|.*_SECRET|.*_CLIENT_ID|.*_CLIENT_SECRET)" "$file_path" 2>/dev/null; then
    env_vars=$(grep -oE "process\.env\.[A-Z_]+" "$file_path" 2>/dev/null | sort -u)

    for var in $env_vars; do
        # Skip known services
        if ! echo "$var" | grep -qE "$KNOWN_SERVICES"; then
            warnings+="- New API key/secret detected: $var\n"
        fi
    done
fi

# Pattern 2: New SDK imports that suggest new services
new_sdk_patterns=(
    "@stripe/"
    "@twilio/"
    "@sendgrid/"
    "@aws-sdk/"
    "@azure/"
    "openai"
    "@pinecone-database/"
    "@supabase/"
    "@clerk/"
    "@auth0/"
    "resend"
    "@upstash/"
    "@vercel/kv"
    "@vercel/blob"
    "posthog"
    "mixpanel"
    "segment"
    "@sentry/"
    "intercom"
)

for pattern in "${new_sdk_patterns[@]}"; do
    if grep -q "from ['\"]${pattern}" "$file_path" 2>/dev/null || \
       grep -q "require(['\"]${pattern}" "$file_path" 2>/dev/null; then
        warnings+="- New service SDK detected: $pattern\n"
    fi
done

# Pattern 3: Check package.json for new dependencies
if [[ "$file_path" == *"package.json"* ]]; then
    service_packages=("stripe" "twilio" "sendgrid" "@aws-sdk" "openai" "@pinecone" "@supabase" "@clerk" "@auth0" "resend" "@upstash" "posthog" "mixpanel" "@sentry")
    for pkg in "${service_packages[@]}"; do
        if grep -q "\"$pkg" "$file_path" 2>/dev/null; then
            warnings+="- New service package detected: $pkg\n"
        fi
    done
fi

if [ -n "$warnings" ]; then
    cat <<EOF
REMINDER: New third-party service(s) may have been added.

$warnings
If you're integrating a new service that processes user data, please update:
1. /messages/de.json - privacy.sections.services (add German translation)
2. /messages/en.json - privacy.sections.services (add English translation)
3. /app/(marketing)/privacy/page.tsx - SERVICES array

Current services in privacy policy:
- Firebase (Google) - Auth, DB, Storage, Functions
- Gmail API (Google) - Email search
- Google Cloud Vision API - OCR
- Vertex AI / Gemini (Google) - AI processing
- Anthropic Claude API - Chat agent
- TrueLayer - Open Banking UK/EU
- GoCardless - Open Banking Europe
- LangFuse - LLM observability

See CLAUDE.md for architecture details.
EOF
fi

exit 0
