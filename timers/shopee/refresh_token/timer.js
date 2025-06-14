const moment = require('moment-timezone')
const fs = require('node:fs').promises

const IntegrationFunctions = require('../../../utils/IntegrationFunctions')

async function lerJson() {
  const data = await fs.readFile('./timers/shopee/refresh_token/config.json', 'utf8')
  const jsonData = JSON.parse(data)
  return jsonData
}

async function verificarHorario() {
  try {
    const configs = await lerJson()

    if (
      configs.timerActive &&
      configs.status === 'active' &&
      process.env.AMBIENT === 'PRODUCTION'
    ) {
      const horarioAtual = moment().tz('America/Sao_Paulo').format('HH:mm')

      if (configs.horarios.includes(horarioAtual)) {
        for (const integracao of configs.integracoes) {
          await IntegrationFunctions.refreshTokenShopee(integracao)
        }
      }
    }
  } catch {}
}

setInterval(verificarHorario, 60000)

verificarHorario()
