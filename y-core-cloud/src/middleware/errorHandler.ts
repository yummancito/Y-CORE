// ============================================================================
// src/middleware/errorHandler.ts
// ----------------------------------------------------------------------------
// Centralized error handler for consistent API error responses.
// ============================================================================

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
    requestId?: string
  }
}

/**
 * Centralized error handler that never exposes stack traces to clients
 * All errors are logged server-side for debugging
 */
export function errorHandler(
  error: FastifyError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const isProduction = process.env.NODE_ENV === 'production'

  // Handle validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'La solicitud no cumple con el esquema esperado.',
        details: error.flatten(),
        requestId: request.id,
      },
    } satisfies ApiErrorBody)
    return
  }

  // Handle Fastify errors (with statusCode)
  if ('statusCode' in error && error.statusCode) {
    const statusCode = error.statusCode as number

    // Log all server errors (5xx)
    if (statusCode >= 500) {
      request.log.error(
        {
          err: error,
          statusCode,
          url: request.url,
          method: request.method,
          ip: request.ip,
          userId: request.userId,
        },
        'Server error',
      )
    }

    // Never expose stack trace to client
    const clientMessage =
      statusCode >= 500
        ? 'Error interno del servidor. Se ha registrado el incidente.'
        : error.message

    reply.status(statusCode).send({
      error: {
        code: ('code' in error && error.code) || 'ERROR',
        message: clientMessage,
        requestId: request.id,
      },
    } satisfies ApiErrorBody)
    return
  }

  // Handle generic errors
  request.log.error(
    {
      err: error,
      url: request.url,
      method: request.method,
      ip: request.ip,
      userId: request.userId,
    },
    'Unhandled error',
  )

  // Return generic error to client, never expose stack trace
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor. Se ha registrado el incidente.',
      requestId: request.id,
    },
  } satisfies ApiErrorBody)
}
