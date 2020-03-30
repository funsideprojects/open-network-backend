import { sign, verify } from 'jsonwebtoken'

// *_: Interface

export interface IUserData {
  username: string
  id: string
  fullName: string
  email: string
}

export interface IAdditionalFromJWT {
  iat: number
  exp: number
}

export interface IDecodedToken extends IUserData, IAdditionalFromJWT {}

// *_:

/**
 * Generates a token for user
 *
 * @param {object} user
 * @param {string} secret
 * @param {date} expiresIn
 */
export function generateToken(user: IUserData, secret: string, expiresIn: string | number): string {
  const { id, fullName, email, username } = user

  return sign({ id, fullName, email, username }, secret, { expiresIn })
}

/**
 * *: Checks if client is authenticated by checking authorization key from req headers
 *
 * @param {String} token - JWT token
 */
export function checkAuthorization(token: string): Promise<IDecodedToken | undefined> {
  return new Promise(async (resolve) => {
    try {
      const authUser = await verify(token, process.env.SECRET!)

      if (authUser) resolve(authUser as IDecodedToken)
    } catch (error) {
      resolve(undefined)
    }
  })
}
