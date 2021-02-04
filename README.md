# API for Open Network using Node, GraphQL and MongoDB

## Development

- Create `.env` file base on `.env.template`.
- Start (See below)

Development mode

```bash
yarn dev
```

Build

```bash
yarn build
```

Production mode (after build)

```bash
yarn start
```

Lint

```bash
yarn lint
```

## TODO

- [x] Comment
  - Queries:
    - getComments(postId: ID!, skip: Int, limit: Int): CommentsPayload
  - Mutations:
    - createComment(input: CreateCommentInput!): CommentPayload
    - updateComment(input: UpdateCommentInput!): Boolean
    - deleteComment(input: DeleteCommentInput!): Boolean
- [x] Follow
  - Queries:
    - getFollowedUsers(username: String, skip: Int, limit: Int): FollowerOrFollowingPayload
    - getUserFollowers(username: String, skip: Int, limit: Int): FollowerOrFollowingPayload
  - Mutations:
    - createFollow(input: CreateOrDeleteFollowInput!): Boolean
    - deleteFollow(input: CreateOrDeleteFollowInput!): Boolean
- [x] Like
  - Queries:
    - getLikes(postId: ID!): LikesPayload
  - Mutations:
    - createLike(input: CreateOrDeleteLikeInput!): Boolean
    - deleteLike(input: CreateOrDeleteLikeInput!): Boolean
- [ ] Message
  - Queries:
    - getMessages(withUserId: ID!, skip: Int, limit: Int): MessagesPayload
    - getConversations: [ConversationsPayload]
  - Mutations:
    - createMessage(input: CreateMessageInput!): Boolean
    - updateMessageSeen(input: UpdateMessageSeenInput!): Boolean
  - Subscriptions:
    - messageCreated(withUserId: ID!): MessagePayload
    - newConversation: ConversationsPayload
- [ ] Sticker
  - Queries:
    - getStickerCollections(skip: Int, limit: Int): StickerCollectionsPayload
    - getInstalledStickerCollections(skip: Int, limit: Int): StickerCollectionsPayload
  - Mutations:
    - createStickerCollection(input: CreateStickerCollectionInput!): Boolean
    - updateStickerCollection(input: UpdateStickerCollectionInput!): Boolean
    - deleteStickerCollection(input: DeleteStickerCollectionInput!): Boolean
- [x] Notification
  - Queries:
    - getNotifications(skip: Int, limit: Int): NotificationsPayload
  - Mutations:
    - updateNotificationSeen(input: UpdateNotificationSeenInput!): Boolean
    - deleteNotification(input: DeleteNotificationInput!): Boolean
  - Subscriptions:
    - notificationUpdated: NotificationUpdatedPayload
- [x] Post
  - Queries:
    - getPosts(type: GetPostsType!, username: String, skip: Int, limit: Int): PostsPayload
    - getPost(postId: ID!): PostPayload
  - Mutations:
    - createPost(input: CreatePostInput!): PostPayload
    - updatePost(input: UpdatePostInput!): Boolean
    - unsubscribePost(input: UnsubscribePostInput!): Boolean
    - deletePost(input: DeletePostInput!): Boolean
- [x] User
  - Queries:
    - getAuthUser: UserPayload
    - getUser(username: String, id: ID): UserPayload
    - getUsers(skip: Int, limit: Int): UsersPayload
    - searchUsers(searchQuery: String!): [UserPayload]
    - suggestPeople: [UserPayload]
    - verifyResetPasswordToken(email: String, token: String!): SuccessMessage
  - Mutations:
    - signin(input: SignInInput!): Token
    - signup(input: SignUpInput!): Token
    - requestPasswordReset(input: RequestPasswordResetInput!): SuccessMessage
    - resetPassword(input: ResetPasswordInput!): Token
    - updateUserInfo(input: UpdateUserInfoInput!): UserPayload
    - updateUserPhoto(input: UpdateUserPhotoInput!): UpdateUserPhotoResponse!
  - Subscriptions:
    - isUserOnline(userId: ID!): IsUserOnlinePayload

## V2 Feature Update

- [ ] Integrate with Year In Pixels
- [ ] Add Piano application
- [ ] Store deleted file in production mode
