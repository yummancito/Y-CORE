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
  }
}

export function errorHandler(
  error: FastifyError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'La solicitud no cumple con el esquema esperado.',
        details: error.flatten(),
      },
    } satisfies ApiErrorBody)
    return
  }

  if ('statusCode' in error && error.statusCode) {
    const statusCode = error.statusCode as number
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error')
    }
    reply.status(statusCode).send({
      error: {
        code: ('code' in error && error.code) || 'ERROR',
        message: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
      },
    } satisfies ApiErrorBody)
    return
  }

  request.log.error({ err: error }, 'Unhandled error')
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor.',
    },
  } satisfies ApiErrorBody)
}
