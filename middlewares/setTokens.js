const IntegracaoML = require('../models/IntegracaoML')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const RandomFunctions = require('../utils/RandomFunctions')

const setTokens = async (req, res, next) => {
  try {
    const integracoes = await IntegracaoML.find({})
    const integracoesMGL = await IntegracaoMGL.find({})

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

    for (const integracao of integracoesMGL) {
      if (!req.cookies[integracao.short_name]) {
        const { token, expires } = await IntegrationFunctions.refreshTokenMagalu(
          integracao.refresh_token,
          integracao._id,
        )

        const cookie = RandomFunctions.encryptCookie(token)

        const expirationDate = new Date(expires)
        const extendedExpirationDate = expirationDate.getTime() + 1.5 * 60 * 60 * 1000

        const configToken = {
          maxAge: extendedExpirationDate - Date.now(),
          httpOnly: true,
          secure: process.env.AMBIENT === 'PRODUCTION',
          ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
        }

        res.cookie(integracao.short_name, cookie, configToken)
      }
    }

    next()
  } catch (error) {
    console.log('Error: ', error)

    res.status(401).json({
      erroCode: '401',
      erroType: 'token_error',
      message: [
        'Não foi possível obter os tokens do Mercado Livre. Por favor contate um adiministrador.',
      ],
    })
  }
}

module.exports = setTokens
