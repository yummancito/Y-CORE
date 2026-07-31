/**
 * Y-Core Mod Security Module - Type Definitions
 * Defines interfaces and types for malware scanning system
 */

/**
 * Severity levels for security findings
 */
export enum SeverityLevel {
  CLEAN = 'clean',
  WARNING = 'warning',
  SUSPICIOUS = 'suspicious',
  DANGEROUS = 'dangerous',
  BLOCKED = 'blocked',
}

/**
 * Scan tiers applied to a file
 */
export enum ScanTier {
  EXTENSION = 'extension',
  PE_HEADER = 'pe_header',
  VIRUS_TOTAL = 'virus_total',
  YARA = 'yara',
}

/**
 * PE header detection flags
 */
export interface PEDetectionFlags {
  isPackedExecutable: boolean;
  hasCodeInjectionAPIs: boolean;
  suspiciousImports: string[];
  hasDebugInfo: boolean;
  highEntropy: boolean;
  entropySections: string[];
}

/**
 * Scan result for a single file
 */
export interface ScanResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: {
    md5?: string;
    sha256?: string;
  };
  scanTimestamp: number;
  overallSeverity: SeverityLevel;
  scanDetails: {
    extensionCheck: ExtensionCheckResult;
    peHeaderAnalysis?: PEHeaderResult;
    virusTotalAnalysis?: VirusTotalResult;
    yaraAnalysis?: YaraResult;
  };
  tiers: ScanTier[];
  shouldBlock: boolean;
  recommendation: string;
}

/**
 * Extension check result (Tier 1)
 */
export interface ExtensionCheckResult {
  extension: string;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  severity: SeverityLevel;
  reason?: string;
}

/**
 * PE header analysis result (Tier 2)
 */
export interface PEHeaderResult {
  isPEFile: boolean;
  is64Bit: boolean;
  timestamp: number;
  detectionFlags: PEDetectionFlags;
  severity: SeverityLevel;
  reason?: string;
}

/**
 * VirusTotal API response cache entry
 */
export interface VirusTotalCacheEntry {
  fileHash: string;
  timestamp: number;
  result: VirusTotalScanData;
  ttl: number;
}

/**
 * VirusTotal individual engine detection
 */
export interface VirusTotalEngineDetection {
  engine: string;
  category: string;
  result: string;
}

/**
 * VirusTotal scan data
 */
export interface VirusTotalScanData {
  fileHash: string;
  detectionCount: number;
  totalEngines: number;
  detections: VirusTotalEngineDetection[];
  lastAnalysisDate: number;
  detectionRatio: string;
}

/**
 * VirusTotal analysis result (Tier 3)
 */
export interface VirusTotalResult {
  fileHash: string;
  fromCache: boolean;
  cachedAt?: number;
  scanData?: VirusTotalScanData;
  severity: SeverityLevel;
  malwareNames: string[];
  reason?: string;
}

/**
 * YARA rule hit
 */
export interface YaraRuleHit {
  ruleName: string;
  ruleFile: string;
  category: string;
  severity: SeverityLevel;
  tags: string[];
}

/**
 * YARA analysis result (Tier 4)
 */
export interface YaraResult {
  rulesMatched: number;
  hits: YaraRuleHit[];
  severity: SeverityLevel;
  detectedMalwareTypes: string[];
  reason?: string;
}

/**
 * Directory scan results
 */
export interface DirectoryScans {
  directoryPath: string;
  scanTimestamp: number;
  totalFiles: number;
  scannedFiles: number;
  blockedFiles: number;
  results: ScanResult[];
  summary: {
    cleanFiles: number;
    warningFiles: number;
    suspiciousFiles: number;
    dangerousFiles: number;
    blockedFiles: number;
  };
  overallSeverity: SeverityLevel;
}

/**
 * Malware scanner configuration
 */
export interface MalwareScannerConfig {
  virusTotalApiKey?: string;
  enableVirusTotal: boolean;
  enableYara: boolean;
  enablePEAnalysis: boolean;
  cacheTTL: number; // milliseconds
  maxFileSizeForVT: number; // bytes
  fileExtensionWhitelist: string[];
  fileExtensionBlacklist: string[];
  blockDangerousFiles: boolean;
  blockSuspiciousFiles: boolean;
  yaraRulesPath?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Cache statistics
 */
export interface CacheStats {
  entriesCount: number;
  cacheSize: number; // bytes
  oldestEntryAge: number; // milliseconds
  newestEntryAge: number; // milliseconds
  hitRate: number; // cache hit percentage (0-100)
}

/**
 * Scan event payloads
 */
export interface ScanStartedEvent {
  filePath: string;
  fileSize: number;
}

export interface ScanProgressEvent {
  filePath: string;
  currentTier: ScanTier;
  progress: number; // 0-100
}

export interface ScanCompletedEvent {
  filePath: string;
  result: ScanResult;
}

export interface FileBlockedEvent {
  filePath: string;
  reason: string;
  severity: SeverityLevel;
}

/**
 * Scan statistics
 */
export interface ScanStatistics {
  totalScans: number;
  averageScanTime: number;
  totalFilesScanned: number;
  totalFilesBlocked: number;
  cacheHitRate: number;
  tierStats: {
    extension: { count: number; averageTime: number };
    peHeader: { count: number; averageTime: number };
    virusTotal: { count: number; averageTime: number; cacheHits: number };
    yara: { count: number; averageTime: number };
  };
}

/**
 * PE header structure (simplified)
 */
export interface PEHeader {
  dosHeader: Buffer;
  peSignature: Buffer;
  fileHeader: {
    machine: number;
    numberOfSections: number;
    timeDateStamp: number;
    characteristics: number;
  };
  optionalHeader: {
    magic: number;
    majorLinkerVersion: number;
    minorLinkerVersion: number;
    codeSize: number;
    dataSize: number;
    bssSize: number;
  };
  sections: PESection[];
  importTable: PEImport[];
}

/**
 * PE section information
 */
export interface PESection {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  rawSize: number;
  rawPointer: number;
  entropy: number;
}

/**
 * PE import information
 */
export interface PEImport {
  moduleName: string;
  functions: string[];
}

/**
 * FIX #12: Type-safe severity level comparison
 * Provides safe comparison without enum value dependencies
 */
export const SEVERITY_ORDER = [
  SeverityLevel.CLEAN,
  SeverityLevel.WARNING,
  SeverityLevel.SUSPICIOUS,
  SeverityLevel.DANGEROUS,
  SeverityLevel.BLOCKED,
] as const;

export function selectHigherSeverity(current: SeverityLevel, candidate: SeverityLevel): SeverityLevel {
  const currentIndex = SEVERITY_ORDER.indexOf(current);
  const candidateIndex = SEVERITY_ORDER.indexOf(candidate);
  return currentIndex > candidateIndex ? current : candidate;
}

/**
 * Default configuration for malware scanner
 */
export const DEFAULT_SCANNER_CONFIG: MalwareScannerConfig = {
  enableVirusTotal: true,
  enableYara: true,
  enablePEAnalysis: true,
  cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
  maxFileSizeForVT: 40 * 1024 * 1024, // 40 MB
  fileExtensionWhitelist: [
    '.pak',
    '.vpk',
    '.bsp',
    '.mdl',
    '.cfg',
    '.lua',
    '.ini',
    '.json',
    '.xml',
    '.txt',
    '.png',
    '.jpg',
    '.wav',
    '.mp3',
    '.ogg',
    '.ttf',
    '.fnt',
    '.vdf',
    '.vmf',
    '.map',
  ],
  fileExtensionBlacklist: [
    '.exe',
    '.bat',
    '.ps1',
    '.vbs',
    '.com',
    '.scr',
    '.dll',
    '.sys',
    '.drv',
    '.msi',
    '.jar',
    '.zip',
    '.rar',
    '.7z',
  ],
  blockDangerousFiles: true,
  blockSuspiciousFiles: false,
  logLevel: 'info',
};

/**
 * Suspicious API patterns that indicate code injection
 */
export const SUSPICIOUS_APIS = [
  'CreateRemoteThread',
  'VirtualAllocEx',
  'WriteProcessMemory',
  'CreateProcessA',
  'CreateProcessW',
  'ShellExecute',
  'WinExec',
  'RegOpenKeyEx',
  'RegSetValueEx',
  'CreateServiceA',
  'CreateServiceW',
  'SetWindowsHookEx',
  'CreateRemoteThreadEx',
  'MapViewOfFile',
  'GetProcAddress',
  'LoadLibrary',
  'LoadLibraryA',
  'LoadLibraryW',
];

/**
 * High-risk entropy threshold for packed executables
 */
export const HIGH_ENTROPY_THRESHOLD = 7.5;
