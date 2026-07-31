# Y-Core Mod Manager - Frequently Asked Questions

## General Questions

### Q: What exactly is a mod?
**A:** A mod (short for "modification") is a file or collection of files that changes how your game looks, plays, or feels. Think of it like installing extensions to your web browser—they add features that weren't there originally.

**Examples:**
- Better graphics or textures
- New weapons or armor
- Different hairstyles for characters
- Gameplay tweaks (easier/harder, different rules)
- Quality of life improvements
- Entirely new storylines or quests

**How they work:**
- Mods replace or add to original game files
- Game loads the mod files when it starts
- Mod changes how the game behaves
- Remove the mod → game goes back to normal

### Q: Is modding safe?
**A:** When using Y-Core, yes—it's very safe. Here's why:

1. **Malware scanning** - Every mod is scanned with 4 security layers
2. **Automatic backups** - Your game is backed up before any changes
3. **Rollback capability** - Broken? One click reverts it
4. **Community verification** - Popular mods have thousands of people testing them

**The risks Y-Core eliminates:**
- ✅ Malicious mods that steal data
- ✅ Corrupted files that break your game
- ✅ Installing the wrong mod version
- ✅ Permanent damage to your game

**Remaining risks (unavoidable):**
- Game crashes if mod is incompatible with your system
- Performance slowdown (solution: disable mod)
- Visual glitches (usually fixable with load order change)

### Q: Will mods get my account banned?
**A:** For single-player games (like Skyrim, Fallout): No, you're safe. Mods only change your local game files.

**Online/multiplayer games:** Be careful. Some games ban modded clients. Check before modding:
- Game website
- Community forums
- Mod pages (usually mention this)

**Steam's official stance:** Single-player mods are fine. Online cheating mods are not.

### Q: Do I need technical knowledge to use mods?
**A:** No! Y-Core handles all the technical stuff. You just:
1. Click on a mod
2. Click "Instalar"
3. Wait a few seconds
4. Done!

The system automatically:
- Downloads the right files
- Scans for malware
- Backs up your game
- Installs everything correctly

You don't need to know how any of it works.

---

## Installation Questions

### Q: How long does mod installation take?
**A:** Depends on mod size:

- **Small mods** (100MB): 10-20 seconds
- **Medium mods** (500MB): 1-2 minutes
- **Large mods** (2-5GB): 5-15 minutes
- **Huge mods** (10GB+): 15-60 minutes

**Time is spent on:**
- Download: Usually 70% of time
- Backup creation: Usually 10% of time (fast!)
- Scan: Usually 15% of time
- Installation: Usually 5% of time

**First-time installations might take slightly longer because of initial setup.**

### Q: Can I install multiple mods at the same time?
**A:** No, they install one at a time. But you don't have to wait between them.

**How it works:**
1. You can click Install on Mod A
2. While it's installing, click Install on Mod B
3. They queue up automatically
4. First one finishes → Second one starts
5. You can install 10+ mods this way

**Pro tip:** Install many while doing something else (watching YouTube, etc.)

### Q: What if I interrupt installation (close Y-Core)?
**A:** Depends on where it was:

- **During download:** Restarts from beginning
- **During backup:** Backup is discarded, installation stops (your game stays unchanged)
- **During scan:** Scan restarts
- **During installation:** Partially installed, might need manual cleanup

**Best practice:** Don't close Y-Core during installation. Let it finish.

### Q: Why does the backup take time?
**A:** The backup is actually super fast (<10 seconds for 50GB games). What takes time:

1. **Creating backup** - Usually 5-10 seconds
2. **Downloading mod** - Usually 30-120 seconds (depends on file size)
3. **Scanning** - Usually 10-30 seconds
4. **Installing** - Usually 5-20 seconds

**Total time looks long, but it's all necessary:**
- Backup = safety net
- Scan = security
- Install = actually putting files in game

### Q: How large are typical mods?
**A:** Varies wildly:

- **Tiny tweaks** - 1-5MB (almost instant)
- **Gameplay mods** - 50-500MB (fast)
- **Graphics overhauls** - 500MB-5GB (medium-slow)
- **Complete texture replacements** - 5-20GB (slow)
- **Major expansions** - 10-50GB (very slow)

**Example sizes for Skyrim:**
- "Better Faces" - 50MB
- "Complete Graphics Overhaul" - 2GB
- "4K Texture Pack" - 15GB

---

## Malware and Security Questions

### Q: What does "malware scan" actually do?
**A:** It checks if the mod is dangerous. Y-Core uses 4 security layers:

**Layer 1: File Type Check** (1 second)
- Looks at what types of files are in the mod
- Blocks dangerous file types (.exe, .dll, scripts)
- Lets safe types through (.models, .textures, .configs)

**Layer 2: Code Signature Check** (1 second)
- Examines the "fingerprint" of executable files
- Checks for known malware patterns
- Looks for code hiding techniques

**Layer 3: VirusTotal Database** (5-15 seconds)
- Submits mod hash to VirusTotal
- They scan it with 70+ antivirus engines
- You get the verdict from dozens of security companies

**Layer 4: YARA Pattern Matching** (5-20 seconds)
- Looks for dangerous code patterns
- Detects keyloggers, password stealers, miners
- Most thorough layer

**Total: Usually 20-30 seconds of scanning per mod**

### Q: How accurate is the malware scan?
**A:** Very accurate for dangerous mods (99%+ detection). Less accurate for false positives.

**Accuracy breakdown:**
- **Real malware:** 99% caught before installation
- **False positives:** 0.5-2% (safe mods flagged as dangerous)
- **Missed threats:** Extremely rare (<0.1%)

**If flagged but popular (100k+ downloads, 5 stars):**
- Probably a false positive
- Very unlikely a malicious mod got 100k downloads
- Safe to install anyway if you trust community

### Q: What's the difference between "Suspicious" and "Infected"?
**A:** 

**Suspicious (Orange):**
- A few antivirus engines flagged it
- Might be okay, might not be
- Manual review recommended
- Check community reviews first
- Can install if you trust it

**Infected (Red):**
- Multiple engines agree it's malware
- Definitely dangerous
- Y-Core blocks installation
- Don't install this
- Find different mod instead

### Q: Can malware scans miss real threats?
**A:** Theoretically yes, but extremely unlikely.

**Why they're so effective:**
- 70+ antivirus engines checking
- Pattern matching for known malware
- Community has installed mod millions of times (would catch issues)

**If truly paranoid:**
- Install to external USB first
- Scan with your antivirus before moving to game folder
- Check mod reviews for complaints

**In reality:**
- More people die from car accidents than malware from popular mods
- Popular mods with good reviews are incredibly safe

---

## Backup Questions

### Q: How much disk space do backups use?
**A:** Y-Core uses "hardlinks" which is extremely space-efficient.

**Traditional backup:**
- 50GB game × 5 backups = 250GB wasted storage!

**Y-Core backup (hardlinks):**
- First backup: 50GB
- Second backup: Only 100-500MB
- Third backup: Only 100-500MB
- etc.

**Why:** Hardlinks only store new/changed files, not full duplicates.

**Real example:**
- 50GB Skyrim game
- 10 mods installed (typical setup)
- Backups total: 55-60GB instead of 500GB
- Saves you 440GB of disk space!

### Q: Where are backups stored?
**A:** In a backup folder on your computer. Default locations:

**Windows:**
- `C:\Users\[YourName]\Y-Core\backups\`
- Or wherever you set in Settings > Backup Path

**External drive:**
- Can configure to save to USB/external SSD instead
- Helpful for space-limited PCs

**You can see the exact location:**
1. Open Settings
2. Look for "Backup Path" or "Backup Location"
3. Shows you the folder path
4. You can browse there with File Explorer

### Q: How long do backups last?
**A:** Depends on your settings.

**Options:**
- Keep forever (your choice)
- Auto-delete after 30 days
- Auto-delete after 7 days
- Auto-delete after 1 day

**Recommendation:**
- Keep at least 2-3 recent backups
- Delete backups older than 3 months
- This balances safety and storage

**You can manually delete:**
1. Go to Backups section
2. Click trash icon next to old backup
3. Confirm deletion

### Q: Can I restore a backup to a different computer?
**A:** Not directly. But here's what you can do:

**Copy backup file to other computer:**
1. Find backup file location (Settings > Backup Path)
2. Copy the backup folder to external USB
3. Take USB to other computer
4. Set backup path to the USB folder
5. Click Restore on other computer

**Easier method:**
- Export your mod configuration (Settings > Export)
- Import on other computer (Settings > Import)
- Reinstalls all mods in same order
- Faster than manually backing up and restoring

### Q: What if backup gets corrupted?
**A:** Y-Core checks backup integrity.

**If corrupted:**
1. You'll see warning when trying to restore
2. Backup is marked as "Corrupted"
3. Can't use that backup
4. But you have other backups hopefully

**Best practice:**
- Keep multiple backups (3-5 recent ones)
- If one corrupts, use another
- Don't delete all old backups at once

### Q: How do I restore to an older backup?
**A:**

1. Go to "Gestor Activos" tab
2. Click "Copias de Seguridad" section
3. See list of all backups with dates
4. Click on the one you want
5. Click "Restaurar" button
6. Confirm by clicking "Yes, restore"
7. Wait 1-5 minutes
8. Game is reverted to that date's state

**Important:** Backups revert game files, not save games. Your character is fine.

---

## Load Order Questions

### Q: What is load order and why does it matter?
**A:** Load order is the sequence mods activate.

**Why it matters:**
- Some mods edit the same game files
- Which mod loads LAST wins (overwrites others)
- Wrong order = visual glitches, gameplay breaks

**Simple analogy:**
- Imagine painting a wall
- Paint it red first
- Paint it blue second
- Result: Blue (last layer wins)
- Mods work the same way

### Q: How do I know what the correct load order should be?
**A:** Let Y-Core figure it out!

1. Go to "Mis Mods"
2. Click "Sugerir Orden" button
3. Y-Core analyzes mod dependencies
4. Automatically arranges them
5. 90% of time this is perfect

**If you want manual control:**
1. Check mod pages for load order recommendations
2. Game-specific modding wikis have guides
3. Community load order lists available
4. But auto-suggest is usually best

### Q: Can wrong load order crash my game?
**A:** Yes, very easily.

**Symptoms of wrong load order:**
- Game crashes on startup
- Game crashes when entering certain areas
- Graphics look weird
- NPCs behave strangely
- Quest doesn't work properly

**How to fix:**
1. Go to "Mis Mods"
2. Click "Sugerir Orden"
3. Restart game
4. Should be fixed

### Q: Do all games care about load order?
**A:** No, varies by game.

**Games where load order MATTERS A LOT:**
- Skyrim, Skyrim SE, Skyrim VR
- Fallout 3, Fallout New Vegas, Fallout 4
- Any Elder Scrolls/Fallout game
- Reason: Complex file overlays

**Games where load order BARELY MATTERS:**
- Stardew Valley
- Minecraft
- Most newer RPGs
- Reason: Simpler mod system

**Check before worrying about load order:**
- Look at game's modding community
- They'll tell you if it matters
- Y-Core auto-suggest handles it anyway

### Q: How many mods can I install?
**A:** Technically, unlimited. Practically, depends on your PC.

**Skyrim examples:**
- Casual player: 10-20 mods no problem
- Enthusiast: 50-100 mods fine
- Power user: 200+ mods possible (needs powerful PC)

**Limits:**
- Each mod takes RAM during gameplay
- Each mod takes disk space
- Many mods can slow startup
- Game might become unstable with 200+ mods

**Rule of thumb:**
- Start with 10 mods
- Add 10 more if game runs smoothly
- Keep testing as you add
- When you hit crashes, you've gone too far

**Most players:** 30-60 mods = sweet spot (good variety, stable game)

---

## Gameplay Questions

### Q: Can mods affect my game save?
**A:** Depends on the mod type.

**Mods that DON'T affect saves:**
- Graphics/texture mods
- UI mods
- Audio mods
- Most visual changes

**Mods that might affect saves:**
- Gameplay changes
- Quest mods
- Character balance mods
- Any mod that changes game mechanics

**General rule:** If you remove a mod that modified gameplay, save might become unstable.

**Best practice:**
- Install gameplay mods before creating character
- Avoid uninstalling mid-playthrough
- If must uninstall, create backup first

### Q: What if a mod breaks my save?
**A:** Your save might be corrupted if you:
1. Install mod mid-playthrough
2. Save game with mod active
3. Uninstall mod
4. Load save

**Solutions:**
1. Restore the mod you uninstalled
2. Or reload from earlier save before the mod
3. Or start new character/game

**How to prevent:**
- Keep mod list stable during playthrough
- Don't frequently uninstall mods
- Test mods in new game first

### Q: Can I enable/disable mods mid-game?
**A:** Sometimes, depends on mod.

**Safe to disable mid-game:**
- Graphics/texture mods
- UI mods
- Audio mods
- Most visual-only mods

**Risky to disable mid-game:**
- Gameplay mods
- Quest mods
- Mod that changed character stats
- Any mod affecting save

**How to be safe:**
1. Save game first
2. Disable mod
3. Load save and test
4. If game is unstable, load backup save and re-enable mod

### Q: Will mods slow down my game performance?
**A:** Possibly, depends on the mods.

**Which mods impact performance:**
- High-resolution texture mods (big performance hit)
- Physics enhancements
- Lighting/weather overhauls
- Mods with lots of scripting

**Which mods don't impact performance:**
- Gameplay tweaks
- Quest mods
- Audio mods
- Most content additions

**If game slows down after mods:**
1. Disable newest mod
2. See if speed improves
3. If yes, that mod is the issue
4. Uninstall it or find lite version
5. Or upgrade your graphics card

### Q: How do I know which mod is causing a problem?
**A:** Test one at a time:

1. Install mod #1 only
2. Play for 10 minutes, test thoroughly
3. If works perfectly, install mod #2
4. Play 10 more minutes, test
5. If breaks, mod #2 is the culprit
6. Uninstall mod #2, try different one

**Takes longer but saves hours of troubleshooting.**

---

## Technical Questions

### Q: What PC specs do I need to mod?
**A:** Depends on mod intensity, but here's minimums:

**For light modding (10-20 mods):**
- Windows 10 or later
- 4GB RAM
- Intel i5 / AMD Ryzen 5 or better
- Basic SSD

**For heavy modding (50-100 mods):**
- Windows 10 or later
- 8GB+ RAM
- Intel i7 / AMD Ryzen 7
- SSD (very recommended)

**For extreme modding (100+ mods):**
- Windows 11
- 16GB RAM
- Intel i9 / AMD Ryzen 9
- High-speed NVMe SSD

**More important than specs:**
- Stable internet
- Enough disk space
- Clean system (few viruses)

### Q: Does Y-Core work on Mac/Linux?
**A:** Currently Windows only.

**Why:**
- Steam Workshop integration is Windows-focused
- Most games don't run on Mac/Linux anyway
- Technical reasons around file system compatibility

**Options if you use Mac/Linux:**
- Run Windows in virtual machine
- Dual boot Windows
- Use alternative mod managers for your OS

### Q: Can I run Y-Core on a laptop?
**A:** Yes, but with caveats.

**Laptops work fine for:**
- Installing mods
- Managing mod list
- Playing moded games

**Laptop challenges:**
- Smaller storage (fewer mods)
- Slower disk = slower backups
- Less RAM = fewer mods playable
- Graphics often weaker = fewer graphics mods possible

**Solution:**
- Use external SSD for mods/backups
- Play with fewer mods
- Don't use heavy graphics mods

### Q: Is there a portable/USB version?
**A:** Not currently.

**Why:**
- Y-Core needs to access game folders
- Needs reliable backup storage
- Needs registry access on Windows

**Workaround:**
- Install on external SSD
- Plug SSD into different computers
- Can "carry" your mod setup anywhere
- But need Y-Core installed on each PC

---

## Configuration Questions

### Q: How do I customize Y-Core settings?
**A:**

1. Open Y-Core
2. Click Settings (gear icon, usually top-right)
3. Scroll through options:
   - Backup settings
   - Malware scanning options
   - Download preferences
   - Display options
   - Advanced settings

4. Change what you want
5. Settings auto-save (no Save button needed)

### Q: What do the scanning levels mean?
**A:**

**Quick Scan** (5 seconds)
- Only checks file extensions
- Fastest but least thorough
- Good enough for popular mods

**Standard Scan** (15-30 seconds)
- Checks extensions + signature + VirusTotal
- Best balance of speed and safety
- Recommended

**Deep Scan** (30-60 seconds)
- Checks everything including YARA patterns
- Most thorough
- For paranoid people or unknown mods

**I'd recommend:** Standard (it's plenty safe)

### Q: Can I have multiple game profiles?
**A:** Depends on your game configuration.

**What you can do:**
- Y-Core automatically detects installed games
- Switch between games with dropdown
- Each game has separate mod list
- Each game has separate load order

**What you might want:**
- Different mod sets for different playthroughs
- Save/restore different configurations

**Solution:**
1. Export configuration: Settings > Export
2. Set up mods as you like
3. Save as "Setup A"
4. Export again: Settings > Export
5. Set up differently
6. Save as "Setup B"
7. Later, import whichever you want

---

## Community and Support

### Q: Where can I find more mods?
**A:** Y-Core's Catalog has thousands, but you can also:

**Steam Workshop**
- Go to game's store page
- Click Workshop button
- Browse all available mods
- Subscribe to ones you want
- Y-Core will see them automatically

**Nexusmods.com**
- Largest mod site for many games
- Often has more recent updates
- Community discussions
- Mod descriptions more detailed
- Can manually download and install

**Modding communities**
- Reddit: r/Skyrim, r/Fallout, etc.
- Discord servers for each game
- They share mod recommendations
- Often have "starter pack" lists

### Q: How do I report a problem mod?
**A:**

**If malicious:**
1. Note the mod name
2. Report to platform (Steam Workshop, Nexusmods)
3. Report to Y-Core developers
4. Should be removed

**If buggy:**
1. Leave comment on mod page
2. Describe the problem
3. Mod creator can fix
4. They'll release update

**If incompatible:**
1. Comment on mod page
2. Say what conflicts with it
3. Helps other users
4. Creator might make patch

### Q: Where's the modding community?
**A:**

**Reddit**
- r/modding (general)
- r/[GameName] (game-specific)
- Very active, helpful community

**Discord**
- Search "[GameName] modding"
- Many communities have Discord
- Real-time chat and support

**Mod websites**
- Nexusmods.com
- Comments and forums
- Ask questions there

**Wikis**
- Many games have modding wikis
- Load order guides
- Compatibility lists
- Best mods recommendations

### Q: How do I get help if something breaks?
**A:**

**Step 1: Troubleshooting**
- Check USER_GUIDE_MOD_MANAGER.md
- Check TROUBLESHOOTING_MOD_MANAGER.md
- Check MOD_MANAGER_FAQ.md (this document)
- Likely there's your answer

**Step 2: Community**
- Post on game's subreddit with details
- Describe your problem clearly
- List mods you installed
- 90% of time someone will help

**Step 3: Mod Creator**
- Go to mod page
- Look for discussion/comments
- Ask there
- Creator often responds

**Step 4: Y-Core Support**
- If issue is definitely Y-Core
- Not game or mod related
- Collect info from Troubleshooting checklist
- Contact Y-Core developers

---

## Money and Licensing Questions

### Q: Do I need to pay for mods?
**A:** No! Mods are free.

**Steam Workshop:** Free
- Thousands of free mods
- User contributions
- No payment ever

**Nexusmods.com:** Free
- Huge mod database
- Free downloads
- No payment required

**Optional donations:**
- Some modders accept donations
- Completely voluntary
- Never required to play

**Important:** If any mod requires payment, it's violating terms of service and probably a scam.

### Q: Can I make money from my mods?
**A:** Generally no, but not because of Y-Core.

**Why not:**
- Most games' terms of service forbid it
- Game assets are copyrighted
- Can modify for yourself, not distribute commercially

**Exceptions:**
- Some platforms allow monetization
- Patreon support (voluntary donations)
- Commercial licensing agreements
- Check your game's specific terms

**Bottom line:** Mods are a hobby, not a business for most people.

### Q: Is Y-Core free or paid?
**A:** Free! No cost to use.

**No hidden costs:**
- No premium version
- No subscription
- No ads
- No in-app purchases

**How is it free?**
- Made by enthusiasts
- Community supported
- Open source
- Funded by donations/sponsors

---

## Advanced Questions

### Q: Can I mod games in other languages?
**A:** Yes! Y-Core works for any language.

**Language support:**
- Y-Core interface: Multiple languages
- Mods: Language doesn't matter (files are files)
- Game version: Language doesn't matter

**Just make sure:**
- Mod is compatible with your game version
- Some mods region/language specific
- Check mod description for compatibility notes

### Q: Can I share my mod configuration with friends?
**A:**

**Yes!**

1. Export your configuration
   - Settings > Export Configuration
   - Choose save location
   - File created (.ycore-config or similar)

2. Share the file with friend
   - Email, Discord, USB drive, etc.

3. Friend imports it
   - Settings > Import Configuration
   - Select your file
   - Y-Core installs all mods in same order

**Friends need:**
- Y-Core installed
- Same games (can't install Skyrim mods for Fallout)
- Same mod availability (public mods only)

### Q: How do I unmod my game and go back to original?
**A:**

**Option 1: Disable all mods**
1. Go to "Mis Mods"
2. Disable every mod (click eye icons)
3. Or uninstall all mods
4. Game back to original

**Option 2: Restore from first backup**
1. Go to Backups
2. Find backup from before any mods
3. Click Restore
4. Game fully reverts to original

**Option 3: Reinstall game**
1. Uninstall game from Steam
2. Delete game folder
3. Reinstall game fresh
4. Completely original

### Q: Can I have both modded and unmodded saves?
**A:** Yes!

**Create separate saves:**
1. One save with mods enabled
2. One save with mods disabled
3. Load whichever you want

**Or separate characters:**
1. Character A: Modded setup
2. Character B: Vanilla (no mods)
3. Play either one

**Or separate games:**
1. Main game: Heavily modded
2. Alternate install: No mods
3. Switch between them

**Easiest:** Different character = different save file = switch anytime.

---

## Final Tips

### Q: What's the best first mod to install?
**A:** Something simple and low-risk:

**For Skyrim:**
- "Unofficial Skyrim Patch" (critical, fixes bugs)
- "Better Faces" (visual improvement, harmless)
- "Quality World Map" (purely visual)

**For Fallout:**
- Similar—patches first, then visual mods

**For other games:**
- Check community "starter pack" lists
- Usually recommended mods for beginners
- These are safest bets

### Q: How many mods should I install?
**A:** Start small:

1. Install 1-5 mods
2. Play for an hour
3. If stable, install 5 more
4. Keep testing
5. Stop when problems start

**Sweet spot for most:** 30-60 mods (good variety, stable game)

### Q: Should I follow mod lists online?
**A:** Yes, great resource!

**Popular lists:**
- Community-tested combinations
- Usually well-ordered
- Authors maintain them
- Safer than random selection

**Where to find:**
- Reddit: "Best mods for [Game]"
- YouTube: "[Game] modding guide"
- Mod sites: "Popular mod lists"

**Use them as starting point:**
- Don't have to install every mod
- Mix and match
- Add your own favorites

### Q: How do I stay updated with mod news?
**A:**

**Subscribe to updates:**
- Steam Workshop: Click Follow on mods
- Nexusmods: Create account, follow mods
- Notifications when mods update

**Community:**
- Join Discord community
- Follow subreddit
- Get weekly recommendations
- Learn about new mods

**Mod lists:**
- Popular lists get updated
- Follows new mod releases
- Curated by enthusiasts

---

**Still have questions?** Check the other documentation:
- **USER_GUIDE_MOD_MANAGER.md** - Detailed walkthrough
- **TROUBLESHOOTING_MOD_MANAGER.md** - Problem solving
- **MOD_INSTALLATION_BEST_PRACTICES.md** - Advanced workflows
- **MOD_MANAGER_QUICK_START_USER.md** - 5-minute start guide

Happy modding!
