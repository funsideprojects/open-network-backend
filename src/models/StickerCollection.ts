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
      required: true,
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

stickerCollectionSchema.set('toObject', {
  versionKey: false,
  transform: (doc, res) => {
    // Delete unused field
    delete res.__v

    // Assign id
    res.id = doc._id

    return res
  },
})

export default model<IStickerCollection>('StickerCollection', stickerCollectionSchema)
