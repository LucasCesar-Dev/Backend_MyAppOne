const cron = require('node-cron')
const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()
const moment = require('moment-timezone')
const EcommerceController = require('../../controllers/EcommerceController')
const IntegrationFunctions = require('../../utils/IntegrationFunctions')

let task

async function startTask() {
  if (!task) {
    task = cron.schedule('* * * * *', async () => {
      const [hour, minute] = moment()
        .tz('America/Sao_Paulo')
        .format('HH:mm')
        .split(':')
        .map(Number)

      const dayOfWeek = moment().tz('America/Sao_Paulo').day()
      const dateTime = new Date(Date.UTC(2000, 0, 1, hour, minute))

      const produtos = await prisma.produtos.findMany({
        where: {
          timePrecos: {
            some: {
              date: dateTime,
              day: dayOfWeek + 1,
            },
          },
        },
        include: {
          timePrecos: {
            where: {
              date: dateTime,
              day: dayOfWeek + 1,
            },
            orderBy: [{ day: 'asc' }, { date: 'asc' }],
          },
        },
      })

      const produtosRegraMarca = []
      let produtosRobo = []
      const ids = []

      if (produtos.length > 0) {
        for (const produto of produtos) {
          const time = produto.timePrecos[0]

          if (
            Number.parseInt(time.action) === 1 &&
            Number.parseFloat(produto.brandrule.replace(',', '.')) > 0
          ) {
            produtosRegraMarca.push({
              id: produto.id,
              tipo: Number.parseInt(time.action),
              sku: produto.sku,
              classico: Number.parseFloat(produto.brandrule.replace(',', '.')),
              premium: Number.parseFloat(produto.brandrule.replace(',', '.')),
              full: Number.parseFloat(produto.brandrule.replace(',', '.')),
              catalogo: Number.parseFloat(produto.brandrule.replace(',', '.')),
            })
          } else {
            ids.push(produto.id)
            produtosRobo.push({
              id: produto.id,
              tipo: Number.parseInt(time.action),
              sku: produto.sku,
              classico: 0,
              premium: 0,
              full: 0,
              catalogo: 0,
            })
          }
        }

        produtosRobo = await getPrecosRobo(produtosRobo, ids)

        try {
          const produtos = [...produtosRegraMarca, ...produtosRobo]

          await IntegrationFunctions.getNewTokens(async () => {
            await processInChunks(produtos, 15)
            console.log('Todos os lotes foram processados!')
          })
        } catch (error) {
          console.log('error: ', error)
        }
      }
    })
  }
}

function chunkArray(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

async function processInChunks(produtos, chunkSize) {
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  const chunks = chunkArray(produtos, chunkSize)
  for (const chunk of chunks) {
    await EcommerceController.precificarByProduto(chunk)
    await wait(1000 * 30)
  }
}

function stopTask() {
  if (task) {
    task.stop()
    task = null
  }
}

async function getPrecosRobo(produtos, ids) {
  const precos = await prisma.roboRegraMarca.findMany({
    where: {
      produtoId: {
        in: ids,
      },
    },
  })

  const produtosRobo = []

  for (const produto of produtos) {
    const preco = precos.find((item) => item.produtoId === produto.id)

    if (preco?.classico && preco?.premium) {
      produtosRobo.push({
        id: produto.id,
        tipo: produto.tipo,
        sku: produto.sku,
        classico: preco.classico,
        premium: preco.premium || null,
        full: preco.full || preco.classico,
        catalogo: preco.catalogo || preco.classico,
      })
    }
  }

  return produtosRobo
}

if (process.env.AMBIENT === 'PRODUCTION') {
  startTask()
}
