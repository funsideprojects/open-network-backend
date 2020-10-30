import { FileUpload } from 'graphql-upload'
import { sync as mkdirSync } from 'mkdirp'
import { createWriteStream, statSync, unlinkSync } from 'fs'
import { extname } from 'path'
import { v4 } from 'uuid'

import { Logger } from 'services'
import { hl } from 'utils'

export interface IUploadedFile {
  filename: string
  mimetype: string
  encoding: string
  fileAddress: string
  filePublicId: string
  fileSize: number
  path: string
}

export type IFileType = 'image' | 'video' | 'audio'

const imageTypes = ['image/gif', 'image/jpeg', 'image/png']
const videoTypes = []
const audioTypes = []

class UploadManager {
  private imageUploadDir = process.env.IMAGES_UPLOAD_DIR ?? './uploads/images'
  private videoUploadDir = process.env.VIDEOS_UPLOAD_DIR ?? './uploads/videos'
  private audioUploadDir = process.env.AUDIOS_UPLOAD_DIR ?? './uploads/audios'

  protected acceptableTypes(accept: Array<IFileType>) {
    return [
      ...(accept.indexOf('image') > -1 ? imageTypes : []),
      ...(accept.indexOf('video') > -1 ? videoTypes : []),
      ...(accept.indexOf('audio') > -1 ? audioTypes : []),
    ]
  }

  public async uploadFile(
    username: string,
    file: Promise<FileUpload>,
    accept: Array<IFileType> = ['image', 'video', 'audio']
  ): Promise<IUploadedFile> {
    const { filename, mimetype, encoding, createReadStream } = await file

    return new Promise((resolve, reject) => {
      if (this.acceptableTypes(accept).indexOf(mimetype as string) < 0) {
        Logger.error(`[UploadManager] [${filename}] File type was not supported`)

        reject(new Error('File type was not supported'))
      }

      const fileType = mimetype.split('/')[0] as IFileType
      const uploadDir = this[`${fileType}UploadDir`]
      const stream = createReadStream()
      const filePublicId = v4()

      // * Ensure upload path
      mkdirSync(`${uploadDir}/${username}`)

      const fileAddress = `${username}/${filePublicId}${extname(filename)}`
      const path = `${uploadDir}/${fileAddress}`

      // * Store the file in the filesystem.
      const writeStream = createWriteStream(path)
      writeStream.on('finish', () => {
        Logger.debug(`[UploadManager] ${hl.success('[UploadFile]')}`, `[${fileType}][${fileAddress}]`)

        resolve({
          filename,
          mimetype,
          encoding,
          fileAddress,
          filePublicId,
          fileSize: statSync(path).size, // ? Size as bytes
          path,
        })
      })

      writeStream.on('error', (error) => {
        Logger.debug(`[UploadManager] ${hl.error('[UploadFile]')}`, error.message)
        unlinkSync(path)
        reject(error)
      })

      stream.on('error', writeStream.destroy)
      stream.pipe(writeStream)
    })
  }

  public removeUploadedFile(fileType: IFileType, fileAddress: string) {
    const uploadDir = this[`${fileType}UploadDir`]

    try {
      // * Delete file from file system
      unlinkSync(`${uploadDir}/${fileAddress}`)
      Logger.debug(`[UploadManager] ${hl.success('[RemoveUploadedFile]')}`, `[${fileType}][${fileAddress}]`)
    } catch {
      Logger.error(`[UploadManager] ${hl.error('[RemoveUploadedFile]')}`, `[${fileType}][${fileAddress}]`)
    }
  }

  public async uploadFiles(
    username: string,
    files: Array<Promise<FileUpload>>,
    accept: Array<IFileType> = ['image', 'video', 'audio']
  ): Promise<Array<IUploadedFile> | string> {
    const uploadedFiles: Array<IUploadedFile> = []

    for (const file of files) {
      const uploadedFile = await this.uploadFile(username, file, accept)

      if (uploadedFile) {
        uploadedFiles.push(uploadedFile)
      } else {
        // ? If error occurred (any file in files failed to upload) then remove all uploaded files and stop
        uploadedFiles.forEach((uFile) => {
          this.removeUploadedFile(uFile.mimetype.split('/')[0] as IFileType, uFile.path)
        })

        return (await file).filename
      }
    }

    return uploadedFiles
  }

  public removeUploadedFiles(files: Array<{ fileType: IFileType; fileAddress: string }>) {
    files.forEach(({ fileType, fileAddress }) => {
      this.removeUploadedFile(fileType, fileAddress)
    })
  }
}

export default new UploadManager()
