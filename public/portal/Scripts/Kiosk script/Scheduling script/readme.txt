# Kiosk Admin Panel & Enhanced Kiosk System

This package provides a complete solution for managing digital signage content with scheduling capabilities and both online/offline content management.

## Features

- Web-based admin panel for content management
- Scheduling content based on time and day of week
- Support for both online and offline content
- Local file uploads (HTML, videos, images)
- Secure authentication system
- Integration with existing kiosk scripts
- Keyboard shortcuts for admin access
- Remote management capabilities

I'll provide you with a comprehensive deployment guide for the Kiosk Admin Panel and Enhanced Kiosk System, building on the existing solution provided.

# Complete Deployment Guide for Kiosk Admin Panel

## Overview

This guide will walk you through deploying a complete digital signage solution with:
- Web-based admin panel for content management
- Scheduling capabilities based on time and day of the week
- Support for both online and offline content
- Local file uploads (HTML, videos, images)
- Secure authentication system
- Remote management capabilities

## System Requirements

- Ubuntu Linux (tested on 20.04+)
- Python 3.6 or higher
- Google Chrome
- Nginx (optional, for remote access)

## Step 1: Prepare Installation Files

1. Create a new directory for your installation files:
   ```bash
   mkdir ~/kiosk-installer
   cd ~/kiosk-installer
   ```

2. Create the following files with the content provided in the uploaded documents:
   - `kiosk_admin_panel.py`: Admin panel web application
   - `start-online-kiosk-enhanced.sh`: Kiosk launcher script
   - `setup_kiosk_admin.sh`: Installation script
   - `kiosk-admin-nginx.conf`: Nginx configuration (if needed)

3. Make the scripts executable:
   ```bash
   chmod +x setup_kiosk_admin.sh
   chmod +x start-online-kiosk-enhanced.sh
   ```

## Step 2: Install Dependencies

Run these commands to install required packages:

```bash
sudo apt update
sudo apt install -y python3 python3-pip unclutter xdotool sqlite3
sudo apt install -y google-chrome-stable
pip3 install flask werkzeug
```

## Step 3: Run Installation Script

Run the setup script as root:

```bash
sudo ./setup_kiosk_admin.sh
```

This script will:
- Create a dedicated kiosk user
- Set up necessary directories
- Install the admin panel and kiosk scripts
- Create a loading screen and fallback content
- Configure systemd service for auto-start
- Set up auto-login (if using LightDM)

## Step 4: Start the Services

1. Start the kiosk service:
   ```bash
   sudo systemctl start kiosk.service
   ```

2. Check the status to ensure it's running:
   ```bash
   sudo systemctl status kiosk.service
   ```

## Step 5: Access the Admin Panel

1. On the kiosk machine:
   - Access the admin panel at: http://localhost:8080
   - Default username: admin
   - Default password: admin

2. From another device on the same network:
   - Access the admin panel at: http://KIOSK_IP_ADDRESS:8080
   - Replace KIOSK_IP_ADDRESS with the actual IP address of your kiosk machine

3. **IMPORTANT**: Change the default password immediately upon first login!

## Step 6: Configure Remote Access (Optional)

If you want to access the admin panel from outside your local network:

1. Install Nginx:
   ```bash
   sudo apt install -y nginx
   ```

2. Copy the Nginx configuration file:
   ```bash
   sudo cp kiosk-admin-nginx.conf /etc/nginx/sites-available/kiosk-admin
   ```

3. Edit the configuration to match your domain name:
   ```bash
   sudo nano /etc/nginx/sites-available/kiosk-admin
   ```

4. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/kiosk-admin /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. Configure your router to forward port 80 to the kiosk machine

6. For HTTPS (recommended for external access):
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Step 7: Using the Admin Panel

### Adding Content

1. Navigate to "Add Content" in the admin panel
2. Fill in the following:
   - Name: A descriptive name for your content
   - Content Type: Choose from External URL, Local File, or HTML Content
   - URL: For external content, provide the complete URL
   - Upload File: For local content, upload your HTML, video, or image file
   - Set as Default Online Content: Check if this should be the default content
   - Set as Default Offline Content: Check if this should display when offline

### Scheduling Content

1. Navigate to "Add Schedule" in the admin panel
2. Fill in the following:
   - Content: Select previously added content
   - Day of Week: Choose a specific day or "everyday"
   - Start Time: When the content should begin displaying
   - End Time: When the content should stop displaying
   - Priority: Higher priority schedules override lower priority ones when overlapping

### System Administration

1. Navigate to "Settings" to change your password
2. Access the dashboard for an overview of your content and schedules
3. Edit or delete content and schedules as needed

## Step 8: Keyboard Shortcuts

The following keyboard shortcuts are available when the kiosk is running:

- **Ctrl+A**: Access the admin panel directly from the kiosk
- **Ctrl+R**: Force refresh the current content

## Troubleshooting

### Admin Panel Not Starting

Check the log file:
```bash
cat /home/kiosk/admin_panel.log
```

Restart the admin panel:
```bash
sudo pkill -f kiosk_admin_panel.py
cd /home/kiosk
sudo -u kiosk python3 kiosk_admin_panel.py
```

### Kiosk Not Starting

Check the systemd service status:
```bash
sudo systemctl status kiosk.service
```

Restart the kiosk service:
```bash
sudo systemctl restart kiosk.service
```

### Content Not Displaying

1. Check if the content URL is accessible
2. Verify file permissions if using local content:
   ```bash
   sudo chown -R kiosk:kiosk /home/kiosk/content
   sudo chmod -R 755 /home/kiosk/content
   ```

3. Check for Chrome errors in the kiosk service log:
   ```bash
   sudo journalctl -u kiosk.service
   ```

## Security Considerations

1. Change the default admin password immediately
2. Use HTTPS if exposing the admin panel to the internet
3. Limit access to the admin panel using Nginx access controls
4. Consider using a VPN for remote management instead of public exposure

## Maintenance

1. Backup your database regularly:
   ```bash
   cp /home/kiosk/kiosk.db /home/kiosk/kiosk.db.backup
   ```

2. Update the system regularly:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. Monitor disk space for content uploads:
   ```bash
   df -h /home/kiosk
   ```

## Advanced Configuration

### Change Admin Panel Port

Edit the kiosk_admin_panel.py file:
```bash
sudo nano /home/kiosk/kiosk_admin_panel.py
```

Find the line that starts with `app.run` and change the port number:
```python
app.run(host='0.0.0.0', port=8080, debug=False)
```

### Add Additional Admin Users

Access the SQLite database:
```bash
sudo sqlite3 /home/kiosk/kiosk.db
```

Insert a new user (replace 'newuser' and 'newpassword'):
```sql
INSERT INTO users (username, password_hash) VALUES ('newuser', lower(hex(hashlib.sha256('newpassword').encode())));
.exit
```

### Set Up Multiple Kiosks with Central Management

1. Install the kiosk on each device
2. Configure all kiosks to use the same admin panel by editing the start-online-kiosk-enhanced.sh script:
   ```bash
   sudo nano /home/kiosk/start-online-kiosk-enhanced.sh
   ```
   
   Update the ADMIN_PANEL_URL variable to point to your central server:
   ```bash
   ADMIN_PANEL_URL="http://your-central-server:8080"
   ```

3. Set up a centralized content storage location if needed

## Conclusion

You now have a fully functioning digital signage system with administration capabilities. For further assistance or to report issues, refer to the documentation or contact support.