declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production'
      LOG_TYPE?: '0' | '1' | '2' | '3' | '4'
      PORT?: string
      CORS_ORIGIN?: string
    }
  }
}

export {}
