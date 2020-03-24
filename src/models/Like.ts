import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface ILike extends Document {
  _id: {
    postId: ObjectId
    userId: ObjectId
  }
}

/**
 * Like schema that has references to Post and User schema
 */
const likeSchema = new Schema(
  {
    _id: {
      postId: {
        type: Schema.Types.ObjectId,
        ref: 'Post'
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },
  {
    timestamps: true
  }
)

export default model<ILike>('Like', likeSchema)
