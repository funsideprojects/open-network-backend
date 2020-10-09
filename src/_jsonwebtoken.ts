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

const accessTokenExpiresIn = '30m'
const refreshTokenExpiresIn = '45m'

export function generateAccessToken(user: IUser, type: 'accessToken' | 'refreshToken') {
  return sign(user, process.env.JWT_SECRET, {
    expiresIn: type === 'accessToken' ? accessTokenExpiresIn : refreshTokenExpiresIn,
  })
}

export function verifyToken(token: string) {
  const authUser = verify(token, process.env.JWT_SECRET)

  if (authUser) return authUser as IDecodedToken
  else return undefined
}
