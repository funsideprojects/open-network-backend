import { v2 as cloudinary } from 'cloudinary'
import { v4 as uuid } from 'uuid'
import { ReadStream } from 'fs'

import { Logger } from 'services'

class Cloudinary {
  constructor() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_SECRET } = process.env

    if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_SECRET) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_SECRET,
      })

      Logger.info(`[Cloudinary] Initialized successfully`)
    }
  }

  public async upload(stream: ReadStream, folder: string, imagePublicId?: string) {
    // if imagePublicId param is presented then we should overwrite the image
    const options = { public_id: imagePublicId ?? (folder ? `${folder}/${uuid()}` : ''), overwrite: true }

    return new Promise((resolve, reject) => {
      const streamLoad = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) reject(error)
        else resolve(result)
      })

      stream.pipe(streamLoad)
    })
  }

  public async delete(publicId: string) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) reject(error)
        else resolve(result)
      })
    })
  }
}

export default new Cloudinary()
