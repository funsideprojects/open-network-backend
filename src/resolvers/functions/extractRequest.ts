import { Request } from 'express'

export const getRequestIP = (request: Request) => {
  if (process.env.NODE_ENV === 'development' || !request.headers['x-forwarded-for']) {
    return 'unknown'
  }

  return (request.headers['x-forwarded-for'] as string).split(/, /)[0]
}

export const getRequestUserAgent = (request: Request) => {
  return request.headers['user-agent'] ?? 'unknown'
}
