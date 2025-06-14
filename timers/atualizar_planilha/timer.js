const moment = require('moment-timezone')
const fs = require('node:fs').promises

const { atualizarProdutos } = require('../../controllers/ApiGoogleSheetsController')

async function lerJson() {
  const data = await fs.readFile('./timers/atualizar_planilha/config.json', 'utf8')
  const jsonData = JSON.parse(data)
  return jsonData
}

let processamentoAtivo = false

async function verificarHorario() {
  if (processamentoAtivo) return

  processamentoAtivo = true

  try {
    const configs = await lerJson()

    if (
      configs.timerActive &&
      configs.status === 'active' &&
      process.env.AMBIENT === 'PRODUCTION'
    ) {
      const horarioAtual = moment().tz('America/Sao_Paulo').format('HH:mm')

      if (configs.horarios.includes(horarioAtual)) {
        atualizarProdutos(configs.idIntegracao)
      } else {
        console.log('Sem ação no horário atual.')
      }
    }
  } catch (error) {
  } finally {
    processamentoAtivo = false
  }
}

setInterval(verificarHorario, 60000)

verificarHorario()
