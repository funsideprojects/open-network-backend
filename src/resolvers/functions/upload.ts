import { FileUpload } from 'graphql-upload'
import { sync as mkdirSync } from 'mkdirp'
import { createWriteStream, statSync, unlinkSync } from 'fs'
import { extname } from 'path'
import { v4 } from 'uuid'

import Logger from 'utils/logger'

const IMAGES_UPLOAD_DIR = process.env.IMAGES_UPLOAD_DIR ?? './uploads/images'
const VIDEOS_UPLOAD_DIR = process.env.VIDEOS_UPLOAD_DIR ?? './uploads/videos'
const AUDIOS_UPLOAD_DIR = process.env.AUDIOS_UPLOAD_DIR ?? './uploads/audios'

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

export async function uploadFile(
  username: string,
  file: FileUpload,
  accept: Array<'image' | 'video' | 'audio'>
): Promise<IUploadedFile | null> {
  // There's no file type selected then return null
  if (!accept.length) return null

  const { filename, mimetype, encoding, createReadStream } = await file

  if (!accept.some((mType) => mimetype.includes(mType))) {
    Logger.error(`[${filename}]: File type not accepted!`)

    return null
  }

  let uploadDir

  if (mimetype.includes('image')) uploadDir = IMAGES_UPLOAD_DIR
  else if (mimetype.includes('video')) uploadDir = VIDEOS_UPLOAD_DIR
  else if (mimetype.includes('audio')) uploadDir = AUDIOS_UPLOAD_DIR

  const stream = createReadStream()
  const filePublicId = v4()
  // Ensure upload path
  mkdirSync(`${uploadDir}/${username}`)
  const fileAddress = `${username}/${filePublicId}${extname(filename)}`
  const path = `${uploadDir}/${fileAddress}`

  // Store the file in the filesystem.
  return await new Promise((resolve, reject) => {
    const writeStream = createWriteStream(path)
    writeStream.on('finish', resolve)
    writeStream.on('error', (error) => {
      unlinkSync(path)
      reject(error)
    })

    stream.on('error', (error) => {
      Logger.error(error)
      writeStream.destroy(error)
    })
    stream.pipe(writeStream)
  })
    .then(() => {
      const { size } = statSync(path)

      return {
        filename,
        mimetype,
        encoding,
        fileAddress,
        filePublicId,
        fileSize: size, // Size as bytes
        path,
      }
    })
    .catch((error) => {
      Logger.error(error)

      return null
    })
}

export async function uploadFiles(
  username: string,
  files: Array<FileUpload>,
  accept: Array<'image' | 'video'>
): Promise<Array<IUploadedFile>> {
  if (!accept.length) return []

  const uploadedFiles: Array<IUploadedFile> = []

  for (const file of files) {
    const uploadedFile = await uploadFile(username, file, accept)

    if (uploadedFile) {
      uploadedFiles.push(uploadedFile as IUploadedFile)
    } else {
      // If error then remove all uploaded files
      uploadedFiles.forEach((uFile) => {
        removeUploadedFile(uFile.mimetype.split('/')[0] as IFileType, uFile.path)
      })

      return []
    }
  }

  return uploadedFiles
}

export function removeUploadedFile(fileType: IFileType, fileAddress: string) {
  let uploadDir

  switch (fileType) {
    case 'image': {
      uploadDir = IMAGES_UPLOAD_DIR
      break
    }

    case 'video': {
      uploadDir = VIDEOS_UPLOAD_DIR
      break
    }

    case 'audio': {
      uploadDir = AUDIOS_UPLOAD_DIR
      break
    }

    default:
      Logger.error(`Invalid fileType inputted when trying to remove [${fileType}][${fileAddress}]`)

      return
  }

  try {
    Logger.debug(`Removing [${fileType}][${fileAddress}]`)
    unlinkSync(`${uploadDir}/${fileAddress}`)
  } catch {
    Logger.error(`Failed to delete [${fileType}][${fileAddress}], file does not exist`)
  }
}

export function removeUploadedFiles(files: Array<{ fileType: IFileType; fileAddress: string }>) {
  files.forEach(({ fileType, fileAddress }) => {
    removeUploadedFile(fileType, fileAddress)
  })
}
