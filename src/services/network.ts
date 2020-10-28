import { networkInterfaces } from 'os'

class NetworkManager {
  private _nets = networkInterfaces()
  private _ip: string

  constructor() {
    netsLoop: for (const networkName in this.nets) {
      if (this.nets[networkName]) {
        for (const net of this.nets[networkName]!) {
          if (net.family === 'IPv4' && !net.internal) {
            this._ip = net.address
            break netsLoop
          }
        }
      }
    }
  }

  public get ip() {
    return this._ip
  }

  public get nets() {
    return this._nets
  }
}

export default new NetworkManager()
