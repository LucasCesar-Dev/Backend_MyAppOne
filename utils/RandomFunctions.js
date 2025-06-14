const CryptoJS = require('crypto-js')
const IntegracaoML = require('../models/IntegracaoML')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const crypto = require('node:crypto')

module.exports = class RandomFunctions {
  static timeStringToMilliseconds(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number)
    const milliseconds = hours * 60 * 60 * 1000 + minutes * 60 * 1000
    return milliseconds
  }

  static setRole(hole, res) {
    let userHole
    switch (hole) {
      case '1':
      case 1:
        userHole = 'Desenvolvedor'
        break

      case '2':
      case 2:
        userHole = 'Administrador'
        break

      case '3':
      case 3:
        userHole = 'Gestão de plataformas'
        break

      case '4':
      case 4:
        userHole = 'Expedição'
        break

      case '5':
      case 5:
        userHole = 'Estoquista'
        break

      case '6':
      case 6:
        userHole = 'Atendimento ao cliente'
        break

      case '7':
      case 7:
        userHole = 'Financeiro'
        break
    }

    return userHole
  }

  static encryptCookie(value) {
    return CryptoJS.AES.encrypt(value, process.env.CRYPTO_TOKEN).toString()
  }

  static decryptCookie(value) {
    const bytes = CryptoJS.AES.decrypt(value, process.env.CRYPTO_TOKEN)
    return bytes.toString(CryptoJS.enc.Utf8)
  }

  static async getCookiesML(req, res) {
    const integracoes = await IntegracaoML.find({})

    for (const integracao of integracoes) {
      if (!req.cookies[integracao.short_name]) {
        const { token, expires } = await IntegrationFunctions.refreshToken(
          integracao.refresh_token,
          integracao._id,
        )

        const cookie = RandomFunctions.encryptCookie(token)

        const expirationDate = new Date(expires)
        const extendedExpirationDate = expirationDate.getTime() + 5.5 * 60 * 60 * 1000

        const configToken = {
          maxAge: extendedExpirationDate - Date.now(),
          httpOnly: true,
          secure: process.env.AMBIENT === 'PRODUCTION',
          ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
        }

        res.cookie(integracao.short_name, cookie, configToken)
      }
    }
  }

  static async setLogs(Logs, document, session = false) {
    const options = session ? { session } : {}

    await Logs.create([document], options)
  }

  static decryptDataShopee(encryptedData) {
    const encryptionKey = process.env.SECRET_KEY_SHOPEE
    const algorithm = 'aes-256-cbc'

    const [ivHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const key = Buffer.from(encryptionKey, 'hex')

    const decipher = crypto.createDecipheriv(algorithm, key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
