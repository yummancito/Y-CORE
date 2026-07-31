# Y-Core Mod Manager - Deployment Guide

**Version:** 1.0  
**Last Updated:** 2026-07-29  
**Target:** Development & Production Environments

---

## Quick Start (5 Minutes)

For developers who want to run Y-Core locally immediately:

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### One-Command Setup

```bash
# Clone repository
git clone https://github.com/Y-Core/mod-manager.git
cd mod-manager

# Install and run (5 minutes)
npm install
npm run dev

# Open http://localhost:5173 in browser
# Or run Electron app
npm run electron:dev
```

That's it! Y-Core will start with default SQLite database and mock data.

---

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Installation Instructions](#installation-instructions)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [API Key Configuration](#api-key-configuration)
6. [Security Configuration](#security-configuration)
7. [Production Deployment](#production-deployment)
8. [Monitoring & Health Checks](#monitoring--health-checks)
9. [Upgrade Path](#upgrade-path)
10. [Troubleshooting](#troubleshooting)

---

## Development Environment Setup

### 1. Install Prerequisites

#### Windows
```powershell
# Using Chocolatey
choco install nodejs git

# Or download from
# Node.js: https://nodejs.org/
# Git: https://git-scm.com/

# Verify installation
node --version  # Should be 18+
npm --version   # Should be 9+
```

#### macOS
```bash
# Using Homebrew
brew install node git

# Or download from official sites

# Verify
node --version
npm --version
```

#### Linux (Ubuntu/Debian)
```bash
# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Verify
node --version
npm --version
```

### 2. Clone Repository

```bash
git clone https://github.com/Y-Core/mod-manager.git
cd mod-manager

# For development, use main branch
git checkout main
```

### 3. Install Dependencies

```bash
# Install npm packages
npm install

# This installs:
# - React, TypeScript, Vite (frontend)
# - Electron, SQLite3, electron-sqlite3 (backend)
# - All other dependencies from package.json
# - Takes 2-3 minutes on first run

# Verify installation
npm list | head -20
```

### 4. Verify Development Environment

```bash
# Check Node version
node -v  # Should be 18.0.0 or higher

# Check npm version
npm -v   # Should be 9.0.0 or higher

# List installed packages
npm list --depth=0

# Should show:
# - react
# - electron
# - typescript
# - vite
# - sqlite3
# - other dependencies
```

### 5. Start Development Server

```bash
# Option A: Development mode with hot reload
npm run dev

# Opens Vite dev server at http://localhost:5173
# Auto-reloads on file changes
# Shows build errors in browser console

# Option B: Electron development mode
npm run electron:dev

# Starts Electron app with dev tools
# Hot reload for React components
# Dev tools available with F12

# Option C: Build and test production build
npm run build
npm run electron:dist
```

### 6. IDE Setup

#### VS Code (Recommended)

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "eslint.enable": true,
  "eslint.validate": [
    "javascript",
    "typescript",
    "typescriptreact"
  ]
}
```

#### Recommended VS Code Extensions
- ESLint
- Prettier
- TypeScript Vue Plugin
- React Developer Tools
- Thunder Client (API testing)

#### WebStorm / IntelliJ IDEA
- Built-in support for Node.js, React, TypeScript
- Debugger integration with Chrome DevTools
- Settings → Languages & Frameworks → Node.js

---

## Installation Instructions

### Windows Installation

#### Standard Installation (64-bit)

```powershell
# 1. Download latest release
# From: https://github.com/Y-Core/mod-manager/releases

# 2. Run installer
Y-Core-Setup-1.0.0.exe

# 3. Choose installation directory
# Default: C:\Program Files\Y-Core\

# 4. Select components
# ☑ Core Application
# ☑ Desktop Shortcut
# ☑ Start Menu Entry

# 5. Complete installation (2-3 minutes)

# 6. Verify installation
# Desktop shortcut created
# C:\Program Files\Y-Core\YCore.exe exists
# %APPDATA%\YCore directory created
```

#### Portable Installation

```powershell
# 1. Download portable .zip
# From releases page

# 2. Extract to desired location
# C:\YCore\ (or any path without spaces)

# 3. Run
.\YCore.exe

# No installation required
# Portable config stored in same directory
```

#### Registry Settings (Advanced)

```registry
# Windows Registry entries (created by installer)
HKEY_CURRENT_USER\Software\Y-Core\
  - InstallPath: C:\Program Files\Y-Core\
  - Version: 1.0.0
  - LastUpdate: 2026-07-29
  - Theme: light|dark
```

### macOS Installation

#### App Store / DMG Installation

```bash
# 1. Download .dmg from releases
wget https://github.com/Y-Core/mod-manager/releases/download/v1.0.0/Y-Core-1.0.0.dmg

# 2. Mount DMG
open Y-Core-1.0.0.dmg

# 3. Drag Y-Core.app to Applications folder
# Finder: Y-Core.dmg → drag to Applications

# 4. Run from Applications
open /Applications/Y-Core.app

# Or use spotlight
cmd+space → Y-Core → Enter
```

#### Homebrew Installation

```bash
# 1. Add Y-Core tap
brew tap Y-Core/mac https://github.com/Y-Core/homebrew-mac.git

# 2. Install
brew install y-core

# 3. Run
y-core

# 4. Uninstall (if needed)
brew uninstall y-core
```

#### Security (First Run)

```
1. macOS shows "Cannot open Y-Core.app because it is from an unidentified developer"
2. Click "Cancel"
3. Go to: System Preferences → Security & Privacy → General
4. Click "Open Anyway" next to Y-Core
5. Click "Open" to confirm
6. Launch from Applications normally
```

### Linux Installation

#### Debian/Ubuntu

```bash
# 1. Add Y-Core repository
sudo wget -qO - https://releases.y-core.dev/apt/KEY.gpg | sudo apt-key add -
sudo sh -c 'echo "deb https://releases.y-core.dev/apt/ jammy main" > /etc/apt/sources.list.d/y-core.list'

# 2. Update package list
sudo apt update

# 3. Install
sudo apt install y-core

# 4. Run
y-core

# 5. Uninstall
sudo apt remove y-core
```

#### Fedora/RHEL

```bash
# 1. Add Y-Core repository
sudo rpm --import https://releases.y-core.dev/rpm/KEY.gpg
sudo dnf config-manager --add-repo https://releases.y-core.dev/rpm/

# 2. Install
sudo dnf install y-core

# 3. Run
y-core

# 4. Uninstall
sudo dnf remove y-core
```

#### AppImage (Universal)

```bash
# 1. Download AppImage
wget https://github.com/Y-Core/mod-manager/releases/download/v1.0.0/Y-Core-1.0.0.AppImage

# 2. Make executable
chmod +x Y-Core-1.0.0.AppImage

# 3. Run
./Y-Core-1.0.0.AppImage

# Optional: Create desktop entry
mkdir -p ~/.local/share/applications
cp Y-Core.desktop ~/.local/share/applications/
```

---

## Environment Configuration

### Configuration Files

#### File Locations

**Windows:**
```
Config:  %APPDATA%\YCore\settings.json
DB:      %APPDATA%\YCore\mods-database.db
Backups: %APPDATA%\YCore\mod-backups\
Logs:    %APPDATA%\YCore\logs\
```

**macOS:**
```
Config:  ~/Library/Application Support/Y-Core/settings.json
DB:      ~/Library/Application Support/Y-Core/mods-database.db
Backups: ~/Library/Application Support/Y-Core/mod-backups/
Logs:    ~/Library/Logs/Y-Core/
```

**Linux:**
```
Config:  ~/.config/Y-Core/settings.json
DB:      ~/.config/Y-Core/mods-database.db
Backups: ~/.config/Y-Core/mod-backups/
Logs:    ~/.local/share/Y-Core/logs/
```

### Environment Variables

#### .env File (Development)

Create `.env` in project root:

```bash
# Steam API
STEAM_API_KEY=your_api_key_here
STEAM_APP_ID=your_game_app_id

# VirusTotal Malware Scanning
VIRUSTOTAL_API_KEY=your_virustotal_key

# YARA Rules (optional)
YARA_RULES_PATH=/usr/share/yara/rules/
YARA_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Database
DATABASE_PATH=./mods-database.db
BACKUP_PATH=./mod-backups

# Feature Flags
ENABLE_MALWARE_SCANNING=true
ENABLE_BACKUPS=true
ENABLE_CACHE=true

# Performance
MAX_CONCURRENT_INSTALLATIONS=3
CACHE_TTL_MS=3600000
```

#### .env.production (Production)

```bash
# Production-specific settings
STEAM_API_KEY=prod_steam_key
VIRUSTOTAL_API_KEY=prod_virustotal_key

# Stricter logging in production
LOG_LEVEL=warn

# More conservative timeouts
CACHE_TTL_MS=1800000  # 30 minutes

# Higher concurrency limits for servers
MAX_CONCURRENT_INSTALLATIONS=5

# Enable analytics
ENABLE_TELEMETRY=true
TELEMETRY_ENDPOINT=https://analytics.y-core.dev
```

### settings.json

First launch auto-creates `settings.json`:

```json
{
  "version": "1.0",
  "steam": {
    "apiKey": "YOUR_STEAM_API_KEY",
    "appId": "YOUR_GAME_APP_ID"
  },
  "malwareScanning": {
    "enabled": true,
    "virusTotalApiKey": "YOUR_VT_KEY",
    "yaraRulesPath": "/usr/share/yara/rules/",
    "blockDangerousFiles": true,
    "blockSuspiciousFiles": false,
    "scanLevel": "standard"  // quick, standard, deep
  },
  "backups": {
    "enabled": true,
    "autoBackupBeforeInstall": true,
    "retentionDays": 7,
    "keepLatestCount": 3,
    "maxConcurrentOps": 3
  },
  "cache": {
    "enabled": true,
    "ttlMs": 3600000,
    "maxSizeBytes": 52428800  // 50 MB
  },
  "ui": {
    "theme": "dark",  // light, dark, auto
    "language": "en",  // en, fr, de, etc.
    "modsPerPage": 50
  },
  "logging": {
    "level": "info",
    "file": true,
    "console": true,
    "maxFileSize": 10485760  // 10 MB
  }
}
```

### Editing Configuration

**GUI (Recommended):**
1. Launch Y-Core
2. Settings → Preferences
3. Adjust values
4. Click Save

**Manual Edit:**
1. Close Y-Core completely
2. Edit `~/.config/Y-Core/settings.json` (or Windows equivalent)
3. Restart Y-Core

```bash
# Example: Set Steam API key via CLI
# (Windows)
powershell -Command "(Get-Content settings.json | ConvertFrom-Json).steam.apiKey = 'new-key' | ConvertTo-Json | Set-Content settings.json"

# (macOS/Linux)
jq '.steam.apiKey = "new-key"' settings.json > settings.json.tmp && mv settings.json.tmp settings.json
```

---

## Database Setup

### Initial Database Creation

Database auto-initializes on first launch:

```typescript
// Automatic initialization in ModsDatabaseService
async initialize() {
  this.db = new sqlite3.Database(this.dbPath)
  await this.runMigrations()  // Creates tables
}
```

**What gets created:**
- `installed_mods` table
- `backups` table
- Indexes for performance
- WAL (Write-Ahead Logging) for safety

### Manual Database Reset

```bash
# Windows
del %APPDATA%\YCore\mods-database.db

# macOS/Linux
rm ~/.config/Y-Core/mods-database.db

# Restart Y-Core → database recreates automatically
```

### Database Backup

```bash
# Backup current database
# Windows
copy %APPDATA%\YCore\mods-database.db %APPDATA%\YCore\mods-database.db.backup

# macOS/Linux
cp ~/.config/Y-Core/mods-database.db ~/.config/Y-Core/mods-database.db.backup
```

### Database Migrations

Migrations run automatically on startup:

```typescript
// Migration system (ModsDatabaseService.runMigrations)
// Checks schema version
// Applies new migrations if needed
// Never downgrades (safe)

// To add new migration:
// 1. Add to migrations array in code
// 2. Increment schema version
// 3. Test on fresh database
// 4. Deploy
```

### Database Maintenance

```bash
# Optimize database (reduce file size)
sqlite3 ~/.config/Y-Core/mods-database.db "VACUUM;"

# Check integrity
sqlite3 ~/.config/Y-Core/mods-database.db "PRAGMA integrity_check;"

# Rebuild indexes (if corrupted)
sqlite3 ~/.config/Y-Core/mods-database.db "REINDEX;"

# Get database info
sqlite3 ~/.config/Y-Core/mods-database.db "
  SELECT name FROM sqlite_master WHERE type='table';
  SELECT count(*) FROM installed_mods;
  SELECT count(*) FROM backups;
"
```

---

## API Key Configuration

### Steam API Key

#### Getting Steam API Key

1. Visit: https://steamcommunity.com/dev/apikey
2. Sign in with Steam account
3. Accept terms
4. Enter domain: `localhost` (for dev), `y-core.dev` (production)
5. Click "Register"
6. Copy API key

#### Setting Steam API Key

**GUI:**
1. Settings → API Keys
2. Paste Steam API key
3. Click Test Connection
4. Save

**Config File:**
```json
{
  "steam": {
    "apiKey": "YOUR_STEAM_API_KEY_HERE"
  }
}
```

**Environment Variable:**
```bash
export STEAM_API_KEY=your_key_here
```

#### Testing Steam API

```bash
# Test API connection
curl "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=YOUR_KEY&steamids=76561198000000000"

# Should return user data JSON
```

### VirusTotal API Key

#### Getting VirusTotal API Key

1. Visit: https://www.virustotal.com/
2. Sign up (free account)
3. Go to: Profile → API Key
4. Copy your API key
5. Free tier: 4 requests per minute, 500 per day

#### Setting VirusTotal API Key

**GUI:**
1. Settings → Security → VirusTotal
2. Paste API key
3. Click "Verify Key"
4. Save

**Config File:**
```json
{
  "malwareScanning": {
    "virusTotalApiKey": "YOUR_VT_KEY_HERE"
  }
}
```

**Environment Variable:**
```bash
export VIRUSTOTAL_API_KEY=your_key_here
```

#### Rate Limiting

Free tier limits:
- 4 requests per minute
- 500 per day
- Queue scans to avoid hitting limits

```typescript
// Automatic rate limiting
const scanQueue = new PQueue({
  interval: 60 * 1000,  // 1 minute
  maxSize: 4            // 4 requests
})

scanQueue.add(() => virusTotal.scan(file))
```

#### Caching to Reduce API Calls

```typescript
// VirusTotal results cached 7 days
const virusTotalCache = new Map()

// Check cache first
const cached = virusTotalCache.get(fileHash)
if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
  return cached.result  // No API call
}

// If cache miss, call API
const result = await virusTotalApi.query(fileHash)
virusTotalCache.set(fileHash, {
  result,
  timestamp: Date.now()
})
```

---

## Security Configuration

### File Extension Blacklist

```json
{
  "malwareScanning": {
    "fileExtensionBlacklist": [
      ".exe",    // Executable
      ".dll",    // Dynamic library
      ".sys",    // System driver
      ".bat",    // Batch script
      ".cmd",    // Command script
      ".scr",    // Screensaver
      ".msi",    // Windows installer
      ".vbs",    // VBScript
      ".ps1"     // PowerShell
    ],
    "fileExtensionWhitelist": [
      ".png",    // Images
      ".jpg",
      ".json",   // Data files
      ".xml",
      ".lua",    // Scripts (safe)
      ".txt",    // Text
      ".md"      // Documentation
    ]
  }
}
```

### Malware Scanning Levels

```json
{
  "malwareScanning": {
    "scanLevel": "standard"  // quick, standard, deep
  }
}
```

**Quick Mode** (fastest):
- Tier 1 only (extension check)
- ~10ms per file
- Use for fast browsing

**Standard Mode** (default):
- Tier 1-3 (extensions, PE headers, VirusTotal)
- ~500-1000ms per file
- Good balance of speed and safety

**Deep Mode** (thorough):
- All tiers including YARA
- ~2000-5000ms per file
- Maximum security
- Use before critical installations

---

## YARA Rules Installation (Optional)

### Install YARA Binary

#### Windows

```powershell
# Download from GitHub releases
# https://github.com/VirusTotal/yara/releases

# Or use Chocolatey
choco install yara

# Verify
yara --version
```

#### macOS

```bash
# Homebrew
brew install yara

# Verify
yara --version
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get install yara

# Fedora
sudo dnf install yara

# Build from source
git clone https://github.com/VirusTotal/yara.git
cd yara
./bootstrap.sh
./configure
make
sudo make install
sudo ldconfig

# Verify
yara --version
```

### Download YARA Rules

```bash
# Yara Rules Repository
git clone https://github.com/Yara-Rules/rules.git /usr/share/yara/rules/

# Or download curated rules
mkdir -p /usr/share/yara/rules/
cd /usr/share/yara/rules/

# Malware signatures
wget https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/MALW_APT.yar
wget https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/MALW_Trojan.yar
wget https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/MALW_Ransomware.yar

# Make readable
chmod -R 644 /usr/share/yara/rules/
```

### Configure YARA Rules Path

```json
{
  "malwareScanning": {
    "enableYara": true,
    "yaraRulesPath": "/usr/share/yara/rules/"
  }
}
```

**Verify YARA Setup:**

```bash
# Test with YARA
yara -r /usr/share/yara/rules/ /path/to/test/file.exe

# Should show matched rules if any
```

---

## File Permissions & Filesystem Requirements

### Filesystem Compatibility

| OS | Filesystem | Hardlinks | Reflinks | Notes |
|----|-----------|-----------|----------|-------|
| Windows | NTFS | Yes | No | Recommended |
| Windows | ReFS | Yes | Yes | Copy-on-Write |
| Windows | FAT32 | No | No | Avoid (no hardlinks) |
| macOS | APFS | Yes | Yes | Recommended |
| macOS | HFS+ | Yes | No | Older Macs |
| Linux | ext4 | Yes | No | Common |
| Linux | Btrfs | Yes | Yes | Copy-on-Write |

### Directory Permissions

**Y-Core needs:**
- Read/write access to installation directory
- Read/write access to backup directory
- Read/write access to database file
- Read/write access to logs directory

```bash
# Linux/macOS - fix permissions if needed
chmod 755 ~/.config/Y-Core/
chmod 644 ~/.config/Y-Core/settings.json
chmod 644 ~/.config/Y-Core/mods-database.db

# If running as different user
sudo chown $USER:$GROUP ~/.config/Y-Core/
```

### Disk Space Requirements

```
Minimum:   2 GB (system files)
Recommended: 10 GB (with 1-2 backups)
Large setup: 100+ GB (many games, extensive backup history)

Backup storage calculation:
  = (mod_size × backup_count) × deduplication_ratio
  = (500 MB × 5) × 0.3  // with hardlinks
  = 750 MB (instead of 2.5 GB without)
```

---

## Production Deployment

### Pre-Deployment Checklist

```
☐ Node.js 18+ installed
☐ SQLite3 properly installed
☐ Steam API key configured and tested
☐ VirusTotal API key configured (optional)
☐ YARA rules installed (optional)
☐ Firewall rules allowing app
☐ Backup location has write access
☐ Database has backup copy
☐ Logs configured with rotation
☐ Monitoring tools installed
```

### Build Production Package

```bash
# Build React app
npm run build

# Build Electron app
npm run electron:build

# Creates:
# - dist/   (web app)
# - dist-electron/  (preload scripts)
# - Y-Core-Setup-1.0.0.exe  (Windows installer)
# - Y-Core-1.0.0.dmg  (macOS installer)
# - y-core_1.0.0_amd64.AppImage  (Linux)
```

### Docker Deployment (Backend Server)

```dockerfile
# Dockerfile for backend server
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm install -g pm2

# Copy application
COPY electron/services ./services
COPY electron/modules ./modules
COPY electron/common ./common

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Set environment
ENV NODE_ENV=production
ENV LOG_LEVEL=warn

# Expose API port
EXPOSE 3000

# Start with PM2
CMD ["pm2-runtime", "start", "server.js", "--name", "y-core-backend"]
```

```bash
# Build Docker image
docker build -t y-core:latest .

# Run container
docker run -d \
  --name y-core \
  -p 3000:3000 \
  -v y-core-data:/root/.config/Y-Core \
  -e STEAM_API_KEY=your_key \
  -e VIRUSTOTAL_API_KEY=your_key \
  y-core:latest
```

### Kubernetes Deployment (Optional)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: y-core
spec:
  replicas: 2
  selector:
    matchLabels:
      app: y-core
  template:
    metadata:
      labels:
        app: y-core
    spec:
      containers:
      - name: y-core
        image: y-core:latest
        ports:
        - containerPort: 3000
        env:
        - name: STEAM_API_KEY
          valueFrom:
            secretKeyRef:
              name: y-core-secrets
              key: steam-api-key
        - name: VIRUSTOTAL_API_KEY
          valueFrom:
            secretKeyRef:
              name: y-core-secrets
              key: virustotal-api-key
        volumeMounts:
        - name: data
          mountPath: /root/.config/Y-Core
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: y-core-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: y-core-service
spec:
  selector:
    app: y-core
  ports:
  - protocol: TCP
    port: 3000
    targetPort: 3000
  type: LoadBalancer
```

```bash
# Deploy to Kubernetes
kubectl apply -f deployment.yaml
kubectl get pods -l app=y-core
```

### PM2 Production Process Manager

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'y-core',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '512M',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'backups'],
    restart_delay: 4000
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Enable startup on reboot
pm2 startup
pm2 save

# Restart after reboot
sudo pm2 restart ecosystem.config.js
```

---

## Monitoring & Health Checks

### Health Check Endpoint

```typescript
// Add to main.ts or server
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    database: await checkDatabase(),
    cache: checkCache(),
    malwareScanner: checkMalwareScanner(),
    backupManager: checkBackupManager()
  }
  res.json(health)
})

// Check database
async function checkDatabase() {
  try {
    const result = await db.get('SELECT count(*) FROM installed_mods')
    return { status: 'ok', modsCount: result.count }
  } catch (err) {
    return { status: 'error', error: err.message }
  }
}

// Check cache
function checkCache() {
  const stats = cache.getStats()
  return {
    status: stats.entriesCount > 0 ? 'ok' : 'empty',
    entries: stats.entriesCount,
    hitRate: stats.hitRate
  }
}

// Check scanner
function checkMalwareScanner() {
  const stats = scanner.getScanStats()
  return {
    status: stats.totalScans > 0 ? 'ok' : 'not-used',
    totalScans: stats.totalScans,
    blocked: stats.totalFilesBlocked
  }
}

// Check backup
function checkBackupManager() {
  const stats = backupManager.getGlobalStatistics()
  return {
    status: stats.totalBackups > 0 ? 'ok' : 'none',
    totalBackups: stats.totalBackups,
    totalStorage: formatBytes(stats.totalStorage)
  }
}
```

### Monitoring Services

#### Prometheus Metrics (Optional)

```typescript
// prometheus.ts
import { register, Counter, Gauge, Histogram } from 'prom-client'

export const installCounter = new Counter({
  name: 'y_core_installs_total',
  help: 'Total mod installations'
})

export const scanCounter = new Counter({
  name: 'y_core_scans_total',
  help: 'Total malware scans'
})

export const backupGauge = new Gauge({
  name: 'y_core_backups_total',
  help: 'Total backups'
})

export const scanDuration = new Histogram({
  name: 'y_core_scan_duration_seconds',
  help: 'Scan duration in seconds'
})

// Usage in handlers
installCounter.inc()
scanDuration.observe(elapsedSeconds)
backupGauge.set(totalBackups)

// Export metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(register.metrics())
})
```

#### New Relic Integration (Optional)

```bash
# Install New Relic
npm install newrelic

# Create newrelic.js
newrelic.js require('./config/newrelic.js')

# Set license key
export NEW_RELIC_LICENSE_KEY=your_key
export NEW_RELIC_APP_NAME=Y-Core

# Run with New Relic
node -r newrelic server.js
```

### Log Monitoring

```bash
# Linux: tail logs in real-time
tail -f ~/.local/share/Y-Core/logs/app.log

# Watch for errors
tail -f ~/.local/share/Y-Core/logs/app.log | grep ERROR

# Count log entries by level
grep -c INFO ~/.local/share/Y-Core/logs/app.log
grep -c ERROR ~/.local/share/Y-Core/logs/app.log

# Archive old logs
find ~/.local/share/Y-Core/logs/ -name "*.log" -mtime +30 -exec gzip {} \;
```

---

## Upgrade Path (v1 → v2)

### Preparation

```bash
# 1. Backup database
cp ~/.config/Y-Core/mods-database.db ~/.config/Y-Core/mods-database.db.backup

# 2. Backup settings
cp ~/.config/Y-Core/settings.json ~/.config/Y-Core/settings.json.backup

# 3. Note current version
y-core --version  # Should show 1.0.0
```

### Upgrade Steps

```bash
# Windows installer
# 1. Download Y-Core-Setup-2.0.0.exe
# 2. Run installer (it detects v1 installation)
# 3. Click "Upgrade"
# 4. Settings/database preserved
# 5. Restart Y-Core

# macOS
# 1. Download Y-Core-2.0.0.dmg
# 2. Drag Y-Core to Applications (replaces v1)
# 3. Settings/database preserved
# 4. Restart Y-Core

# Linux
sudo apt update
sudo apt install --only-upgrade y-core

# Verify upgrade
y-core --version  # Should show 2.0.0
```

### Migration Steps

```typescript
// Automatic schema migrations run on startup
// ModsDatabaseService.runMigrations() checks version

// Example migration from v1 to v2
migration_v2_001: async (db) => {
  // Add new columns to installed_mods
  await db.run(`
    ALTER TABLE installed_mods
    ADD COLUMN dependencies_v2 TEXT
  `)
  
  // Migrate data from old format
  const mods = await db.all('SELECT * FROM installed_mods')
  for (const mod of mods) {
    const deps = parseOldDependencyFormat(mod.dependencies)
    await db.run(`
      UPDATE installed_mods
      SET dependencies_v2 = ?
      WHERE id = ?
    `, [JSON.stringify(deps), mod.id])
  }
}
```

### Rollback Plan

```bash
# If upgrade fails, rollback to v1

# 1. Restore from backup
cp ~/.config/Y-Core/mods-database.db.backup ~/.config/Y-Core/mods-database.db
cp ~/.config/Y-Core/settings.json.backup ~/.config/Y-Core/settings.json

# 2. Uninstall v2
# Windows: Control Panel → Uninstall Program → Y-Core → Uninstall
# macOS: Trash Y-Core from Applications
# Linux: sudo apt remove y-core

# 3. Install v1
# From: https://github.com/Y-Core/mod-manager/releases/tag/v1.0.0

# 4. Restart Y-Core
```

### Data Compatibility

**Compatible data:**
- Installed mod list ✓
- Backup history ✓
- Settings ✓
- Database ✓

**Schema updates handled automatically:**
- New columns added with defaults
- Old columns preserved
- Data migrated in migrations
- Indexes recreated if needed

---

## Troubleshooting

### Application Won't Start

```
Error: "Cannot find module 'electron'"

Solution:
1. npm install --save-dev electron
2. npm run electron:dev

Or: Your node_modules might be corrupted
1. rm -rf node_modules package-lock.json
2. npm install
3. npm run electron:dev
```

### Database Locked Error

```
Error: "database is locked"

Cause: Multiple instances running or lock file stuck

Solution:
# Option 1: Restart app
Close all Y-Core windows
Wait 30 seconds
Restart

# Option 2: Remove lock file
# Windows
del %APPDATA%\YCore\*.lock

# macOS/Linux
rm ~/.config/Y-Core/*.lock

# Option 3: Reset database
rm ~/.config/Y-Core/mods-database.db
# App will recreate on next start
```

### VirusTotal API Rate Limited

```
Error: "Rate limit exceeded. 4 requests per minute"

Solution:
1. Wait 60 seconds before next scan
2. Upgrade VirusTotal account for higher limits
3. Use standard scan level (not deep)
4. Cache results help reduce API calls
```

### Malware Scan Very Slow

```
Cause: YARA binary missing or rules too large

Solution:
# Install YARA
brew install yara  # macOS
sudo apt install yara  # Linux

# Or disable YARA
settings.json: "enableYara": false

# Use standard level instead of deep
```

### Backup Creation Fails

```
Error: "No space left on device"

Solution:
1. Clean up old backups
   backup-manager.cleanupOldBackups(gameId)
2. Check disk space
   df -h  # Linux/macOS
3. Move backups to larger drive
   Copy ~/.config/Y-Core/mod-backups/ to new location
   Update settings.json with new path
```

### Performance Issues

```
Lag/freezing while using app

Likely causes:
1. Too many mods (1000+): Add database indexes
2. Virus scan running: Let it finish
3. Large backup: Wait for completion
4. Cache size too large: Clear cache

Solutions:
# Clear cache
curl http://localhost:3000/api/mods/clear-cache

# Disable features if not needed
settings.json: "enableMalwareScanning": false

# Increase hardware resources
Increase available RAM
Close other applications
```

---

## Success Indicators

After successful deployment:

✓ Y-Core opens without errors  
✓ Can search Steam Workshop mods  
✓ Can install and enable mods  
✓ Backups create successfully  
✓ Malware scanning completes  
✓ Database queries respond <100ms  
✓ Logs rotate properly  
✓ No errors in logs  
✓ VirusTotal API key works  
✓ Settings persist after restart  

---

## Support & Resources

**Documentation:**
- Architecture: ARCHITECTURE_COMPLETE.md
- Database Schema: DATABASE_SCHEMA.md
- API Reference: API_COMPLETE_REFERENCE.md

**Community:**
- Issues: https://github.com/Y-Core/mod-manager/issues
- Discussions: https://github.com/Y-Core/mod-manager/discussions
- Discord: https://discord.gg/y-core

**Official:**
- Website: https://y-core.dev
- Releases: https://github.com/Y-Core/mod-manager/releases
- Docs: https://docs.y-core.dev

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-29  
**Status:** Complete & Ready for Deployment
