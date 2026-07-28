// ============================================================================
// electron/services/middleware.ts
// ----------------------------------------------------------------------------
// MiddlewareChain — composable middleware for service calls.
// Each middleware can intercept, modify, or abort a service call.
// Inspired by tRPC's middleware chain pattern.
// ============================================================================

import { logger } from '../logger'

export interface CallContext {
  service: string
  method: string
  args: unknown[]
  startTime: number
}

export type MiddlewareFn = (
  ctx: CallContext,
  next: () => Promise<unknown>,
) => Promise<unknown>

export class MiddlewareChain {
  private middlewares: MiddlewareFn[] = []

  /**
   * Add a middleware function to the chain.
   * Middleware runs in the order they are added.
   */
  use(fn: MiddlewareFn): void {
    this.middlewares.push(fn)
  }

  /**
   * Execute the middleware chain around a final handler.
   */
  async execute(
    ctx: CallContext,
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    const chain = [...this.middlewares]

    const next = async (index: number): Promise<unknown> => {
      if (index < chain.length) {
        return chain[index](ctx, () => next(index + 1))
      }
      return handler()
    }

    return next(0)
  }
}

// ── Built-in Middleware ─────────────────────────────────────────────────────

/**
 * Log every service call with timing.
 */
export function createLoggingMiddleware(): MiddlewareFn {
  return async (ctx, next) => {
    const result = await next()
    const duration = Date.now() - ctx.startTime
    if (duration > 1000) {
      logger.warn(
        `[Gateway] Slow call: ${ctx.service}.${ctx.method} (${duration}ms)`,
        'services',
      )
    } else {
      logger.debug(
        `[Gateway] Call: ${ctx.service}.${ctx.method} (${duration}ms)`,
        'services',
      )
    }
    return result
  }
}

/**
 * Catch errors in service calls and log them.
 */
export function createErrorBoundaryMiddleware(): MiddlewareFn {
  return async (ctx, next) => {
    try {
      return await next()
    } catch (err: any) {
      logger.error(
        `[Gateway] Error in ${ctx.service}.${ctx.method}: ${err?.message ?? err}`,
        'services',
      )
      throw err
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: MiddlewareChain | null = null

export function getMiddlewareChain(): MiddlewareChain {
  if (!_instance) {
    _instance = new MiddlewareChain()
    // Register default middleware
    _instance.use(createLoggingMiddleware())
    _instance.use(createErrorBoundaryMiddleware())
  }
  return _instance
}
