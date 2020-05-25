import { GraphQLResolveInfo } from 'graphql'
import { combineResolvers } from 'graphql-resolvers'
import { Types } from 'mongoose'

import { IContext } from 'utils/apollo-server'

import { getRequestedFieldsFromInfo, uploadFiles, removeUploadedFiles } from './functions'
import { isAuthenticated } from './high-order-resolvers'

// *_:
const Query = {
  // DONE:
  getPosts: async (
    root,
    { type, username, skip, limit },
    { authUser, User, Post, Follow, ERROR_TYPES }: IContext,
    info: GraphQLResolveInfo
  ) => {
    let query
    switch (type) {
      case 'USER': {
        const userFound = await User.findOne({ username }).select('_id')
        if (!userFound) throw new Error(`user_${ERROR_TYPES.NOT_FOUND}`)

        query = {
          $and: [
            { authorId: userFound._id },
            ...(authUser?.id !== userFound.id ? [{ isPrivate: false }] : []),
          ],
        }

        break
      }

      case 'FOLLOWED': {
        if (!authUser) throw new Error(ERROR_TYPES.UNAUTHENTICATED)
        const currentFollowing = await Follow.find({ '_id.followerId': authUser.id })

        query = {
          $or: [
            {
              $and: [
                { authorId: { $in: [...currentFollowing.map(({ _id }) => _id.userId)] } },
                { isPrivate: false },
              ],
            },
            {
              authorId: Types.ObjectId(authUser.id),
            },
          ],
        }

        break
      }

      case 'EXPLORE': {
        let currentFollowing

        if (authUser) {
          currentFollowing = await Follow.find({ '_id.followerId': authUser.id })
        } else {
          currentFollowing = []
        }

        query = {
          $and: [
            { image: { $ne: [] } },
            {
              authorId: {
                $nin: [
                  ...currentFollowing.map(({ _id }) => _id.userId),
                  Types.ObjectId(authUser.id),
                ],
              },
            },
            { isPrivate: false },
          ],
        }

        break
      }

      default: {
        throw new Error(ERROR_TYPES.INVALID_OPERATION)
      }
    }

    const requestedFields = getRequestedFieldsFromInfo(info)
    const result = {}

    if (requestedFields.includes('count')) {
      const count = await Post.countDocuments(query)

      result['count'] = count
    }

    if (requestedFields.some((f) => f.includes('posts'))) {
      const shouldAggregateAuthor = requestedFields.some((f) => f.includes('posts.author'))
      const shouldAggregateLikes = requestedFields.some((f) => f.includes('posts.likes'))
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('posts.likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) =>
        f.includes('posts.commentCount')
      )
      const shouldAggregateComments = requestedFields.some((f) => f.includes('posts.comments'))

      const posts = await Post.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        ...(skip ? [{ $skip: skip }] : []),
        ...(limit ? [{ $limit: limit }] : []),
        ...(shouldAggregateAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$authorId'] } } }],
                  as: 'author',
                },
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateLikeCount || shouldAggregateLikes
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    ...(shouldAggregateLikes
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { userId: '$_id.userId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                                { $set: { id: '$_id' } },
                              ],
                              as: 'user',
                            },
                          },
                          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                        ]
                      : []),
                    { $project: { _id: 0 } },
                  ],
                  as: 'likes',
                },
              },
            ]
          : []),
        ...(shouldAggregateCommentCount || shouldAggregateComments
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    ...(shouldAggregateComments
                      ? [
                          { $sort: { createdAt: -1 } },
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
                          { $set: { id: '$_id' } },
                        ]
                      : []),
                  ],
                  as: 'comments',
                },
              },
            ]
          : []),
        {
          $set: {
            id: '$_id',
            ...(shouldAggregateAuthor ? { 'author.id': '$author._id' } : {}),
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likes' },
                      then: { $size: '$likes' },
                      else: 0,
                    },
                  },
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$comments' },
                      then: { $size: '$comments' },
                      else: 0,
                    },
                  },
                }
              : {}),
          },
        },
      ])

      result['posts'] = posts
    }

    return result
  },

  // DONE:
  getPost: combineResolvers(
    async (
      root,
      { postId },
      { authUser, Post, ERROR_TYPES }: IContext,
      info: GraphQLResolveInfo
    ) => {
      const postFound = await Post.findById(postId).select({ _id: 1, isPrivate: 1, authorId: 1 })
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)

      if (postFound.isPrivate) {
        if (!authUser || authUser.id !== postFound.authorId.toHexString()) {
          throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
        }
      }

      const requestedFields = getRequestedFieldsFromInfo(info)
      const shouldAggregateAuthor = requestedFields.some((f) => f.includes('author'))
      const shouldAggregateLikes = requestedFields.some((f) => f.includes('likes'))
      const shouldAggregateLikeCount = requestedFields.some((f) => f.includes('likeCount'))
      const shouldAggregateCommentCount = requestedFields.some((f) => f.includes('commentCount'))
      const shouldAggregateComments = requestedFields.some((f) => f.includes('comments'))

      const [post] = await Post.aggregate([
        { $match: { _id: postFound._id } },
        ...(shouldAggregateAuthor
          ? [
              {
                $lookup: {
                  from: 'users',
                  let: { authorId: '$authorId' },
                  pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$authorId'] } } }],
                  as: 'author',
                },
              },
              { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            ]
          : []),
        ...(shouldAggregateLikeCount || shouldAggregateLikes
          ? [
              {
                $lookup: {
                  from: 'likes',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id.postId', '$$postId'] } } },
                    ...(shouldAggregateLikes
                      ? [
                          {
                            $lookup: {
                              from: 'users',
                              let: { userId: '$_id.userId' },
                              pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                                { $set: { id: '$_id' } },
                              ],
                              as: 'user',
                            },
                          },
                          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                        ]
                      : []),
                    { $project: { _id: 0 } },
                  ],
                  as: 'likes',
                },
              },
            ]
          : []),
        ...(shouldAggregateCommentCount || shouldAggregateComments
          ? [
              {
                $lookup: {
                  from: 'comments',
                  let: { postId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                    ...(shouldAggregateComments
                      ? [
                          { $sort: { createdAt: -1 } },
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
                          { $set: { id: '$_id' } },
                        ]
                      : []),
                  ],
                  as: 'comments',
                },
              },
            ]
          : []),
        {
          $set: {
            id: '$_id',
            ...(shouldAggregateAuthor ? { 'author.id': '$author._id' } : {}),
            ...(shouldAggregateLikeCount
              ? {
                  likeCount: {
                    $cond: {
                      if: { $isArray: '$likes' },
                      then: { $size: '$likes' },
                      else: 0,
                    },
                  },
                }
              : {}),
            ...(shouldAggregateCommentCount
              ? {
                  commentCount: {
                    $cond: {
                      if: { $isArray: '$comments' },
                      then: { $size: '$comments' },
                      else: 0,
                    },
                  },
                }
              : {}),
          },
        },
      ])

      return post
    }
  ),
}

// *_:
const Mutation = {
  // DONE:
  createPost: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { title, images, isPrivate } },
      { authUser: { id, username }, Post, File, ERROR_TYPES }: IContext
    ) => {
      // Check input
      if (typeof isPrivate !== 'boolean' || (!title && !images.length)) {
        throw new Error(ERROR_TYPES.INVALID_INPUT)
      }

      // Upload
      let uploadedImages: Array<any> = []

      if (images?.length) {
        const uploadedFiles = await uploadFiles(username, images, ['image'])
        if (!uploadedFiles.length) throw new Error(ERROR_TYPES.UNKNOWN)

        uploadedImages = uploadedFiles.map(({ fileAddress, filePublicId }) => ({
          image: fileAddress,
          imagePublicId: filePublicId,
        }))

        await File.insertMany(
          uploadedFiles.map(
            ({ filename, mimetype, encoding, filePublicId, fileSize }) =>
              new File({
                publicId: filePublicId,
                filename,
                mimetype,
                encoding,
                size: fileSize,
                type: 'Post',
                userId: id,
              })
          )
        )
      }

      // Insert
      const newPost = await new Post({
        title,
        images: uploadedImages,
        authorId: id,
        isPrivate,
      }).save()

      return newPost
    }
  ),

  // DONE:
  updatePost: combineResolvers(
    isAuthenticated,
    async (
      root,
      { input: { id, title, isPrivate, addImages, deleteImages } },
      { authUser, Post, File, ERROR_TYPES }: IContext
    ) => {
      // Check input
      if (
        typeof title !== 'string' &&
        typeof isPrivate !== 'boolean' &&
        !addImages.length &&
        !deleteImages.length
      ) {
        throw new Error(ERROR_TYPES.INVALID_OPERATION)
      }

      // Ensure post existence
      const postFound = await Post.findById(id).select({ authorId: 1, images: 1 })
      if (!postFound) throw new Error(`post_${ERROR_TYPES.NOT_FOUND}`)
      if (postFound.authorId.toHexString() !== authUser.id) {
        throw new Error(ERROR_TYPES.PERMISSION_DENIED)
      }

      // Upload
      let uploadedImages: Array<any> = []

      if (addImages?.length) {
        const uploadedFiles = await uploadFiles(authUser.username, addImages, ['image'])
        if (!uploadedFiles.length) throw new Error(ERROR_TYPES.UNKNOWN)

        uploadedImages = uploadedFiles.map(({ fileAddress, filePublicId }) => ({
          image: fileAddress,
          imagePublicId: filePublicId,
        }))

        await File.insertMany(
          uploadedFiles.map(
            ({ filename, mimetype, encoding, filePublicId, fileSize }) =>
              new File({
                publicId: filePublicId,
                filename,
                mimetype,
                encoding,
                size: fileSize,
                type: 'Post',
                userId: id,
              })
          )
        )
      }

      // Delete
      let deletedImages

      if (deleteImages.length) {
        deletedImages = postFound.images.filter(({ image }) => deleteImages.indexOf(image) > -1)

        removeUploadedFiles(
          deletedImages.map((img) => ({ fileType: 'image', fileAddress: img.image }))
        )

        await File.updateMany(
          { publicId: { $in: deletedImages.map((img) => img.image) } },
          { $set: { deleted: true } }
        )
      } else {
        deletedImages = postFound.images
      }

      await Post.findByIdAndUpdate(id, {
        $set: {
          ...(typeof title === 'string' ? { title } : {}),
          ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
          ...(addImages.length || deleteImages.length
            ? { images: [...deletedImages, ...uploadedImages] }
            : {}),
        },
      })

      return true
    }
  ),

  // FIXME:
  deletePost: combineResolvers(
    isAuthenticated,
    async (root, { input: { id } }, { Post, File, Like, Comment, Notification }: IContext) => {
      const postFound = await Post.findOne({ _id: id })
      if (!postFound) throw new Error('Post not found!')

      // Remove post image from upload
      if (postFound.images) {
        removeUploadedFiles(
          postFound.images.map(({ image }) => ({ fileType: 'image', fileAddress: image }))
        )

        await File.updateMany(
          { publicId: { $in: postFound.images.map(({ image }) => image) } },
          { $set: { deleted: true } }
        )
      }

      // Find post and remove it
      await Post.findByIdAndRemove(id)

      // Delete post likes from likes collection
      await Like.deleteMany({ '_id.postId': id })

      // Delete post comments from comments collection
      await Comment.deleteMany({ postId: id })

      // Remove notifications from notifications collection
      // await Notification.deleteMany({ relativeData: id })

      return true
    }
  ),
}

export default { Query, Mutation }
