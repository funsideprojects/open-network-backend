import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IPostImage {
  image: string
  imagePublicId: string
}

export interface IPost extends Document {
  title: string
  images: Array<IPostImage>
  authorId: ObjectId
  isPrivate: boolean
}

const postSchema = new Schema(
  {
    title: String,
    images: [{ type: Object }],
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isPrivate: {
      type: Boolean,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export default model<IPost>('Post', postSchema)
