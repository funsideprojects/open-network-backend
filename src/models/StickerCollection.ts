import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IStickerCollection extends Document {
  thumbnailImage: string
  thumbnailImagePublicId: string
  name: string
  description?: string
  authorId: ObjectId
  isPrivate: boolean
}

const stickerCollectionSchema = new Schema(
  {
    thumbnailImage: {
      type: String,
      required: true,
    },
    thumbnailImagePublicId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isPrivate: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

export default model<IStickerCollection>('StickerCollection', stickerCollectionSchema)
