import { v1 as uuid } from 'uuid'

import { Logger } from 'services'

interface IConnection {
  id: string
  deviceName: string
  connectedAt: string
}

interface IUsers {
  [userId: string]: Array<IConnection>
}

class ConnectionManager {
  private users: IUsers = {}

  public get connectionsList() {
    return this.users
  }

  public userConnections(userId: string) {
    return this.users[userId] ?? []
  }

  public addConnection(userId: string, deviceName: string) {
    const connectionId = uuid()
    const connection: IConnection = { id: connectionId, deviceName, connectedAt: new Date().toUTCString() }

    if (!this.users.hasOwnProperty(userId)) {
      this.users.userId = [connection]
    } else {
      this.users.userId.push(connection)
    }

    return connectionId
  }

  public removeConnection(userId: string, connectionId: string) {
    if (!this.users.hasOwnProperty(userId) || !this.users.userId.find((connection) => connection.id === connectionId)) {
      Logger.error(`[Service] [ConnectionManager] Failed to remove connection [${connectionId}] from user [${userId}]`)
    } else {
      this.users.userId = this.users.userId.filter((connection) => connection.id !== connectionId)
    }
  }
}

export default new ConnectionManager()
