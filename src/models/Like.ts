import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ILike extends Document {
  post: ObjectId
  user: ObjectId
}

/**
 * Like schema that has references to Post and User schema
 */
const likeSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
)

export default model<ILike>('Like', likeSchema)
