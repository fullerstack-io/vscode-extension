#!/bin/bash
# Clone a single extension from the monorepo
# Usage: ./clone-extension.sh <extension-name> [target-directory]
#
# Examples:
#   ./clone-extension.sh my-extension
#   ./clone-extension.sh my-extension ~/projects/my-extension-dev

set -e

REPO_URL="https://github.com/fullerstack-io/vscode-extension.git"
EXTENSION_NAME="${1:?Error: Extension name required. Usage: $0 <extension-name> [target-directory]}"
TARGET_DIR="${2:-$EXTENSION_NAME}"

echo "Cloning extension: $EXTENSION_NAME to $TARGET_DIR"

# Partial clone with sparse checkout (no files checked out initially)
git clone \
  --filter=blob:none \
  --no-checkout \
  --sparse \
  "$REPO_URL" \
  "$TARGET_DIR"

cd "$TARGET_DIR"

# Configure sparse checkout to only include the specific extension
git sparse-checkout set "extensions/$EXTENSION_NAME"

# Checkout the main branch
git checkout main

echo ""
echo "Done! Extension '$EXTENSION_NAME' is ready in '$TARGET_DIR'"
echo ""
echo "To add another extension to this checkout:"
echo "  cd $TARGET_DIR && git sparse-checkout add extensions/<other-extension>"
echo ""
echo "To expand to full repository:"
echo "  cd $TARGET_DIR && git sparse-checkout disable"
