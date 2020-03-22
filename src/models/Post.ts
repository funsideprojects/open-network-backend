import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IPost extends Document {
  title: string
  image: string
  imagePublicId: string
  author: ObjectId
  likes: Array<ObjectId>
  comments: Array<ObjectId>
}

/**
 * Post schema that has references to User, Like and Comment schemas
 */
const postSchema = new Schema(
  {
    title: String,
    image: String,
    imagePublicId: String,
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Like'
      }
    ],
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Comment'
      }
    ]
  },
  {
    timestamps: true
  }
)

export default model<IPost>('Post', postSchema)
