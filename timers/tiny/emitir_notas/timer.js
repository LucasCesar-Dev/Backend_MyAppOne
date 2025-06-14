const fs = require('node:fs').promises
const moment = require('moment-timezone')
const { ApiTinyController } = require('../../../controllers/ApiTinyController')
const NotaFiscal = require('../../../models/NotasTiny')

async function lerJson() {
  const data = await fs.readFile('./timers/tiny/emitir_notas/config.json', 'utf8')
  return JSON.parse(data)
}

const horarios = {
  '00:15': 1,
  '01:00': 2,
  '01:30': 3,
  '02:00': 4,
  '02:30': 5,
  '03:00': 6,
  '03:30': 7,
  '04:00': 8,
}

async function verificarHorario() {
  try {
    const configs = await lerJson()

    if (configs.status === 'active' && process.env.AMBIENT === 'PRODUCTION') {
      const horarioAtual = moment().tz('America/Sao_Paulo').format('HH:mm')
      const horarioDefinido = horarios[horarioAtual]

      if (horarioDefinido) {
        const hoje = new Date()

        const ontem = new Date(hoje)
        ontem.setDate(hoje.getDate() - 1)
        ontem.setHours(0, 0, 0, 0)

        const fimOntem = new Date(ontem)
        fimOntem.setHours(23, 59, 59, 999)

        const notas = await NotaFiscal.find({
          emissionHour: horarioDefinido,
          dataNota: { $gte: ontem, $lt: fimOntem },
          status: 'aberto',
        })

        if (notas) {
          for (const nota of notas) {
            await ApiTinyController.incluirNotaFiscal(nota._id)
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar notas:', error)
  }
}

setInterval(verificarHorario, 60000)
verificarHorario()
