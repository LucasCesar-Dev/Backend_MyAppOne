const jwt = require('jsonwebtoken')
const IntegracaoML = require('../models/IntegracaoML')
const RandomFunctions = require('../utils/RandomFunctions')

const setIntegration = async (req, res, next) => {
  try {
    if (!req.cookies.integrations) {
      const integracoes = await IntegracaoML.find().select(
        '-code -refresh_token -lastAccess_token',
      )

      const jwtToken = jwt.sign({ integracoes }, process.env.JWT_TOKEN)

      const cookie = RandomFunctions.encryptCookie(jwtToken)

      const configToken = {
        httpOnly: false,
        secure: process.env.AMBIENT === 'PRODUCTION',
        ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
      }

      res.cookie('integrations', cookie, configToken)
    }

    next()
  } catch (error) {
    console.log(error)
    return res.status(401).json({
      erroCode: '401',
      erroType: 'server_error',
      message: [
        'Não foi possível obter as integrações do Mercado Livre. Por favor, contate um administrador.',
      ],
    })
  }
}

module.exports = setIntegration
