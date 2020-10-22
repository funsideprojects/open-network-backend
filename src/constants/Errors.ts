export const ERROR_TYPES = {
  NOT_FOUND: 'not_found',
  INVALID_INPUT: 'invalid_input',
  INVALID_OPERATION: 'invalid_operation',
  UNKNOWN: 'unknown',
  PERMISSION_DENIED: 'permission_denied',
  UNAUTHENTICATED: 'unauthenticated',
}

export enum HTTP_STATUS_CODE {
  // ? Success
  'OK' = '200',
  'Created' = '201',
  'Accepted' = '202',
  'No Content' = '204',
  // ? Client errors
  'Bad Request' = '400',
  'Unauthorized' = '401',
  'Not Found' = '404',
  'Unsupported Media Type' = '415',
  'Too Many Request' = '429',
  'Request Header Fields Too Large' = '431',
  // ? Server errors
  'Internal Server Error' = '500',
}
