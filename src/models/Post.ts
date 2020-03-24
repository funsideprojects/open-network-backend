import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IPost extends Document {
  title: string
  image: string
  imagePublicId: string
  authorId: ObjectId
  private: boolean
}

/**
 * Post schema that has references to User, Like and Comment schemas
 */
const postSchema = new Schema(
  {
    title: String,
    image: String,
    imagePublicId: String,
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    private: {
      type: Boolean,
      required: true
    }
  },
  {
    timestamps: true
  }
)

export default model<IPost>('Post', postSchema)
