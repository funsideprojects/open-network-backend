import { hex } from 'chalk'

type MessageType = 0 | 1 | 2 | 3
/**
 * Highlight input messag in console.log
 * @param {enum} type - type of message
 * - 0 for Success
 * - 1 for Info
 * - 2 for Warning
 * - 3 for Error
 * @param {String} message
 */
export function highlight(type: MessageType, message: string) {
  let colorCode: string
  switch (type) {
    case 0:
      colorCode = '#52c41a'
      break
    case 1:
      colorCode = '#1890ff'
      break
    case 2:
      colorCode = '#fadb14'
      break
    case 3:
      colorCode = '#f5222d'
      break
    default:
      colorCode = '#ffffff'
  }

  return hex(colorCode)(message)
}
