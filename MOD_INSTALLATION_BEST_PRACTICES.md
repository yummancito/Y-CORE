# Y-Core Mod Manager - Installation Best Practices

## Introduction

This guide teaches you the professional way to install, manage, and maintain mods. These practices prevent 95% of mod-related problems.

---

## The Golden Rule: One Mod at a Time

### Why This Works

Installing one mod at a time is the single best practice for stability.

**Benefits:**
- ✅ Instantly identify problematic mods
- ✅ Save hours of troubleshooting
- ✅ Understand compatibility in real-time
- ✅ Build stable game gradually
- ✅ Know exactly which mod causes any issue

**The opposite (installing 20 mods at once):**
- ❌ If game crashes, which mod is guilty?
- ❌ Might spend 5 hours testing
- ❌ Can't identify conflicts
- ❌ Very frustrating

### The Workflow

1. **Install mod #1**
2. **Play 10-15 minutes** - test thoroughly
   - Walk around
   - Do combat if applicable
   - Save and load game
   - Visit different areas
3. **If works perfectly → Install mod #2**
4. **Repeat**

**Time estimate:** 30 seconds per install + 10 minutes testing = 10-15 minutes per mod

**For 20 mods:** About 3-5 hours total (but you get a perfectly stable game)

### The Exception: Installing Mod Collections

Most games have curated "Mod Collections" - pre-tested combinations.

**If installing a collection:**
1. Click "Install Collection"
2. Y-Core installs all at once
3. Community has already tested it
4. Much lower risk than random combination

**After installing collection:**
- Play for 30+ minutes
- Test thoroughly
- If stable, can start adding personal mods

---

## Pre-Installation Checklist

### Before Clicking Install

Use this checklist every time:

#### Mod Compatibility Verification

- [ ] **Game version match**
  - Mod page says "Skyrim SE"
  - You have Skyrim SE
  - Not Skyrim VR, not original Skyrim
  - Check your game version in Steam properties

- [ ] **Recent update**
  - Mod last updated within 6 months
  - Older mods might have vulnerabilities
  - Check "Last updated" date

- [ ] **Good ratings**
  - 4+ stars
  - 1,000+ ratings (sample size)
  - Low rating with few ratings = unreliable

- [ ] **Popular enough**
  - 10,000+ downloads minimum
  - Higher = more tested
  - Popular mods = less likely to be malware

#### Dependencies Verified

- [ ] **Check "Requires" section**
  - Look at mod page
  - Note all required mods
  - Do you have them installed?

- [ ] **Install dependencies FIRST**
  - If mod requires "Skyrim Script Extender"
  - Install that before this mod
  - Otherwise mod won't work

- [ ] **Check load order dependencies**
  - Some mods must load before/after others
  - Note this for later
  - Y-Core auto-fix usually handles it

#### Safety Verification

- [ ] **Malware scan passed**
  - See green ✅ CLEAN
  - Or orange ⚠️ only if you researched it
  - Never red ❌ INFECTED

- [ ] **Read mod description carefully**
  - Understand what mod does
  - Check for warnings/incompatibilities
  - Look for known issues section

- [ ] **Backup exists**
  - Usually automatic
  - But verify setting is ON
  - Settings > Backup > "Create Backup Before Install" = ON

### Backup Before Installing Risky Mods

For mods you're unsure about:

1. Go to "Gestor Activos" > "Copias de Seguridad"
2. Click "Crear Copia de Seguridad" (Create Backup)
3. Name it something like "Before Graphics Mod X"
4. Wait for backup to complete
5. Now install the risky mod
6. If it breaks, restore this backup
7. Back to previous state in 30 seconds

---

## Installation Workflow

### Step 1: Prepare Your System

**Before installing any mods:**

1. **Close everything except Y-Core**
   - Close game
   - Close other programs
   - Close web browsers
   - Frees up RAM and disk I/O

2. **Ensure sufficient disk space**
   - Need: Mod size × 2 + 1GB buffer
   - Check: File Explorer > Drive properties
   - Free up space if needed

3. **Check internet stability**
   - Run speed test: speedtest.net
   - Should be 5+ Mbps
   - Restart router if flaky

4. **Restart Y-Core**
   - Close and reopen
   - Clears any temporary issues
   - Fresh start

### Step 2: Install the Mod

1. **Find the mod in Catalog**
2. **Click on it to see details**
3. **Verify compatibility** (use checklist above)
4. **Click "Instalar" button**
5. **Watch for errors** during installation
   - Monitor progress
   - Note any warnings
   - Don't close Y-Core

### Step 3: Verify Installation

1. **Wait for success message**
   - "Mod instalado correctamente"
   - Or "Installation complete"

2. **Go to "Mis Mods" tab**
   - Find your new mod
   - Verify it shows "installed"
   - Check status indicator (should be green or neutral)

3. **Check malware status**
   - Should show ✅ or neutral
   - If shows ⚠️ or ❌, investigate

### Step 4: Test the Mod

**Critical step:** Actually test it works!

1. **Close Y-Core**
2. **Start your game**
3. **Look for the mod's changes**
   - New menu item
   - New items in inventory
   - Changed visuals
   - Changed gameplay
   - Depends on mod type

4. **Test thoroughly**
   - Walk around for 5-10 minutes
   - Perform mod-specific actions
   - Save game, close, reload
   - Check for crashes

5. **If works great**
   - Go back to step 1 for next mod
   - Install another
   - Keep building

6. **If something wrong**
   - Close game
   - Go to troubleshooting section
   - Disable or uninstall mod
   - Try different mod instead

---

## Load Order Management

### Understanding Your Load Order

Load order determines which mod's files "win" when conflicts occur.

**Good analogy:**
```
Mod A: Changes NPC faces
Mod B: Changes NPC textures

If A loads first: A changes faces → B changes textures → Result: Both work
If B loads first: B changes textures → A changes faces → Result: Texture lost!
```

### Initial Load Order Setup

**When installing your first mods:**

1. Use Y-Core's auto-suggest:
   - Go to "Mis Mods"
   - Click "Sugerir Orden"
   - It analyzes dependencies
   - Arranges automatically
   - 90% correct

2. **OR manually follow guide:**
   - Check game's modding wiki
   - They have load order rules
   - Example for Skyrim:
     - Master files first
     - Patches second
     - Overhauls third
     - Specific tweaks last

### Optimizing Load Order for Stability

**Priority system (load order from top to bottom):**

1. **Master files and critical patches** (e.g., "Unofficial Patch")
   - Load these FIRST
   - Everything depends on them

2. **Core overhauls** (major gameplay/visual changes)
   - These need to load before specific mods
   - Examples: texture packs, physics changes

3. **Content additions** (new items, NPCs, quests)
   - These usually independent
   - Load order less critical

4. **Gameplay tweaks** (balance changes, difficulty)
   - These can go anywhere usually
   - But load AFTER overhauls

5. **Specific fixes and patches**
   - Load near end
   - They override earlier mods

**General rule:**
- Load larger-scope mods first
- Load specific tweaks last
- More general → more specific

### Testing Load Order Changes

When you change load order:

1. **Save your load order**
   - Y-Core saves automatically
   - But verify in "Mis Mods"

2. **Restart game completely**
   - Close game fully
   - Reopen it
   - Mods only load on startup

3. **Test immediately**
   - Walk around 5-10 minutes
   - Save and load
   - Check for crashes
   - Look for visual/gameplay issues

4. **If problems occur**
   - Close game
   - Click "Sugerir Orden" again
   - Or revert to previous order
   - Restart game

---

## Conflict Detection and Resolution

### Understanding Conflicts

Y-Core detects three types of conflicts:

#### File Conflicts
**What it is:** Multiple mods edit the same game file

**Example:**
- Mod A: Changes sword damage
- Mod B: Also changes sword damage
- Conflict: Which mod's change wins?

**Solution:**
- Usually load order fixes it
- Or install a "patch" that combines both
- Or choose one mod over the other

#### Load Order Conflicts
**What it is:** Mods need specific order to work

**Example:**
- Mod A needs to load AFTER Mod B
- But currently loads before it
- Conflict: Dependencies reversed

**Solution:**
- Y-Core auto-suggest fixes this
- Or manually reorder
- Restart game

#### Incompatibility Conflicts
**What it is:** Mods can't work together at all

**Example:**
- Mod A: Complete overhaul of magic system
- Mod B: Also complete overhaul of magic system
- Conflict: Fundamentally incompatible

**Solution:**
- Choose one OR the other
- Can't use both
- Find alternative mod
- Or install compatibility patch

### How to Resolve Conflicts

**Step 1: Identify the conflict**
1. Y-Core shows warning in "Gestor Activos"
2. Click on conflict to see details
3. Read description
4. Understand what mods conflict

**Step 2: Understand the cause**
- File conflict → load order issue
- Load order conflict → reordering needed
- Incompatibility → can't use both

**Step 3: Apply solution**
1. Try load order fix first:
   - "Sugerir Orden"
   - Restart game
   - Check if resolved

2. If still conflicting:
   - Look for compatibility patch
   - Mod author often makes one
   - Search: "[Mod A] [Mod B] compatibility"

3. If no patch exists:
   - Uninstall one of the conflicting mods
   - Choose which is more important
   - Find alternative for the one you uninstall

### Conflict Research

Before giving up on conflicting mods:

1. **Search online:** "Mod A + Mod B compatibility"
2. **Check mod pages:** Look for compatibility notes
3. **Read reviews:** Other users might mention fixes
4. **Community forums:** Ask for solutions
5. **Create patch yourself:** If you're technical

---

## Backup Strategy

### Backup Creation Points

Create manual backups at these moments:

#### Before Major Changes
```
Install 5-10 mods
Create backup named "Large Batch Install"
↓
Test thoroughly
↓
If problems, restore to this backup
↓
Or if satisfied, delete backup (save space)
```

#### Before Experimenting with Load Order
```
Current load order: Stable, game works
Create backup named "Before Load Order Changes"
↓
Manually reorder mods
↓
Test changes
↓
If it breaks, restore
```

#### Before Testing Risky Mods
```
About to install unknown/risky mod
Create backup
↓
Install risky mod
↓
Test it
↓
If bad, restore; if good, delete backup
```

#### Before Major Game Updates
```
Game gets update (new patch/DLC)
Create backup named "Before Game Update"
↓
Update game
↓
Mods might break with new update
↓
Can restore if problems
```

### Backup Retention Strategy

**Keep these backups:**
- Last 2-3 stable setups (recent, working)
- Checkpoint backups (major milestones)
- Before major game updates

**Delete these:**
- Backups older than 3 months
- Duplicate/redundant backups
- Failed install attempts
- Experimental setups you're not keeping

**Retention formula:**
- Small game (10GB): Keep 5-10 backups
- Medium game (30GB): Keep 3-5 backups
- Large game (100GB+): Keep 2-3 backups

### Backup Storage Optimization

**To save disk space:**

1. **Use external SSD**
   - Backups stored on USB/external drive
   - Settings > Backup Path > Change location
   - Moves backups to external storage

2. **Archive old backups**
   - Keep 1-2 backups on PC
   - Move older ones to external drive
   - Accessible but not taking space

3. **Clean cache regularly**
   - Settings > Clear Cache
   - Removes temporary files
   - Frees up 1-5GB typically

### When to Restore vs. Reinstall

**Restore from backup when:**
- Something just broke
- You want to undo recent changes
- Want to get back to known-good state
- Need to revert game files quickly

**Reinstall mods instead when:**
- Mod updates available
- Upgrading to better version
- Want fresh install
- Backup is old/outdated

---

## Mod Updates and Maintenance

### Checking for Mod Updates

**How Y-Core helps:**
1. Some mods show "Update available" badge
2. Click to install newer version
3. Auto-backs up before updating

**Manual checking:**

1. Periodically search mods you have:
   - Go to "Catálogo"
   - Search mod name
   - Check version number
   - If higher version exists, install it

2. Set calendar reminder:
   - Monthly: Check for updates
   - Takes 10-15 minutes
   - Keeps everything current

### Updating Mods: Safe Process

**Before updating:**

1. Create backup
   - "Gestor Activos" > Create Backup
   - Name it "Before Mod Updates"

2. Close game completely

3. Go to "Mis Mods"
4. Find mod with available update
5. Click "Actualizar" or "Install" on new version
6. Wait for completion

**After updating:**

1. Restart game completely
2. Test thoroughly (10+ minutes)
3. Save and load game
4. If works, delete backup
5. If broken, restore backup

### When NOT to Update

**Situations to skip updates:**

- **Breaking change** (update notes mention incompatibility)
- **New major version** (e.g., 1.0 → 2.0 with restructure)
- **Mid-playthrough with save compatibility issues** (finish playthrough first)
- **Mod update breaks other mods** (community reports issues)

**In these cases:**
- Wait for patch
- Or stay on current version
- Or research before updating

---

## Clean Uninstall Procedures

### Proper Mod Removal

**When removing a mod:**

1. **Disable it first** (sometimes helps)
   - Click eye icon to disable
   - Wait 10 seconds

2. **Create backup** (if unsure)
   - Safety net in case something wrong

3. **Uninstall the mod**
   - "Mis Mods" > Find mod
   - Click trash icon
   - Confirm deletion

4. **Restart game**
   - Load a save
   - Verify game runs without mod
   - Check for issues

5. **Delete backup** (if confident)
   - It's safe to remove mod
   - Free up disk space

### Removing Multiple Mods at Once

If removing many mods:

1. **Create backup first**
   - Safety net for all of them

2. **Uninstall in batches**
   - Uninstall 3-5 mods
   - Restart game
   - Test
   - Then uninstall next batch

3. **Don't uninstall all at once**
   - Hard to identify which removal caused problems
   - Better to batch and test

### Complete Clean Install

If everything is broken and you want fresh start:

1. **Backup your saves**
   - Find game save folder
   - Copy to external drive
   - Protects character files

2. **Uninstall all mods**
   - Fastest: Restore original backup
   - Or: Manually uninstall each
   - Game is back to vanilla

3. **Delete Y-Core cache**
   - %APPDATA%\Y-Core\ folder
   - Delete "cache" subfolder
   - Fresh start data

4. **Reinstall carefully**
   - Start fresh with one mod
   - Test it
   - Build back up slowly

---

## Troubleshooting Specific Scenarios

### Scenario 1: "Mod Installed But Doesn't Work"

**Process:**

1. Verify it's enabled
   - "Mis Mods" > Look for eye icon
   - Should be open eye (👁️)

2. Check dependencies
   - Mod page says "Requires X"
   - Do you have X installed?
   - Install X if missing

3. Check load order
   - Go to "Mis Mods" > "Sugerir Orden"
   - Might need different order

4. Test fresh game
   - Start new character/playthrough
   - Some mods only work on new games
   - Existing save might be incompatible

5. Reinstall fresh
   - Uninstall and install again
   - Sometimes fixes it

### Scenario 2: "Game Crashes After Installing"

**Diagnosis:**

1. Note which mod was installed most recently
2. Disable just that one mod
3. Restart game
4. Does it work now?

**If yes, that mod is the culprit:**
- Option A: Uninstall it
- Option B: Check for updates
- Option C: Check for compatibility patch

**If no, disable more mods:**
- Disable last 3 mods installed
- Restart game
- Keep disabling until stable
- Then identify which one by re-enabling one at a time

### Scenario 3: "Conflicts Between Mods"

**Symptoms:**
- Y-Core shows conflict warning
- Game glitches or crashes
- Mod behavior weird

**Fix attempt 1:**
1. Go to "Mis Mods" > "Sugerir Orden"
2. Let Y-Core fix order
3. Restart game
4. 70% of time this works

**Fix attempt 2:**
1. Search online: "[Mod A] [Mod B] compatible"
2. Look for patch
3. Install patch
4. Usually created by community

**Fix attempt 3:**
1. Uninstall one of the mods
2. Choose which is more important
3. Find alternative for the other
4. Some mods just can't coexist

### Scenario 4: "Performance Got Bad"

**Identify which mod:**
1. Create backup
2. Disable newest mod
3. Play and check FPS
4. If improves, that's the culprit
5. If not, disable next-newest
6. Keep going until performance improves

**Fix options:**
1. Uninstall mod completely
2. Find "lite" version (lower quality, faster)
3. Lower mod settings (often have config)
4. Upgrade your graphics card (expensive but works)

---

## Advanced: Load Order for Different Games

### Skyrim and Skyrim Special Edition

**Load order priority:**

1. Master files (.esm)
   - Skyrim.esm
   - DLC files
   - Fan patches like USSEP

2. Texture/mesh overhauls
   - Large visual mods
   - These should load first

3. Gameplay overhauls
   - Major mechanic changes
   - Before specific tweaks

4. Content additions
   - New items/NPCs/quests

5. Specific tweaks and patches
   - Load last to override everything

**Example order:**
```
1. Skyrim.esm
2. Update.esm
3. Dawnguard.esm
4. Unofficial Skyrim Patch.esp
5. Better Graphics Overhaul.esp
6. Immersive Weapons.esp
7. More Perks.esp
8. Balance Tweaks.esp
```

### Fallout 4

**Generally same as Skyrim:**
1. Master files
2. Patches
3. Overhauls
4. Content
5. Tweaks

**Note:** Less order-dependent than Skyrim
- Many mods work in any order
- Still use auto-suggest
- Safe to be flexible

### Minecraft

**Load order usually doesn't matter**
- Most mods independent
- Some API mods first
- Otherwise order-agnostic
- Exception: Modpacks specify order

### Stardew Valley

**Generally order-independent**
- Most mods don't conflict
- Exceptions rare
- Content mods: any order
- Quality of life mods: any order

---

## Documentation and Record Keeping

### Track Your Mod Setup

Create a simple document:

**Example:**
```
Game: Skyrim SE
Setup: Vanilla+ with Graphics
Date: 2024-01-15

INSTALLED MODS:
1. Skyrim.esm
2. Unofficial Skyrim Patch
3. Better Graphics Overhaul
4. Immersive Weapons
5. Immersive Armor
6. ...

TOTAL MODS: 24
TOTAL SIZE: 45GB
LOAD ORDER: Auto-suggested by Y-Core

NOTES:
- Stable, no crashes
- Performance: 60 FPS avg
- Graphics preset: High
- All mods from Steam Workshop

BACKUPS:
- Latest: 2024-01-15 (stable)
- Previous: 2024-01-10
```

**Why helpful:**
- Remember what you have
- Document stability
- Easy to recreate on other PC
- Troubleshoot faster

### Export Your Configuration

Do this regularly:

1. Settings > Export Configuration
2. Save to location
3. Also save to cloud storage (Dropbox, OneDrive)
4. Name it: `ModSetup_[GameName]_[Date].ycore-config`

**Benefits:**
- Can reinstall same setup on other PC
- Backup of your configuration
- Share setup with friends
- Version history

---

## When to Start Fresh

### Signs You Need a Reset

**Consider resetting if:**
- More than 200 mods causing stability issues
- Multiple conflicting mods impossible to resolve
- Load order completely optimized but still broken
- Backup system corrupted

**Reset process:**

1. **Backup saves**
   - Protect character files

2. **Restore to original game**
   - Uninstall all mods
   - Or restore initial backup

3. **Delete Y-Core data**
   - Clear cache
   - Rebuild database

4. **Start fresh with careful process**
   - One mod at a time
   - Test each
   - Build stable setup

**Time needed:** 4-8 hours (building 50 stable mods)

---

## Summary: Best Practices Checklist

### Before Every Installation
- [ ] Verify game version compatibility
- [ ] Check mod rating (4+ stars)
- [ ] Check mod download count (10k+)
- [ ] Verify dependencies installed
- [ ] Ensure backup enabled
- [ ] Have sufficient disk space

### During Installation
- [ ] Close other programs
- [ ] Monitor for errors
- [ ] Don't close Y-Core
- [ ] Wait for success message

### After Installation
- [ ] Verify in "Mis Mods"
- [ ] Test in-game (10+ minutes)
- [ ] Save and load game
- [ ] Test mod-specific features
- [ ] Check for crashes

### Regular Maintenance
- [ ] Monthly: Check for updates
- [ ] Quarterly: Clear cache
- [ ] As-needed: Create backups
- [ ] As-needed: Optimize load order
- [ ] As-needed: Remove problematic mods

---

**Next steps:** See MOD_MANAGER_QUICK_START_USER.md for 5-minute overview, or USER_GUIDE_MOD_MANAGER.md for comprehensive details.
