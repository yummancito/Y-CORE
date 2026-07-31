# Y-Core Mod Manager - Troubleshooting Guide

## Quick Problem Finder

Find your issue below and jump to the solution:

| Problem | Solution Link |
|---------|---------------|
| Mod won't install | [Installation Won't Complete](#installation-wont-complete) |
| "File not found" error | [File Path Errors](#file-path-errors) |
| Game crashes after mods | [Game Crashes](#game-crashes-after-installing-mods) |
| Mods aren't showing up in game | [Mods Not Working](#mods-arent-working-in-game) |
| Malware warning/quarantine | [Malware Concerns](#dealing-with-malware-warnings) |
| Can't find backup | [Missing Backups](#missing-backups) |
| Backup creation failed | [Backup Creation Issues](#backup-creation-fails) |
| Mod Manager is slow | [Performance Issues](#performance-and-speed-issues) |
| Load order won't save | [Load Order Problems](#load-order-not-saving) |
| Mod Manager won't launch | [Application Won't Start](#mod-manager-wont-launch) |
| Can't uninstall a mod | [Uninstallation Errors](#cant-uninstall-mod) |
| Duplicate mods showing | [Mod List Issues](#mod-list-shows-duplicates-or-missing) |

---

## Installation Won't Complete

### Complete Installation Flowchart

```
You click "Instalar" (Install)
│
├─ Does download bar appear?
│  │
│  ├─ NO → [No Download Bar](#no-download-bar)
│  │
│  └─ YES → Download starts
│     │
│     ├─ Download completes quickly?
│     │  │
│     │  ├─ NO → [Download Speed Issues](#download-is-extremely-slow)
│     │  │
│     │  └─ YES → Move to scanning phase
│     │     │
│     │     ├─ Scan completes successfully?
│     │     │  │
│     │     │  ├─ NO → [Scan Failed](#malware-scan-fails)
│     │     │  │
│     │     │  └─ YES → Installation phase
│     │     │     │
│     │     │     ├─ Files are extracted?
│     │     │     │  │
│     │     │     │  ├─ NO → [Extraction Failed](#extraction-fails-during-install)
│     │     │     │  │
│     │     │     │  └─ YES → Complete!
```

### No Download Bar

**Symptoms:**
- Click Install
- Nothing happens
- No progress bar appears
- After 30+ seconds, error message

**Possible causes:**
1. Internet connection down
2. Steam Workshop temporarily unavailable
3. Y-Core permission issue
4. Firewall blocking connection

**Solutions (try in order):**

**Fix 1: Check Internet Connection**
1. Open your web browser
2. Go to google.com
3. If page loads → internet is fine
4. If page doesn't load → restart WiFi/modem
   - Restart router
   - Wait 30 seconds
   - Try installing again

**Fix 2: Verify Steam Service is Available**
1. Open Steam client
2. Try downloading a game update
3. If Steam download works → Steam is fine
4. If Steam is down → wait for Steam to recover
   - Check: steampowered.com/status

**Fix 3: Check Y-Core Permissions**
1. Close Y-Core completely
2. Right-click Y-Core shortcut
3. Select "Run as Administrator"
4. Try installing again

**Fix 4: Firewall/Antivirus**
1. Open Windows Defender settings
2. Go to "Firewall & network protection"
3. Click "Allow an app through firewall"
4. Check if Y-Core is listed
5. If not, click "Add an app"
6. Find Y-Core and add it
7. Try installing again

**Fix 5: Clear Cache and Retry**
1. Open Y-Core Settings
2. Click "Clear Cache"
3. Restart Y-Core
4. Try installing again

**If nothing works:** See [Contact Support](#contact-support-checklist) section

### Download is Extremely Slow

**Symptoms:**
- Download starts
- Progress bar barely moves
- Taking hours for a small mod

**Speed expectations:**
- Small mod (100MB): should take 10-30 seconds
- Medium mod (500MB): should take 1-2 minutes
- Large mod (2GB): should take 5-10 minutes
- *If much slower, something's wrong*

**Solutions:**

**Fix 1: Check Your Internet Speed**
1. Open speedtest.net in browser
2. Click "Go" button
3. Wait for results
   - Download speed should be 5+ Mbps
   - If less than 1 Mbps → call your ISP

**Fix 2: Reduce Network Congestion**
1. Close other programs using internet:
   - YouTube/Netflix
   - Torrent clients
   - Large file uploads
   - Gaming on other devices
2. Restart router
3. Try again

**Fix 3: Change Download Server**
1. Open Y-Core Settings
2. Look for "Download Server" or "Server Region"
3. Try selecting a different region/server
4. Try installing again

**Fix 4: Check Disk Speed**
1. During download, open Task Manager
2. Go to Performance tab
3. Click Disk
4. Check "Disk Utilization"
   - Should be 100% while downloading
   - If much lower → slow disk drive
   - Not Y-Core's fault, likely your storage

**If it's a slow disk:**
- Download to external SSD instead
- Or upgrade to SSD (best long-term fix)

### Malware Scan Fails

**Symptoms:**
- Download completes
- Scan starts
- Scan error appears
- Installation stops

**Common scan error messages:**

**Error: "VirusTotal API Timeout"**
- VirusTotal servers are slow
- Network is slow
- Y-Core waited too long for response

**Fix:**
1. Settings > Malware Scanning
2. Look for "Timeout" setting
3. Increase timeout from 30s to 60s
4. Try installing again

**Error: "Unable to reach malware database"**
- Y-Core can't reach online scanning service
- Local scanning failed

**Fix:**
1. Check internet connection (see above)
2. Settings > Clear Cache
3. Try again

**Error: "Scan engine corrupted"**
- Local scan files got damaged
- Need to redownload

**Fix:**
1. Settings > Advanced
2. "Repair Scan Engines"
3. Wait for download to complete
4. Try installing again

### Extraction Fails During Install

**Symptoms:**
- Download and scan complete
- Installation starts
- Extraction error appears
- Mod can't be installed

**Common error messages:**

**Error: "Insufficient disk space"**
- Not enough free space
- Mod is too large for remaining space

**Fix:**
1. Check free disk space:
   - File Explorer > This PC
   - Right-click drive > Properties
   - Look at "Free space"
2. Need at least: Mod size × 2 + 1GB buffer
3. Free up space by:
   - Deleting old backups (Settings > Backups)
   - Clearing cache (Settings > Clear Cache)
   - Moving old files to external drive
4. Try again

**Error: "Archive is corrupted"**
- Downloaded mod file is damaged
- Incomplete download

**Fix:**
1. Settings > Clear Cache
2. Settings > Clear Downloads
3. Try installing again
4. If still fails, mod might be bad
5. Try installing a different mod

**Error: "Permission denied"**
- Y-Core doesn't have write permissions
- Game folder read-only

**Fix:**
1. Right-click game folder
2. Properties > General
3. Uncheck "Read-only" box
4. Click Apply > OK
5. Try again

---

## File Path Errors

### "Game Path Not Found"

**What it means:**
- Y-Core can't find your game installation
- Game folder path is wrong or deleted

**How to fix:**

1. Open Y-Core Settings
2. Find "Game Paths" section
3. Look for the game showing error
4. Click the folder icon to browse
5. Navigate to your game folder
   - Default locations:
   - Steam: C:\Program Files (x86)\Steam\steamapps\common\[GameName]
   - Epic Games: C:\Program Files\Epic Games\[GameName]
   - Standalone: Wherever you installed it
6. Click Select
7. Y-Core verifies the path
8. Try installing again

**If can't find game:**
1. Verify game is actually installed
2. Open Steam/Epic Launcher
3. Find game in library
4. Check if it says "Installed"
5. If not installed, install it first
6. Then retry in Y-Core

### "Mod Directory Not Set"

**What it means:**
- Y-Core doesn't know where to put mods
- Game mods folder path is missing

**How to fix:**

1. Open Y-Core Settings
2. Find "Mod Paths" or "Installation Directory"
3. Click "Auto-detect"
4. Or manually browse to: [GameFolder]/Mods/
5. If that folder doesn't exist, create it
   - Open File Explorer
   - Navigate to [GameFolder]
   - Right-click > New Folder
   - Name it "Mods"
6. Click Select in Y-Core
7. Try again

---

## Game Crashes After Installing Mods

### Complete Diagnostic Flowchart

```
Game crashes after installing mods
│
├─ Does game crash on startup immediately?
│  │
│  ├─ YES → [Immediate Crash](#immediate-crash-on-startup)
│  │
│  └─ NO → Crash happens during gameplay
│     └─ [Game Crashes During Play](#crash-during-gameplay-not-startup)
```

### Immediate Crash on Startup

**Symptoms:**
- Click Play
- Loading screen briefly appears
- Game closes immediately
- No error message

**Diagnosis: Which mod is causing it?**

1. Go to "Mis Mods"
2. Note which mods were installed most recently
3. Disable your 3 most recent mods (click eye icon)
4. Restart game
5. Does it now run without crashing?

**If game runs now:**
- One of those 3 mods is the culprit
- Re-enable them one by one
- Test game after each
- When it crashes again, you found it

**If game still crashes:**
- Disable more mods (try disabling all mods)
- If game runs with zero mods → it's a mod issue
- If still crashes with zero mods → not a mod problem

**Once you identified the problem mod:**

**Option 1: Uninstall problematic mod**
1. Right-click the mod
2. Click Uninstall
3. Confirm deletion
4. Restart game
5. Should be fixed

**Option 2: Check for mod updates**
1. Go to "Catálogo"
2. Search for mod name
3. If newer version exists:
   - Uninstall old version
   - Install new version
   - Restart game
4. Older mod might be incompatible with game updates

**Option 3: Check dependencies**
1. Click on the problematic mod
2. Look for "Requires:" section
3. Check if all dependencies are installed
4. Install any missing dependencies
5. Restart game

**Option 4: Check load order**
1. Go to "Mis Mods"
2. Click "Sugerir Orden"
3. Let Y-Core auto-fix the order
4. Restart game

### Crash During Gameplay (Not Startup)

**Symptoms:**
- Game starts fine
- Game runs for 5-60 minutes
- Then crashes to desktop
- Usually while doing something specific (combat, certain areas, etc.)

**Diagnosis:**

**Is it happening in a specific location?**
1. Note where the crash happens
2. Go to that location again
3. See if it crashes in same spot
4. If yes → likely a mod editing that area

**Is it happening during specific action?**
1. Note what you were doing (combat, casting spell, etc.)
2. Try to reproduce it
3. If always crashes doing same thing → mod conflict

**Finding the culprit mod:**

For location-based crashes:
1. Note the location name
2. Disable graphics/visual mods first
3. These often conflict in specific areas
4. Restart and try same location
5. If works → one of those mods is issue

For action-based crashes:
1. Disable gameplay mods
2. Combat tweaks, spell mods, etc.
3. Test the action again
4. If works → one of those is issue

### Testing with Backups

If you can't figure out which mod:

1. Go to Backups
2. Find a backup from before the crash
3. Click "Restaurar"
4. Game reverts to previous state
5. Mods from after that backup are removed
6. This tells you which mod install caused it

---

## Mods Aren't Working in Game

### "I Installed the Mod But Don't See It"

**Step 1: Verify Mod is Enabled**

1. Go to "Mis Mods"
2. Find your mod
3. Look at the eye icon:
   - 👁️ Open eye = enabled
   - 🚫 Crossed eye = disabled
4. If crossed, click it to enable
5. Restart game (IMPORTANT!)
6. Check if mod works now

**Step 2: Check Load Order (Skyrim/Fallout)**

1. Go to "Mis Mods"
2. Click "Sugerir Orden"
3. Let Y-Core arrange mods optimally
4. Restart game
5. Check mod now

**Step 3: Verify Dependencies**

1. Click on your mod
2. Look for "Requires:" section
3. Check you have all requirements
4. If missing any, install them
5. Restart game

**Step 4: Game Version Compatibility**

1. Check game version in Steam:
   - Right-click game
   - Properties > General
   - Find version number
2. Click on mod
3. Look for "Compatible with:" section
4. Verify mod says your version
5. Example: "Skyrim SE" ≠ "Skyrim VR"
6. If incompatible, uninstall and find right version

**Step 5: Mod Type Specific**

**For graphics/texture mods:**
- Wait 60 seconds after game loads
- Graphics take longer to load
- Check specific locations (outdoors, inside, specific NPCs)
- Try adjusting graphics settings down then back up
- This forces game to reload textures

**For gameplay/feature mods:**
- Create a new game character if possible
- Sometimes mods don't apply to existing saves
- Start new game to see mod features

**For NPC/character mods:**
- May only apply to new NPCs
- Try spawning a new character or NPC
- Existing characters might not update

**Step 6: Last Resort - Reinstall**

1. Go to "Mis Mods"
2. Right-click mod > Uninstall
3. Restart game once
4. Go to "Catálogo"
5. Search for mod again
6. Install fresh copy
7. Restart game

---

## Dealing with Malware Warnings

### Understanding Malware Scan Results

**Green ✅ CLEAN**
- Safe to install
- Thoroughly scanned
- No threats found

**Orange ⚠️ SUSPICIOUS**
- Might be okay
- Some antivirus engines flagged it
- Check community reviews
- Consider alternative mods

**Red ❌ INFECTED/QUARANTINED**
- Do not install
- Definitely malicious
- Y-Core blocked it for safety
- Find alternative mod instead

### "Mod Flagged as Malware But I Trust It"

**Only consider if:**
- 100,000+ people downloaded it (no way that many got hacked)
- 4+ star rating with 10,000+ reviews
- Very old mod (false positives on old code)
- Creator is well-known
- Community defends it in reviews

**To install anyway:**

1. Read multiple reviews - check for complaints
2. Search community forums - ask if it's safe
3. If 100+ reviews say "safe/works" → probably ok
4. Click "Install Anyway"
5. **Monitor your PC for 24 hours:**
   - Watch for unusual behavior
   - Check Task Manager for strange processes
   - Scan your PC with antivirus after

**Better option:** Find alternative mod
- 1000+ mods do almost anything
- If one is suspicious, just use different one
- No reason to risk it

### "False Positive? How Do I Report It?"

Some mods get flagged incorrectly:

1. If mod is clearly safe (100k downloads, 5 stars)
2. And you installed anyway without issues
3. Help the community:
   - Go to mod page on Steam Workshop
   - Leave review: "No issues, works fine"
   - Report the false positive to mod creator
   - Creator can contact antivirus companies

---

## Load Order Not Saving

### Load Order Changes Disappear

**Symptom:**
- You manually drag mods to new order
- Change order, see it update
- Restart game
- Order reverts to previous

**Causes:**
1. Changes weren't actually saved
2. Load order file got corrupted
3. Write permission problem

**Fixes:**

**Fix 1: Use Auto-Suggest Feature**
1. Go to "Mis Mods"
2. Click "Sugerir Orden"
3. Let Y-Core arrange them
4. Should save automatically
5. Restart game to verify

**Fix 2: Manual Reordering**
1. If drag-and-drop doesn't save:
2. Click on mod
3. Look for "Load Order" field
4. Type a number (1, 2, 3, etc.)
5. Press Save
6. Should persist

**Fix 3: Check Folder Permissions**
1. Find where load order file is stored
2. Usually: [GameFolder]/Mods/load-order.json
3. Right-click file > Properties
4. Check if Read-only is checked
5. If yes, uncheck it
6. Click Apply > OK

**Fix 4: Check Y-Core Permissions**
1. Close Y-Core completely
2. Right-click Y-Core
3. Run as Administrator
4. Try reordering again
5. Try to save

---

## Missing Backups

### Backup Disappeared

**Step 1: Is It Really Gone?**

1. Go to "Gestor Activos"
2. Click "Copias de Seguridad" section
3. Scroll through entire list
4. Search by mod name
5. Check "Archive" or "Old Backups" section
6. If you find it → use it to restore

**Step 2: Check Retention Settings**

1. Open Settings
2. Find "Backup Retention" setting
3. Check what it says:
   - "Delete after 30 days"
   - "Delete after 7 days"
   - "Keep forever"
4. If set to 7 or 30 days:
   - Old backups auto-delete
   - This is intentional to save space

**Step 3: Check Backup Folder**

1. Settings > Backup Path
2. Note the folder path
3. Open File Explorer
4. Navigate to that folder
5. Look for .backup files
6. If folder is empty → backups deleted

**Step 4: Restore from System Backup**

Windows keeps its own backups:

1. Open File Explorer
2. Right-click game folder
3. Select "Restore previous versions"
4. See list of dated versions
5. Select one before the problem
6. Click "Restore"
7. Windows reverts to that date

---

## Backup Creation Fails

### Backup Process Stops with Error

**Error: "Insufficient disk space"**

**What it means:**
- Not enough free space
- Backup needs space equal to backup size

**How much space do you need?**
- Standard: 1GB free minimum
- Large mods: 5-10GB free
- Safety buffer: Always keep 10% drive free

**How to fix:**

1. File Explorer > This PC
2. Right-click drive > Properties
3. Check "Free space"
4. Delete unnecessary files:
   - Old backups: Settings > Backups > Delete old ones
   - Temp files: Settings > Clear Cache
   - Downloads folder
   - Recycle Bin: Empty it
5. Try creating backup again

**Error: "Permission denied"**

**What it means:**
- Y-Core can't write to backup folder
- Folder is read-only

**How to fix:**

1. Find backup folder:
   - Settings > Backup Path
2. Right-click folder > Properties
3. Look for "Read-only" checkbox
4. If checked:
   - Uncheck it
   - Click Apply > OK
5. Try backup again

**Error: "Backup directory not found"**

**What it means:**
- Backup folder path is wrong
- Folder was deleted

**How to fix:**

1. Settings > Backup Path
2. If showing red error:
   - Path doesn't exist
3. Click the folder icon to browse
4. Create new backup folder:
   - Or select existing folder
5. Click Select
6. Try backup again

---

## Mod Manager Won't Launch

### Y-Core Starts But Doesn't Load

**Symptom:**
- Click Y-Core icon
- Splash screen appears
- Application hangs
- Never reaches main window

**Fixes (try in order):**

**Fix 1: Wait for Load**
- Sometimes takes 30+ seconds first launch
- Let it run for 2 minutes
- If nothing happens, go to Fix 2

**Fix 2: Clear Cache**
1. Open File Explorer
2. Go to: %APPDATA%\Y-Core\
3. Find "cache" folder
4. Delete it completely
5. Start Y-Core again

**Fix 3: Repair Installation**
1. Right-click Y-Core shortcut
2. Open file location
3. Find the Y-Core executable file
4. Right-click it > Properties
5. Compatibility tab
6. Check "Run this program in compatibility mode"
7. Select "Windows 10"
8. Click Apply > OK
9. Start Y-Core

**Fix 4: Reinstall Y-Core**
1. Uninstall Y-Core from Control Panel
2. Delete leftover files:
   - %APPDATA%\Y-Core\
   - Entire folder
3. Restart computer
4. Reinstall Y-Core fresh from source
5. Launch again

### Y-Core Crashes on Startup

**Symptom:**
- Click Y-Core
- Loads for 2-5 seconds
- Crashes to desktop
- No error message or error code shown

**Fixes:**

**Fix 1: Check System Requirements**
- Windows 10 or later
- 4GB RAM minimum
- 500MB free disk space
- Check your PC meets these

**Fix 2: Run as Administrator**
1. Right-click Y-Core
2. "Run as Administrator"
3. Click Yes if prompted
4. Does it now run?

**Fix 3: Check for Conflicting Software**
Programs that might conflict:
- Other mod managers
- Certain antivirus software
- Virtual machine software
- Sandboxing software

Try:
1. Temporarily disable antivirus
2. Close other mod managers
3. Try launching Y-Core
4. If works → disable the conflicting program

**Fix 4: Update Graphics Drivers**
- Outdated drivers can cause crashes
- Visit graphics card website
- Download latest driver
- Install it
- Restart computer
- Try Y-Core

---

## Can't Uninstall Mod

### Uninstall Button Grayed Out

**Symptom:**
- Try to uninstall mod
- Delete button is disabled (grayed out)
- Can't click it

**Causes:**
1. Mod is currently in use by game
2. File is locked
3. Permissions problem

**Fixes:**

**Fix 1: Close Game**
1. Make sure game is completely closed
2. Not just paused, fully close it
3. Close game launcher too
4. Wait 10 seconds
5. Try uninstalling again

**Fix 2: Disable Mod First**
1. In "Mis Mods"
2. Click eye icon to disable mod
3. Wait 5 seconds
4. Try uninstalling
5. Should work now

**Fix 3: Force Delete**
1. If still grayed out:
2. Click mod's three-dot menu (⋮)
3. Look for "Force Delete" or "Remove Anyway"
4. Confirm deletion
5. May take longer but forces removal

### "Uninstall Failed - File in Use"

**Symptom:**
- Click uninstall
- Progress bar starts
- Error: "File is in use"
- Uninstall stops

**Causes:**
- Game process still running
- File manager accessing the file
- Antivirus scanning the file

**Fixes:**

**Fix 1: Restart Computer**
1. Close everything
2. Restart your PC
3. Open Y-Core
4. Try uninstalling again
5. Highest success rate

**Fix 2: Uninstall from Safe Mode**
1. Restart computer
2. Hold Shift while clicking Restart
3. Choose Troubleshoot > Advanced > Startup Settings
4. Press 4 for Safe Mode
5. Log in
6. Open Y-Core
7. Try uninstall
8. Restart normally

**Fix 3: Delay and Retry**
1. Don't retry immediately
2. Wait 5 minutes
3. Try again
4. Sometimes files unlock after delay

---

## Performance and Speed Issues

### Y-Core is Running Slowly

**Symptom:**
- Clicking buttons is slow/unresponsive
- Loading mods list takes long time
- Scrolling is jerky
- Scanning takes forever

**Fixes:**

**Fix 1: Clear Cache**
1. Settings > Clear Cache
2. Restarts the cache system
3. Can improve speed dramatically

**Fix 2: Close Other Programs**
1. Open Task Manager (Ctrl+Shift+Esc)
2. Close unnecessary programs:
   - Chrome/Firefox
   - Discord
   - Streaming services
3. Free up RAM
4. Y-Core should be faster

**Fix 3: Update Y-Core**
1. Check for Y-Core updates
2. Updates often include speed fixes
3. Download latest version
4. Reinstall
5. Try again

**Fix 4: Disable Malware Scanning**
1. Settings > Malware Scanning
2. Temporarily turn off scanning
3. See if Y-Core is faster
4. Scanning can be resource-intensive
5. Consider fast scan instead of full scan

### Mod Installation is Slow

**Symptom:**
- Download starts
- Transfer speed is 100KB/s or less
- Would take hours for 500MB mod

**See:** [Download is Extremely Slow](#download-is-extremely-slow) section above

### Malware Scan Takes Forever

**Expected times:**
- Quick scan: 5-10 seconds
- Standard scan: 10-30 seconds
- Deep scan: 1-5 minutes
- *Very large mods may take longer*

**If taking 15+ minutes:**

**Fix 1: Skip Deep Scan**
1. Settings > Malware Scanning
2. Change from "Deep" to "Standard"
3. Still thorough, but faster
4. Try again

**Fix 2: Check VirusTotal Connectivity**
1. Settings > VirusTotal API
2. Test connection
3. If can't reach VirusTotal:
   - Firewall issue
   - Network issue
   - See Firewall Fix section
4. Restart router and try

---

## Mod List Issues

### Mod List Shows Duplicates or Missing

**Symptom:**
- Same mod appears twice in "Mis Mods"
- Or mod is missing from list when you know it's installed

**Causes:**
1. Database cache is corrupted
2. Mod file moved manually
3. List needs refresh

**Fixes:**

**Fix 1: Refresh List**
1. Go to "Mis Mods"
2. Click refresh icon (circular arrow, usually top-right)
3. Wait for list to reload
4. Duplicates/missing should resolve

**Fix 2: Clear Cache**
1. Settings > Clear Cache
2. Restart Y-Core
3. Go to "Mis Mods"
4. Should show correct list now

**Fix 3: Rebuild Database**
1. Settings > Advanced
2. Look for "Rebuild Mod Database"
3. Click it
4. Wait for scan to complete (1-5 minutes)
5. Should fix duplicates/missing issues

**Fix 4: Manual Fix for Duplicates**
1. If still seeing duplicates:
2. Uninstall one of the duplicates
3. Confirm deletion
4. Refresh the list
5. Should only show one now

### Searching for Mods Doesn't Work

**Symptom:**
- Type search term
- No results appear
- Or search hangs

**Fixes:**

**Fix 1: Clear Search**
1. Clear the search box
2. Press Enter or Search button
3. Full mod list reappears

**Fix 2: Check Internet Connection**
1. Search requires Steam Workshop connection
2. Verify internet works (open browser)
3. Try search again

**Fix 3: Refresh Catalog**
1. Click "Catálogo" tab
2. Look for Refresh button
3. Wait for catalog to reload
4. Try searching again

**Fix 4: Try Different Search Term**
1. Your search term might not match any mods
2. Try searching more general term
3. Example: Search "graphics" instead of "ultra graphics pro x"
4. See if results appear

---

## Performance and Stability

### Multiple Mods Causing Conflicts

**Symptom:**
- Game works with 5 mods
- Game works with 10 mods
- Game breaks with 15 mods
- Conflicts between mods

**Diagnostic:**

1. Go to "Gestor Activos"
2. Look for "Conflictos" (Conflicts) section
3. If highlighted in orange/red → conflicts exist
4. Click on conflict to see details:
   - Which mods conflict
   - What type of conflict
   - Recommended solution

**Fixes:**

**Fix 1: Follow Conflict Suggestions**
1. Read the conflict description
2. Y-Core often suggests fix:
   - Reorder mods
   - Uninstall one
   - Install patch
3. Follow suggestion
4. Test game

**Fix 2: Use Load Order Auto-Fix**
1. Go to "Mis Mods"
2. Click "Sugerir Orden"
3. Let Y-Core rearrange
4. Most conflicts resolve with correct order
5. Test game

**Fix 3: Uninstall One Conflicting Mod**
1. If conflict is severe
2. Uninstall the less essential mod
3. Keep the more critical one
4. Find alternative for the uninstalled mod
5. Test game

---

## Contact Support Checklist

If you've tried everything and nothing works, gather this information:

### Information to Collect

**About your system:**
- [ ] Windows version (10? 11? 12?)
- [ ] Available RAM (GB)
- [ ] Disk space free (GB)
- [ ] Graphics card model
- [ ] Game installed where? (C: drive path)

**About the problem:**
- [ ] Exact error message (screenshot or text)
- [ ] When does it happen? (installation/backup/scanning/etc.)
- [ ] First time it happened or happens always?
- [ ] Reproducible? (Can you make it happen again?)

**About your mod setup:**
- [ ] How many mods installed?
- [ ] Total size of all mods (GB)
- [ ] Which mod(s) cause the issue?
- [ ] Game you're modding

**Steps you've tried:**
- [ ] What fixes have you already attempted?
- [ ] What was the result of each attempt?
- [ ] Did any fix partially work?

**Y-Core information:**
- [ ] Y-Core version (Settings > About)
- [ ] When was it last updated?
- [ ] Any recent changes before problem started?

### Where to Get Help

1. **Y-Core Documentation**
   - Check USER_GUIDE_MOD_MANAGER.md (main guide)
   - Check MOD_MANAGER_FAQ.md (common questions)
   - These cover 80% of issues

2. **Game-Specific Communities**
   - Reddit: r/Skyrim, r/Fallout, etc.
   - Discord servers for your game
   - These know game-specific mod issues

3. **Mod Creator**
   - Go to mod page on Steam Workshop
   - Check mod's discussion/comments
   - Creator might have troubleshooting guide
   - Community often answers questions

4. **Y-Core Support**
   - If issue is Y-Core specific
   - Include checklist information above
   - Provide detailed reproduction steps
   - Attach screenshot if visual issue

---

## Preventive Maintenance

### Avoid Problems Before They Start

**Weekly:**
- Restart Y-Core once
- Restart your PC once
- Keeps everything fresh

**Monthly:**
- Clear cache: Settings > Clear Cache
- Delete old backups (keep recent ones)
- Verify game folder permissions
- Run one malware scan on all mods

**Quarterly (3 months):**
- Rebuild mod database: Settings > Rebuild
- Update Y-Core if available
- Reinstall problem mods
- Review and update load order

**Annually:**
- Full system scan with antivirus
- Check for Windows updates
- Update graphics drivers
- Consider fresh game install if very old

### Best Practices to Stay Trouble-Free

1. **Always create backup before installing**
   - Automatic but worth remembering
   - Gives you safety net

2. **Test one mod at a time**
   - Install one
   - Play 10 minutes
   - Install next
   - This catches problems immediately

3. **Read mod descriptions**
   - They often mention compatibility
   - List requirements/dependencies
   - Note known issues

4. **Join modding communities**
   - Learn from others' mistakes
   - Get mod installation guides
   - Find well-tested mod combinations

5. **Keep mods updated**
   - Mod creators often fix bugs
   - Check for updates monthly
   - Install new versions

6. **Document your setup**
   - Keep note of:
     - Which mods you have
     - Load order
     - Any tweaks you made
   - Makes recovery easier

---

## Still Stuck?

If you've read through this entire guide and still can't find your issue:

1. **Double-check your problem type**
   - Is it really a Mod Manager issue?
   - Or a game/game-specific issue?
   - Or a system issue?

2. **Search online**
   - Google: "[Problem] [Game] mod"
   - Reddit: r/[GameName]
   - Mod sites: Check comments/discussions

3. **Post in communities**
   - Be specific about your problem
   - Include steps you've taken
   - Share screenshots of errors
   - People love helping modders!

4. **Consider professional help**
   - If system issue: Local IT support
   - If game issue: Game dev support
   - If mod issue: Mod creator support

Good luck, and happy modding!
