#!/bin/bash

set -e 

echo "🚀 Starting JellyCC installation..."

# 1. Fetch the latest release version
echo "🔍 Fetching the latest version..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/parkejunior/jellycc-cli/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
    echo "✖ Error: Could not find the latest release. Please check if a public release exists."
    exit 1
fi

echo "📦 Found version: $LATEST_VERSION"

# 2. Define the download URL for the binary
BINARY_URL="https://github.com/parkejunior/jellycc-cli/releases/download/${LATEST_VERSION}/jellycc-linux-x64"

# 3. Download the file to a temporary directory
TMP_FILE="/tmp/jellycc"
echo "📥 Downloading binary..."
curl -fsSL "$BINARY_URL" -o "$TMP_FILE"

# 4. Apply execution permissions
chmod +x "$TMP_FILE"

# 5. Move the binary to the user's local bin directory
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

echo "📂 Moving to $INSTALL_DIR..."
mv "$TMP_FILE" "$INSTALL_DIR/jellycc"

echo "✔ JellyCC installed successfully!"
echo "💡 The global command 'jellycc' is ready to use."