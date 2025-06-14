const moment = require('moment-timezone')
const fs = require('node:fs').promises

const { EstoqueController } = require('../../../controllers/ApiTinyController')

async function lerJson() {
  const data = await fs.readFile('./timers/tiny/compras/config.json', 'utf8')
  const jsonData = JSON.parse(data)
  return jsonData
}

async function verificarHorario() {
  try {
    const configs = await lerJson()

    for (integracao of configs) {
      if (integracao.timerActive && process.env.AMBIENT === 'PRODUCTION') {
        const horarioAtual = moment().tz('America/Sao_Paulo').format('HH:mm')

        if (integracao.horarios.includes(horarioAtual)) {
          await EstoqueController.getNotasEntrada(integracao.idIntegracao)
        }
      }
    }
  } catch (error) {}
}

setInterval(verificarHorario, 60000)

verificarHorario()
