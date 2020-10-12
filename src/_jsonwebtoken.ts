import { sign, verify } from 'jsonwebtoken'

// ? Interface
export interface IUser {
  id: string
  email: string
  username: string
  fullName: string
}

interface ITokenMetadata {
  iat: number
  exp: number
}

export interface IDecodedToken extends IUser, ITokenMetadata {}

const { JWT_SECRET } = process.env

export const accessTokenExpiresIn = '30m'
export const refreshTokenExpiresIn = '45m'
export const resetPasswordTokenExpiresIn = 1000 * 60 * 60 // ? 1 hour

export function generateToken(user: IUser, tokenType: 'access' | 'refresh' | 'resetPassword') {
  if (!JWT_SECRET) throw new Error('[Jsonwebtoken] Missing JWT_SECRET')

  return sign(user, JWT_SECRET, {
    expiresIn:
      tokenType === 'access'
        ? accessTokenExpiresIn
        : tokenType === 'refresh'
        ? refreshTokenExpiresIn
        : resetPasswordTokenExpiresIn,
  })
}

export function verifyToken(token: string) {
  if (!JWT_SECRET) throw new Error('[Jsonwebtoken] Missing JWT_SECRET')

  try {
    const authUser = verify(token, JWT_SECRET)

    return authUser ? (authUser as IDecodedToken) : undefined
  } catch {
    return undefined
  }
}
