import express, { RequestHandler, ErrorRequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import { resolve, join } from 'path'

import { UploadDirectories } from 'constants/Upload'
import Logger from 'services/logger'

import { TokenTypes, verifyToken } from '_jsonwebtoken'

// * Middlewares

const authMiddleware: RequestHandler = (request, response, next) => {
  if (!request.cookies[TokenTypes.Access]) {
    return next('Unauthenticated')
  }

  const isTokenValid = verifyToken(request.cookies[TokenTypes.Access])
  if (!isTokenValid) {
    return next('Invalid access token')
  }

  const [, requestPath] = request.url.split('/')
  if (isTokenValid.username !== requestPath) {
    Logger.error(isTokenValid.username, 'is trying to access', request.url, 'but failed')
    next('You do not have permission to get this file')
  }

  return next()
}

const errorLoggingMiddleware: ErrorRequestHandler = (error, request, response, next) => {
  // console.error(error)

  next(error)
}

const clientErrorHandlerMiddleware: ErrorRequestHandler = (error, request, response, next) => {
  if (request.xhr) {
    response.status(404).send({ error })
  } else {
    next(error)
  }
}

const errorsHandlerMiddleware: ErrorRequestHandler = (error, request, response, next) => {
  response.status(404).sendFile(resolve(join(__dirname, '..', 'public', 'error.png')))
}

// * Express

export function createApplication() {
  const app = express()

  // ? Cookie
  app.use(cookieParser())

  // ? Serve static public files
  app.use('/images', [
    express.static(join(__dirname, '..', 'uploads', 'public', UploadDirectories.image), { dotfiles: 'deny' }),
  ])

  // ? Serve static protected files
  app.use('/protected', [
    authMiddleware,
    express.static(join(__dirname, '..', 'uploads', 'protected'), { dotfiles: 'allow' }),
  ])

  // ? Error handler middlewares
  app.use(errorLoggingMiddleware)
  app.use(clientErrorHandlerMiddleware)
  app.use(errorsHandlerMiddleware)

  // ? Hide X-Powered-By in response headers
  app.disable('x-powered-by')

  return app
}
