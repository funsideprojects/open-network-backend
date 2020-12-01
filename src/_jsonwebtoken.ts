import { sign, verify } from 'jsonwebtoken'

// ? Types
export enum TokenTypes {
  Access = 'x-access-token',
  Refresh = 'x-refresh-token',
  ResetPassword = 'reset-password',
  EmailVerification = 'email-verification',
}

export type UserPayload = {
  id: string
  username: string
  fullName: string
}

export type RefreshTokenPayload = UserPayload & {
  ip: string
  userAgent: string
}

type AccessToken = {
  type: TokenTypes.Access
  payload: UserPayload
}

type RefreshToken = {
  type: TokenTypes.Refresh
  payload: RefreshTokenPayload
}

type ResetPasswordToken = {
  type: TokenTypes.ResetPassword
  payload: UserPayload
}

type EmailVerification = {
  type: TokenTypes.EmailVerification
  payload: UserPayload
}

type TokenConfig = AccessToken | RefreshToken | ResetPasswordToken | EmailVerification
export interface IPayload extends UserPayload, RefreshTokenPayload {}

export const accessTokenMaxAge = 1000 * 60 * 10 // ? 10 mins
export const refreshTokenMaxAge = 1000 * 60 * 60 * 24 * 365 * 20 // ? 20 years
export const resetPasswordTokenMaxAge = 1000 * 60 * 60 // ? 1 hour
export const emailVerificationTokenMaxAge = 1000 * 60 * 24 // ? 1 day

const { JWT_SECRET } = process.env

export function generateToken({ type, payload }: TokenConfig) {
  if (!JWT_SECRET) throw new Error('[Jsonwebtoken] Missing JWT_SECRET')

  return sign(payload, JWT_SECRET, {
    expiresIn:
      type === TokenTypes.Access
        ? accessTokenMaxAge
        : type === TokenTypes.Refresh
        ? refreshTokenMaxAge
        : type === TokenTypes.ResetPassword
        ? resetPasswordTokenMaxAge
        : emailVerificationTokenMaxAge,
  })
}

export function verifyToken(token: string): UserPayload | RefreshTokenPayload | undefined {
  if (!JWT_SECRET) throw new Error('[Jsonwebtoken] Missing JWT_SECRET')

  try {
    return (verify(token, JWT_SECRET) as any) || undefined
  } catch {
    return undefined
  }
}
