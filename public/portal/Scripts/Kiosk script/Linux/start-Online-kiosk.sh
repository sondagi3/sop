#!/bin/bash

# Configuration
CONFIG_FILE="/home/kiosk/kiosk_config.cfg"
LOADING_SCREEN="file:///home/kiosk/loading.html"  # Path to your loading GIF page

# Static settings
check_interval=5      # Interval between checks (in seconds)
max_failed_checks=3   # Allow 3 consecutive failures before switching offline

# Load configuration
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        echo "Config loaded - Main: $main_page, Offline: $offline_video_page"
    else
        echo "ERROR: Config file missing!"
        exit 1
    fi
}

# Initial load
load_config

# State variables
current_mode="booting"
chrome_pid=0
failed_checks=0
last_main_page="$main_page"
last_offline_page="$offline_video_page"

# -------------------------------------------------------------------
# FUNCTIONS
# -------------------------------------------------------------------

check_internet() {
    wget --timeout=2 --tries=2 --spider http://clients3.google.com/generate_204 >/dev/null 2>&1
    return $?
}

check_chrome_errors() {
    [ $chrome_pid -eq 0 ] && return 1

    if ! kill -0 $chrome_pid 2>/dev/null; then
        return 1
    fi

    if command -v xdotool >/dev/null; then
        if xdotool search --name "Error|Crash|Aw, Snap!" >/dev/null; then
            return 1
        fi
    fi

    return 0
}

start_chrome() {
    local url="$1"
    local show_loading="$2"

    echo "Preparing to launch Chrome..."

    # Optionally show loading screen
    if [ "$show_loading" = true ]; then
        echo "Showing loading screen..."
        pkill -f "chrome.*--kiosk"
        google-chrome --password-store=basic --kiosk --no-first-run \
            --disable-pinch --disable-infobars --noerrdialogs \
            "$LOADING_SCREEN" >/dev/null 2>&1 &
        sleep 2
    fi

    echo "Loading URL: $url"
    pkill -f "chrome.*--kiosk"
    google-chrome --password-store=basic --kiosk --no-first-run \
        --disable-pinch --disable-infobars --noerrdialogs \
        --disable-session-crashed-bubble --no-default-browser-check \
        --disable-component-update --check-for-update-interval=31536000 \
        "$url" >/dev/null 2>&1 &
    chrome_pid=$!

    command -v unclutter >/dev/null && unclutter -idle 1 &
}

# -------------------------------------------------------------------
# MAIN LOOP
# -------------------------------------------------------------------

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Start Chrome initially
start_chrome "$main_page" true
current_mode="online"

while true; do
    load_config

    # URL change detection
    if [ "$last_main_page" != "$main_page" ] || [ "$last_offline_page" != "$offline_video_page" ]; then
        echo "URL config changed - reloading..."
        last_main_page="$main_page"
        last_offline_page="$offline_video_page"
        start_chrome "$main_page" true
        current_mode="online"
        failed_checks=0
        continue
    fi

    # Chrome health check
    if ! check_chrome_errors; then
        echo "Detected Chrome issue - restarting..."
        start_chrome "$main_page" true
        current_mode="online"
        failed_checks=0
        continue
    fi

    # Internet state machine
    if check_internet; then
        failed_checks=0
        if [ "$current_mode" != "online" ]; then
            echo "Internet restored - switching to main page"
            start_chrome "$main_page" true
            current_mode="online"
        fi
    else
        echo "Internet offline (consecutive failures: $failed_checks)"
        ((failed_checks++))

        if [ "$current_mode" = "online" ] && [ $failed_checks -ge $max_failed_checks ]; then
            echo "Switching to offline content..."
            start_chrome "$offline_video_page" true
            current_mode="offline"
            failed_checks=0
        fi
    fi

    sleep $check_interval
done
