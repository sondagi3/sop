#!/bin/bash

# Function to install packages if missing
install_if_missing() {
    local cmd="$1"
    local pkg="$2"
    if ! command -v "$cmd" &> /dev/null; then
        echo "[*] Installing $pkg..."
        sudo apt update -qq && sudo apt install -y "$pkg"
    fi
}

echo "===== Checking/Installing Required Tools ====="
install_if_missing "sensors" "lm-sensors"
install_if_missing "smartctl" "smartmontools"
install_if_missing "iostat" "sysstat"

echo -e "\n===== Running System Health Checks ====="

# --- CPU Load ---
echo -e "\n[CPU Load]"
cpu_load=$(uptime | awk -F 'load average:' '{print $2}' | awk '{print $1}')
cpu_cores=$(nproc)
echo "CPU Load (1min avg): $cpu_load (Cores: $cpu_cores)"
echo "Normal range: Below $cpu_cores (High load if > $cpu_cores)"

# --- Memory Usage ---
echo -e "\n[Memory Usage]"
free -h | grep "Mem:"

# --- Disk Usage ---
echo -e "\n[Disk Usage]"
df -h --exclude-type=tmpfs --exclude-type=devtmpfs

# --- CPU Temperature ---
echo -e "\n[CPU Temperature]"
if command -v sensors &> /dev/null; then
    sensors | grep -E "Core|Package"
else
    echo "[!] 'sensors' still missing after install attempt."
    echo "    Tip: You may need to run 'sudo sensors-detect' once to enable full sensor support."
fi

# --- Disk Health (SMART) ---
echo -e "\n[Disk Health (SMART)]"
if command -v smartctl &> /dev/null; then
    root_disk=$(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print $1; exit}')
    echo "Checking /dev/$root_disk:"
    sudo smartctl -a /dev/"$root_disk" | grep -E "Model|Reallocated|Pending|Temperature|Health"
else
    echo "[!] 'smartctl' still missing after install attempt."
fi

# --- System Logs (Critical Errors) ---
echo -e "\n[System Logs - Critical Errors]"
log_output=$(journalctl -p 3 -xb --no-pager | tail -n 10)
if [ -z "$log_output" ]; then
    echo "No critical errors found in logs."
else
    echo "$log_output"
fi

echo -e "\n===== Health Check Complete ====="
