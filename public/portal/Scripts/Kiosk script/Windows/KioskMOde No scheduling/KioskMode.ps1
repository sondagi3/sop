# Windows Kiosk Mode Script (Single URL Version)
# Save this file as KioskMode.ps1

# Configuration Paths
$configFile = "$env:USERPROFILE\kiosk_config.json"
$logFile = "$env:USERPROFILE\kiosk.log"

# Default Settings (will be used if config file is missing)
$defaultConfig = @{
    MainPage = "https://www.example.com"
    OfflinePage = "file:///$env:USERPROFILE/offline.html"
    CheckInterval = 5           # How often to check internet (seconds)
    Timeout = 15                # How long to wait before switching to offline mode (seconds)
    KioskMode = $true           # Run in full kiosk mode (F11)
    HideCursor = $true          # Hide the cursor
    EnableLogging = $true       # Enable logging
}

# Global Variables
$script:currentMode = "booting"
$script:lastConfigModified = (Get-Item $configFile).LastWriteTime
$script:elapsedTime = 0
$script:chromeProcess = $null
$script:lastConfig = $null

# Function to write logs
function Write-Log {
    param(
        [string]$Message
    )
    
    if ($config.EnableLogging) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$timestamp - $Message" | Out-File -Append -FilePath $logFile
    }
    Write-Host $Message
}

# Function to load configuration
function Load-Config {
    try {
        if (Test-Path $configFile) {
            $loadedConfig = Get-Content -Path $configFile | ConvertFrom-Json
            $config = $defaultConfig.Clone()
            
            # Override defaults with loaded values
            foreach ($key in $loadedConfig.PSObject.Properties.Name) {
                $config[$key] = $loadedConfig.$key
            }
            
            Write-Log "Config loaded - Main: $($config.MainPage), Offline: $($config.OfflinePage)"
            return $config
        } else {
            Write-Log "Config file missing, using defaults."
            # Create default config file for future use
            $defaultConfig | ConvertTo-Json | Out-File -FilePath $configFile
            return $defaultConfig
        }
    } catch {
        Write-Log "Error loading config: $_"
        return $defaultConfig
    }
}

# Function to check internet connection
function Test-Internet {
    try {
        $result = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
        return $result
    } catch {
        return $false
    }
}

# Function to start Chrome in kiosk mode
function Start-ChromeKiosk {
    param(
        [string]$Url
    )
    
    try {
        # Kill any existing Chrome processes (optional based on preference)
        Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
        
        Write-Log "Starting Chrome with URL: $Url"
        
        # Command line arguments for Chrome
        $chromeArgs = @(
            "--new-window",
            "--start-maximized"
        )
        
        # Add kiosk mode if enabled
        if ($config.KioskMode) {
            $chromeArgs += "--kiosk"
        }
        
        # Add other Chrome arguments
        $chromeArgs += @(
            "--disable-extensions",
            "--disable-pinch",
            "--disable-infobars",
            "--disable-translate",
            "--noerrdialogs",
            "--no-first-run",
            "--disable-notifications",
            "--disable-search-engine-choice-screen",
            $Url
        )
        
        # Start Chrome process
        $script:chromeProcess = Start-Process -FilePath "chrome.exe" -ArgumentList $chromeArgs -PassThru
        
        # Hide cursor if enabled (requires AutoIt or similar tool)
        if ($config.HideCursor) {
            # This would require an external tool like AutoHotkey
            # For now, just log that this would happen
            Write-Log "Cursor would be hidden (requires external tool)"
        }
        
        return $true
    } catch {
        Write-Log "Error starting Chrome: $_"
        return $false
    }
}

# Function to check if Chrome is still running
function Test-ChromeRunning {
    if ($script:chromeProcess -eq $null) {
        return $false
    }
    
    try {
        $proc = Get-Process -Id $script:chromeProcess.Id -ErrorAction SilentlyContinue
        return ($proc -ne $null)
    } catch {
        return $false
    }
}

# Main script execution
try {
    # Initial setup
    Clear-Host
    Write-Log "Starting Windows Kiosk Mode Script (Single URL Version)"
    
    # Load initial configuration
    $config = Load-Config
    $script:lastConfig = $config.Clone()
    
    # Start Chrome with main URL
    Start-ChromeKiosk -Url $config.MainPage
    
    # Main loop
    while ($true) {
        # Load config and check for changes
        $config = Load-Config
        # Check if config file was modified
$currentModifiedTime = (Get-Item $configFile).LastWriteTime
if ($currentModifiedTime -ne $script:lastConfigModified) {
    Write-Log "Config file changed - reloading..."
    $config = Load-Config
    $script:lastConfigModified = $currentModifiedTime
    Start-ChromeKiosk -Url $config.MainPage
}
        # Check Chrome process
        if (-not (Test-ChromeRunning)) {
            Write-Log "Chrome not running - restarting..."
            Start-ChromeKiosk -Url $config.MainPage
            $script:currentMode = "online"
            $script:elapsedTime = 0
        }
        
        # Internet connectivity check
        if (Test-Internet) {
            if ($script:currentMode -ne "online") {
                Write-Log "Internet restored - switching to main page"
                Start-ChromeKiosk -Url $config.MainPage
                $script:currentMode = "online"
                $script:elapsedTime = 0
            }
        } else {
            $script:elapsedTime += $config.CheckInterval
            Write-Log "Internet offline (${script:elapsedTime}s)"
            
            if ($script:currentMode -eq "online" -and $script:elapsedTime -ge $config.Timeout) {
                Write-Log "Switching to offline content"
                Start-ChromeKiosk -Url $config.OfflinePage
                $script:currentMode = "offline"
            }
        }
        
        # Wait for next check
        Start-Sleep -Seconds $config.CheckInterval
    }
} catch {
    Write-Log "Critical error: $_"
    # Optional: add recovery mechanism
}