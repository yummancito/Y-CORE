import { z } from 'zod'

export const registerBodySchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

export const loginBodySchema = registerBodySchema

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

// Supabase revoca sesiones por access token, no por refresh token — ver
// AuthService.logout().
export const logoutBodySchema = z.object({
  accessToken: z.string().min(1),
})
