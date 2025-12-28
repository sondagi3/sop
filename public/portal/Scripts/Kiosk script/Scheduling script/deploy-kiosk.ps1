# OFFLINE WORDPRESS DEPLOYMENT SCRIPT (Windows)
# Reuses your credentials securely for an air-gapped kiosk

# --- Configuration ---
$wordpressPath = "C:\inetpub\wwwroot\wordpress"
$domainName = "localhost"

# Use your provided credentials for everything
$adminEmail = "jolo@brandm3dia.com"    # WordPress admin email
$adminPassword = "%DY@+^Q39a38Cse"     # WordPress admin password
$dbUser = "jolo_user"                  # MySQL-compatible username (no @)
$dbPassword = "DY_Q39a38Cse"           # MySQL-compatible password (no %@)
$dbName = "wordpress_db"

# --- Offline Installation Steps ---

# 1. Install IIS (No internet required)
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, IIS-ASPNET45

# 2. Install MySQL (Pre-installed offline MSI)
#    - Assume MySQL 8.0+ is pre-installed with your root password
$mysqlRootPass = "YourMySQLRootPass123!"  # Replace with your actual root password

# 3. Create MySQL Database with your credentials
$mysqlExe = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$createDbQuery = @"
CREATE DATABASE $dbName;
CREATE USER '$dbUser'@'localhost' IDENTIFIED BY '$dbPassword';
GRANT ALL PRIVILEGES ON $dbName.* TO '$dbUser'@'localhost';
FLUSH PRIVILEGES;
"@
Start-Process -Wait -FilePath $mysqlExe -ArgumentList "-u", "root", "-p$mysqlRootPass", "-e", $createDbQuery

# 4. Deploy WordPress files (Pre-downloaded offline)
Expand-Archive -Path "C:\offline\wordpress.zip" -DestinationPath $wordpressPath

# 5. Configure wp-config.php
(Get-Content "$wordpressPath\wp-config-sample.php") -replace "database_name_here", $dbName `
                                                  -replace "username_here", $dbUser `
                                                  -replace "password_here", $dbPassword |
Set-Content "$wordpressPath\wp-config.php"

# 6. Install WordPress core (Offline)
#    - Uses your provided admin credentials
$wpCliPath = "C:\offline\wp-cli.phar"  # Pre-downloaded WP-CLI
php $wpCliPath core install --url="http://$domainName" --title="Kiosk" `
                           --admin_user="$adminEmail" --admin_password="$adminPassword" `
                           --admin_email="$adminEmail" --path="$wordpressPath" --skip-email

# 7. Restore your offline backup (if needed)
Copy-Item "C:\offline\cme-2024-v3.wpress" "$wordpressPath\wp-content\ai1wm-backups\"
php $wpCliPath ai1wm restore cme-2024-v3.wpress --path="$wordpressPath"

# --- Lockdown (Critical for kiosks) ---
# Disable updates and external access
php $wpCliPath config set WP_AUTO_UPDATE_CORE false --path="$wordpressPath"
php $wpCliPath plugin deactivate akismet --path="$wordpressPath"
php $wpCliPath plugin deactivate hello --path="$wordpressPath"

Write-Host "OFFLINE DEPLOYMENT COMPLETE!"
Write-Host "Access at: http://localhost"
Write-Host "Admin Login: $adminEmail / $adminPassword"