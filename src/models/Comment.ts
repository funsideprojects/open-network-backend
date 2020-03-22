import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IComment extends Document {
  comment: string
  post: ObjectId
  author: ObjectId
}

/**
 * Comments schema that has reference to Post and user schemas
 */
const commentSchema = new Schema(
  {
    comment: {
      type: String,
      required: true
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
)

export default model<IComment>('Comment', commentSchema)
