import { createTransport } from 'nodemailer'

const { MAIL_SERVICE, MAIL_USER, MAIL_PASS } = process.env

if (!MAIL_SERVICE || !MAIL_USER || !MAIL_PASS) {
  throw new Error(`Missing evironment variables for mail service.`)
}

const transporter = createTransport({
  service: MAIL_SERVICE,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
})

/**
 *  Sends an email to user
 *
 * @param {string} to email address where to send mail
 * @param {string} subject of the email
 * @param {string} html content of the email
 */
export const sendEmail = ({ to, subject, html }) => {
  return new Promise((resolve, reject) => {
    const options = { from: MAIL_USER, to, subject, html }

    return transporter
      .sendMail(options)
      .then((response) => resolve(response.data))
      .catch((error) => reject(error))
  })
}
