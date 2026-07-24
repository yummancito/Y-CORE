import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Handler de errores único — toda respuesta de error de la API pasa por acá,
 * garantizando el mismo shape sin importar dónde se originó. */
export function errorHandler(
  error: FastifyError | ZodError,
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

  const statusCode = 'statusCode' in error && error.statusCode ? error.statusCode : 500
  const code = 'code' in error && error.code ? error.code : 'INTERNAL_ERROR'

  if (statusCode >= 500) {
    request.log.error({ err: error }, 'Unhandled error')
  }

  reply.status(statusCode).send({
    error: {
      code,
      message: statusCode >= 500 ? 'Error interno del servidor.' : error.message,
    },
  } satisfies ApiErrorBody)
}
