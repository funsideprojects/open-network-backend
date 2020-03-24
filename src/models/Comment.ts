import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IComment extends Document {
  comment: string
  postId: ObjectId
  authorId: ObjectId
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
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post'
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
)

export default model<IComment>('Comment', commentSchema)
