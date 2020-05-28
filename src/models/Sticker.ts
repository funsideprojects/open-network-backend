import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ISticker extends Document {
  image: string
  imagePublicId: string
  name: string
  collectionId: ObjectId
}

const stickerSchema = new Schema(
  {
    image: {
      type: String,
      required: true,
    },
    imagePublicId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    collectionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'StickerCollection',
    },
  },
  {
    timestamps: true,
  }
)

stickerSchema.set('toObject', {
  versionKey: false,
  transform: (doc, res) => {
    // Delete unused field
    delete res.__v

    // Assign id
    res.id = doc._id

    return res
  },
})

export default model<ISticker>('Sticker', stickerSchema)
