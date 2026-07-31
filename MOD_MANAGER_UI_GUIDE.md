# MOD MANAGER UI GUIDE

Complete reference for the Y-Core Mod Manager UI components, hooks, and integration patterns.

## Overview

The Mod Manager UI provides a production-ready interface for managing game mods with the following features:

- **Catalog Browsing**: Browse and install mods from Steam Workshop
- **Mod Management**: Enable/disable, uninstall, and organize installed mods
- **Backup & Restore**: Create automatic backups and restore previous versions
- **Malware Scanning**: Real-time malware detection and status display
- **Conflict Detection**: Identify mod conflicts and load order issues
- **Load Order Management**: Drag-and-drop interface for organizing mod priority
- **Storage Tracking**: Monitor disk usage per mod and total

## Architecture

### File Structure

```
src/
├── domain/
│   └── mod-types.ts              # Type definitions (159 lines)
├── hooks/
│   └── useModManager.ts           # State management hook (450+ lines)
├── components/mods/
│   ├── ModCard.tsx                # Individual mod card component (300 lines)
│   ├── ModsGrid.tsx               # Grid/List layout (200 lines)
│   ├── CatalogView.tsx            # Catalog browsing view (280 lines)
│   ├── MyModsView.tsx             # Installed mods management (350 lines)
│   ├── ModDetailsModal.tsx        # Detailed mod information (450 lines)
│   └── ModManagerPanel.tsx        # Active mod management (350 lines)
└── pages/
    └── ModsPage.tsx               # Main page container (500+ lines)
```

## Type Definitions

### Core Types (`src/domain/mod-types.ts`)

#### `ModInfo`
Represents a mod available in catalog or installed.

```typescript
interface ModInfo {
  // Identifiers
  mod_id: string              // Unique mod identifier
  app_id: string              // Associated game ID

  // Display
  name: string                // Mod name
  author: string              // Author name
  short_description?: string  // Brief description
  full_description?: string   // Long description

  // Images
  preview_image_url?: string  // Main preview image
  thumbnail_url?: string      // Small thumbnail
  gallery_images?: string[]   // Additional screenshots

  // Metadata
  version?: string            // Current version
  file_size?: number          // Size in bytes
  last_updated: Date          // Last update date
  created_date?: Date         // Creation date

  // Statistics
  install_count?: number      // Total installs
  rating?: number             // 0-5 rating
  num_ratings?: number        // Rating count
  num_favorites?: number      // Favorite count

  // Organization
  tags?: string[]             // Category tags
  category?: string           // Primary category

  // URLs
  workshop_url?: string       // Steam Workshop link
  mod_url?: string            // Mod page URL
}
```

#### `InstalledMod`
Extends `ModInfo` with local installation state.

```typescript
interface InstalledMod extends ModInfo {
  // Paths
  install_path: string        // Local installation directory
  backup_path?: string        // Backup directory location

  // State
  enabled: boolean            // Is mod currently enabled
  load_order: number          // Priority in load sequence
  installed_date: Date        // Installation date
  installed_version?: string  // Version that was installed

  // Backup
  has_backup: boolean         // Backup available
  backup_date?: Date          // Backup creation date

  // Status
  status: ModInstallStatus    // Current operation status
  malware_status: MalwareScanStatus  // Security scan result

  // Metadata
  total_size: number          // Total disk usage
  is_active: boolean          // Currently in use
}
```

#### Status Types

```typescript
type ModInstallStatus = 
  | 'not-installed'  // Not yet installed
  | 'installing'     // Currently downloading
  | 'installed'      // Ready to use
  | 'updating'       // Updating existing install
  | 'failed'         // Installation failed
  | 'uninstalling'   // Currently uninstalling

type MalwareScanStatus = 
  | 'pending'        // Not yet scanned
  | 'scanning'       // Actively scanning
  | 'clean'          // No threats found
  | 'infected'       // Threats detected
  | 'quarantined'    // File quarantined
  | 'error'          // Scan failed
```

## Hooks

### `useModManager`

Main hook for mod management with IPC communication and state management.

**Location**: `src/hooks/useModManager.ts`

**Usage**:

```typescript
const modManager = useModManager(initialGameId)
```

**Return Type**:

```typescript
interface UseModManagerReturn {
  // State
  installedMods: InstalledMod[]
  catalogMods: ModInfo[]
  selectedGameId: string | null
  loading: boolean
  error: string | null
  progressUpdates: Map<string, ModProgress>

  // Mod Operations
  fetchInstalledMods(appId: string): Promise<InstalledMod[]>
  fetchCatalogMods(appId: string, options?: ModFilterOptions): Promise<ModInfo[]>
  installMod(modId: string, appId: string): Promise<boolean>
  uninstallMod(modId: string, appId: string): Promise<boolean>
  enableMod(modId: string, appId: string): Promise<boolean>
  disableMod(modId: string, appId: string): Promise<boolean>
  updateLoadOrder(appId: string, modIds: string[]): Promise<boolean>
  searchMods(appId: string, query: string, options?: ModFilterOptions): Promise<ModInfo[]>

  // Backup Operations
  createBackup(modId: string, appId: string): Promise<ModBackup | null>
  restoreBackup(backupId: string, appId: string): Promise<boolean>
  listBackups(modId?: string, appId?: string): Promise<ModBackup[]>
  deleteBackup(backupId: string): Promise<boolean>

  // Malware Scanning
  scanMod(modId: string, appId: string): Promise<MalwareScanResult | null>
  scanAllMods(appId: string): Promise<MalwareScanResult[]>

  // Conflict Detection
  checkConflicts(appId: string): Promise<ModConflict[]>
  getModDetails(modId: string, appId: string): Promise<ModInfo | null>

  // Game Management
  selectGame(appId: string): Promise<void>

  // UI Helpers
  clearError(): void
  retryLastOperation(): Promise<void>
}
```

**Features**:

- **IPC Communication**: Typed gateway calls to main process
- **Caching**: 5-minute TTL cache for API responses
- **Real-time Updates**: Event listeners for installation progress
- **Error Handling**: Centralized error state management
- **Retry Logic**: Built-in operation retry capability

**Example**:

```typescript
function ModManagerExample() {
  const { 
    installedMods, 
    loading, 
    installMod, 
    selectGame 
  } = useModManager('12345')

  const handleInstall = async (modId: string) => {
    const success = await installMod(modId, '12345')
    if (success) {
      // Handle success
    }
  }

  return (
    <div>
      {loading && <Spinner />}
      {installedMods.map(mod => (
        <ModCard key={mod.mod_id} mod={mod} />
      ))}
    </div>
  )
}
```

## Components

### `ModCard`

Individual mod display card with image, metadata, and actions.

**Location**: `src/components/mods/ModCard.tsx`

**Props**:

```typescript
interface ModCardProps {
  mod: ModInfo | InstalledMod        // Mod to display
  isInstalled?: boolean              // Installation status
  status?: ModInstallStatus          // Current operation
  malwareStatus?: MalwareScanStatus  // Security status
  progress?: ModProgress             // Download progress
  onInstall?: () => void             // Install handler
  onUninstall?: () => void           // Uninstall handler
  onToggle?: () => void              // Enable/disable handler
  onDetails?: () => void             // Details view handler
  compact?: boolean                  // Compact layout mode
}
```

**Features**:

- Full-size and compact layouts
- Hover effects with blur overlay
- Real-time progress bars
- Malware status indicators
- Rating stars display
- Image lazy loading
- Skeleton loader

**Example**:

```tsx
<ModCard
  mod={modInfo}
  isInstalled={true}
  status="installed"
  malwareStatus="clean"
  onInstall={handleInstall}
  onDetails={handleShowDetails}
  compact={false}
/>
```

### `ModsGrid`

Responsive grid layout for multiple mod cards.

**Location**: `src/components/mods/ModsGrid.tsx`

**Props**:

```typescript
interface ModsGridProps {
  mods: (ModInfo | InstalledMod)[]  // Mods to display
  loading?: boolean                 // Loading state
  error?: string | null             // Error message
  layout?: 'grid' | 'list' | 'compact' // Layout mode
  installedModIds?: Set<string>     // Installed mod IDs
  progress?: Map<string, ModProgress> // Download progress
  onInstall?: (modId: string) => void
  onUninstall?: (modId: string) => void
  onToggle?: (modId: string) => void
  onSelectMod?: (mod: ModInfo | InstalledMod) => void
  onLoadMore?: () => void           // Pagination callback
  hasMore?: boolean                 // More items available
  loadingMore?: boolean             // Pagination loading
  emptyMessage?: string             // Empty state text
  compact?: boolean                 // Force compact mode
}
```

**Features**:

- Responsive grid (1-4 columns)
- List and compact layouts
- Infinite scroll support
- Empty and error states
- Loading skeletons
- Layout toggle buttons

### `CatalogView`

Browse and install mods from Steam Workshop.

**Location**: `src/components/mods/CatalogView.tsx`

**Props**:

```typescript
interface CatalogViewProps {
  mods: ModInfo[]
  installedModIds: Set<string>
  loading: boolean
  error: string | null
  progress: Map<string, ModProgress>
  onInstall: (modId: string) => void
  onSelectMod: (mod: ModInfo) => void
  onSearch: (query: string, options: ModFilterOptions) => Promise<void>
  onLoadMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
}
```

**Features**:

- Full-text search
- Multi-criteria filtering
- Sort options (popular, trending, newest, rating, updated)
- Category filtering
- Rating threshold filtering
- Collapsible filter panel
- Active filter badges

**Sort Options**:

```typescript
'popular' | 'trending' | 'newest' | 'rating' | 'updated'
```

**Categories**:

```typescript
'all' | 'gameplay' | 'graphics' | 'audio' | 'quality' | 'balance' | 'ui' | 'utility'
```

### `MyModsView`

Manage installed mods with load order and storage tracking.

**Location**: `src/components/mods/MyModsView.tsx`

**Props**:

```typescript
interface MyModsViewProps {
  mods: InstalledMod[]
  loading: boolean
  error: string | null
  progress: Map<string, ModProgress>
  onUninstall: (modId: string) => void
  onToggle: (modId: string) => void
  onUpdateLoadOrder: (modIds: string[]) => Promise<void>
  onSelectMod: (mod: InstalledMod) => void
  onCreateBackup?: (modId: string) => void
}
```

**Features**:

- Installed mods list
- Enable/disable toggles
- Drag-and-drop load order management
- Total and per-mod storage display
- Malware status indicators
- Uninstall buttons
- Backup creation

**Load Order**:

- Drag mods to reorder
- Numeric indicators show priority
- Save/cancel buttons to confirm
- Persists to backend

### `ModDetailsModal`

Detailed mod information with actions.

**Location**: `src/components/mods/ModDetailsModal.tsx`

**Props**:

```typescript
interface ModDetailsModalProps {
  mod: ModInfo | InstalledMod
  isInstalled?: boolean
  isEnabled?: boolean
  loading?: boolean
  backups?: ModBackup[]
  onInstall?: () => void
  onUninstall?: () => void
  onToggle?: () => void
  onCreateBackup?: () => void
  onRestoreBackup?: (backupId: string) => void
  onClose: () => void
  onScan?: () => void
}
```

**Features**:

- Full mod description
- Image gallery with thumbnails
- Rating display
- Download and favorite count
- File size information
- Installation date
- Category tags
- Malware scan status
- Backup management
- Install/Uninstall/Enable/Disable buttons
- Link to Steam Workshop

**Sections**:

1. **Header**: Mod name, author, release date
2. **Images**: Preview image with gallery
3. **Description**: Full mod details
4. **Sidebar Stats**: Rating, downloads, favorites, size
5. **Malware Status**: Security scan results
6. **Backups**: Available backups with restore options
7. **Actions**: All available operations

### `ModManagerPanel`

Summary panel for active mod management.

**Location**: `src/components/mods/ModManagerPanel.tsx`

**Props**:

```typescript
interface ModManagerPanelProps {
  mods: InstalledMod[]
  conflicts: ModConflict[]
  loading?: boolean
  onToggleMod?: (modId: string) => void
  compact?: boolean
}
```

**Features**:

- Active mods summary
- Enable/disable toggles
- Quick status indicators
- Conflict detection with severity levels
- Load order numbers
- Malware status badges
- Compact and full layouts

**Conflict Types**:

```typescript
'file' | 'config' | 'incompatible' | 'load-order' | 'unknown'
```

**Severity Levels**:

```typescript
'info' | 'warning' | 'critical'
```

## Main Page

### `ModsPage`

Main container page with tab navigation.

**Location**: `src/pages/ModsPage.tsx`

**Features**:

- Game selector dropdown
- Three main tabs:
  1. **Mis Mods**: Installed mods management
  2. **Catálogo**: Browse and install mods
  3. **Gestor Activos**: Active mod management
- Error banner
- Context-aware actions
- Real-time progress tracking

**Tab Navigation**:

```typescript
type TabType = 'catalog' | 'installed' | 'manager'
```

**Integration Points**:

- Fetches installed games on mount
- Coordinates mod operations across tabs
- Manages details modal state
- Handles toast notifications
- Tracks progress updates

## IPC Communication

### Service Contract

The frontend communicates with main process via the gateway pattern:

```typescript
// Service method calls
await gateway.call<T>(serviceName, methodName, ...args)

// Event subscriptions
gateway.on(eventName, callback)
```

### Expected Backend Methods

The backend should implement:

```typescript
// modManager service
modManager.listInstalled(appId: string)
modManager.listCatalog(appId: string, options?: ModFilterOptions)
modManager.install(modId: string, appId: string)
modManager.uninstall(modId: string, appId: string)
modManager.enable(modId: string, appId: string)
modManager.disable(modId: string, appId: string)
modManager.updateLoadOrder(appId: string, modIds: string[])
modManager.search(appId: string, query: string, options?: ModFilterOptions)
modManager.createBackup(modId: string, appId: string)
modManager.restoreBackup(backupId: string, appId: string)
modManager.listBackups(modId?: string, appId?: string)
modManager.deleteBackup(backupId: string)
modManager.scanMod(modId: string, appId: string)
modManager.scanAllMods(appId: string)
modManager.checkConflicts(appId: string)
modManager.getDetails(modId: string, appId: string)
```

### Events

```typescript
// Real-time events from main process
'mod:progress'      // Installation/uninstallation progress
'mod:installed'     // Mod successfully installed
'mod:uninstalled'   // Mod removed
'mod:enabled'       // Mod activated
'mod:disabled'      // Mod deactivated
'mod:scanResult'    // Malware scan completed
```

## Styling

### Design System Integration

Components use existing Y-Core design tokens:

```typescript
// Colors
text-bright       // Primary text (white)
text-dim          // Secondary text (dim)
surface-1         // Darkest surface
surface-2         // Medium surface
surface-3         // Lightest surface
accent            // Primary accent color
```

### Responsive Breakpoints

```typescript
// Tailwind breakpoints
sm: 640px         // Small devices
lg: 1024px        // Large screens
xl: 1280px        // Extra large
```

### Custom Styles

- Glassmorphism overlays
- Gradient backgrounds
- Smooth transitions (300-500ms)
- Hover effects with scale/opacity
- Loading spinners and skeleton loaders

## State Management

### Caching Strategy

The `useModManager` hook implements intelligent caching:

- **TTL**: 5 minutes per cache entry
- **Keys**: Pattern-based (e.g., `installed-mods-{appId}`)
- **Invalidation**: Automatic on mutations
- **Manual**: `clearCache()` method

### Real-time Updates

Event listeners update state immediately:

```typescript
useIpcEvent('mod:progress', (data) => {
  // Update progress indicator
  setProgressUpdates(prev => new Map(prev).set(data.mod_id, data))
})
```

## Error Handling

### Error Boundaries

Components include error boundaries for robustness:

```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <ModCard mod={mod} />
</ErrorBoundary>
```

### User Feedback

Three-tier feedback system:

1. **Toast Notifications**: Temporary messages
2. **Error Banners**: Persistent errors
3. **Modal Dialogs**: Critical information

### Recovery

- Retry buttons on failures
- Operation history for retry
- Graceful degradation

## Performance Optimization

### Techniques Applied

- **Memoization**: `memo()` on all components
- **Lazy Loading**: Images with fallbacks
- **Virtual Scrolling**: For large lists (future enhancement)
- **Pagination**: Load more capability
- **Skeleton Loaders**: Better perceived performance

### Bundle Size

- Tree-shaking enabled
- Icon library (lucide-react) optimized
- CSS pruning with Tailwind

## Accessibility

### Features

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators
- Color contrast compliance
- Loading state announcements

## Testing

### Test Coverage

Recommended test scenarios:

```typescript
// Component tests
describe('ModCard', () => {
  it('renders mod information correctly')
  it('handles install button click')
  it('displays malware status icon')
})

describe('ModsGrid', () => {
  it('renders multiple cards')
  it('handles infinite scroll')
  it('shows loading skeletons')
})

// Hook tests
describe('useModManager', () => {
  it('fetches installed mods')
  it('installs mod successfully')
  it('handles installation errors')
  it('caches responses correctly')
})

// Integration tests
describe('ModsPage', () => {
  it('displays three tabs')
  it('switches between tabs')
  it('shows mod details modal')
})
```

## Migration Guide

### Adding Mod Manager to Existing App

1. **Install types**:
   ```bash
   # Already included in domain/mod-types.ts
   ```

2. **Setup hook**:
   ```tsx
   import { useModManager } from '@/hooks/useModManager'
   
   const modManager = useModManager(gameId)
   ```

3. **Add to routing**:
   ```tsx
   import { ModsPage } from '@/pages/ModsPage'
   
   <Route path="/mods" element={<ModsPage />} />
   ```

4. **Implement backend**:
   - Implement `modManager` service contract
   - Setup event emitters
   - Configure file paths

## Troubleshooting

### Common Issues

**Q: Mods not appearing in catalog**
- Verify `onSearch` callback is implemented
- Check API responses in dev tools
- Ensure game ID is correct

**Q: Enable/disable not working**
- Confirm IPC event listeners are active
- Check backend service implementation
- Verify mod ID format

**Q: Images not loading**
- Check image URLs in mod data
- Verify CORS headers if external
- Fallback to placeholder working

**Q: Cache not updating**
- Call `clearCache()` after mutations
- Check cache TTL (5 minutes)
- Verify cache key patterns

## Contributing

### Adding New Features

1. **Add types** to `src/domain/mod-types.ts`
2. **Extend hook** in `src/hooks/useModManager.ts`
3. **Create component** in `src/components/mods/`
4. **Update documentation** in this guide

### Code Style

- TypeScript strict mode
- React functional components
- Memoization for performance
- Descriptive naming conventions
- JSDoc comments on public APIs

## License

MIT - See project LICENSE file

## Support

For issues or questions:
- Check this guide first
- Review component examples
- Check GitHub issues
- Submit detailed bug reports
