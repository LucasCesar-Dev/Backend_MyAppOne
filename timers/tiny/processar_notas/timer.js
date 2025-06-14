const fs = require('node:fs').promises
const WebhooksController = require('../../../controllers/WebhooksController')

async function lerJson() {
  const data = await fs.readFile('./timers/tiny/processar_notas/config.json', 'utf8')
  return JSON.parse(data)
}

let processamentoAtivo = false

async function verificarHorario() {
  if (processamentoAtivo) return

  processamentoAtivo = true
  try {
    const configs = await lerJson()
    if (configs.status === 'active' && process.env.AMBIENT === 'PRODUCTION') {
      await WebhooksController.processarNota()
    }
  } catch (error) {
    console.error('Erro ao processar notas:', error)
  } finally {
    processamentoAtivo = false
  }
}

setInterval(verificarHorario, 300000)
verificarHorario()
