import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IComment extends Document {
  comment: string
  image: string
  imagePublicId: string
  stickerId: ObjectId
  postId: ObjectId
  authorId: ObjectId
}

const commentSchema = new Schema(
  {
    comment: {
      type: String,
      required: true
    },
    image: String,
    imagePublicId: String,
    stickerId: {
      type: Schema.Types.ObjectId,
      ref: 'Sticker'
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
