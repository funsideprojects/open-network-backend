import commentResolver from './comment'
import followResolver from './follow'
import likeResolver from './like'
// import message from './message'
import notificationResolver from './notification'
import otherResolver from './other'
import postResolver from './post'
import userResolver from './user'

export default [
  commentResolver,
  followResolver,
  likeResolver,
  // message,
  notificationResolver,
  otherResolver,
  postResolver,
  userResolver,
]
