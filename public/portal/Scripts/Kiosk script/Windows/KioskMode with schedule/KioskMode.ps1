# Windows Kiosk Mode Script with Time-Based URL Scheduling
# Save this file as KioskMode.ps1

# Configuration Paths
$configFile = "$env:USERPROFILE\kiosk_config.json"
$scheduleFile = "$env:USERPROFILE\kiosk_schedule.json"
$logFile = "$env:USERPROFILE\kiosk.log"

# Default Settings (will be used if config file is missing)
$defaultConfig = @{
    MainPage = "https://www.example.com"
    OfflinePage = "file:///$env:USERPROFILE/offline.html"
    CheckInterval = 5           # How often to check internet (seconds)
    TimeCheckInterval = 60      # How often to check for schedule changes (seconds)
    Timeout = 15                # How long to wait before switching to offline mode (seconds)
    KioskMode = $true           # Run in full kiosk mode (F11)
    HideCursor = $true          # Hide the cursor
    EnableLogging = $true       # Enable logging
}

# Global Variables
$script:currentMode = "booting"
$script:elapsedTime = 0
$script:timeCheckCounter = 0
$script:currentScheduleUrl = ""
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

# Function to get URL based on current schedule
function Get-ScheduledUrl {
    # Default to main page
    $scheduledUrl = $config.MainPage
    
    try {
        # Return default if schedule file doesn't exist
        if (-not (Test-Path $scheduleFile)) {
            return $scheduledUrl
        }
        
        # Get current time and day
        $currentTime = Get-Date -Format "HH:mm"
        $currentDay = (Get-Date).DayOfWeek.value__ + 1  # 1=Monday, 7=Sunday
        
        # Read schedule file
        $scheduleEntries = Get-Content -Path $scheduleFile | ConvertFrom-Json
        
        foreach ($entry in $scheduleEntries) {
            # Parse days (could be "all" or array of day numbers)
            $dayMatch = $false
            if ($entry.Days -eq "all" -or $entry.Days -eq "*") {
                $dayMatch = $true
            } elseif ($entry.Days -is [array] -and $entry.Days -contains $currentDay) {
                $dayMatch = $true
            } elseif ($entry.Days -match $currentDay) {
                $dayMatch = $true
            }
            
            # Check if day and time match
            if ($dayMatch -and $currentTime -ge $entry.StartTime -and $currentTime -lt $entry.EndTime) {
                $scheduledUrl = $entry.Url
                break
            }
        }
    } catch {
        Write-Log "Error processing schedule: $_"
    }
    
    return $scheduledUrl
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
    Write-Log "Starting Windows Kiosk Mode Script"
    
    # Create sample schedule file if it doesn't exist
    if (-not (Test-Path $scheduleFile)) {
        $sampleSchedule = @(
            @{
                Days = @(1,2,3,4,5)
                StartTime = "08:00"
                EndTime = "12:00"
                Url = "https://morning.example.com"
            },
            @{
                Days = @(1,2,3,4,5)
                StartTime = "12:00"
                EndTime = "17:00"
                Url = "https://afternoon.example.com"
            },
            @{
                Days = "all"
                StartTime = "17:00"
                EndTime = "22:00"
                Url = "https://evening.example.com"
            },
            @{
                Days = "all"
                StartTime = "22:00"
                EndTime = "08:00"
                Url = "https://night.example.com"
            },
            @{
                Days = @(6,7)
                StartTime = "08:00"
                EndTime = "22:00"
                Url = "https://weekend.example.com"
            }
        )
        $sampleSchedule | ConvertTo-Json | Out-File -FilePath $scheduleFile
        Write-Log "Created sample schedule file at $scheduleFile"
    }
    
    # Load initial configuration
    $config = Load-Config
    $script:lastConfig = $config.Clone()
    
    # Get initial scheduled URL
    $script:currentScheduleUrl = Get-ScheduledUrl
    
    # Start Chrome with initial URL
    Start-ChromeKiosk -Url $script:currentScheduleUrl
    
    # Main loop
    while ($true) {
        # Load config and check for changes
        $config = Load-Config
        
        # Check Chrome process
        if (-not (Test-ChromeRunning)) {
            Write-Log "Chrome not running - restarting..."
            Start-ChromeKiosk -Url $script:currentScheduleUrl
            $script:currentMode = "online"
            $script:elapsedTime = 0
        }
        
        # Time-based URL check
        if ($script:timeCheckCounter -ge $config.TimeCheckInterval) {
            $script:timeCheckCounter = 0
            $newUrl = Get-ScheduledUrl
            
            if ($newUrl -ne $script:currentScheduleUrl -and $script:currentMode -eq "online") {
                Write-Log "Time-based URL change: $newUrl"
                $script:currentScheduleUrl = $newUrl
                Start-ChromeKiosk -Url $script:currentScheduleUrl
            }
        } else {
            $script:timeCheckCounter += $config.CheckInterval
        }
        
        # Internet connectivity check
        if (Test-Internet) {
            if ($script:currentMode -ne "online") {
                Write-Log "Internet restored - switching to scheduled page"
                $script:currentScheduleUrl = Get-ScheduledUrl
                Start-ChromeKiosk -Url $script:currentScheduleUrl
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