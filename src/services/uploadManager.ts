import { FileUpload } from 'graphql-upload'
import { sync as mkdirSync } from 'mkdirp'
import { createWriteStream, statSync, unlinkSync } from 'fs'
import { resolve as resolvePath, extname } from 'path'
import { v4 } from 'uuid'

import { UploadDirectories, FileType } from 'constants/Upload'
import { Logger } from 'services'
import { hl } from 'utils'

export interface IUploadedFile {
  filename: string
  mimetype: string
  encoding: string
  filePath: string
  filePublicId: string
  fileSize: number
  fullPath: string
}

const imageTypes = ['image/gif', 'image/jpeg', 'image/png']
const videoTypes = []
const audioTypes = []

type DirOptions = {
  isProtected?: boolean
  fileType: FileType
}

class UploadManager {
  private buildUploadPath = ({ isProtected = false, fileType }: DirOptions) => {
    return resolvePath(
      __dirname,
      '..',
      '..',
      UploadDirectories.Base,
      isProtected ? UploadDirectories.Protected : UploadDirectories.Public,
      UploadDirectories[fileType]
    )
  }

  protected acceptableTypes(accept: Array<FileType>) {
    return [
      ...(accept.indexOf(FileType.Image) > -1 ? imageTypes : []),
      ...(accept.indexOf(FileType.Video) > -1 ? videoTypes : []),
      ...(accept.indexOf(FileType.Audio) > -1 ? audioTypes : []),
    ]
  }

  public async uploadFile(
    username: string,
    file: Promise<FileUpload>,
    accept: Array<FileType> = [FileType.Image, FileType.Video, FileType.Audio],
    isProtected?: boolean
  ): Promise<IUploadedFile> {
    const { filename, mimetype, encoding, createReadStream } = await file

    return new Promise((resolve, reject) => {
      if (this.acceptableTypes(accept).indexOf(mimetype as string) < 0) {
        Logger.error(`[UploadManager] [${filename}] File type was not supported`)

        reject('File type was not supported')
      }

      const fileType = mimetype.split('/')[0] as FileType
      const uploadPath = this.buildUploadPath({ isProtected, fileType })
      const stream = createReadStream()
      const filePublicId = v4()

      // * Ensure upload path
      mkdirSync(`${uploadPath}/${username}`)

      const filePath = `${username}/${filePublicId}${extname(filename)}`
      const fullPath = `${uploadPath}/${filePath}`

      // * Store the file in the filesystem.
      const writeStream = createWriteStream(fullPath)
      writeStream.on('finish', () => {
        Logger.debug(`[UploadManager] ${hl.success('[UploadFile]')}`, `[${fileType}][${filePath}]`)

        resolve({
          filename,
          mimetype,
          encoding,
          filePath,
          filePublicId,
          fileSize: statSync(fullPath).size, // ? Size as bytes
          fullPath,
        })
      })

      writeStream.on('error', (error) => {
        Logger.debug(`[UploadManager] ${hl.error('[UploadFile]')}`, error.message)
        unlinkSync(fullPath)
        reject(error)
      })

      stream.on('error', writeStream.destroy)
      stream.pipe(writeStream)
    })
  }

  public removeUploadedFile(fileType: FileType, filePath: string, isProtected?: boolean) {
    const uploadPath = this.buildUploadPath({ isProtected, fileType })

    try {
      // ? Delete file from file system
      unlinkSync(`${uploadPath}/${filePath}`)

      Logger.debug(`[UploadManager] ${hl.success('[RemoveUploadedFile]')}`, `[${fileType}][${filePath}]`)
    } catch {
      Logger.error(`[UploadManager] ${hl.error('[RemoveUploadedFile]')}`, `[${fileType}][${filePath}]`)
    }
  }

  public async uploadFiles(
    username: string,
    files: Array<Promise<FileUpload>>,
    accept: Array<FileType> = [FileType.Image, FileType.Video, FileType.Audio]
  ): Promise<Array<IUploadedFile> | string> {
    const uploadedFiles: Array<IUploadedFile> = []

    for (const file of files) {
      const uploadedFile = await this.uploadFile(username, file, accept)

      if (uploadedFile) {
        uploadedFiles.push(uploadedFile)
      } else {
        // ? If any error occurred (any file in files failed to upload) then remove all uploaded files and stop the process
        uploadedFiles.forEach((uFile) => {
          this.removeUploadedFile(uFile.mimetype.split('/')[0] as FileType, uFile.fullPath)
        })

        return (await file).filename
      }
    }

    return uploadedFiles
  }

  public removeUploadedFiles(files: Array<{ fileType: FileType; filePath: string }>) {
    files.forEach(({ fileType, filePath }) => {
      this.removeUploadedFile(fileType, filePath)
    })
  }
}

export default new UploadManager()
