import { CookieOptions } from 'express'

export const baseCookieOptions: CookieOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production',
}
