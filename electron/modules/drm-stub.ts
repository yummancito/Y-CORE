// ============================================================================
// DRM / license-circumvention boundary — INTENTIONALLY NOT IMPLEMENTED
// ----------------------------------------------------------------------------
// The original private modules that lived here (depot-key injection, DLL
// sideloading, manifest activation, signature validation) implemented Steam
// license/ownership circumvention. Those are deliberately NOT reconstructed.
//
// This file provides the shared "not implemented" primitives that the stubbed
// boundary modules reuse, so the rest of the application still compiles and
// runs with these features cleanly disabled.
// ============================================================================

export const DRM_DISABLED_MESSAGE =
  'This feature (game unlocking) is not available in this build.'

/** Error thrown by any code path that would perform DRM circumvention. */
export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED'
  constructor(feature: string) {
    super(`NotImplemented: ${feature} — ${DRM_DISABLED_MESSAGE}`)
    this.name = 'NotImplementedError'
  }
}

/** Standard failure result for IPC handlers whose real logic is omitted. */
export function notImplementedResult(feature: string): {
  success: false
  error: string
} {
  return {
    success: false,
    error: `NOT_IMPLEMENTED: ${feature}. ${DRM_DISABLED_MESSAGE}`,
  }
}
