import { FileUpload } from 'graphql-upload'
import { sync as mkdirSync } from 'mkdirp'
import { createWriteStream, unlinkSync } from 'fs'
import { extname } from 'path'
import { v4 } from 'uuid'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

export async function uploadFile(username: string, image: FileUpload) {
  const { createReadStream, filename } = await image
  const stream = createReadStream()
  const imagePublicId = v4()
  // Ensure upload path
  mkdirSync(`${UPLOAD_DIR}/${username}`)
  const imageAddress = `${username}/${imagePublicId}${extname(filename)}`
  const path = `${UPLOAD_DIR}/${imageAddress}`

  // Store the file in the filesystem.
  await new Promise((resolve, reject) => {
    const writeStream = createWriteStream(path)
    writeStream.on('finish', resolve)
    writeStream.on('error', (error) => {
      unlinkSync(path)
      reject(error)
    })

    stream.on('error', (error) => writeStream.destroy(error))
    stream.pipe(writeStream)
  })

  return { imageAddress, imagePublicId }
}

export function removeUploadedFile(imageAddress: string) {
  try {
    unlinkSync(`${UPLOAD_DIR}/${imageAddress}`)
  } catch {
    console.log('Failed to unlink, file does not exist')
  }
}
