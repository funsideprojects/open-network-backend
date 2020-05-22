import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { NOTIFICATION_CREATED_OR_DELETED } from 'constants/Subscriptions'
import { IContext, pubSub } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo, uploadFile, removeUploadedFile } from './functions'
import { isAuthenticated } from './high-order-resolvers'

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
    { authUser, Post, Comment, ERROR_TYPES }: IContext,
    info
  ) => {
    // Ensure post exist
    const postFound = await Post.findById(postId)
    if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

    // Check post privacy
    if (postFound.isPrivate) {
      if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
        throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
      }
    }

    const result = {}
    const requestedFields = getRequestedFieldsFromInfo(info)

    // Get data if requested
    if (requestedFields.includes('count')) {
      const count = await Comment.countDocuments({ postId })

      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('comments'))) {
      const shouldAggregateCommentsSticker = requestedFields.some((f) =>
        f.includes('comments.sticker.')
      )
      const shouldAggregateCommentsPost = requestedFields.some((f) => f.includes('comments.post.'))
      const shouldAggregateCommentsAuthor = requestedFields.some((f) =>
        f.includes('comments.author.')
      )

      const comments = await Comment.aggregate([
        { $match: { postId: Types.ObjectId(postId) } },
        { $sort: { createdAt: -1 } },
        ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
        ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
        ...(shouldAggregateCommentsSticker
          ? [
              {
                $lookup: {
                  from: 'stickers',
                  let: { stickerId: '$stickerId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$stickerId'] } } },
                    { $set: { id: '$_id' } },
                  ],
                  as: 'sticker',
                },
              },
              { $unwind: { path: '$sticker', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateCommentsPost
          ? [
              {
                $lookup: {
                  from: 'posts',
                  let: { postId: '$postId' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$postId'] } } },
                    { $set: { id: '$_id' } },
                  ],
                  as: 'post',
                },
              },
              { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
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
                    { $set: { id: '$_id' } },
                  ],
                  as: 'author',
                },
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        { $set: { id: '$_id' } },
      ])

      result['comments'] = comments
    }

    return result
  },
}

// *_:
const Mutation = {
  // DONE:
  createComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { comment, image, stickerId, postId } },
      { authUser: { id, username }, Post, File, Comment, User, Notification, ERROR_TYPES }: IContext
    ) => {
      if (((!comment || comment.trim() === '') && !image && !stickerId) || (image && stickerId)) {
        throw new Error(ERROR_TYPES.INVALID_INPUT)
      }

      const postFound = await Post.findById(postId).select({ authorId: 1 })
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

      // Upload image
      let uploadedImage

      if (image) {
        const uploadedFile = await uploadFile(username, image, ['image'])
        if (!uploadedFile) throw new Error(ERROR_TYPES.UNKNOWN)

        uploadedImage = uploadedFile

        await new File({
          publicId: uploadedFile.filePublicId,
          filename: uploadedFile.filename,
          mimetype: uploadedFile.mimetype,
          encoding: uploadedFile.encoding,
          size: uploadedFile.fileSize,
          type: 'Comment',
          userId: id,
        }).save()
      }

      // New Comment
      const newComment = new Comment({
        ...(comment ? { comment } : {}),
        ...(uploadedImage ? { image: uploadedImage.fileAddress } : {}),
        ...(stickerId ? { stickerId } : {}),
        postId,
        authorId: id,
      })
      await newComment.save()
      const userFound = await User.findById(id)

      // *: Send noti
      if (id !== postFound.authorId.toHexString()) {
        const newNotification = new Notification({
          type: 'COMMENT',
          additionalData: `${postId}|${newComment._id}`,
          fromId: id,
          toId: postFound.authorId.toHexString(),
        })

        await newNotification.save()

        // *: PubSub
        pubSub.publish(NOTIFICATION_CREATED_OR_DELETED, {
          notificationCreatedOrDeleted: {
            operation: 'CREATE',
            notification: Object.assign(newNotification, { from: userFound }),
          },
        })
      }

      return Object.assign(newComment, { author: userFound })
    }
  ),

  // DONE:
  updateComment: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { id, comment, image, stickerId, deleteImage, deleteSticker } },
      { authUser, Comment, File, ERROR_TYPES }: IContext
    ) => {
      const commentFound = await Comment.findById(id)
      if (!commentFound) throw new Error(`comment_${ERROR_TYPES.NOT_FOUND}`)
      if (commentFound.authorId.toHexString() !== authUser.id) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      const update = {}

      // Update comment
      if (comment && comment.trim() !== '') {
        update['comment'] = comment
      }

      // Update image
      if (image) {
        // Remove old image
        if (commentFound.image) {
          removeUploadedFile('image', commentFound.image)
        }

        // Upload new
        const uploadedFile = await uploadFile(authUser.username, image, ['image'])
        if (!uploadedFile) throw new Error(ERROR_TYPES.UNKNOWN)

        update['image'] = uploadedFile.fileAddress

        await new File({
          publicId: uploadedFile.filePublicId,
          filename: uploadedFile.filename,
          mimetype: uploadedFile.mimetype,
          encoding: uploadedFile.encoding,
          size: uploadedFile.fileSize,
          type: 'Comment',
          userId: authUser.id,
        }).save()
      } else if (typeof deleteImage === 'boolean' && deleteImage) {
        if (commentFound.image) {
          removeUploadedFile('image', commentFound.image)
          update['image'] = null
        }
      }

      // Update sticker
      if (stickerId) {
        update['stickerId'] = stickerId
      } else if (typeof deleteSticker === 'boolean' && deleteSticker) {
        update['stickerId'] = null
      }

      return !!(await Comment.findByIdAndUpdate(id, { $set: { ...update } }))
    }
  ),

  // DONE:
  deleteComment: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { authUser, Comment, Notification, ERROR_TYPES }: IContext) => {
      const commentFound = await Comment.findById(id)
      if (!commentFound) throw new Error(`comment_${ERROR_TYPES.NOT_FOUND}`)
      if (commentFound.authorId.toHexString() !== authUser.id) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      // Remove uploaded image
      if (commentFound.image) {
        removeUploadedFile('image', commentFound.image)
      }

      // Perform delete
      const deleteResult = await Comment.deleteOne({ _id: Types.ObjectId(id) })

      // *: Delete notification
      const notificationFound = await Notification.findOneAndRemove({
        $and: [
          { type: 'COMMENT' },
          { additionalData: `${commentFound.postId.toHexString()}|${commentFound.id}` },
          { fromId: Types.ObjectId(authUser.id) },
        ],
      })

      // *: PubSub
      pubSub.publish(NOTIFICATION_CREATED_OR_DELETED, {
        notificationCreatedOrDeleted: {
          operation: 'DELETE',
          notification: notificationFound,
        },
      })

      return !!deleteResult.ok
    }
  ),
}

export default { Query, Mutation }
