# Y-Core Mod Manager - Complete User Guide

## Table of Contents

1. [Welcome to Mod Management](#welcome-to-mod-management)
2. [Getting Started](#getting-started)
3. [Discovering Mods](#discovering-mods)
4. [Installing Mods](#installing-mods)
5. [Managing Your Mods](#managing-your-mods)
6. [Load Order Management](#load-order-management)
7. [Backup and Restore](#backup-and-restore)
8. [Safety and Security](#safety-and-security)
9. [Troubleshooting](#troubleshooting)
10. [Pro Tips & Hidden Features](#pro-tips--hidden-features)

---

## Welcome to Mod Management

### What is the Y-Core Mod Manager?

The Y-Core Mod Manager is your personal mod librarian. Think of it like a Netflix for game modifications—except these mods are completely under your control.

**What it does:**
- Discovers mods for your games from Steam Workshop
- Keeps your mods organized and accessible from one central location
- Tests mods for malware and suspicious behavior before they touch your game
- Creates fast backups before installation so you can always go back
- Manages the order mods load in (which matters a lot for stability)
- Lets you easily turn mods on and off without uninstalling

**Why you need it:**
Without a mod manager, installing mods is like playing Jenga blindfolded. One wrong move and your game breaks. Y-Core eliminates that stress by:
- Preventing corrupted files from breaking your games
- Detecting when mods conflict with each other
- Creating instant backups automatically
- Letting you experiment safely—if something breaks, it takes 10 seconds to revert

### What You Can Do With It

**For casual players:**
- One-click mod installation
- Instant rollback if something goes wrong
- Simple on/off toggles for each mod
- Visual indicator of mod safety

**For mod enthusiasts:**
- Manage 50+ mods simultaneously
- Fine-tune load order for perfect stability
- See detailed conflict reports
- Track backup history
- Compare mod versions and updates

**For power users:**
- Batch operations on multiple mods
- Export and import mod configurations
- Schedule automated backups
- Monitor real-time malware scanning
- Analyze mod dependencies

---

## Getting Started

### First Launch Setup

When you first open the Mod Manager:

1. **Select Your Game**
   - Click the game dropdown at the top of the Mod Manager
   - Choose the game you want to mod
   - The manager loads your installed mods (if any)

2. **Wait for Initial Scan (2-5 seconds)**
   - The system scans your game folders
   - It checks if you have any existing mods
   - This only happens once—after that it's instant

3. **You're Ready!**
   - You'll see three tabs: "Mis Mods" (My Mods), "Catálogo" (Catalog), and "Gestor Activos" (Active Manager)
   - Start exploring

### The Three Main Tabs Explained

#### Tab 1: "Mis Mods" (My Installed Mods)
This is where all your installed mods live. You'll see:
- **Mod name** and creator
- **File size** in GB/MB
- **Current status** (enabled/disabled)
- **Malware scan status** (safe, scanning, or alert)
- **Enable/disable toggle** (the eye icon)
- **Uninstall button** (trash icon)

**View modes:**
- **List view** (default): Shows mods in a vertical list with all details
- **Grid view**: Shows mods as cards, better for browsing
- **Drag-to-reorder**: See "Load Order Management" section

#### Tab 2: "Catálogo" (Mod Catalog)
This is your shopping mall for mods. Features:
- **Browse thousands of mods** from Steam Workshop
- **Filter by:** category, rating, downloads, newest, trending
- **Search** for specific mods by name or creator
- **See previews** with mod descriptions and screenshots
- **Check ratings** before downloading (higher = more tested)
- **One-click installation** when you find something you like

**Pro feature:** Shows you which mods you already have installed with a checkmark

#### Tab 3: "Gestor Activos" (Active Manager)
Your mod command center. Shows:
- **All enabled mods** with their load order numbers
- **Conflict warnings** if mods disagree with each other
- **Malware alerts** if anything's suspicious
- **Storage usage** per mod
- **Quick enable/disable** toggles

---

## Discovering Mods

### How to Find Mods You'll Love

#### Method 1: Browse by Category

1. Open the **"Catálogo"** tab
2. Use the **category filter** on the left (if available)
3. Scroll through and click on mods that interest you

**Categories you'll typically see:**
- Gameplay overhauls
- Visual/graphics improvements
- New weapons, items, or characters
- Quality of life tweaks
- Story/content additions

#### Method 2: Search for Specific Mods

1. Click the **search box** at the top
2. Type what you're looking for:
   - Mod name: "Better Forests"
   - Creator name: "modauthor1"
   - Topic: "performance" or "graphics"
3. Press Enter or click the search icon
4. Results appear instantly

#### Method 3: Sort by Popularity

1. Use the **sort dropdown** (usually says "Popular" or "Trending")
2. Choose from:
   - **Most Popular:** All-time favorites
   - **Trending:** Hot right now
   - **Newest:** Just released
   - **Top Rated:** Highest quality
   - **Most Downloaded:** Most trusted

### Understanding Mod Details

When you click on a mod, you'll see:

**The Card Shows:**
- **Large preview image** at the top
- **Mod title** and creator name
- **Short description** (2-3 sentences)
- **Ratings and statistics:**
  - ⭐ Rating (out of 5 stars)
  - 📊 Number of ratings
  - ❤️ Favorites count
  - 📥 Download count

**When You Click "Details" or the card itself:**
- **Full description** explaining what the mod does
- **Installation requirements** (if any)
- **Compatible game versions**
- **File size** and download time estimate
- **Tags** (keywords like "performance," "graphics," "gameplay")
- **Creator information** and other mods by them
- **User reviews** (in some cases)

### Important: Check Before You Click Install

**Good signs a mod is safe:**
- ✅ Lots of downloads (10,000+)
- ✅ High rating (4+ stars)
- ✅ Recently updated
- ✅ Clear description
- ✅ Creator has other popular mods
- ✅ Multiple positive reviews

**Caution signs:**
- ⚠️ Very few ratings or downloads
- ⚠️ Vague or no description
- ⚠️ Last updated 2+ years ago
- ⚠️ Mixed/negative reviews
- ⚠️ Requires obscure dependencies

---

## Installing Mods

### One-Click Installation

**The simplest way:**

1. Find a mod in the Catalog
2. Click the **blue "Instalar"** (Install) button
3. Wait for the progress bar (usually 5-30 seconds)
4. See the success message: "Mod instalado correctamente"
5. **Done!** Mod is installed and ready to use

That's it. The system does everything else automatically.

### What Happens Behind the Scenes

When you hit Install, Y-Core does this automatically:

```
Your action: Click "Install"
          ↓
1. Create Backup
   (copies current game state in <10 seconds)
          ↓
2. Download Mod
   (from Steam Workshop)
          ↓
3. Scan for Malware
   (4-tier security check - see "Safety" section)
          ↓
4. Extract & Install
   (puts mod in game folder)
          ↓
5. Verify Installation
   (makes sure everything is correct)
          ↓
6. Enable Automatically
   (mod starts working immediately)
          ↓
Your game now has the mod installed!
```

### Installation Settings (Advanced)

Click the **gear icon** before installing to customize:

**Create Backup Before Install**
- Default: ON (recommended to keep it ON)
- Why: If something goes wrong, you can revert instantly

**Scan for Malware**
- Default: ON (highly recommended)
- Why: Checks the mod file for viruses and suspicious code
- See "Safety and Security" for details

**Overwrite Existing Files**
- Default: OFF
- When to use: If reinstalling a mod that failed
- Warning: Only turn on if you know what you're doing

**Auto-Enable After Install**
- Default: ON
- What it does: Mod starts working immediately
- Change it if: You want to test first before enabling

### Step-by-Step: Installing Your First Skyrim Mod

*Example walkthrough for a real scenario:*

**Goal:** Add a mod that improves graphics in Skyrim

**Step 1:** Start the Mod Manager
- Open Y-Core
- Select "Skyrim" from the game dropdown
- Click the "Catálogo" tab

**Step 2:** Find a graphics mod
- Type "Better Graphics" in search
- Or sort by "Highest Rated"
- Look for a mod with 4+ stars

**Step 3:** Check the details
- Click on a mod called "Enhanced Graphics Pack"
- Read the description
- Check it says "Skyrim SE Compatible" or similar
- Look at the rating (should be 4+ stars)

**Step 4:** Install it
- Click the blue "Instalar" button
- Watch the progress bar (it'll show "Downloading..." then "Installing...")
- Wait for "¡Mod instalado correctamente!" message

**Step 5:** Test it
- Close the Mod Manager
- Launch your game
- Look around—you should see improved graphics
- If it looks great, you're done!
- If you don't notice anything, see the "Visual Mods Aren't Working" section of Troubleshooting

### Installing Multiple Mods at Once

You can install several mods in sequence:

1. Go to the Catalog
2. Find your first mod → Click Install
3. While it's installing, find your second mod and click Install
4. Click Install on a third, fourth, fifth...
5. They'll queue up and install one by one

**How to monitor:**
- Look at the "Gestor Activos" tab
- You'll see a progress number next to each mod being installed
- Green checkmark = installed successfully
- X or warning = something went wrong

---

## Managing Your Mods

### Enabling and Disabling Mods

The most common thing you'll do in the Mod Manager is toggle mods on and off.

**Why would you do this?**
- Test if a mod is causing a crash
- Temporarily reduce performance impact
- Disable mods that aren't working
- Save mods for later testing

**How to disable a mod:**

1. Go to "Mis Mods" tab
2. Find the mod you want to disable
3. Click the **eye icon** (it'll turn into a crossed-out eye)
4. Mod is now OFF
5. Restart your game for changes to take effect

**How to enable a mod back:**

1. Same process—click the eye icon again
2. It turns back into an open eye
3. Mod is ON again

**Quick toggle from the Active Manager:**

1. Go to "Gestor Activos" tab
2. Click the toggle next to any mod
3. It switches on/off instantly

### Uninstalling Mods

When you're done with a mod:

1. Go to "Mis Mods" tab
2. Find the mod
3. Click the **trash/delete icon** on the right
4. Confirm the deletion in the popup
5. The mod is removed from your game

**What happens:**
- Files are deleted from your game folder
- Any backup created during installation is kept (you can restore if needed)
- The mod no longer shows up in your installed list
- Your game is back to how it was before

**Pro tip:** Uninstalling doesn't delete your backup. You can reinstall the mod anytime and the backup still works.

### Finding Uninstalled Mods

If you delete a mod but later want it back:

1. Go to "Catálogo"
2. Search for the mod by name
3. Click Install again
4. It installs fresh

**Even better:** Your old backup still exists. When you reinstall, you'll have the option to restore from that backup instead of creating a new installation.

### Checking Mod Status

Each mod shows its current status with visual indicators:

**Malware Status Indicators:**
- ✅ **Green checkmark:** Mod is safe (scanned and clean)
- ⏳ **Spinning circle:** Currently scanning
- ⚠️ **Orange triangle:** Suspicious activity detected
- ❌ **Red X:** Potential malware (quarantined)

**Enabled/Disabled:**
- 👁️ **Open eye:** Mod is enabled and active
- 🚫 **Crossed eye:** Mod is disabled
- 🔄 **Spinning icon:** Toggling status, please wait

**Installation Status:**
- ✅ Complete
- ⏳ Installing
- ❌ Failed (see troubleshooting)
- ⚠️ Corrupted (reinstall recommended)

---

## Load Order Management

### What is Load Order and Why It Matters

**Simple explanation:** Load order is the sequence in which mods activate when your game starts.

**Why it matters:**
- Some mods must load before others or they conflict
- Wrong order = crashes, visual glitches, or gameplay breaks
- Correct order = everything works perfectly

**Real-world analogy:**
- Imagine assembling a LEGO set
- You can't put the roof on before the walls
- Mods are the same—some have dependencies

### Example: Why Load Order Can Break Your Game

Let's say you have two mods:

**Mod A:** "Better NPC Faces"
- Changes how all characters look
- Needs to load early

**Mod B:** "Character Enhancement"
- Adds new hairstyles and makeup
- Must load AFTER Mod A

**If Mod B loads first:** Character Enhancement loads, but then Better NPC Faces overwrites it → NPCs look wrong

**If Mod A loads first:** Better NPC Faces applies, THEN Character Enhancement adds details → Perfect!

### How to Manage Load Order in Y-Core

#### Method 1: Drag-and-Drop (Easiest)

1. Go to "Mis Mods" tab
2. Look for the **"Gestor de Orden"** (Load Order Manager) button
3. Mods now show a **drag handle** (≡ icon) on the left
4. **Click and drag** mods to reorder them
5. Mods with lower numbers load first

**Visual Guide:**
```
1  ≡  Better Faces          ← Loads first
2  ≡  Character Enhancement ← Loads second
3  ≡  New Hairstyles        ← Loads third
```

#### Method 2: Number Input (Precise)

1. Click on a mod
2. Look for **"Load Order"** field
3. Type a number (1 = first, 2 = second, etc.)
4. Save

#### Method 3: Auto-Sort (For Beginners)

Click **"Sugerir Orden"** (Suggest Order) button:
- Y-Core analyzes mod dependencies
- Automatically arranges them
- You can still manually adjust if needed

### Understanding Mod Dependencies

Some mods require other mods to work:

**Example:**
- "Skyrim Unofficial Patch" = required by many mods
- If you install 10 mods, most will depend on this patch
- It MUST load first, before mods that depend on it

**How to find dependencies:**
1. Click on a mod in the Catalog
2. Look for **"Requires"** or **"Dependencies"** section
3. It lists any mods this mod needs
4. Install those first

### Load Order for Different Games

**Skyrim/Fallout Games:**
- Master files (patches) first
- Overhaul mods next
- Specific tweaks and graphics last

**Minecraft:**
- Generally less order-dependent
- Mods with dependencies handle their own ordering

**Stardew Valley:**
- Load order usually doesn't matter much
- Exceptions: major overhauls or API mods

**Your Specific Game:**
- Check the game's modding community guide
- Look at popular mod lists for recommended order
- Y-Core's auto-sort handles most cases

### How to Tell if Load Order is Wrong

If you experience these issues after changing load order:

- ❌ Game crashes on startup
- ❌ Mods aren't working as expected
- ❌ Graphics look weird or incomplete
- ❌ NPCs or objects behave strangely
- ❌ Game runs very slowly

**How to fix:**
1. Go back to "Mis Mods"
2. Click "Sugerir Orden" to let Y-Core fix it
3. Or manually drag mods back to previous order
4. Restart your game

---

## Backup and Restore

### The Safety Net: Automatic Backups

Every time you install a mod, Y-Core creates a backup automatically. This is your safety net.

**What gets backed up:**
- Your entire game installation before the mod was added
- This takes <10 seconds for even a 50GB game (using hardlinks technology)
- You never have to wait or do anything

**Why backups are amazing:**
- Something goes wrong? Click "Restore"
- Your game is back to how it was in 30 seconds
- No reinstalling, no redownloading
- It's like pressing Undo on your game

### Creating Manual Backups

Beyond automatic backups, you can create manual ones anytime:

1. Go to "Mis Mods"
2. Click on a mod's **three-dot menu** (⋮)
3. Select **"Crear Copia de Seguridad"** (Create Backup)
4. Wait 10-15 seconds
5. Backup is done

**When to do this:**
- Before testing a new risky mod
- Before a major mod update
- Before enabling/disabling multiple mods at once
- Before experimenting with load order

### Viewing Your Backups

See all your backups:

1. Go to "Gestor Activos"
2. Click **"Copias de Seguridad"** (Backups) section
3. You'll see:
   - Backup date
   - What mod it's for
   - File size
   - Whether it's automatic or manual

### Restoring from Backup

If your game breaks or a mod causes issues:

1. Go to the backup you want to restore to
2. Click **"Restaurar"** (Restore) button
3. Y-Core verifies the backup
4. Files are restored (takes 10-30 seconds)
5. Your game is back to that state

**What happens during restore:**
- Your game folder is restored to the backup state
- Your mod list is NOT changed (you still have the mods)
- Any mods installed AFTER this backup are not restored
- Your game save files are NOT affected

### Backup Storage and Cleanup

**How much space do backups use?**

With Y-Core's hardlink technology:
- Each backup only uses space for changes, not duplicate files
- 50GB game → backup only takes 100-500MB per mod
- Compare to traditional backup: 50GB × 5 mods = 250GB wasted!

**Managing backup storage:**

1. Go to **Settings** (gear icon)
2. Find **"Backup Retention"** settings
3. Choose how long to keep backups:
   - Auto-delete after 30 days
   - Auto-delete after 7 days
   - Keep forever

4. Or manually delete old backups:
   - Go to backups list
   - Click trash icon next to old backup
   - Confirm deletion

---

## Safety and Security

### The 4-Tier Malware Scanning System

Y-Core protects you from malicious mods using four layers of defense:

#### Tier 1: File Extension Whitelist

**What it does:**
- Checks if the mod contains suspicious file types
- Only allows known-safe file types
- Blocks executables (.exe), scripts, and other dangerous files

**Examples of allowed files:**
- ✅ .mesh, .texture (game models)
- ✅ .esp, .esm (game data files)
- ✅ .bsa (compressed game archives)
- ✅ .json, .xml (configuration files)

**Examples of blocked files:**
- ❌ .exe (Windows programs)
- ❌ .dll (Windows libraries that could be malware)
- ❌ .bat, .cmd (Windows scripts)
- ❌ .vbs (Visual Basic scripts)

**If a mod is blocked here:**
- You'll see a warning: "Mod contains suspicious file types"
- It won't install unless you override (not recommended)
- The mod might be malicious

#### Tier 2: PE Header Analysis

**What it is:**
- PE = Portable Executable (Windows program format)
- Y-Core examines the structure of any executable-like files

**What it does:**
- Looks for known malware signatures
- Checks for suspicious code patterns
- Detects if someone tried to disguise malware

**How detailed is it:**
- Scans file headers (the "fingerprint" of the file)
- Looks for packing (hiding code inside)
- Checks for stealth techniques

**If suspicious code is found:**
- Warning: "File signature doesn't match expected pattern"
- Mod is quarantined (can't install)

#### Tier 3: VirusTotal API Integration

**What it is:**
- VirusTotal is a free service that scans files with 70+ antivirus engines
- Google's tool, trusted by millions

**How Y-Core uses it:**
1. Takes a hash (fingerprint) of the mod file
2. Submits it to VirusTotal
3. Gets results from multiple antivirus programs
4. Shows you the verdict

**What you'll see:**
- ✅ "Scanned by 60 engines, all clean"
- ⚠️ "3 out of 60 engines flagged this as suspicious"
- ❌ "Detected as malware by 45 engines"

**Important:** This takes a few extra seconds (mod is being checked by dozens of antivirus programs)

**If it's flagged:**
- You'll see warnings
- Can still install at your own risk
- Not recommended unless you know what you're doing

#### Tier 4: YARA Rules

**What it is:**
- YARA is the same tool used by major antivirus companies
- It runs complex pattern-matching rules

**What it does:**
- Scans actual file contents (not just the header)
- Looks for known malware patterns
- Finds suspicious code even if filename is faked
- Most advanced layer of protection

**Examples of what it catches:**
- Keyloggers (records your typing)
- Password stealers
- Cryptocurrency miners (uses your PC to mine crypto)
- Backdoors (lets hackers access your PC)
- Ransomware

**How thorough:**
- Scans the entire file
- Takes longer than other tiers
- Most reliable detection method

### What Happens if a Mod is Flagged

**Scenario 1: Flagged in Tier 1 (Extension)**
- Installation blocked
- Shows which file types aren't allowed
- Can't be overridden
- Safe decision: Don't install

**Scenario 2: Flagged in Tier 2-3 (Signature/VirusTotal)**
- Shows a warning
- You can still click "Install Anyway"
- Only if you trust the mod source
- Example: Old mods with updated dependencies might falsely trigger

**Scenario 3: Flagged in Tier 4 (YARA)**
- Quarantined = deleted automatically
- Won't install no matter what
- Highest confidence malware detected
- This is serious—don't try to override

### Understanding Malware Scan Results

When you see a scan result:

**CLEAN (✅ Green)**
```
Status: Clean
Scanned: 68 antivirus engines
Threats: 0
Time: 3.2 seconds
```
Meaning: Safe to install, thoroughly checked

**SUSPICIOUS (⚠️ Orange)**
```
Status: Suspicious
Scanned: 68 antivirus engines
Threats: 2-5 detected
Detection names: Possibly.Unwanted.ML...
```
Meaning: Might be okay, but check community forums

**INFECTED (❌ Red)**
```
Status: Infected
Scanned: 68 antivirus engines
Threats: 40+ detected
Detection names: Trojan.Generic, Win32.Malware...
```
Meaning: Definitely malicious. Don't install.

### How to Know if a Mod is Actually Safe

**Questions to ask:**

1. **How many people downloaded it?**
   - 100,000+ downloads = unlikely to be malware (would've been caught)
   - 10 downloads from an unknown creator = risky

2. **When was it last updated?**
   - Recently updated = creator cares about it
   - Not updated in 3+ years = might have vulnerabilities

3. **What's the rating?**
   - 4+ stars with 1,000+ ratings = community tested it
   - 1-2 stars = people complaining

4. **What do reviews say?**
   - Check for comments like "doesn't work" vs "works perfectly"
   - Ignore 1-2 person reviews, trust consensus

5. **Is the creator known?**
   - One mod vs. creator with 50 popular mods
   - Established creators have reputation to protect

### Malware Scanning for Your Own Mods

If you've installed a mod elsewhere or downloaded it:

1. Go to "Mis Mods"
2. Find the mod
3. Click three-dot menu (⋮)
4. Select **"Escanear Malware"** (Scan for Malware)
5. Wait 15-30 seconds
6. See the results

---

## Troubleshooting

### "Mod Won't Install" Flowchart

```
You click Install...

↓

Does installation start?
├─ NO → Check Internet Connection
│        └─ Reconnect WiFi/Ethernet
│        └─ Check if Steam is working
│        └─ Try installing again
│
└─ YES → Does it show error message?
         ├─ "Insufficient Space"
         │  └─ Free up disk space
         │  └─ Need at least 2GB free
         │
         ├─ "File Corrupted"
         │  └─ Clear the cache (Settings > Clear Cache)
         │  └─ Try installing again
         │
         ├─ "Permission Denied"
         │  └─ Run Y-Core as Administrator
         │  └─ Right-click Y-Core > Run as admin
         │
         ├─ "Malware Detected"
         │  └─ Don't install this mod
         │  └─ It's potentially dangerous
         │  └─ Find a different mod
         │
         ├─ "Mod Conflict"
         │  └─ See "Managing Conflicts" section
         │  └─ Uninstall conflicting mod first
         │
         └─ "Unknown Error"
            └─ Note the error code
            └─ See Support Checklist section
```

### Common Error Messages and Fixes

#### Error: "Mod download failed"

**What it means:** The mod file couldn't be downloaded from Steam

**Fixes (try in order):**
1. Check your internet connection
2. Wait 5 minutes (Steam servers might be busy)
3. Restart Y-Core completely
4. Restart your PC
5. Try uninstalling and reinstalling

#### Error: "Installation directory not found"

**What it means:** Y-Core can't find where your game is installed

**Fixes:**
1. Make sure your game is fully installed
2. Check game isn't running (close it completely)
3. Go to Settings > Game Paths
4. Make sure game path is correct
5. Re-browse to find your game folder

#### Error: "Mod already exists"

**What it means:** You already have this mod installed

**Fixes:**
1. Go to "Mis Mods"
2. Check if it's there
3. If you see it, click Install to update it
4. If you don't see it but get this error:
   - Clear cache: Settings > Clear Cache
   - Restart Y-Core
   - Try again

#### Error: "Backup creation failed"

**What it means:** Y-Core couldn't create a safety backup before installing

**Fixes:**
1. Check your disk has at least 1GB free space
2. Make sure backup folder isn't read-only:
   - Right-click backup folder
   - Properties > Security > Edit
   - Give yourself full permissions
3. Restart Y-Core
4. Try again

#### Error: "Malware quarantined - installation blocked"

**What it means:** The mod was detected as malware in the highest confidence scan (Tier 4)

**What to do:**
- **Don't install it**
- The mod is dangerous
- Find a different mod instead
- Report it to the mod platform (Steam Workshop, etc.)

### "Game Crashes After Installing Mods"

If your game crashes to desktop after mods install:

**Step 1: Pinpoint which mod crashed it**

1. Go to "Mis Mods"
2. Disable your most recently installed mod
3. Restart game—did it work?
4. If yes, that's the problematic mod
5. If no, disable the next-most-recent mod
6. Repeat until game runs

**Step 2: If you found the culprit**

Option A - Remove it:
1. Click the trash icon next to it
2. Game should now run fine

Option B - Check for updates:
1. Go to "Catálogo"
2. Search for that mod
3. If there's a newer version, install it
4. Older version might be buggy

Option C - Check dependencies:
1. Click on the problematic mod
2. Look for "Requires" section
3. Install any missing dependencies
4. This usually fixes it

**Step 3: If it's still broken**

1. Try restoring from your backup:
   - Go to backups section
   - Click "Restaurar" on the backup from before install
   - Your game reverts to the previous state
2. Don't install that mod again
3. Look for alternative mods that do the same thing

### "Mods Aren't Working (Not Appearing in Game)"

If you installed a mod but don't see it in your game:

**Quick fixes (try these first):**

1. **Make sure it's enabled**
   - Go to "Mis Mods"
   - Check the eye icon shows open eye (not crossed)
   - If crossed, click to enable

2. **Restart your game**
   - Completely close the game
   - Reopen it
   - Mods load when game starts

3. **Check mod dependency**
   - Click on the mod in "Mis Mods"
   - Look for "Requires" section
   - Install any missing mods first

**Deeper troubleshooting:**

4. **Load order problem** (Skyrim/Fallout only)
   - Go to "Mis Mods"
   - Click "Sugerir Orden" to auto-fix order
   - Restart game

5. **Visual mod specific**
   - Some mods only change textures/graphics
   - Need to wait 30 seconds after game loads
   - Look in specific locations (outdoors vs indoors)
   - Check if graphics settings need adjustment

6. **Mod too old for your game version**
   - Game got an update
   - Mod wasn't updated
   - Look for newer version in Catalog
   - Or check mod page for compatibility notes

7. **Last resort: Reinstall**
   - Right-click the mod > Uninstall
   - Restart game once (to clear it)
   - Go to Catalog
   - Search mod again and reinstall fresh

### "Can't Find My Backup"

If a backup seems to have disappeared:

**First, check the obvious:**

1. Go to "Gestor Activos"
2. Click "Copias de Seguridad" section
3. Scroll through the list
4. Search by mod name if available

**If still not there:**

1. Check backup deletion settings:
   - Settings > Backup Retention
   - If set to "30 days", old backups auto-delete
   - This is intentional to save space

2. Check if it was deleted:
   - Go to backups list
   - Look for deleted/archived section
   - Some backups move to archive

3. Check backup storage location:
   - Settings > Backup Path
   - See where backups are stored
   - Navigate there in File Explorer
   - Look for files manually

**If it's truly gone:**
- Backups don't last forever
- That's why manual backups exist
- Create fresh backups of important mod setups going forward

### "Not Enough Disk Space" Error

Y-Core says you don't have space to install a mod.

**How much space do you need?**
- Mod size × 2 (one for mod, one for backup)
- 1GB mod = need 2GB free
- Plus some buffer = aim for 3GB free minimum

**How to free up space:**

1. **Move old backups to external drive:**
   - Settings > Backup Path
   - See where backups are stored
   - Move to external USB/drive

2. **Delete very old backups:**
   - Go to Backups section
   - Delete backups older than 6 months
   - Keep recent ones just in case

3. **Clear the download cache:**
   - Settings > Clear Cache
   - Frees up temporary files
   - Doesn't delete anything important

4. **Check Windows disk space:**
   - Open File Explorer
   - Right-click Drive C:
   - Look at "Free space"
   - Need at least 5% of drive free
   - If less, Windows itself is full

5. **Consider external storage:**
   - For large games (40GB+)
   - Install to external SSD or HDD
   - Backups also go there
   - Must be USB 3.0+ for speed

### "Performance is Slow" After Installing Mods

Your game is now running slowly after mods.

**Is it slow at startup or in-game?**

**Slow at startup (takes long time to load):**
- Likely cause: Mods don't have correct load order
- Fix: Go to "Mis Mods" > "Sugerir Orden"
- Or check if a new mod is incompatible with others

**Slow during gameplay (FPS drop, freezing):**

1. **Identify which mod causes it:**
   - Disable the newest mod
   - See if FPS improves
   - If yes, that mod causes slowdown
   - If no, disable the next one

2. **Options for the problematic mod:**
   - Option A: Uninstall it completely
   - Option B: Check for a "lite" or "performance" version
   - Option C: Lower graphics settings in the mod's config
   - Option D: Disable it and only enable when needed

3. **Check your PC's specs:**
   - Some mods need powerful PCs
   - High-resolution texture mods = need good graphics card
   - Lots of mods = need good RAM
   - If your PC isn't powerful, install fewer mods

### Clean Start / Reset Procedures

If everything is broken and you want to start fresh:

**Option 1: Reset One Game's Mods (Recommended)**

1. Go to "Mis Mods"
2. Select each mod
3. Click trash icon to uninstall
4. Continue until no mods left
5. Restart game
6. Start over with a clean slate

*Advantages:* Fast, keeps your data, reversible
*Time needed:* 2-5 minutes depending on mod count

**Option 2: Restore to Original Game State**

1. Find the very first backup (often called "Initial Install")
2. Click "Restaurar"
3. Confirm
4. Wait 1 minute for restore
5. Game is back to original state
6. All mods are removed

*Advantages:* Complete clean slate
*Disadvantages:* Removes ALL mod-related changes
*Time needed:* 1-2 minutes

**Option 3: Clean Uninstall and Reinstall Game**

1. Uninstall game via Steam
2. Delete game folder (right-click > delete)
3. Empty Recycle Bin
4. Reinstall game fresh
5. Y-Core starts with clean game

*Advantages:* Most thorough
*Disadvantages:* Takes 30+ minutes (reinstall time)
*Best for:* Completely corrupted game state

---

## Pro Tips & Hidden Features

### Tip 1: Create "Safe Checkpoint" Backups

Before trying risky mods:

1. Go to your current mod setup
2. Create a manual backup
3. Name it "Before Skyrim Overhaul" (or whatever)
4. Now install risky mod
5. If it breaks, restore to that checkpoint
6. You get back to your known-good setup instantly

### Tip 2: Test Mods One at a Time

When installing a bunch of new mods:

1. Install one mod
2. Restart game and test (5 minutes)
3. If good, install next one
4. If bad, you know which mod caused it
5. Uninstall that mod and try a different one

This saves hours of troubleshooting vs. installing 10 at once.

### Tip 3: Use Mod Collections

Some games support mod collections (Skyrim, Fallout):

1. Find a "Mod Collection" in the Catalog
2. Click "Install Collection"
3. Y-Core installs all mods in perfect order
4. Community has already tested compatibility
5. Less chance of conflicts

### Tip 4: Check Mod Version Compatibility

Before installing:

1. Click on mod details
2. Look for "Compatible with:"
3. Make sure it says your game version
4. Example: "Skyrim SE" (Special Edition) ≠ "Skyrim VR"
5. Wrong version = it won't work

### Tip 5: Use Load Order "Suggest" Feature

Stuck on manual ordering?

1. Go to "Mis Mods"
2. Click "Sugerir Orden" button
3. Y-Core analyzes dependencies
4. Automatically arranges mods
5. 90% of the time this works perfectly
6. Only manually adjust if conflicts still occur

### Tip 6: Monitor Installation Progress in Real-Time

See exactly what's happening:

1. During install, look at "Gestor Activos"
2. You'll see:
   - "Downloading..." - file transfer in progress
   - "Scanning..." - malware check running
   - "Installing..." - files being placed
   - Percentage indicator - how much done
3. Don't close Y-Core until it finishes

### Tip 7: Batch Disable Mods for Comparison

Want to compare two mod setups?

**Setup A:**
1. Enable mods 1-5
2. Take note of how game looks
3. Create manual backup called "Setup A"

**Setup B:**
1. Disable mods 1-5
2. Enable mods 6-10
3. Restart game and compare
4. If you prefer Setup A, restore backup

### Tip 8: Export Your Mod Configuration

Save your perfect mod setup:

1. Settings > Export Configuration
2. Choose where to save
3. Saved as a file (.ycore-config or similar)
4. Later, can import this on another PC
5. All mods in same order, same enabled/disabled state

**Why useful:**
- Backup your setup
- Share with friends
- Set up new PC quickly

### Tip 9: Check Mod Author's Website

Sometimes mod authors have:

1. Discord channels for support
2. FAQ pages for their mods
3. Updated versions before Steam Workshop
4. Performance tips for their specific mod

1. Look at mod details
2. Find author name
3. Google "author name" + "website"
4. They often have more info there

### Tip 10: Join Modding Communities

Connect with other mod users:

1. Reddit: r/modding, r/skyrim (has mod guides)
2. Discord: Most games have mod communities
3. Nexusmods.com: Huge mod community with forums
4. Mod wiki pages: Contain compatibility info
5. YouTube: Mod installation guides and reviews

### Advanced: Understanding Mod Conflicts

**File conflicts:** Multiple mods edit the same game file
- Solution: Usually load order fixes this
- Or find a "patch" mod that combines them

**Dependency conflicts:** Mod A needs Mod B, but Mod B conflicts with Mod C
- Solution: Find compatible versions
- Or find alternative mods

**Incompatibility:** Two mods fundamentally can't work together
- Solution: Choose one or the other
- Look for alternative mods that do similar things

### Advanced: When Malware Scan Warns but You Trust It

*Only do this if you're an experienced modder:*

Some old or small mods might falsely trigger warnings:

1. Research the mod extensively
2. Check community reviews
3. Verify creator's reputation
4. If confident, click "Install Anyway"
5. Monitor your PC for 24 hours afterward
6. Make backup before installing

**Better option:** Just find a different mod instead. Thousands of alternatives exist.

### Advanced: Performance Optimization

If you have 50+ mods and want speed:

1. Disable visual overhaul mods when not gaming
2. Use "Lite" versions if available (lower quality but faster)
3. Increase load order for heavy mods to go last
4. Keep game restart between major changes
5. Monitor RAM usage: Task Manager > Performance
6. Close other programs while playing modded game

---

## Game-Specific Setup Guides

### Complete Skyrim Setup Guide

**Goal:** A stable, enhanced Skyrim experience with 40-50 mods

**Phase 1: Foundation (essential mods)**

Install in this order:
1. "Skyrim Script Extender" (SE) - required by most mods
2. "Unofficial Skyrim Patch" - fixes bugs
3. "SKSE Plugins Preloader" - helps other mods work

**Test:** Game starts, no errors

**Phase 2: Graphics Enhancement (10-15 mods)**

Add mods that improve visuals:
- Better texture packs (2-3GB download)
- Improved lighting
- Weather overhaul
- Character model improvements

**Test after each:** Make sure graphics look better but performance is stable

**Phase 3: Gameplay Enhancement (10-15 mods)**

Add mods that change gameplay:
- Better combat mechanics
- Improved AI
- New weapons/armor
- Quality of life tweaks

**Test after each:** Make sure game still runs smoothly, no crashes

**Phase 4: Content Expansion (10-15 mods)**

Add mods that add new content:
- New quests
- New locations
- New NPCs
- New items

**Final test:** Play for 30+ minutes
- Fight enemies
- Complete quests
- Fast travel between areas
- Save and load
- Look for any crashes or glitches

**If stable:** You now have ~50 mods! Enjoy.

### Fallout 4 Setup Guide

**Similar to Skyrim but:**
- Foundation mods: Script Extender, patches
- Graphics focus: Can go heavier than Skyrim (modern engine)
- Gameplay: Much more diverse mod variety
- Performance: Generally less load order dependent

**Setup takes:** 2-3 hours total (install + test)

### "I Want One Perfect Setup" Workflow

If you want to create the ultimate modded game:

**Week 1: Research Phase**
- Join modding communities (Reddit, Discord)
- Watch mod reviews on YouTube
- Read mod lists (find curated lists online)
- Document mods that interest you

**Week 2: Installation Phase**
- Install one mod every hour
- Test each thoroughly
- Create checkpoint backup after every 5 mods
- Note which mods work together

**Week 3: Optimization Phase**
- Fine-tune load order
- Adjust conflicting mods
- Disable any problematic ones
- Create final backup

**Week 4: Enjoyment Phase**
- Play your game!
- Enjoy months of gameplay
- Document your setup
- Help others replicate it

---

## Real-World Scenario: From Zero to 30 Mods

### Sarah's Story: Getting Skyrim Perfect

**Starting point:** Fresh Skyrim SE installation, no mods

**Day 1: Planning (1 hour)**
1. Sarah joins r/Skyrim community
2. Finds a "Essential Mods" list
3. Writes down 30 mods she wants
4. Checks each for compatibility

**Day 2: Installation Begins (3 hours)**
1. Installs foundation mods (Script Extender, Patch)
2. Tests game - works fine
3. Adds graphics mods one by one
4. Tests after each - frame rate stays good
5. Creates backup after 10 mods

**Day 3: Continues (3 hours)**
1. Adds gameplay mods
2. Tests each one
3. One mod causes crash
4. Uninstalls it, finds alternative
5. Continues building

**Day 4: Finalizing (2 hours)**
1. Adds last few content mods
2. Uses Y-Core's auto-suggest for load order
3. Plays for 2 hours straight
4. No crashes, everything works
5. Creates final backup named "Perfect Setup"

**Result:** 30 stable mods, looks amazing, plays great

**Time invested:** ~8 hours (includes testing and troubleshooting)

**Enjoyment gained:** 200+ hours of gameplay ahead

---

## Backup Scenarios: When Restores Save You

### Scenario 1: The Accidental Uninstall

**What happened:**
- Sarah found a mod she disliked
- Accidentally uninstalled the WRONG mod
- Now her 30-mod setup is broken

**How she recovered:**
1. Remembered she had backup from before uninstall
2. Clicked "Restaurar" on that backup
3. Game reverted to working state in 30 seconds
4. Reinstalled the mod she actually wanted to remove

**Time to fix:** 1 minute

**If no backup:** 2-3 hours to debug and fix

### Scenario 2: Game Update Broke Everything

**What happened:**
- Steam pushed game update
- All Sarah's mods stopped working
- Game won't even start

**How she recovered:**
1. Found backup from before game update
2. Restored from backup
3. Game works with mods again (reverted to pre-update state)
4. Waited for mod creators to update their mods
5. Manually updated each mod one by one

**Time to fix:** 30 minutes for restore + 1 hour for updates

**If no backup:** Completely broken game for days

### Scenario 3: Load Order Experiment Failed

**What happened:**
- Sarah wanted to test different mod order
- Manually changed load order
- Game now crashes 30 seconds after startup
- She can't remember the old order

**How she recovered:**
1. Had backup from before load order changes
2. Restored that backup
3. Game worked perfectly again
4. This time used Y-Core's auto-suggest instead
5. Problem solved

**Time to fix:** 1 minute

---

## Creating Your Mod Configuration Document

### Why You Need This

Imagine your PC crashes and won't boot. You lost everything. But you have your mod setup documented. You can rebuild in hours instead of weeks.

### Simple Template

Create a text file with this information:

```
========================================
MY MOD SETUP DOCUMENTATION
========================================

GAME: Skyrim Special Edition
CREATION DATE: 2024-07-29
LAST UPDATED: 2024-07-29

HARDWARE:
- PC: Desktop / Laptop
- CPU: [Your CPU]
- RAM: [Amount]
- GPU: [Your graphics card]
- Storage: [Storage type - SSD/HDD]

TOTAL MODS: 45
TOTAL SIZE: 78GB
PERFORMANCE: 60 FPS average

LOAD ORDER NOTES:
- Used Y-Core auto-suggest
- No manual overrides needed
- Stable for 200+ hours gameplay

INSTALLED MODS:
[Category: Graphics]
1. Better Graphics Pack v3.2
2. Enhanced Textures HD
3. Improved Lighting
[Category: Gameplay]
4. Better Combat
5. Smarter AI
...

KNOWN ISSUES:
- None currently

BACKUP INFORMATION:
Latest stable backup: 2024-07-29 21:00
Backup name: "Stable Setup v2"
Storage location: External SSD

COMMUNITIES & RESOURCES USED:
- r/Skyrim
- YouTube: [Creator Name]
- Mod list: [Source]

PERFORMANCE TIPS:
- Disable during non-gaming: Discord, Chrome
- Set graphics to "High" not "Ultra"
- Turn off unnecessary mods when not playing

TOTAL TIME SPENT:
- Planning: 2 hours
- Installation: 6 hours
- Testing & Optimization: 4 hours
- Total: 12 hours

SATISFACTION RATING: 9/10
(Only reason not 10/10: one small mod conflict)
========================================
```

### How to Use This Document

1. **Share with friends** - they can replicate your setup
2. **Backup to cloud** - Google Drive, OneDrive, etc.
3. **Reference during troubleshooting** - helps diagnose issues
4. **Update monthly** - keep it current
5. **Version control** - if you change setup, date the new version

---

## Seasonal Mod Themes

### "Summer Chill" Mods
Relaxing, casual mods for summer gaming:
- Fishing mods
- Crafting simulation mods
- Peaceful NPC life mods
- Exploration mods

### "Winter Adventure" Mods
Intense, challenging mods for winter:
- Combat overhauls
- Hardcore survival mods
- Difficult enemy mods
- Expansion quest mods

### "Horror Month" Mods (October)
Scary, atmospheric mods:
- Dark dungeon mods
- Creature enhancement mods
- Weather/atmosphere mods
- Spooky quest mods

**Why this works:**
- Different mods match different moods
- Export/import configurations by season
- Keeps game fresh and interesting

---

## Troubleshooting by Symptoms (Quick Reference)

**"Game won't start"**
- Disable newest mod
- Use Y-Core's auto-suggest for load order
- Restore from backup

**"Crashes 5 seconds after starting"**
- Identify newest mod (see "Mod Won't Install" flowchart)
- Uninstall it
- Install different mod

**"Everything looks wrong/different"**
- Disable graphics mods one by one
- Find which one is causing it
- Adjust mod settings or uninstall

**"Game is super slow"**
- Disable heavy graphics mods (textures, lighting)
- Close other programs
- Lower graphics settings in mod config

**"Mod features don't work"**
- Check if mod is enabled (eye icon open)
- Check dependencies installed
- Check load order
- Restart game completely

---

## Conclusion

You now understand how to safely install, manage, and organize mods using Y-Core.

**Key takeaways:**

✅ **Always use the safety features** - malware scanning and backups exist for a reason

✅ **Load order matters** - especially for Skyrim/Fallout. Use the auto-suggest feature

✅ **Backups are your friend** - they let you experiment without fear

✅ **One mod at a time** - install one, test it, then add the next

✅ **Document your setup** - makes recovery and sharing easy

✅ **Join communities** - modders are friendly and love helping

✅ **Have fun!** - Modding is supposed to be enjoyable

**Remember:** You're not just installing mods. You're crafting your own personal, unique version of your favorite game. Take your time, enjoy the process, and don't be afraid to experiment (that's what backups are for!).

Happy modding! Your games are about to get way more interesting.

---

**Need help?** See the next document: TROUBLESHOOTING_MOD_MANAGER.md
