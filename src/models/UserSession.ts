import { Document, Schema, model } from 'mongoose'
import { ObjectId } from 'mongodb'

export interface IUserSession extends Document {
  userId: ObjectId
  connectionId: string
  connectedAt: Date
  disconnectedAt?: Date
  userAgent: string
}

const userSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    connectionId: {
      type: String,
      required: true,
    },
    connectedAt: {
      type: Date,
      required: true,
    },
    disconnectedAt: {
      type: Date,
    },
    userAgent: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export default model<IUserSession>('UserSession', userSessionSchema)
