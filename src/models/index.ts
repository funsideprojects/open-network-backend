import Comment from './Comment'
import File from './File'
import Follow from './Follow'
import Like from './Like'
import Message from './Message'
import Notification from './Notification'
import Post from './Post'
import Setting from './Setting'
import Sticker from './Sticker'
import StickerCollection from './StickerCollection'
import User from './User'

export interface IModels {
  Comment: typeof Comment
  File: typeof File
  Follow: typeof Follow
  Like: typeof Like
  Message: typeof Message
  Notification: typeof Notification
  Post: typeof Post
  Setting: typeof Setting
  Sticker: typeof Sticker
  StickerCollection: typeof StickerCollection
  User: typeof User
}

export default {
  Comment,
  File,
  Follow,
  Like,
  Message,
  Notification,
  Post,
  Setting,
  Sticker,
  StickerCollection,
  User
}
