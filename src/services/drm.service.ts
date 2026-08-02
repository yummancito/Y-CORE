// ============================================================================
// src/services/drm.service.ts
// ----------------------------------------------------------------------------
// Frontend DrmService — wraps Gateway calls for DRM detection/removal,
// including the Phase 3 ML/anti-cheat/community-stats assessment.
// ============================================================================

import { BaseService } from './gateway'
import type { DrmServiceContract } from '../../electron/common/ipc-contract'

class DrmService extends BaseService {
  protected serviceName = 'drm' as const

  async remove(appId: string): ReturnType<DrmServiceContract['remove']> {
    return this.call('remove', appId)
  }

  async status(appId: string): ReturnType<DrmServiceContract['status']> {
    return this.call('status', appId)
  }

  async assessGameAdvanced(appId: string): ReturnType<DrmServiceContract['assessGameAdvanced']> {
    return this.call('assessGameAdvanced', appId)
  }

  async contributeResult(
    appId: string,
    drmType: string,
    removalMethod: string,
    successStatus: 'success' | 'partial' | 'failed',
    notes?: string,
  ): ReturnType<DrmServiceContract['contributeResult']> {
    return this.call('contributeResult', appId, drmType, removalMethod, successStatus, notes)
  }

  async getCommunityStats(appId: string): ReturnType<DrmServiceContract['getCommunityStats']> {
    return this.call('getCommunityStats', appId)
  }

  async exportCommunityDatabase(): ReturnType<DrmServiceContract['exportCommunityDatabase']> {
    return this.call('exportCommunityDatabase')
  }
}

export const drmService = new DrmService()
