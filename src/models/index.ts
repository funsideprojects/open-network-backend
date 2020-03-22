import Comment from './Comment'
import Follow from './Follow'
import Like from './Like'
import Message from './Message'
import Notification from './Notification'
import Post from './Post'
import User from './User'

export interface IModels {
  Comment: typeof Comment
  Follow: typeof Follow
  Like: typeof Like
  Message: typeof Message
  Notification: typeof Notification
  Post: typeof Post
  User: typeof User
}

export default {
  Comment,
  Follow,
  Like,
  Message,
  Notification,
  Post,
  User
}
