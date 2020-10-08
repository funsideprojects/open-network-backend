import { hex } from 'chalk'

export function success(message: string) {
  return hex('#52c41a')(message)
}

export function info(message: string) {
  return hex('#1890ff')(message)
}

export function warn(message: string) {
  return hex('#fadb14')(message)
}

export function error(message: string) {
  return hex('#f5222d')(message)
}
