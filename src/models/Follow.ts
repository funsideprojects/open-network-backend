import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IFollow extends Document {
  user: ObjectId
  follower: ObjectId
}

/**
 * Follow schema that has references to User schema
 */
const followSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    follower: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
)

export default model<IFollow>('Follow', followSchema)
