export function getCorsOrigin() {
  const corsOrigin = process.env.CORS_ORIGIN

  if (corsOrigin) {
    if (corsOrigin.indexOf(',') > -1) {
      const whitelist = corsOrigin.split(',')

      return function (requestOrigin, callback) {
        if (process.env.NODE_ENV === 'development' || whitelist.indexOf(requestOrigin) > -1) {
          callback(null, true)
        } else {
          callback(`${requestOrigin} not allowed by CORS`, false)
        }
      }
    }

    return corsOrigin
  }

  return false
}
