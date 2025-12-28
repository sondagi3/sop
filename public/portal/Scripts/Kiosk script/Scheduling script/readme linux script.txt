Kiosk Deployment and Management Manual


Overview
This manual guides you through deploying and managing a Chrome-based kiosk system that automatically switches between online and offline content based on internet connectivity. The system uses two key components:

Configuration File: kiosk_config.cfg (stores URLs for online/offline content).

Management Script: start-Online-kiosk.sh (handles Chrome kiosk mode, internet checks, and transitions).

Prerequisites
Before deployment, ensure the following:

Operating System: Linux-based OS (tested on Ubuntu 20.04/22.04).

Dependencies:

bash
sudo apt update && sudo apt install -y google-chrome-stable xdotool unclutter
User Account: A dedicated kiosk user (create with sudo adduser kiosk).

File Structure:

Scripts and configs are stored in /home/kiosk/.

Offline content (e.g., offline.html, loading.html) must exist at specified paths.

Installation Steps
1. File Setup
Copy files to the kiosk user’s home directory:

bash
sudo cp kiosk_config.cfg /home/kiosk/
sudo cp start-Online-kiosk.sh /home/kiosk/
sudo chown -R kiosk:kiosk /home/kiosk/
2. Configure Permissions
Make the script executable:

bash
sudo chmod +x /home/kiosk/start-Online-kiosk.sh
3. Edit Configuration
Open kiosk_config.cfg to set URLs:

bash
nano /home/kiosk/kiosk_config.cfg
Example:

ini
main_page="https://bm3demos.com/cme2024/digital-ads/"
offline_video_page="file:///home/kiosk/offline.html"
Notes:

Use absolute paths for offline content.

Avoid syntax errors (e.g., quotes, typos).

4. Validate Loading Screen
Ensure loading.html exists at file:///home/kiosk/loading.html.

Running the Kiosk
1. Manual Start
Switch to the kiosk user and run:

bash
sudo -u kiosk bash /home/kiosk/start-Online-kiosk.sh
2. Autostart at Boot (Optional)
Create a systemd service (e.g., /etc/systemd/system/kiosk.service):

ini
[Unit]
Description=Kiosk Service
After=network.target

[Service]
User=kiosk
ExecStart=/home/kiosk/start-Online-kiosk.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
Enable the service:

bash
sudo systemctl daemon-reload
sudo systemctl enable kiosk.service
sudo systemctl start kiosk.service
Usage and Behavior
Normal Operation
Online Mode: Chrome displays main_page.

Offline Detection:

If internet is unavailable for 15 seconds, switches to offline_video_page.

Reverts to main_page when internet is restored.

Configuration Updates
Edit kiosk_config.cfg while the script is running. Changes are detected and applied automatically.

Loading Screen
A loading screen (loading.html) appears briefly during transitions.

Troubleshooting
Common Issues
Issue	Solution
Chrome not launching	Verify dependencies: google-chrome-stable, xdotool.
Offline page not loading	Check offline_video_page path in kiosk_config.cfg.
Script permissions denied	Ensure start-Online-kiosk.sh is executable.
Chrome crashes	Check for error dialogs with xdotool. Restart the script.
Logs and Monitoring
Monitor script output:

bash
journalctl -u kiosk.service -f  # If using systemd
Force an offline test: Disconnect the network and wait 15 seconds.

Best Practices
Test Configurations: Always test URL changes locally before deployment.

Secure the Kiosk:

Disable sleep/screensaver:

bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
Regular Updates: Keep Chrome and dependencies up-to-date.

FAQ
Q: How do I change the check interval for internet connectivity?
A: Modify check_interval and timeout in the script (default: 5s and 15s).

Q: Can I use a different browser?
A: No; the script is optimized for Google Chrome.

Q: Why does the loading screen flash during transitions?
A: It ensures a smooth transition while content loads. Customize loading.html as needed.

Revision: 1.0
Contact: IT Team at it-support@example.com