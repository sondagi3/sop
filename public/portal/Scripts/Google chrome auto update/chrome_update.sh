#!/bin/bash

set -e

# Ensure script runs as root
if [[ "$EUID" -ne 0 ]]; then
  echo "Please run this script as root"
  exit 1
fi

# Check if Google Chrome is already installed
if command -v google-chrome >/dev/null 2>&1; then
  echo "Google Chrome is already installed. Updating..."
  apt update -y
  apt install --only-upgrade -y google-chrome-stable
  exit 0
fi

# Proceed with fresh installation
echo "Installing Google Chrome..."

apt update -y
apt install -y wget gnupg ca-certificates apt-transport-https software-properties-common

wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list

apt update -y
apt install -y google-chrome-stable

mkdir -p /etc/opt/chrome/policies/managed
cat <<EOF > /etc/opt/chrome/policies/managed/auto_config.json
{
  "HideWebStorePromo": true,
  "MetricsReportingEnabled": false,
  "RestoreOnStartup": 4,
  "BrowserAddPersonEnabled": false,
  "BrowserGuestModeEnabled": false,
  "ImportBookmarks": false,
  "ImportHistory": false,
  "ImportSavedPasswords": false,
  "ImportSearchEngine": false
}
EOF

echo "Google Chrome installed and configured."
