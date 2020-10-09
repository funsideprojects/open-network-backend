import { hex } from 'chalk'

const success = (message: string) => hex('#52c41a')(message)
const debug = (message: string) => hex('#ffffb8')(message)
const info = (message: string) => hex('#1890ff')(message)
const warn = (message: string) => hex('#fadb14')(message)
const error = (message: string) => hex('#f5222d')(message)

export default { success, debug, info, warn, error }
