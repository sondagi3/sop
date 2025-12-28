#!/bin/bash

WORDPRESS_PATH="/var/www/html"
APACHE_CONF="/etc/apache2/sites-available/wordpress.conf"
DOMAIN_NAME="127.0.0.1"
WORDPRESS_FILE=cme-2024-v3.wpress
WORDPRESS_FILE_URL=https://bm3-wordpress-files.s3.ca-central-1.amazonaws.com/cme-2024-v3.wpress


# Update and upgrade the system
sudo apt update && sudo apt upgrade -y

# Install Apache
sudo apt install apache2 -y
sudo systemctl enable apache2
sudo systemctl start apache2

# Install MySQL
sudo apt install mysql-server -y

# Secure MySQL installation
sudo mysql_secure_installation <<EOF

y
0
y
y
y
y
EOF

# Install PHP
sudo apt install php libapache2-mod-php php-mysql php-cli php-curl php-zip php-gd php-mbstring php-xml php-soap php-intl php-bcmath -y

# Download and Install WordPress
cd /var/www/html
sudo wget https://wordpress.org/latest.tar.gz
sudo tar -xvzf latest.tar.gz
sudo mv wordpress/* .
sudo rm -r wordpress latest.tar.gz

# Set permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/

# Create MySQL Database and User
DB_NAME="wordpress_db"
DB_USER="wordpress_user"
DB_PASSWORD="your_password"

sudo mysql -u root -p <<MYSQL_SCRIPT
CREATE DATABASE $DB_NAME;
CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EXIT;
MYSQL_SCRIPT

# Configure WordPress
sudo cp wp-config-sample.php wp-config.php

# Update wp-config.php with database information
sudo sed -i "s/database_name_here/$DB_NAME/" wp-config.php
sudo sed -i "s/username_here/$DB_USER/" wp-config.php
sudo sed -i "s/password_here/$DB_PASSWORD/" wp-config.php



# Configure Apache 2 for WordPress
if ! grep -q "$WORDPRESS_PATH" "$APACHE_CONF"; then
    echo "Configuring Apache 2 for WordPress..."
    sudo tee "$APACHE_CONF" > /dev/null <<EOL
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    DocumentRoot $WORDPRESS_PATH
	ServerName localhost
    	ServerAlias localhost 
 
    ErrorLog \${APACHE_LOG_DIR}/error.log
    CustomLog \${APACHE_LOG_DIR}/access.log combined

    <Directory $WORDPRESS_PATH>
        AllowOverride All
	Require all granted
    </Directory>
</VirtualHost>
EOL
    sudo a2enmod rewrite
  sudo a2ensite wordpress.conf
    sudo systemctl restart apache2
fi

sudo mv /var/www/html/index.html /tmp/

# download curl package
sudo apt-get install curl

# Download wp-cli
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar

# Make the file executable
chmod +x wp-cli.phar

# Move the file to a location that is in your system's PATH
sudo mv wp-cli.phar /usr/local/bin/wp

# Verify the installation
wp --info

#installing core database of wordpress
wp --allow-root core install --url="http://localhost" --title="taccom" --admin_user="jolo@brandm3dia.com" --admin_password="%DY@+^Q39a38Cse" --admin_email="jolo@brandm3dia.com" --path=/var/www/html/ --skip-email
wp plugin install all-in-one-wp-migration --activate --allow-root --path=/var/www/html/
wget https://bm3-wordpress-files.s3.ca-central-1.amazonaws.com/all-in-one-wp-migration-unlimited-extension.zip
# Set permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/
wp plugin install ./all-in-one-wp-migration-unlimited-extension.zip --allow-root --activate --path=/var/www/html
wget $WORDPRESS_FILE_URL
cp $WORDPRESS_FILE /var/www/html/wp-content/ai1wm-backups/

# Set permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/

wp plugin update all-in-one-wp-migration-unlimited-extension --allow-root --path=/var/www/html/

echo "y" | wp ai1wm restore $WORDPRESS_FILE --allow-root --path=/var/www/html

# Set permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/

wp --allow-root core update-db --path=/var/www/html
wp option update permalink_structure "/%postname%/" --allow-root --path=/var/www/html
wp rewrite structure '/%postname%/' --allow-root --path=/var/www/html/

wp --allow-root rewrite flush --path=/var/www/html

# Set permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/

