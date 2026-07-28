// ============================================================================
// src/services/maintenance.service.ts
// ----------------------------------------------------------------------------
// Frontend MaintenanceService — wraps Gateway calls for the maintenance center.
// All backend coordination is handled by the backend MaintenanceService.
// ============================================================================

import { BaseService } from './gateway'
import type {
  FullHealthReport,
  RuntimeHealthReport,
  SaveHealthReport,
  LibraryScanReport,
  FullDiagnostics,
} from '../../electron/common/ipc-contract'

class MaintenanceService extends BaseService {
  protected serviceName = 'maintenance' as const

  async runFullHealthCheck(): Promise<FullHealthReport> {
    return this.call('runFullHealthCheck')
  }

  async checkRuntimeHealth(): Promise<RuntimeHealthReport> {
    return this.call('checkRuntimeHealth')
  }

  async checkSaveHealth(): Promise<SaveHealthReport> {
    return this.call('checkSaveHealth')
  }

  async runLibraryScan(): Promise<LibraryScanReport> {
    return this.call('runLibraryScan')
  }

  async getMaintenanceDiagnostics(): Promise<FullDiagnostics> {
    return this.call('getMaintenanceDiagnostics')
  }

  async clearAllCaches(): Promise<{ success: boolean; error?: string; bytesFreed?: number }> {
    return this.call('clearAllCaches')
  }
}

export const maintenanceService = new MaintenanceService()
