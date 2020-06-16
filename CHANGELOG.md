# Changes

## Wed-May-27-20 10:00

- Update Apollo

## Tue-May-26-20 21:00

- Update `Comment`, `Notification`, `Post` models.
- Update `Comment`, `Follow`, `Like`, `Notification`, `Post` resolvers.

## Mon-May-25-20 16:00

- Update `File` models.
- Update `Post` resolvers.

## Wed-May-22-20 12:00

- Update `Comment` resolvers.
- Update `Follow` resolvers.
- Update `Like` resolvers.
- Add Error codes.

## Wed-May-20-20 18:00

- Format models + schema.
- Add GraphQL schema-directive setup.
- Add warning on deprecated field.

## Wed-May-20-20 12:00

- Update .env.example file.
- Update .prettierrc file.
- Update tslint `trailing-comma` rule.
- Update resolvers for `Post` and `User`.
- Update all `upload` functions, add ability to change upload dir for specific file type.
- Add `File` model for later use. E.g. Manage, analyze uploaded files, making report,...
- Add `Logger` module.

## Mon-May-18-20 19:00

- Update .env.example file.
- Update dependencies.
- Update `Comment`, `Message`, `Post` model.
  - Comment, Message: add `image`, `imagePublicId`, `stickerId` field.
  - Post: re-design model to adapt multi image upload.
- Add `StickerCollection`, `Sticker`, `Setting` model.
