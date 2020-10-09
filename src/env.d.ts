declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production'

      PORT?: string

      LOG_TYPE?: '0' | '1' | '2' | '3' | '4'

      // IMAGES_UPLOAD_DIR='./uploads/images'
      // VIDEOS_UPLOAD_DIR='./uploads/videos'
      // AUDIOS_UPLOAD_DIR='./uploads/audios'

      // PM2_LOG_DIR='./logs'
      // PM2_LOGS_FILENAME='console.log'

      // API_PORT=4000

      // ? Cors
      CORS_ORIGIN?: string

      // ? Mongodb / Mongoose
      MONGO_URL?: string

      // ? Jsonwebtoken
      JWT_SECRET?: string

      // ? Mailer
      MAIL_SERVICE?: string
      MAIL_USER?: string
      MAIL_PASS?: string

      // ? Cloudinary
      CLOUDINARY_CLOUD_NAME?: string
      CLOUDINARY_API_KEY?: string
      CLOUDINARY_SECRET?: string
    }
  }
}

export {}
