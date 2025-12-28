#!/bin/bash

# Step 1: Update Google Chrome
echo "Updating Google Chrome..."
sudo apt-get update
if dpkg-query -l | grep -q "google-chrome"; then
  echo "Google Chrome is installed. Updating to the latest version..."
  sudo apt-get --only-upgrade install google-chrome-stable
else
  echo "Google Chrome is not installed. Installing the latest version..."
  sudo apt-get install google-chrome-stable
fi

# Step 2: Remove keyring files
echo "Removing keyring files..."
rm -rf ~/.local/share/keyrings/* && \
rm -rf /home/kiosk/.local/share/keyrings/*

# Step 3: Kill any running Chrome processes
echo "Killing any running Chrome processes..."
pkill -f chrome

# Step 4: Remove SingletonLock and SingletonSocket files
echo "Removing Chrome lock files..."
rm -f ~/.config/google-chrome/SingletonLock
rm -f ~/.config/google-chrome/SingletonSocket

# Step 5: Launch Google Chrome
echo "Launching Google Chrome..."
google-chrome &

# Step 6: Wait a bit to ensure Chrome is fully launched
sleep 5

# Step 7: Focus the Chrome window and simulate typing
echo "Focusing Chrome window and simulating typing..."
wmctrl -a "Google Chrome" && \
sleep 1 && \
xdotool type "  " && \
xdotool key Return

echo "Process completed!"
