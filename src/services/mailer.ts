import { createTransport, SendMailOptions } from 'nodemailer'

import { Logger } from 'services'

class Mailer {
  private authUser = process.env.MAIL_USER
  private transporter?: ReturnType<typeof createTransport>

  constructor() {
    const { MAIL_SERVICE, MAIL_USER, MAIL_PASS } = process.env

    if (MAIL_SERVICE && MAIL_USER && MAIL_PASS) {
      const transporter = createTransport({
        service: MAIL_SERVICE,
        auth: { user: MAIL_USER, pass: MAIL_PASS },
      })

      this.transporter = transporter

      Logger.info('[Service] [Mailer] Initialized successfully')
    }
  }

  public async sendEmail({ from = this.authUser, ...rest }: SendMailOptions) {
    return new Promise((resolve, reject) => {
      if (!this.transporter) reject('Mailer was not initialized')
      else {
        return this.transporter
          .sendMail({ from, ...rest })
          .then((response) => resolve(response.data))
          .catch(reject)
      }
    })
  }
}

export default new Mailer()
