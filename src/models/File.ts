import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IFile extends Document {
  publicId: string
  filename: string
  mimetype: string
  encoding: string
  size: number
  type: string
  userId: ObjectId
  deleted: boolean
}

const fileSchema = new Schema(
  {
    publicId: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    encoding: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    deleted: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

export default model<IFile>('File', fileSchema)
