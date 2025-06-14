const jwt = require('jsonwebtoken')
const Precificacao = require('../models/Precificacao') // Certifique-se de importar o modelo de Precificacao

const setPrecification = async (req, res, next) => {
  try {
    if (!req.cookies.precificacao) {
      let tabela = await Precificacao.findOne({ name: 'default' }).select(
        '-_id -tabela_fretes_ml',
      )
      tabela = tabela.toObject()

      const jwtToken = jwt.sign(tabela, process.env.JWT_TOKEN)

      const configToken = {
        httpOnly: false,
        secure: process.env.AMBIENT === 'PRODUCTION',
        ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
        ...(process.env.AMBIENT === 'PRODUCTION' && {
          domain: 'myappone.com.br',
        }),
      }

      res.cookie('precificacao', jwtToken, configToken)
    }

    next()
  } catch (error) {
    return res.status(401).json({
      erroCode: '401',
      erroType: 'server_error',
      message: [
        'Não foi possível obter os dados de precificação. Por favor, contate um administrador.',
      ],
    })
  }
}

module.exports = setPrecification
