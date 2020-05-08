import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { NOTIFICATION_CREATED_OR_DELETED } from 'constants/Subscriptions'
import { IContext, pubSub } from 'utils/apollo-server'

import { isAuthenticated } from './high-order-resolvers'
import { getRequestedFieldsFromInfo } from './functions'

// *_:
const Query = {
  // TODO:
  getMyComments: combineResolvers(
    isAuthenticated,
    async (root, { skip, limit }, { authUser: { id }, Comment }: IContext) => {
      return
    }
  ),

  // DONE:
  getComments: async (
    root,
    { postId, skip, limit },
    { authUser, Post, Comment }: IContext,
    info
  ) => {
    const postFound = await Post.findById(postId)
    if (!postFound) throw new Error('Post not found!')

    if (postFound.isPrivate) {
      if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
        throw new Error('Post not found!')
      }
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Comment.countDocuments({ postId })

      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('comments'))) {
      const shouldAggregateCommentsPost = requestedFields.some((f) => f.includes('comments.post'))
      const shouldAggregateCommentsAuthor = requestedFields.some((f) =>
        f.includes('comments.author')
      )

      const comments = await Comment.aggregate([
        { $match: { postId: Types.ObjectId(postId) } },
        { $sort: { createdAt: -1 } },
        ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
        ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
        ...(shouldAggregateCommentsPost
          ? [
              {
                $lookup: {
                  from: 'posts',
                  let: { postId: '$postId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$postId'] } } },
                    { $set: { id: '$_id' } }
                  ],
                  as: 'post'
                }
              },
              { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } }
            ]
          : []),
        ...(shouldAggregateCommentsAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$authorId'] } } },
                    { $set: { id: '$_id' } }
                  ],
                  as: 'author'
                }
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } }
            ]
          : []),
        { $set: { id: '$_id' } }
      ])

      result['comments'] = comments
    }

    return result
  }
}

// *_:
const Mutation = {
  // DONE:
  createComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { comment, postId } },
      { authUser: { id }, Post, Comment, User, Notification }: IContext
    ) => {
      if (!comment || comment.match(/^\s*$/)) throw new Error('Please input comment!')

      const postFound = await Post.findById(postId).select({ authorId: 1 })
      if (!postFound) throw new Error('Post not found!')

      const newComment = new Comment({ comment, postId, authorId: id })
      await newComment.save()
      const userFound = await User.findById(id)

      // *: Send noti
      const newNotification = new Notification({
        type: 'COMMENT',
        additionalData: `${postId}|${newComment._id}`,
        fromId: id,
        toId: postFound.authorId.toHexString()
      })

      await newNotification.save()

      // *: PubSub
      pubSub.publish(NOTIFICATION_CREATED_OR_DELETED, {
        notificationCreatedOrDeleted: {
          operation: 'CREATE',
          notification: Object.assign(newNotification, { from: userFound })
        }
      })

      return Object.assign(newComment, { author: userFound })
    }
  ),

  // DONE:
  updateComment: combineResolvers(
    isAuthenticated,
    async (root, { input: { id, comment } }, { Comment }: IContext) => {
      try {
        if (!comment || comment.match(/^\s*$/)) throw new Error('New comment is required!')
        await Comment.findByIdAndUpdate(id, { $set: { comment } })

        return true
      } catch {
        return false
      }
    }
  ),

  // DONE:
  deleteComment: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { authUser, Comment, Notification }: IContext) => {
      try {
        const commentFound = await Comment.findById(id)
        if (!commentFound) throw new Error('Comment not found!')
        if (commentFound.authorId.toHexString() !== authUser.id) {
          throw new Error('Invalid operation')
        }

        await Comment.deleteOne({ _id: Types.ObjectId(id) })

        // *: Delete notification
        const notificationFound = await Notification.findOneAndRemove({
          $and: [
            { type: 'COMMENT' },
            { additionalData: `${commentFound.postId.toHexString()}|${commentFound.id}` },
            { fromId: Types.ObjectId(authUser.id) }
          ]
        })

        // *: PubSub
        pubSub.publish(NOTIFICATION_CREATED_OR_DELETED, {
          notificationCreatedOrDeleted: {
            operation: 'DELETE',
            notification: notificationFound
          }
        })

        return true
      } catch {
        return false
      }
    }
  )
}

export default { Query, Mutation }
