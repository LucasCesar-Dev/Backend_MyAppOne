const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { PrismaClient, Prisma } = require('@prisma/client')
const axios = require('axios').create()
const axiosRetry = require('axios-retry').default
const sharp = require('sharp')
const FormData = require('form-data')
const moment = require('moment')

const RandomFunctions = require('../utils/RandomFunctions')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const Precificacao = require('../models/Precificacao')
const IntegracaoML = require('../models/IntegracaoML')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const Logs = require('../models/Logs')

const { enviarProgresso } = require('../websocket/websocket')

const prisma = new PrismaClient()

axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000
  },
  retryCondition: (error) => {
    console.log('error: ', error)
    return error.response?.status >= 409 || error.code === 'ECONNABORTED'
  },
})

module.exports = class EcommerceController {
  static async obterProdutosSimples(req, res) {
    try {
      const produtos = await prisma.produtos.findMany({
        select: {
          photo: true,
          name: true,
          gtin: true,
          sku: true,
          id: true,
        },
      })

      return res.json(produtos)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter a lista de produtos para essa página. Por favor recarregue a página !',
        ],
      })
    }
  }

  static async obterKits(req, res) {
    try {
      const kits = await prisma.kits.findMany({})

      return res.json(kits)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter a lista de kits para essa página. Por favor recarregue a página !',
        ],
      })
    }
  }

  static async getProductsWithParams(req, res) {
    const { id, value } = req.body

    try {
      if (id) {
        const produto = await prisma.produtos.findUnique({
          where: {
            id: id,
          },
          include: {
            brand: true,
          },
        })

        if (!produto) {
          res.status(404).json({
            erroCode: '404',
            erroType: 'product_not_found',
            message: ['Esse produto não foi encontrado no banco de dados.'],
          })
          return
        }

        produto.quantity = 1

        return res.status(201).json(produto)
      }

      const whereCondition = {
        OR: [
          { gtin: { equals: value.trim() } },
          { name: { equals: value } },
          { sku: { equals: value.trim() } },
        ],
      }

      const produto = await prisma.produtos.findFirst({
        where: whereCondition,
        include: {
          brand: true,
        },
      })

      if (!produto) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'product_not_found',
          message: ['Esse produto não foi encontrado no banco de dados.'],
        })
        return
      }

      produto.quantity = 1

      return res.status(201).json(produto)
    } catch (error) {
      console.log(error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do produto. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async getCombosWithParams(req, res) {
    const { id, quantity } = req.body

    try {
      const combo = await prisma.combos.findFirst({
        where: {
          produtoId: id,
          quantity: quantity,
        },

        include: {
          produto: true,
        },
      })

      if (!combo) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: [
            'Esse combo não foi encontrado. Provavelmente não existe combo desse produto com essa quantidade informada !',
          ],
        })
        return
      }

      combo.cost = combo.produto.cost * combo.quantity
      combo.weight = combo.produto.weight * combo.quantity

      res.status(201).json(combo)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do combo. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async getNextComboWithParams(req, res) {
    const { id, quantity } = req.body

    try {
      const combo = await prisma.combos.findFirst({
        where: {
          produtoId: id,
          quantity: {
            gt: quantity,
          },
        },
        include: {
          produto: true,
        },
        orderBy: {
          quantity: 'asc',
        },
      })

      if (!combo) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: [
            'Esse combo não foi encontrado. Provavelmente não existe combo desse produto com uma quantidade maior que a informada!',
          ],
        })
        return
      }

      combo.cost = combo.produto.cost * combo.quantity
      combo.weight = combo.produto.weight * combo.quantity

      res.status(200).json(combo)
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do próximo combo. Por favor tente novamente mais tarde.',
        ],
      })
    }
  }

  static async getKitsWithParams(req, res) {
    const { id, value } = req.body

    try {
      if (id) {
        const produto = await prisma.kits.findUnique({
          where: {
            id: id,
          },
          include: {
            produtos: {
              include: {
                produto: true,
              },
            },
          },
        })

        if (!produto) {
          res.status(404).json({
            erroCode: '404',
            erroType: 'kit_not_found',
            message: ['Esse kit não foi encontrado no banco de dados.'],
          })
          return
        }

        produto.quantity = 1

        let custoFinal = 0
        let pesoFinal = 0

        for (const i of produto.produtos) {
          const custo = Number.parseFloat((i.produto.cost * i.quantity).toFixed(2))
          const peso = Number.parseFloat((i.produto.weight * i.quantity).toFixed(3))

          custoFinal += custo
          pesoFinal += peso
        }

        produto.cost = custoFinal
        produto.weight = pesoFinal

        return res.status(201).json(produto)
      }

      const whereCondition = {
        OR: [
          { gtin: { equals: value.trim() } },
          { name: { equals: value } },
          { sku: { equals: value.trim() } },
        ],
      }

      const produto = await prisma.kits.findFirst({
        where: whereCondition,
        include: {
          produtos: {
            include: {
              produto: true,
            },
          },
        },
      })

      if (!produto) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'kit_not_found',
          message: ['Esse kit não foi encontrado no banco de dados.'],
        })
        return
      }

      produto.quantity = 1

      let custoFinal = 0
      let pesoFinal = 0

      for (const i of produto.produtos) {
        const custo = Number.parseFloat((i.produto.cost * i.quantity).toFixed(2))
        const peso = Number.parseFloat((i.produto.weight * i.quantity).toFixed(3))

        custoFinal += custo
        pesoFinal += peso
      }

      produto.cost = custoFinal
      produto.weight = pesoFinal

      return res.status(201).json(produto)
    } catch (error) {
      console.log(error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do kit. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async getFreteML(req, res) {
    const { peso, special } = req.body

    try {
      if (!peso || peso === 0) {
        return res.status(201).json({
          frete: 0,
          message: 'O produto não tem peso. <br/> Digite o frete manualmente.',
        })
      }

      let tabela = await Precificacao.findOne({ name: 'default' }).select('-_id')
      tabela = tabela.toObject()
      const fretes = tabela.tabela_fretes_ml
      let resultado = null

      for (const frete of fretes) {
        if (peso >= frete.de && peso <= frete.ate) {
          resultado = special ? frete.esp : frete.nrm
          break
        }
      }

      if (resultado) {
        return res.status(201).json({ frete: resultado })
      }

      return res
        .status(201)
        .json({ frete: 0, message: 'Não foi possível calcular o frete' })
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: ['Houve um erro ao tentar obter o frete do produto.'],
      })
    }
  }

  static async getFreteMGL(req, res) {
    const { peso } = req.body

    try {
      if (!peso || peso === 0) {
        return res.status(201).json({
          frete: 0,
          message: 'O produto não tem peso. <br/> Digite o frete manualmente.',
        })
      }

      let tabela = await Precificacao.findOne({ name: 'default' }).select('-_id')
      tabela = tabela.toObject()
      const fretes = tabela.tabela_fretes_mgl
      let resultado = null

      for (const frete of fretes) {
        if (peso >= frete.de && peso <= frete.ate) {
          resultado = frete.custo
          break
        }
      }

      if (resultado) {
        return res.status(201).json({ frete: resultado })
      }

      return res
        .status(201)
        .json({ frete: 0, message: 'Não foi possível calcular o frete' })
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: ['Houve um erro ao tentar obter o frete do produto.'],
      })
    }
  }

  static async getAnunciosContas(req, res) {
    const sku = req.body.sku

    const integracoes = await IntegracaoML.find()

    let anunciosEncontados = []
    for (const conta of integracoes) {
      const anuncios = await MercadoLivre.anunciosBySku(
        sku,
        false,
        true,
        'ambos',
        'ambos',
        conta.lastAccess_token.token,
        conta.seller_id,
      )

      for (const anuncio of anuncios) {
        anunciosEncontados.push({
          id: anuncio,
          seller_id: conta.seller_id,
          short_name: conta.short_name,
          conta: conta.name,
          token: conta.lastAccess_token.token,
          promotionID: conta.configs.promocao.id,
          promotionType: conta.configs.promocao.type,
          promotionPercent: conta.configs.promocao.percent,
          order: conta.order,
        })
      }
    }

    // DIVIDE OS ANÚNCIOS EM BLOCOS DE 5 ANÚNCIOS, PARA NÃO SOBRECARREGAR
    const resultado = dividirEmBlocos(anunciosEncontados, 5)

    // BUSCA AS INFORMAÇÕES DOS ANÚNCIOS POR LOTE
    anunciosEncontados = []
    for (const lote of resultado) {
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getInfoByMLB(item.id, item.token).then((data) => {
            if (data.status !== 'closed' && data.status !== 'under_review') {
              anunciosEncontados.push({
                ...item,
                status: data.status,
                catalogo: data.catalog_listing,
                tipo: data.listing_type_id,
                frete: data.shipping.free_shipping,
                envio: data.shipping.logistic_type,
                variation: data.variations.length > 0 ? data.variations : false,
                title: data.title,
                ean: data.attributes?.find((item) => item.id === 'GTIN')?.value_name,
                photo: data.pictures?.[0]?.url,
                health: data.health,
              })
            }
          })
        }),
      )
    }

    //OBTEM DADOS DAS PROMOÇÕES DOS ANÚNCIOS
    anunciosEncontados = dividirEmBlocos(anunciosEncontados, 5)
    for (const lote of anunciosEncontados) {
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getPromoById(item.id, item.token).then((data) => {
            item.promotion = !!data.prices.find((item) => item.type === 'promotion')
          })
        }),
      )
    }

    const resposta = []
    for (const anuncio of anunciosEncontados.flat()) {
      resposta.push({
        mlb: anuncio.id,
        title: anuncio.title,
        photo: anuncio.photo,
        sku: sku,
        ean: anuncio.ean,
        envio: anuncio.envio,
        tipo: anuncio.tipo,
        saude: anuncio.health,
        conta: anuncio.conta,
        order: anuncio.order,
        seller_id: anuncio.seller_id,
      })
    }

    resposta.sort((a, b) => a.order - b.order)

    res.status(201).json({ anuncios: resposta })
  }

  static async getInfoAnuncios(req, res) {
    const { mlb, seller_id } = req.body

    const integracao = await IntegracaoML.find({ seller_id: seller_id })

    const anuncio = await MercadoLivre.getInfoByMLB(
      mlb,
      integracao[0].lastAccess_token.token,
    )

    const updatedPictures = anuncio.pictures?.map((item) => {
      return {
        ...item,
        type: 'ml_photo',
      }
    })

    const detalhes = await MercadoLivre.getDetailsCategory(anuncio.category_id)

    res.status(201).json({
      maxFotos: detalhes?.settings?.max_pictures_per_item,
      fotos: updatedPictures,
      variation: true,
    })
  }

  static async melhorarImagem(req, res) {
    const { id, url, oldSize } = req.body

    const inputImagePath = path.resolve(
      __dirname,
      '../public/images/temporary/imagem_temp.png',
    )
    const borderImagePath = path.resolve(
      __dirname,
      '../public/images/img_utils/bordas.png',
    )
    const outputImagePath = path.resolve(
      __dirname,
      `../public/images/temporary/output_${id}.png`,
    )

    const TARGET_SIZE = 1200

    async function downloadAndSaveImage(url, savePath) {
      const imagePath = savePath

      if (fs.existsSync(imagePath)) {
        return imagePath
      }

      try {
        const response = await axios.get(url, {
          responseType: 'stream',
        })

        fs.mkdirSync(path.dirname(imagePath), { recursive: true })

        const writer = fs.createWriteStream(imagePath)
        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(imagePath))
          writer.on('error', reject)
        })
      } catch (error) {
        return 'error'
      }
    }

    async function areCornersWhite(imagePath) {
      try {
        const image = sharp(imagePath)
        const metadata = await image.metadata()

        const corners = [
          { left: 0, top: 0 },
          { left: metadata.width - 1, top: 0 },
          { left: 0, top: metadata.height - 1 },
          { left: metadata.width - 1, top: metadata.height - 1 },
        ]

        for (const corner of corners) {
          const pixel = await image
            .extract({
              left: corner.left,
              top: corner.top,
              width: 1,
              height: 1,
            })
            .raw()
            .toBuffer()

          if (
            !(
              pixel[0] === 255 &&
              pixel[1] === 255 &&
              pixel[2] === 255 &&
              pixel[3] === 255
            )
          ) {
            return false
          }
        }

        return true
      } catch (error) {
        console.error('Erro ao verificar cantos da imagem:', error)
        return false
      }
    }

    async function processImageWithExistingBorders() {
      sharp.cache(false)

      const expandedImage = await sharp(inputImagePath)
        .resize({
          width: TARGET_SIZE,
          height: TARGET_SIZE,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .toBuffer()

      const cornersWhite = true //await areCornersWhite(inputImagePath)

      if (cornersWhite) {
        await sharp(expandedImage)
          .composite([{ input: borderImagePath, blend: 'over' }])
          .toFile(outputImagePath)
      } else {
        await sharp(expandedImage).toFile(outputImagePath)
      }
    }

    async function deleteTempFile(filePath) {
      try {
        await fs.promises.unlink(filePath)
        console.log('Arquivo temporário excluído com sucesso!')
      } catch (error) {
        console.error('Erro ao excluir arquivo temporário:', error)
      }
    }

    async function getImageDimensions(filePath) {
      try {
        const metadata = await sharp(filePath).metadata()
        return {
          width: metadata.width,
          height: metadata.height,
        }
      } catch (error) {
        console.error('Erro ao obter dimensões da imagem:', error)
        return null
      }
    }

    try {
      if (fs.existsSync(inputImagePath)) {
        await deleteTempFile(inputImagePath)
      }

      const downloadedImagePath = await downloadAndSaveImage(url, inputImagePath)

      if (downloadedImagePath === 'error') {
        return res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: [
            'Ocorreu um erro ao tentar baixar a imagem. Por favor, tente novamente!',
          ],
        })
      }

      await processImageWithExistingBorders()

      const url2 = `${process.env.API_LOCAL}/images/temporary/output_${id}.png`

      const dimensions = await getImageDimensions(outputImagePath)

      res.status(201).json({
        id: id,
        url: url2,
        dimensions: `${dimensions.width}x${dimensions.height}`,
        oldSize: oldSize,
      })
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar processar a imagem. Por favor, tente novamente!',
        ],
      })
    } finally {
      await deleteTempFile(inputImagePath)
    }
  }

  static async removerFundo(req, res) {
    const { id, url } = req.body

    const inputImagePath = path.resolve(
      __dirname,
      `../public/images/temporary/imagem_temp_${id}.png`,
    )
    const outputImagePath = path.resolve(
      __dirname,
      `../public/images/temporary/saida_${id}.png`,
    )

    async function downloadAndSaveImage(url, savePath) {
      try {
        const response = await axios.get(url, { responseType: 'stream' })

        fs.mkdirSync(path.dirname(savePath), { recursive: true })

        const writer = fs.createWriteStream(savePath)
        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
          writer.on('finish', () => {
            writer.close()
            resolve(savePath)
          })
          writer.on('error', (err) => {
            writer.close()
            reject(err)
          })
        })
      } catch (error) {
        return null
      }
    }

    async function processImg(inputPath, outputPath) {
      const pythonScriptPath = path.resolve(__dirname, '../python/src/byebg.py')
      const pythonBinary =
        process.env.AMBIENT === 'PRODUCTION'
          ? path.resolve(__dirname, '../python/venv/bin/python')
          : path.resolve(__dirname, '../python/venv/Scripts/python.exe')

      return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonBinary, [
          pythonScriptPath,
          inputPath,
          outputPath,
        ])

        pythonProcess.stdout.on('data', (data) => {
          console.log(`stdout: ${data.toString()}`)
        })

        pythonProcess.stderr.on('data', (data) => {
          console.error(`stderr: ${data.toString()}`)
        })

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            resolve(outputPath)
          } else {
            reject(new Error('Erro ao processar a imagem.'))
          }
        })
      })
    }

    try {
      const downloadedImagePath = await downloadAndSaveImage(url, inputImagePath)

      if (!downloadedImagePath) {
        return res.status(500).json({ error: 'Falha ao baixar a imagem.' })
      }

      await processImg(inputImagePath, outputImagePath)

      if (fs.existsSync(inputImagePath)) {
        fs.unlinkSync(inputImagePath)
      }

      const url2 = `${process.env.API_LOCAL}/images/temporary/saida_${id}.png`

      res.json({
        id: id,
        url: url2,
      })
    } catch (error) {
      console.error('Erro geral:', error.message)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar processar a imagem. Por favor, tente novamente!',
        ],
      })
    }
  }

  static async salvarImagem(req, res) {
    async function getImageDimensions(filePath) {
      try {
        const metadata = await sharp(filePath).metadata()
        return {
          width: metadata.width,
          height: metadata.height,
        }
      } catch (error) {
        console.error('Erro ao obter dimensões da imagem:', error)
        return null
      }
    }

    const imageData = req.body.imageData

    const imageId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`

    const outputImagePath = path.resolve(
      __dirname,
      `../public/images/temporary/imagem_temp_${imageId}.png`,
    )

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    try {
      await fs.promises.writeFile(outputImagePath, imageBuffer)

      const dimensions = await getImageDimensions(outputImagePath)

      const imageUrl = `${process.env.API_LOCAL}/images/temporary/imagem_temp_${imageId}.png`

      res.status(201).json({
        id: imageId,
        url: imageUrl,
        dimensions: `${dimensions.width}x${dimensions.height}`,
      })
    } catch (error) {
      console.error('Erro ao salvar imagem:', error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar salvar a imagem. Por favor, tente novamente!',
        ],
      })
    }
  }

  static async conferirFotos(req, res) {
    const imageUrl = req.body.imageUrl
    const id = req.body.id
    try {
      const integracoes = await IntegracaoML.find()
      const token = integracoes[0].lastAccess_token.token

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' })
      const imageBuffer = Buffer.from(imageResponse.data)

      const formData = new FormData()
      formData.append('file', imageBuffer, 'image.jpg')

      const headers = {
        Authorization: `Bearer ${token}`,
        ...formData.getHeaders(),
      }

      const response = await axios.post(
        'https://api.mercadolibre.com/pictures/items/upload',
        formData,
        { headers },
      )

      const resposta = response.data

      function parseSize(size) {
        const [width, height] = size.split('x').map(Number)
        return { width, height }
      }

      const maxSize = parseSize(resposta.max_size)
      const variations = resposta.variations.sort((a, b) => {
        const sizeA = parseSize(a.size)
        const sizeB = parseSize(b.size)
        return sizeB.width * sizeB.height - sizeA.width * sizeA.height
      })

      let chosenUrl = null
      for (const variation of variations) {
        const size = parseSize(variation.size)
        if (size.width === 1200 && size.height === 1200) {
          chosenUrl = variation.secure_url
          break
        }
        if (size.width > 1200 && size.height > 1200 && !chosenUrl) {
          chosenUrl = variation.secure_url
        }
      }

      res.status(201).json({
        id: resposta.id,
        oldId: id,
        successSize: maxSize.width >= 1200 && maxSize.height >= 1200,
        size: resposta.max_size,
        url: chosenUrl,
        type: 'ml_photo',
      })
    } catch (error) {
      if (error.response?.data?.message) {
        res.status(201).json({
          id: null,
          oldId: id,
          successSize: false,
          size: '',
          url: '',
          type: 'ml_photo',
          message: error.response?.data?.message,
        })
        return
      }

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar verificar a imagem. Por favor, tente novamente!',
        ],
      })
    }
  }

  static async obterLogsById(req, res) {
    try {
      const id = req.body.id

      const logs = await Logs.find({ integrationId: id })
        .select('-_id -integrationId -integration -updatedAt -__v')
        .sort({ createdAt: -1 })
        .limit(100)

      const logsFormatados = logs.map((log) => {
        log = {
          ...log.toObject(),
          createdAt: moment(log.createdAt).format('DD/MM/YYYY HH:mm'),
        }
        return log
      })

      res.status(201).json({ logs: logsFormatados })
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter os logs dessa integração. Por favor tente novamente !',
        ],
      })
    }
  }

  static async downloadLogsById(req, res) {
    try {
      const id = req.body.id

      const logs = await Logs.find({ integrationId: id }).select(
        '-_id -integrationId -integration -updatedAt -__v',
      )

      const logsFormatados = logs.map((log) => {
        return {
          ...log.toObject(),
          createdAt: moment(log.createdAt).format('DD/MM/YYYY HH:mm'),
        }
      })

      const fileContent = logsFormatados.map((log) => JSON.stringify(log)).join('\n')

      const filePath = path.join(__dirname, 'logs.txt')

      fs.writeFileSync(filePath, fileContent)

      res.download(filePath, 'logs.txt', (err) => {
        fs.unlinkSync(filePath)
      })
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message:
          'Ocorreu um erro ao tentar obter os logs dessa integração. Por favor tente novamente!',
      })
    }
  }

  static async precificarByProduto(produtos) {
    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    const integracoes = await IntegracaoML.find()

    let anunciosEncontados = []

    for (const conta of integracoes) {
      for (const produto of produtos) {
        const anuncios = await MercadoLivre.anunciosBySku(
          produto.sku,
          'ambos',
          true,
          'ambos',
          'ambos',
          conta.lastAccess_token.token,
          conta.seller_id,
        )

        for (const anuncio of anuncios) {
          anunciosEncontados.push({
            contaId: conta._id,
            produtoId: produto.id,
            sku: produto.sku,
            id: anuncio,
            seller_id: conta.seller_id,
            short_name: conta.short_name,
            conta: conta.name,
            token: conta.lastAccess_token.token,
            promotionID: conta.configs.promocao.id,
            promotionType: conta.configs.promocao.type,
            promotionPercent: conta.configs.promocao.percent,
          })
        }
      }
    }

    // DIVIDE OS ANÚNCIOS EM BLOCOS DE 5 ANÚNCIOS, PARA NÃO SOBRECARREGAR
    const resultado = dividirEmBlocos(anunciosEncontados, 5)

    // BUSCA AS INFORMAÇÕES DOS ANÚNCIOS POR LOTE
    anunciosEncontados = []
    for (const lote of resultado) {
      await wait(1000)
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getInfoByMLB(item.id, item.token)
            .then((data) => {
              if (data.status !== 'closed' && data.status !== 'under_review') {
                anunciosEncontados.push({
                  ...item,
                  status: data.status,
                  catalogo: data.catalog_listing,
                  tipo: data.listing_type_id,
                  frete: data.shipping.free_shipping,
                  envio: data.shipping.logistic_type,
                  variation: data.variations.length > 0 ? data.variations : false,
                  marketplace: data.channels?.includes('marketplace'),
                })
              }
            })
            .catch((error) => {})
        }),
      )
    }

    //OBTEM DADOS DAS PROMOÇÕES DOS ANÚNCIOS
    anunciosEncontados = dividirEmBlocos(anunciosEncontados, 5)
    for (const lote of anunciosEncontados) {
      await wait(1000)
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getPromoById(item.id, item.token)
            .then((data) => {
              item.promotion = !!data.prices.find((item) => item.type === 'promotion')
            })
            .catch((error) => {})
        }),
      )
    }

    const full = []
    const catalogo = []
    const classico = []
    const premium = []

    function calcularPreco(base, diminuir) {
      return Number.parseFloat(
        Number.parseFloat(base) + Number.parseFloat(diminuir),
      ).toFixed(2)
    }

    // RELACIONA O ANÚNCIO COM O PREÇO, TIRANDO OS CENTAVOS DE ANÚNCIO PRA ANÚNCIO
    for (const item of anunciosEncontados.flat()) {
      const produto = produtos.find((prod) => prod.sku === item.sku)
      if (item.envio === 'fulfillment' && produto.full) {
        item.price = calcularPreco(produto.full, 0)
        full.push(item)

        continue
      }

      if (item.catalogo && produto.catalogo) {
        item.price = calcularPreco(produto.catalogo, 0)
        catalogo.push(item)

        continue
      }

      if (item.tipo === 'gold_special' && produto.classico) {
        item.price = calcularPreco(produto.classico, 0)
        classico.push(item)

        continue
      }

      if (item.tipo === 'gold_pro' && produto.premium) {
        item.price = calcularPreco(produto.premium, 0)
        premium.push(item)
      }
    }

    // Função para remover promoções de um grupo de anúncios
    const removerPromocoesDeGrupo = async (grupoAnuncios, tipoGrupo) => {
      for (const lote of grupoAnuncios) {
        await wait(1000)
        await Promise.all(
          lote.map((item, index) => {
            if (item.promotion) {
              return MercadoLivre.removerPromocao(
                item.id,
                item.token,
                item.promotionType,
                item.promotionID,
              )
                .then(async (data) => {
                  item.promotion = false

                  await RandomFunctions.setLogs(Logs, {
                    integration: item.conta,
                    integrationId: item.contaId,
                    user: 'MyAppOne',
                    userId: 'MyAppOne',
                    action: 'Remover promoção',
                    message: 'Removeu promoção do anúncio descrito abaixo',
                    observacoes: [
                      {
                        id: item.id,
                        sku: item.sku,
                        promotionId: item.promotionID,
                        promotionType: item.promotionType,
                      },
                    ],
                  })
                })
                .catch((error) => {
                  const indexToRemove = lote.findIndex(
                    (anuncio) => anuncio.id === item.id,
                  )
                  if (indexToRemove !== -1) {
                    lote.splice(indexToRemove, 1)
                  }
                })
            }
          }),
        )
      }
    }

    const grupoFull = dividirEmBlocos(full, 10)
    const grupoCatalogo = dividirEmBlocos(catalogo, 10)
    const grupoClassico = dividirEmBlocos(classico, 10)
    const grupoPremium = dividirEmBlocos(premium, 10)

    await removerPromocoesDeGrupo(grupoFull, 'Full')
    await removerPromocoesDeGrupo(grupoCatalogo, 'Catalogo')
    await removerPromocoesDeGrupo(grupoClassico, 'Classico')
    await removerPromocoesDeGrupo(grupoPremium, 'Premium')

    // Função para precificar um grupo de anúncios
    const alterarPrecoDeGrupo = async (
      grupoAnuncios,
      type,
      promo = true,
      changeType = false,
      ultimo = false,
    ) => {
      for (const lote of grupoAnuncios) {
        await wait(1000)
        await Promise.all(
          lote.map((item, index) => {
            let valor = item.price
            if (promo && item.marketplace) {
              valor = Number.parseFloat(item.price / 0.95)
            }
            valor = Math.ceil(valor * 100) / 100

            return MercadoLivre.precificador(
              item.id,
              valor,
              item.token,
              item.variation,
              type,
            )
              .then(async (data) => {
                item.promotion = false

                if (!item.marketplace) {
                  const indexToRemove = lote.findIndex(
                    (anuncio) => anuncio.id === item.id,
                  )
                  if (indexToRemove !== -1) {
                    lote.splice(indexToRemove, 1)
                  }
                }

                await RandomFunctions.setLogs(Logs, {
                  integration: item.conta,
                  integrationId: item.contaId,
                  user: 'MyAppOne',
                  userId: 'MyAppOne',
                  action: 'Alterar preço',
                  message: 'Alterou o preço do anúncio descrito abaixo',
                  observacoes: [
                    {
                      id: item.id,
                      sku: item.sku,
                      valor: valor,
                    },
                  ],
                })
              })
              .catch((error) => {
                const indexToRemove = lote.findIndex((anuncio) => anuncio.id === item.id)
                if (indexToRemove !== -1) {
                  lote.splice(indexToRemove, 1)
                }
              })
          }),
        )
      }
    }

    await alterarPrecoDeGrupo(grupoFull, 'gold_special', true, true)
    await alterarPrecoDeGrupo(grupoCatalogo, 'gold_special', true, true)
    await alterarPrecoDeGrupo(grupoPremium, 'gold_pro', true, true)
    await alterarPrecoDeGrupo(grupoClassico, 'gold_special', true, true)

    // Função para adcionar promoção a um grupo de anúncios
    const adcionarPromocaoDeGrupo = async (grupoAnuncios, type) => {
      for (const lote of grupoAnuncios) {
        await wait(1000)
        await Promise.all(
          lote.map(async (item, index) => {
            let valor = item.price
            valor = Math.ceil(valor * 100) / 100

            try {
              await MercadoLivre.addPromo(
                item.id,
                valor,
                item.token,
                item.promotionType,
                item.promotionID,
              )

              const itemIndex = lote.findIndex((el) => el.id === item.id)
              if (itemIndex > -1) {
                lote.splice(itemIndex, 1)
              }

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: 'MyAppOne',
                userId: 'MyAppOne',
                action: 'Adicionar promoção',
                message: 'Adicionou promoção ao anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    promotionType: item.promotionType,
                    promotionID: item.promotionID,
                  },
                ],
              })
            } catch {}
          }),
        )
      }
    }

    await adcionarPromocaoDeGrupo(grupoFull, 'full')
    await adcionarPromocaoDeGrupo(grupoCatalogo, 'catalogo')
    await adcionarPromocaoDeGrupo(grupoClassico, 'classico')
    await adcionarPromocaoDeGrupo(grupoPremium, 'premium')

    // Precifica novamente os anúncios que deram problema na promoção
    await alterarPrecoDeGrupo(grupoFull, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(grupoCatalogo, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(grupoClassico, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(grupoPremium, 'gold_pro', false, false, true)

    console.log('aqui')
  }

  static async activateBySku(req, res) {
    const { sku, idIntegration, short_name } = req.body
    const user = req.user

    try {
      const token = RandomFunctions.decryptCookie(req.cookies[short_name])
      const integracao = await IntegracaoML.findById(idIntegration)
      //const token = integracao.lastAccess_token.token

      const configs = integracao.configs.precificacao

      if (!configs.activate) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: [
            'Essa integração não permite que seus anúncios sejam ativados pelo MyAppOne. ',
          ],
        })

        return
      }

      const anuncios = await MercadoLivre.anunciosBySku(
        sku,
        'ambos',
        true,
        'ambos',
        'ambos',
        token,
        integracao.seller_id,
      )

      const totalAnuncios = anuncios.length
      const resultado = []
      const promessas = []

      const calcularPorcentagem = (index) => {
        return Math.round((index / totalAnuncios) * 100)
      }

      let anunciosProcessados = 0
      for (let i = 0; i < totalAnuncios; i++) {
        const anuncio = anuncios[i]

        const promessa = MercadoLivre.ativarAnuncio(
          anuncio,
          integracao.configs.precificacao.default_stock,
          token,
        )
          .then(async () => {
            resultado.push({
              type: 'success',
              item: anuncio,
              message: 'Anúncio ativado com sucesso!',
            })

            await RandomFunctions.setLogs(Logs, {
              integration: integracao.name,
              integrationId: integracao._id,
              user: user.name,
              userId: user._id,
              action: 'Ativar anúncio',
              message: 'Ativou o anúncio descrito abaixo no Mercado Livre',
              observacoes: [
                {
                  id: anuncio,
                  quantidade: integracao.configs.precificacao.default_stock,
                },
              ],
            })
          })
          .catch((error) => {
            resultado.push({
              type: 'error',
              item: anuncio,
              message: 'Erro ao ativar o anúncio',
              ml_response: error.response.data,
            })
          })
          .finally(() => {
            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados)
            enviarProgresso(req.headers['x-socket-id'], porcentagem)
          })

        promessas.push(promessa)
      }

      await Promise.all(promessas)

      res.status(201).json({ resultado }).end()
    } catch (error) {
      console.log(error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar ativar os anúncios. Confira na plataforma se foram ativados e, se necessário, tente novamente !',
        ],
      })
    } finally {
      enviarProgresso(req.headers['x-socket-id'], false)
    }
  }

  static async precificarBySku(req, res) {
    const payload = req.body
    const user = req.user
    const diminuirCents = payload[0].diminuirCents || false

    const integracoes = await IntegracaoML.find()

    let anunciosEncontados = []

    const item = payload.find((obj) => obj.plataforma === 'mercado_livre')

    let precos

    if (item) {
      precos = {
        classico: Number.parseFloat(item.classico / item.quantity).toFixed(2) || 0,
        premium: Number.parseFloat(item.premium / item.quantity).toFixed(2) || 0,
        full: Number.parseFloat(item.full / item.quantity).toFixed(2) || 0,
        catalogo: Number.parseFloat(item.catalogo / item.quantity).toFixed(2) || 0,
        classicoFG: Number.parseFloat(item.classicoFG / item.quantity).toFixed(2) || 0,
        premiumFG: Number.parseFloat(item.premiumFG / item.quantity).toFixed(2) || 0,
      }
    }

    const calcularPorcentagemPre = (index, totalAnuncios) => {
      return Math.round((index / totalAnuncios) * 100)
    }

    let anunciosProcessados = 0

    // OBTEM TODOS OS ANÚNCIOS DE TODAS AS CONTAS QUE CHEGAM DO FRONTEND
    for (const conta of payload) {
      if (conta.plataforma !== 'mercado_livre') {
        continue
      }

      const token = RandomFunctions.decryptCookie(req.cookies[conta.short_name])

      const integracao = integracoes.find((item) => item.short_name === conta.short_name)

      const anuncios = await MercadoLivre.anunciosBySku(
        conta.sku,
        'ambos',
        true,
        'ambos',
        'ambos',
        token,
        integracao.seller_id,
      )

      for (const anuncio of anuncios) {
        anunciosEncontados.push({
          sku: item.sku,
          id: anuncio,
          seller_id: integracao.seller_id,
          short_name: conta.short_name,
          conta: integracao.name,
          contaId: integracao._id,
          token: token,
          promotionML: conta.promotion,
          promotionID: integracao.configs.promocao.id,
          promotionType: integracao.configs.promocao.type,
          promotionPercent: integracao.configs.promocao.percent,
          activate: integracao.configs.precificacao.activate ? conta.activate : false,
          replicate: integracao.configs.precificacao.replicate ? conta.replicate : false,
          changeStock: integracao.configs.precificacao.change_stock,
          default_stock:
            integracao.configs.precificacao.default_stock === 0
              ? false
              : integracao.configs.precificacao.default_stock,
        })
      }

      anunciosProcessados += 1
      const mercadoLivrePayload = payload.filter(
        (item) => item.plataforma === 'mercado_livre',
      )
      const porcentagem = calcularPorcentagemPre(
        anunciosProcessados,
        mercadoLivrePayload.length,
      )
      enviarProgresso(req.headers['x-socket-id'], porcentagem, 'Obtendo anúncios')
    }

    enviarProgresso(req.headers['x-socket-id'], 1, '')

    const totalAnuncios = anunciosEncontados.length

    const calcularPorcentagem = (index) => {
      return Math.round((index / totalAnuncios) * 100)
    }

    // DIVIDE OS ANÚNCIOS EM BLOCOS DE 5 ANÚNCIOS, PARA NÃO SOBRECARREGAR
    const resultado = dividirEmBlocos(anunciosEncontados, 5)

    // Dados da alteração de preços:
    const dadosAlteracao = []

    // BUSCA AS INFORMAÇÕES DOS ANÚNCIOS POR LOTE
    anunciosEncontados = []
    anunciosProcessados = 0
    for (const lote of resultado) {
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getInfoByMLB(item.id, item.token)
            .then((data) => {
              if (data.status !== 'closed' && data.status !== 'under_review') {
                anunciosEncontados.push({
                  ...item,
                  status: data.status,
                  catalogo: data.catalog_listing,
                  tipo: data.listing_type_id,
                  frete: data.shipping.free_shipping,
                  envio: data.shipping.logistic_type,
                  variation: data.variations.length > 0 ? data.variations : false,
                })
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Obter dados',
                  status: 'success',
                  final: false,
                })
              }
            })
            .catch((error) => {
              dadosAlteracao.push({
                id: item.id,
                action: 'Obter dados',
                status: 'error',
                ml_response: error.response.data,
                final: false,
              })

              dadosAlteracao.push({
                id: item.id,
                action: 'Obter dados',
                status: 'error',
                message: 'Anúncio não precificado',
                final: true,
              })
            })
            .finally(() => {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Obtendo dados dos anúncios',
              )
            })
        }),
      )
    }
    enviarProgresso(req.headers['x-socket-id'], 1, '')

    //OBTEM DADOS DAS PROMOÇÕES DOS ANÚNCIOS
    anunciosEncontados = dividirEmBlocos(anunciosEncontados, 5)
    anunciosProcessados = 0
    for (const lote of anunciosEncontados) {
      await Promise.all(
        lote.map((item) => {
          return MercadoLivre.getPromoById(item.id, item.token)
            .then((data) => {
              item.promotion = !!data.prices.find((item) => item.type === 'promotion')
              dadosAlteracao.push({
                id: item.id,
                action: 'Obter promoção',
                status: 'success',
                final: false,
              })
            })
            .catch((error) => {
              dadosAlteracao.push({
                id: item.id,
                action: 'Obter promoção',
                status: 'error',
                ml_response: error.response.data,
                final: false,
              })

              dadosAlteracao.push({
                id: item.id,
                action: 'Obter promoção',
                status: 'error',
                message: 'Anúncio não precificado',
                final: true,
              })
            })
            .finally(() => {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Obtendo promoções',
              )
            })
        }),
      )
    }
    enviarProgresso(req.headers['x-socket-id'], 1, '')

    const full = []
    const catalogo = []
    const classico = []
    const premium = []
    const classicoFG = []
    const premiumFG = []

    function calcularPreco(base, diminuir) {
      return Number.parseFloat(
        Number.parseFloat(base) + Number.parseFloat(diminuir),
      ).toFixed(2)
    }

    // RELACIONA O ANÚNCIO COM O PREÇO, TIRANDO OS CENTAVOS DE ANÚNCIO PRA ANÚNCIO
    for (const item of anunciosEncontados.flat()) {
      const precos = payload.find((conta) => conta.short_name === item.short_name)
      if (item.envio === 'fulfillment') {
        item.price = calcularPreco(precos.full, precos.diminuirFull)
        full.push(item)

        if (diminuirCents) {
          precos.diminuirFull = (precos.diminuirFull - 0.01).toFixed(2)
        }
        continue
      }

      if (item.catalogo) {
        item.price = calcularPreco(precos.catalogo, precos.diminuirCatalogo)
        catalogo.push(item)

        if (diminuirCents) {
          precos.diminuirCatalogo = (precos.diminuirCatalogo - 0.01).toFixed(2)
        }
        continue
      }

      if (item.tipo === 'gold_special') {
        item.price = calcularPreco(precos.classico, precos.diminuirClassico)
        classico.push(item)
        if (diminuirCents) {
          precos.diminuirClassico = (precos.diminuirClassico - 0.01).toFixed(2)
        }
        continue
      }

      if (item.tipo === 'gold_pro') {
        item.price = calcularPreco(precos.premium, precos.diminuirPremium)
        premium.push(item)

        if (diminuirCents) {
          precos.diminuirPremium = (precos.diminuirPremium - 0.01).toFixed(2)
        }
      }
    }

    full.sort((a, b) => a.price - b.price)
    catalogo.sort((a, b) => a.price - b.price)
    classico.sort((a, b) => a.price - b.price)
    premium.sort((a, b) => a.price - b.price)

    // FAZ A DIVISÃO DOS ANÚNCIOS PARA EVITAR REPLICAR ANÚNCIO EM DUPLICIDADE
    for (const conta of payload) {
      if (conta.plataforma !== 'mercado_livre') {
        continue
      }

      const nick_name = conta.short_name

      let classicos = classico.filter((item) => item.short_name === nick_name).length
      let premiums = premium.filter((item) => item.short_name === nick_name).length

      // remove um item de classico e passa para premium
      if (premiums === 0 && classicos > 1 && conta.premium) {
        const index = classico.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = classico.splice(index, 1)
          item.price = Number.parseFloat(conta.premium)
          premium.push(item)
        }
      }

      // remove um item de premium e passa para classico
      if (classicos === 0 && premiums > 1 && conta.clasico) {
        const index = premium.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = premium.splice(index, 1)
          item.price = Number.parseFloat(conta.classico)
          classico.push(item)
        }
      }

      classicos = classico.filter((item) => item.short_name === nick_name).length

      premiums = premium.filter((item) => item.short_name === nick_name).length

      // remove um item de classico e passa para classico frete grátis
      if (conta.classicoFG && classicos > 1 && conta.classicoFG) {
        const index = classico.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = classico.splice(index, 1)
          item.price = Number.parseFloat(conta.classicoFG)
          classicoFG.push(item)
        }
      }

      // remove um item de premium e passa para premium frete grátis
      if (conta.premiumFG && premiums > 1 && conta.premiumFG) {
        const index = premium.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = premium.splice(index, 1)
          item.price = Number.parseFloat(conta.premiumFG)
          premiumFG.push(item)
        }
      }

      classicos = classico.filter((item) => item.short_name === nick_name).length

      premiums = premium.filter((item) => item.short_name === nick_name).length

      // remove um item de classico e passa para premium frete grátis
      if (conta.premiumFG && premiumFG.length === 0 && classicos > 1 && conta.premiumFG) {
        const index = classico.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = classico.splice(index, 1)
          item.price = Number.parseFloat(conta.premiumFG)
          premiumFG.push(item)
        }
      }

      // remove um item de premium e passa para classico frete grátis
      if (
        conta.classicoFG &&
        classicoFG.length === 0 &&
        premiums > 1 &&
        conta.classicoFG
      ) {
        const index = premium.findIndex((item) => item.short_name === nick_name)

        if (index !== -1) {
          const [item] = premium.splice(index, 1)
          item.price = Number.parseFloat(conta.classicoFG)
          classicoFG.push(item)
        }
      }
    }

    // GERENCIA OS ANÚNCIOS QUE PRECISAM SER REPLICADOS EM CADA CONTA
    let anuncioReplicavel = false
    let descAnuncioReplicavel = false
    const idAnuncioReplicavel = classico.find((obj) => obj) || premium.find((obj) => obj)

    let replicaveis = 0
    for (const conta of payload) {
      if (conta.plataforma !== 'mercado_livre') {
        continue
      }

      const nick_name = conta.short_name

      const integracao = integracoes.find((item) => item.short_name === nick_name)

      const classicos = classico.filter((item) => item.short_name === nick_name).length

      if (
        classicos === 0 &&
        conta.classico &&
        integracao.configs.precificacao.replicate &&
        conta.replicate
      ) {
        replicaveis += 1
      }

      const premiums = premium.filter((item) => item.short_name === nick_name).length

      if (
        premiums === 0 &&
        conta.premium &&
        integracao.configs.precificacao.replicate &&
        conta.replicate
      ) {
        replicaveis += 1
      }

      const classicosFG = classicoFG.filter(
        (item) => item.short_name === nick_name,
      ).length

      if (
        classicosFG === 0 &&
        conta.classicoFG &&
        integracao.configs.precificacao.replicate &&
        conta.replicate
      ) {
        replicaveis += 1
      }

      const premiumsFG = premiumFG.filter((item) => item.short_name === nick_name).length

      if (
        premiumsFG === 0 &&
        conta.premiumFG &&
        integracao.configs.precificacao.replicate &&
        conta.replicate
      ) {
        replicaveis += 1
      }
    }

    anunciosProcessados = 0
    if (idAnuncioReplicavel) {
      for (const conta of payload) {
        if (conta.plataforma !== 'mercado_livre') {
          continue
        }

        const nick_name = conta.short_name

        const integracao = integracoes.find((item) => item.short_name === nick_name)

        const classicos = classico.filter((item) => item.short_name === nick_name).length

        if (
          classicos === 0 &&
          conta.classico &&
          integracao.configs.precificacao.replicate &&
          conta.replicate
        ) {
          if (!anuncioReplicavel) {
            anuncioReplicavel = await MercadoLivre.getInfoByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )

            descAnuncioReplicavel = await MercadoLivre.getDescriptionByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )
          }

          try {
            const anuncioCriado = await MercadoLivre.replicarAnuncio(
              anuncioReplicavel,
              integracao.lastAccess_token.token,
              'gold_special',
              descAnuncioReplicavel,
              dadosAlteracao,
            )

            await RandomFunctions.setLogs(Logs, {
              integration: integracao.name,
              integrationId: integracao._id,
              user: user.name,
              userId: user._id,
              action: 'Criar anúncio',
              message: 'Criou um anúncio no Mercado Livre através do replicador',
              observacoes: [
                {
                  id: anuncioCriado.id,
                  sku: conta.sku,
                  status: anuncioCriado.status,
                  tipo: 'classico',
                },
              ],
            })

            classico.push({
              sku: conta.sku,
              id: anuncioCriado.id,
              seller_id: integracao.seller_id,
              short_name: conta.short_name,
              conta: integracao.name,
              contaId: integracao._id,
              token: integracao.lastAccess_token.token,
              promotionML: conta.promotion,
              promotionID: integracao.configs.promocao.id,
              promotionType: integracao.configs.promocao.type,
              promotionPercent: integracao.configs.promocao.percent,
              activate: integracao.configs.precificacao.activate ? conta.activate : false,
              replicate: integracao.configs.precificacao.replicate
                ? conta.replicate
                : false,
              changeStock: integracao.configs.precificacao.change_stock,
              default_stock:
                integracao.configs.precificacao.default_stock === 0
                  ? false
                  : integracao.configs.precificacao.default_stock,
              status: anuncioCriado.status,
              catalogo: false,
              tipo: anuncioCriado.listing_type_id,
              frete: anuncioCriado.shipping.free_shipping,
              envio: anuncioCriado.shipping.logistic_type,
              variation:
                anuncioCriado.variations.length > 0 ? anuncioCriado.variations : false,
              price: conta.classico,
              promotion: false,
            })

            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, replicaveis)
            enviarProgresso(
              req.headers['x-socket-id'],
              porcentagem,
              'Replicando anúncios',
            )
          } catch (error) {}
        }

        const premiums = premium.filter((item) => item.short_name === nick_name).length

        if (
          premiums === 0 &&
          conta.premium &&
          integracao.configs.precificacao.replicate &&
          conta.replicate
        ) {
          if (!anuncioReplicavel) {
            anuncioReplicavel = await MercadoLivre.getInfoByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )

            descAnuncioReplicavel = await MercadoLivre.getDescriptionByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )
          }

          try {
            const anuncioCriado = await MercadoLivre.replicarAnuncio(
              anuncioReplicavel,
              integracao.lastAccess_token.token,
              'gold_pro',
              descAnuncioReplicavel,
              dadosAlteracao,
            )

            await RandomFunctions.setLogs(Logs, {
              integration: integracao.name,
              integrationId: integracao._id,
              user: user.name,
              userId: user._id,
              action: 'Criar anúncio',
              message: 'Criou um anúncio no Mercado Livre através do replicador',
              observacoes: [
                {
                  id: anuncioCriado.id,
                  sku: conta.sku,
                  status: anuncioCriado.status,
                  tipo: 'premium',
                },
              ],
            })

            premium.push({
              id: anuncioCriado.id,
              sku: conta.sku,
              seller_id: integracao.seller_id,
              short_name: conta.short_name,
              conta: integracao.name,
              contaId: integracao._id,
              token: integracao.lastAccess_token.token,
              promotionML: conta.promotion,
              promotionID: integracao.configs.promocao.id,
              promotionType: integracao.configs.promocao.type,
              promotionPercent: integracao.configs.promocao.percent,
              activate: integracao.configs.precificacao.activate ? conta.activate : false,
              replicate: integracao.configs.precificacao.replicate
                ? conta.replicate
                : false,
              changeStock: integracao.configs.precificacao.change_stock,
              default_stock:
                integracao.configs.precificacao.default_stock === 0
                  ? false
                  : integracao.configs.precificacao.default_stock,
              status: anuncioCriado.status,
              catalogo: false,
              tipo: anuncioCriado.listing_type_id,
              frete: anuncioCriado.shipping.free_shipping,
              envio: anuncioCriado.shipping.logistic_type,
              variation:
                anuncioCriado.variations.length > 0 ? anuncioCriado.variations : false,
              price: conta.premium,
              promotion: false,
            })

            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, replicaveis)
            enviarProgresso(
              req.headers['x-socket-id'],
              porcentagem,
              'Replicando anúncios',
            )
          } catch {}
        }

        const classicosFG = classicoFG.filter(
          (item) => item.short_name === nick_name,
        ).length

        if (
          classicosFG === 0 &&
          conta.classicoFG &&
          integracao.configs.precificacao.replicate &&
          conta.replicate
        ) {
          if (!anuncioReplicavel) {
            anuncioReplicavel = await MercadoLivre.getInfoByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )

            descAnuncioReplicavel = await MercadoLivre.getDescriptionByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )
          }

          try {
            const anuncioCriado = await MercadoLivre.replicarAnuncio(
              anuncioReplicavel,
              integracao.lastAccess_token.token,
              'gold_special',
              descAnuncioReplicavel,
              dadosAlteracao,
            )

            await RandomFunctions.setLogs(Logs, {
              integration: integracao.name,
              integrationId: integracao._id,
              user: user.name,
              userId: user._id,
              action: 'Criar anúncio',
              message: 'Criou um anúncio no Mercado Livre através do replicador',
              observacoes: [
                {
                  id: anuncioCriado.id,
                  sku: conta.sku,
                  status: anuncioCriado.status,
                  tipo: 'classico',
                },
              ],
            })

            classicoFG.push({
              id: anuncioCriado.id,
              sku: conta.sku,
              seller_id: integracao.seller_id,
              short_name: conta.short_name,
              conta: integracao.name,
              contaId: integracao._id,
              token: integracao.lastAccess_token.token,
              promotionML: conta.promotion,
              promotionID: integracao.configs.promocao.id,
              promotionType: integracao.configs.promocao.type,
              promotionPercent: integracao.configs.promocao.percent,
              activate: integracao.configs.precificacao.activate ? conta.activate : false,
              replicate: integracao.configs.precificacao.replicate
                ? conta.replicate
                : false,
              changeStock: integracao.configs.precificacao.change_stock,
              default_stock:
                integracao.configs.precificacao.default_stock === 0
                  ? false
                  : integracao.configs.precificacao.default_stock,
              status: anuncioCriado.status,
              catalogo: false,
              tipo: anuncioCriado.listing_type_id,
              frete: anuncioCriado.shipping.free_shipping,
              envio: anuncioCriado.shipping.logistic_type,
              variation:
                anuncioCriado.variations.length > 0 ? anuncioCriado.variations : false,
              price: conta.classicoFG,
              promotion: false,
            })

            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, replicaveis)
            enviarProgresso(
              req.headers['x-socket-id'],
              porcentagem,
              'Replicando anúncios',
            )
          } catch {}
        }

        const premiumsFG = premiumFG.filter(
          (item) => item.short_name === nick_name,
        ).length

        if (
          premiumsFG === 0 &&
          conta.premiumFG &&
          integracao.configs.precificacao.replicate &&
          conta.replicate
        ) {
          if (!anuncioReplicavel) {
            anuncioReplicavel = await MercadoLivre.getInfoByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )

            descAnuncioReplicavel = await MercadoLivre.getDescriptionByMLB(
              idAnuncioReplicavel.id,
              idAnuncioReplicavel.token,
            )
          }

          try {
            const anuncioCriado = await MercadoLivre.replicarAnuncio(
              anuncioReplicavel,
              integracao.lastAccess_token.token,
              'gold_pro',
              descAnuncioReplicavel,
              dadosAlteracao,
            )

            await RandomFunctions.setLogs(Logs, {
              integration: integracao.name,
              integrationId: integracao._id,
              user: user.name,
              userId: user._id,
              action: 'Criar anúncio',
              message: 'Criou um anúncio no Mercado Livre através do replicador',
              observacoes: [
                {
                  id: anuncioCriado.id,
                  sku: conta.sku,
                  status: anuncioCriado.status,
                  tipo: 'premium',
                },
              ],
            })

            premiumFG.push({
              id: anuncioCriado.id,
              sku: conta.sku,
              seller_id: integracao.seller_id,
              short_name: conta.short_name,
              conta: integracao.name,
              contaId: integracao._id,
              token: integracao.lastAccess_token.token,
              promotionML: conta.promotion,
              promotionID: integracao.configs.promocao.id,
              promotionType: integracao.configs.promocao.type,
              promotionPercent: integracao.configs.promocao.percent,
              activate: integracao.configs.precificacao.activate ? conta.activate : false,
              replicate: integracao.configs.precificacao.replicate
                ? conta.replicate
                : false,
              changeStock: integracao.configs.precificacao.change_stock,
              default_stock:
                integracao.configs.precificacao.default_stock === 0
                  ? false
                  : integracao.configs.precificacao.default_stock,
              status: anuncioCriado.status,
              catalogo: false,
              tipo: anuncioCriado.listing_type_id,
              frete: anuncioCriado.shipping.free_shipping,
              envio: anuncioCriado.shipping.logistic_type,
              variation:
                anuncioCriado.variations.length > 0 ? anuncioCriado.variations : false,
              price: conta.premiumFG,
              promotion: false,
            })

            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, replicaveis)
            enviarProgresso(
              req.headers['x-socket-id'],
              porcentagem,
              'Replicando anúncios',
            )
          } catch {}
        }
      }
    }

    //REMOVE OS ANÚNCIOS QUE O PREÇO NÃO FOI ENVIADO PELO FRONTEND
    for (const conta of payload) {
      if (conta.plataforma !== 'mercado_livre') {
        continue
      }

      const nick_name = conta.short_name

      for (let i = full.length - 1; i >= 0; i--) {
        if (full[i].short_name === nick_name && !conta.full) {
          dadosAlteracao.push({
            id: full[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            ml_response: {
              message: 'Price is not present',
              error: 'price_out',
              status: 400,
              cause: [
                {
                  department: 'items-price-control',

                  type: 'error_frontend',
                  code: 'item.price.out',

                  message: 'The price was not send by frontend',
                },
              ],
            },
            final: false,
          })

          dadosAlteracao.push({
            id: full[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            final: true,
          })
          full.splice(i, 1)
        }
      }

      for (let i = catalogo.length - 1; i >= 0; i--) {
        if (catalogo[i].short_name === nick_name && !conta.catalogo) {
          dadosAlteracao.push({
            id: catalogo[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            ml_response: {
              message: 'Price is not present',
              error: 'price_out',
              status: 400,
              cause: [
                {
                  department: 'items-price-control',

                  type: 'error_frontend',
                  code: 'item.price.out',

                  message: 'The price was not send by frontend',
                },
              ],
            },
            final: false,
          })

          dadosAlteracao.push({
            id: catalogo[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            final: true,
          })
          catalogo.splice(i, 1)
        }
      }

      for (let i = classico.length - 1; i >= 0; i--) {
        if (classico[i].short_name === nick_name && !conta.classico) {
          dadosAlteracao.push({
            id: classico[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            ml_response: {
              message: 'Price is not present',
              error: 'price_out',
              status: 400,
              cause: [
                {
                  department: 'items-price-control',

                  type: 'error_frontend',
                  code: 'item.price.out',

                  message: 'The price was not send by frontend',
                },
              ],
            },
            final: false,
          })

          dadosAlteracao.push({
            id: classico[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            final: true,
          })
          classico.splice(i, 1)
        }
      }

      for (let i = premium.length - 1; i >= 0; i--) {
        if (premium[i].short_name === nick_name && !conta.premium) {
          dadosAlteracao.push({
            id: premium[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            ml_response: {
              message: 'Price is not present',
              error: 'price_out',
              status: 400,
              cause: [
                {
                  department: 'items-price-control',

                  type: 'error_frontend',
                  code: 'item.price.out',

                  message: 'The price was not send by frontend',
                },
              ],
            },
            final: false,
          })

          dadosAlteracao.push({
            id: premium[i].id,
            action: 'Relacionamento de preços',
            status: 'error',
            message: 'Anúncio não precificado',
            final: true,
          })
          premium.splice(i, 1)
        }
      }
    }

    EcommerceController.pricesAndPromos(
      req,
      res,
      {
        full,
        catalogo,
        classico,
        premium,
        classicoFG,
        premiumFG,
      },
      dadosAlteracao,
      [full, catalogo, classico, premium, classicoFG, premiumFG].flat().length,
      precos,
    )
  }

  static async pricesAndPromos(
    req,
    res,
    anuncios,
    dadosAlteracao,
    totalAnuncios,
    precos,
  ) {
    const calcularPorcentagem = (index) => {
      return Math.round((index / totalAnuncios) * 100)
    }

    const user = req.user

    // Função para remover promoções de um grupo de anúncios
    let anunciosProcessados = 0
    const removerPromocoesDeGrupo = async (grupoAnuncios, tipoGrupo) => {
      await Promise.all(
        grupoAnuncios.map((item, index) => {
          if (item.promotion) {
            return MercadoLivre.removerPromocao(
              item.id,
              item.token,
              item.promotionType,
              item.promotionID,
            )
              .then(async (data) => {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Remover promoção',
                  status: 'success',
                  final: false,
                })

                item.promotion = false

                await RandomFunctions.setLogs(Logs, {
                  integration: item.conta,
                  integrationId: item.contaId,
                  user: user.name,
                  userId: user._id,
                  action: 'Remover promoção',
                  message: 'Removeu promoção do anúncio descrito abaixo',
                  observacoes: [
                    {
                      id: item.id,
                      sku: item.sku,
                      promotionId: item.promotionID,
                      promotionType: item.promotionType,
                    },
                  ],
                })
              })
              .catch((error) => {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Remover promoção',
                  status: 'error',
                  ml_response: error.response.data,
                  final: false,
                })
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Remover promoção',
                  status: 'error',
                  message: 'Anúncio não precificado',
                  final: true,
                })

                const indexToRemove = grupoAnuncios.findIndex(
                  (anuncio) => anuncio.id === item.id,
                )
                if (indexToRemove !== -1) {
                  grupoAnuncios.splice(indexToRemove, 1)
                }
              })
              .finally(() => {
                anunciosProcessados += 1
                const porcentagem = calcularPorcentagem(
                  anunciosProcessados,
                  totalAnuncios,
                )
                enviarProgresso(
                  req.headers['x-socket-id'],
                  porcentagem,
                  'Removendo promoções',
                )
              })
          }
          anunciosProcessados += 1
          const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
          enviarProgresso(req.headers['x-socket-id'], porcentagem, '')
        }),
      )
    }

    await removerPromocoesDeGrupo(anuncios.full, 'Full')
    await removerPromocoesDeGrupo(anuncios.catalogo, 'Catalogo')
    await removerPromocoesDeGrupo(anuncios.classico, 'Classico')
    await removerPromocoesDeGrupo(anuncios.premium, 'Premium')
    await removerPromocoesDeGrupo(anuncios.classicoFG, 'ClassicoFG')
    await removerPromocoesDeGrupo(anuncios.premiumFG, 'PremiumFG')
    enviarProgresso(req.headers['x-socket-id'], 1)

    // Função para precificar um grupo de anúncios
    anunciosProcessados = 0
    const alterarPrecoDeGrupo = async (
      grupoAnuncios,
      type,
      promo = true,
      changeType = false,
      ultimo = false,
    ) => {
      await Promise.all(
        grupoAnuncios.map((item, index) => {
          let valor = item.price
          if (item.promotionML && promo) {
            valor = Number.parseFloat(item.price / (1 - item.promotionPercent / 100))
          }
          valor = Math.ceil(valor * 100) / 100

          return MercadoLivre.precificador(
            item.id,
            valor,
            item.token,
            item.variation,
            type,
          )
            .then(async (data) => {
              if (!ultimo) {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Alterar preço',
                  status: 'success',
                  final: false,
                })
              }

              if (ultimo) {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Alterar preço',
                  status: 'success',
                  final: true,
                })
              }

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: user.name,
                userId: user._id,
                action: 'Alterar preço',
                message: 'Alterou o preço do anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    valor: valor,
                  },
                ],
              })

              item.promotion = false

              if (item.tipo !== type && changeType) {
                MercadoLivre.changePubliType(item.id, item.token, type)
                  .then(async (data) => {
                    dadosAlteracao.push({
                      id: item.id,
                      action: 'Alterar exposição',
                      status: 'success',
                      final: false,
                    })

                    await RandomFunctions.setLogs(Logs, {
                      integration: item.conta,
                      integrationId: item.contaId,
                      user: user.name,
                      userId: user._id,
                      action: 'Alterar exposição',
                      message: 'Alterou a exposão do anúncio descrito abaixo',
                      observacoes: [
                        {
                          id: item.id,
                          sku: item.sku,
                          type: type,
                        },
                      ],
                    })
                  })
                  .catch((error) => {
                    dadosAlteracao.push({
                      id: item.id,
                      action: 'Alterar exposição',
                      status: 'error',
                      ml_response: error.response.data,
                      final: false,
                    })
                  })
              }
            })
            .catch((error) => {
              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar preço',
                status: 'error',
                ml_response: error.response.data,
                final: false,
              })
              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar preço',
                status: 'error',
                message: 'Anúncio não precificado',
                final: true,
              })

              const indexToRemove = grupoAnuncios.findIndex(
                (anuncio) => anuncio.id === item.id,
              )
              if (indexToRemove !== -1) {
                grupoAnuncios.splice(indexToRemove, 1)
              }
            })
            .finally(() => {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Precificando no Mercado Livre',
              )
            })
        }),
      )
    }

    await alterarPrecoDeGrupo(anuncios.full, 'gold_special', true, true)
    await alterarPrecoDeGrupo(anuncios.classicoFG, 'gold_special', true, true)
    await alterarPrecoDeGrupo(anuncios.premiumFG, 'gold_pro', true, true)
    await alterarPrecoDeGrupo(anuncios.catalogo, 'gold_special', true, true)
    await alterarPrecoDeGrupo(anuncios.premium, 'gold_pro', true, true)
    await alterarPrecoDeGrupo(anuncios.classico, 'gold_special', true, true)

    enviarProgresso(req.headers['x-socket-id'], 1)

    // Função para ativar um grupo de anúncios
    anunciosProcessados = 0
    const ativarGrupoAnuncios = async (grupoAnuncios, type) => {
      await Promise.all(
        grupoAnuncios.map(async (item, index) => {
          let valor = item.price
          valor = Math.ceil(valor * 100) / 100

          if (item.activate && item.status !== 'active') {
            try {
              await MercadoLivre.ativarAnuncio(
                item.id,
                item.envio === 'fulfillment' ? false : item.default_stock,
                item.token,
              )

              dadosAlteracao.push({
                id: item.id,
                action: 'Ativar anúncio',
                status: 'success',
                final: false,
              })

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: user.name,
                userId: user._id,
                action: 'Ativar anúncio',
                message: 'Ativou o anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    estoque: item.envio === 'fulfillment' ? false : item.default_stock,
                  },
                ],
              })
            } catch (error) {
              dadosAlteracao.push({
                id: item.id,
                action: 'Ativar anúncio',
                status: 'error',
                ml_response: error.response?.data || error.message,
                final: false,
              })
            } finally {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Ativando anúncios',
              )
            }
          } else {
            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
            enviarProgresso(req.headers['x-socket-id'], porcentagem, '')
          }
        }),
      )
    }

    await ativarGrupoAnuncios(anuncios.classicoFG)
    await ativarGrupoAnuncios(anuncios.premiumFG)
    await ativarGrupoAnuncios(anuncios.full)
    await ativarGrupoAnuncios(anuncios.catalogo)
    await ativarGrupoAnuncios(anuncios.classico)
    await ativarGrupoAnuncios(anuncios.premium)

    enviarProgresso(req.headers['x-socket-id'], 1)

    // Função para adcionar promoção a um grupo de anúncios
    anunciosProcessados = 0
    const adcionarPromocaoDeGrupo = async (grupoAnuncios, type) => {
      await Promise.all(
        grupoAnuncios.map(async (item, index) => {
          let valor = item.price
          valor = Math.ceil(valor * 100) / 100

          if (item.promotionML) {
            try {
              await MercadoLivre.addPromo(
                item.id,
                valor,
                item.token,
                item.promotionType,
                item.promotionID,
              )

              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar promoção',
                status: 'success',
                final: false,
              })

              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar promoção',
                status: 'success',
                message: 'Anúncio precificado com sucesso!',
                final: true,
              })

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: user.name,
                userId: user._id,
                action: 'Adicionar promoção',
                message: 'Adicionou promoção ao anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    promotionType: item.promotionType,
                    promotionID: item.promotionID,
                  },
                ],
              })

              const itemIndex = grupoAnuncios.findIndex((el) => el.id === item.id)
              if (itemIndex > -1) {
                grupoAnuncios.splice(itemIndex, 1)
              }
            } catch (error) {
              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar promoção',
                status: 'error',
                ml_response: error.response?.data || error.message,
                final: false,
              })
            } finally {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Adicionando promoções',
              )
            }
          } else {
            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
            enviarProgresso(
              req.headers['x-socket-id'],
              porcentagem,
              'Adicionando promoções se necessário',
            )
          }
        }),
      )
    }

    await adcionarPromocaoDeGrupo(anuncios.full, 'full')
    await adcionarPromocaoDeGrupo(anuncios.catalogo, 'catalogo')
    await adcionarPromocaoDeGrupo(anuncios.classicoFG, 'classico')
    await adcionarPromocaoDeGrupo(anuncios.premiumFG, 'premium')
    await adcionarPromocaoDeGrupo(anuncios.classico, 'classico')
    await adcionarPromocaoDeGrupo(anuncios.premium, 'premium')
    enviarProgresso(req.headers['x-socket-id'], 1)

    // Precifica novamente os anúncios que deram problema na promoção
    anunciosProcessados = 0
    totalAnuncios = [
      anuncios.full,
      anuncios.catalogo,
      anuncios.classico,
      anuncios.premium,
      anuncios.classicoFG,
      anuncios.premiumFG,
    ].flat().length

    await alterarPrecoDeGrupo(anuncios.full, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(anuncios.catalogo, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(anuncios.classico, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(anuncios.premium, 'gold_pro', false, false, true)
    await alterarPrecoDeGrupo(anuncios.classicoFG, 'gold_special', false, false, true)
    await alterarPrecoDeGrupo(anuncios.premiumFG, 'gold_pro', false, false, true)

    // enviarProgresso(req.headers['x-socket-id'], false)

    const resultado = [...dadosAlteracao]

    const organizedData = organizeData({ resultado }, 'mercado_livre')

    // res.status(201).json({ precos, resultado: organizedData })

    EcommerceController.precificarMagalu(req, res, precos, organizedData)
  }

  static async precificarMagalu(req, res, precos, organizedData) {
    const calcularPorcentagemPre = (index, totalAnuncios) => {
      return Math.round((index / totalAnuncios) * 100)
    }

    const calcularPorcentagem = (index) => {
      return Math.round((index / totalAnuncios) * 100)
    }

    const user = req.user

    const payload = req.body

    const integracoes = await IntegracaoMGL.find()

    const anunciosEncontados = []
    let anunciosProcessados = 0

    const dadosAlteracao = []

    //  OBTEM TODOS OS ANÚNCIOS DE TODAS AS CONTAS QUE CHEGAM DO FRONTEND
    for (const conta of payload) {
      if (conta.plataforma !== 'magalu') {
        continue
      }

      if (!conta.classico) {
        dadosAlteracao.push({
          id: conta.sku,
          action: 'Relacionamento de preços',
          status: 'error',
          message: 'Anúncio não precificado',
          ml_response: {
            message: 'Price is not present',
            error: 'price_out',
            status: 400,
            cause: [
              {
                department: 'items-price-control',

                type: 'error_frontend',
                code: 'item.price.out',

                message: 'The price was not send by frontend',
              },
            ],
          },
          final: true,
        })
        continue
      }

      const token = RandomFunctions.decryptCookie(req.cookies[conta.short_name])
      const integracao = integracoes.find((item) => item.short_name === conta.short_name)
      const anuncio = await Magalu.anuncioBySku(token, conta.sku)

      if (anuncio) {
        anunciosEncontados.push({
          sku: conta.sku,
          id: anuncio.IdSku,
          short_name: conta.short_name,
          conta: integracao.name,
          contaId: integracao._id,
          token: token,
          activate: integracao.configs.precificacao.activate ? conta.activate : false,
          replicate: integracao.configs.precificacao.replicate ? conta.replicate : false,
          changeStock: integracao.configs.precificacao.change_stock,
          default_stock:
            integracao.configs.precificacao.default_stock === 0
              ? false
              : integracao.configs.precificacao.default_stock,
          price: conta.classico,
          status: anuncio.StockQuantity > 0,
          promotionPercent: integracao.configs.promocao.percent,
        })
      }

      anunciosProcessados += 1
      const magaluPayload = payload.filter((item) => item.plataforma === 'magalu')
      const porcentagem = calcularPorcentagemPre(
        anunciosProcessados,
        magaluPayload.length,
      )
      enviarProgresso(req.headers['x-socket-id'], porcentagem, 'Obtendo anúncios magalu')
    }

    // Dados da alteração de preços:
    const totalAnuncios = anunciosEncontados.length

    // Função para ativar um grupo de anúncios
    anunciosProcessados = 0
    const ativarGrupoAnuncios = async (grupoAnuncios, type) => {
      await Promise.all(
        grupoAnuncios.map(async (item, index) => {
          if (item.activate) {
            //&& !item.status) {
            try {
              await Magalu.ativarAnuncio(item.token, item.id, item.default_stock)

              dadosAlteracao.push({
                id: item.id,
                action: 'Ativar anúncio',
                status: 'success',
                final: false,
              })

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: user.name,
                userId: user._id,
                action: 'Ativar anúncio',
                message: 'Ativou o anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    estoque: item.default_stock,
                  },
                ],
              })
            } catch (error) {
              dadosAlteracao.push({
                id: item.id,
                action: 'Ativar anúncio',
                status: 'error',
                mgl_response: error.response?.data || {
                  message: 'nenhuma mensagem vinda da magalu',
                },
                final: false,
              })
            } finally {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Ativando anúncios magalu',
              )
            }
          } else {
            anunciosProcessados += 1
            const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
            enviarProgresso(req.headers['x-socket-id'], porcentagem, '')
          }
        }),
      )
    }

    await ativarGrupoAnuncios(anunciosEncontados)

    enviarProgresso(req.headers['x-socket-id'], 1)

    // Função para precificar um grupo de anúncios
    anunciosProcessados = 0
    const alterarPrecoDeGrupo = async (grupoAnuncios, ultimo = false) => {
      await Promise.all(
        grupoAnuncios.map((item, index) => {
          let valor = item.price.replace(',', '.')

          valor = Number.parseFloat(valor / (1 - item.promotionPercent / 100))

          valor = Math.ceil(valor * 100) / 100

          return Magalu.precificador(
            item.token,
            item.id,
            valor,
            item.price.replace(',', '.'),
          )
            .then(async (data) => {
              if (!ultimo) {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Alterar preço',
                  status: 'success',
                  final: false,
                })
              }

              if (ultimo) {
                dadosAlteracao.push({
                  id: item.id,
                  action: 'Alterar preço',
                  status: 'success',
                  final: true,
                })
              }

              await RandomFunctions.setLogs(Logs, {
                integration: item.conta,
                integrationId: item.contaId,
                user: user.name,
                userId: user._id,
                action: 'Alterar preço',
                message: 'Alterou o preço do anúncio descrito abaixo',
                observacoes: [
                  {
                    id: item.id,
                    sku: item.sku,
                    valor: item.price.replace(',', '.'),
                  },
                ],
              })
            })
            .catch((error) => {
              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar preço',
                status: 'error',
                mgl_response: error.response?.data || {
                  message: 'nenhuma mensagem vinda da magalu',
                },
                final: false,
              })
              dadosAlteracao.push({
                id: item.id,
                action: 'Alterar preço',
                status: 'error',
                message: 'Anúncio não precificado',
                final: true,
              })

              const indexToRemove = grupoAnuncios.findIndex(
                (anuncio) => anuncio.id === item.id,
              )
              if (indexToRemove !== -1) {
                grupoAnuncios.splice(indexToRemove, 1)
              }
            })
            .finally(() => {
              anunciosProcessados += 1
              const porcentagem = calcularPorcentagem(anunciosProcessados, totalAnuncios)
              enviarProgresso(
                req.headers['x-socket-id'],
                porcentagem,
                'Precificando na Magalu',
              )
            })
        }),
      )
    }

    await alterarPrecoDeGrupo(anunciosEncontados, true)

    enviarProgresso(req.headers['x-socket-id'], false)

    const resultado = [...dadosAlteracao]

    const organizedDataMGL = organizeData({ resultado }, 'magalu')

    res.status(201).json({ precos, resultado: [...organizedData, ...organizedDataMGL] })
  }

  static async activateBySkuMagalu(req, res) {
    const { sku, idIntegration, short_name } = req.body

    try {
      const token = RandomFunctions.decryptCookie(req.cookies[short_name])
      const integracao = await IntegracaoMGL.findById(idIntegration)

      const configs = integracao.configs.precificacao

      if (!configs.activate) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: [
            'Essa integração não permite que seus anúncios sejam ativados pelo MyAppOne. ',
          ],
        })

        return
      }

      enviarProgresso(req.headers['x-socket-id'], 50, 'Obtendo anúncio magalu')
      const anuncio = await Magalu.anuncioBySku(token, sku)

      if (!anuncio) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'without_sku',
          message: ['Essa integração não tem nenhum anúncio desse Sku.'],
        })

        return
      }

      const resultado = []

      enviarProgresso(req.headers['x-socket-id'], 75, 'Ativando anúncio')
      await Magalu.ativarAnuncio(
        token,
        anuncio.IdSku,
        integracao.configs.precificacao.default_stock,
      )
        .then(() => {
          resultado.push({
            type: 'success',
            item: anuncio.IdSku,
            message: 'Anúncio ativado com sucesso!',
          })

          enviarProgresso(req.headers['x-socket-id'], 100, 'Anúncio ativado')
        })
        .catch((error) => {
          resultado.push({
            type: 'error',
            item: anuncio.IdSku,
            message: 'Erro ao ativar o anúncio',
            ml_response: error.response.data,
          })
          enviarProgresso(req.headers['x-socket-id'], 100, 'Erro')
        })

      res.status(201).json({ resultado }).end()
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar ativar os anúncios. Confira na plataforma se foram ativados e, se necessário, tente novamente !',
        ],
      })
    } finally {
      enviarProgresso(req.headers['x-socket-id'], false)
    }
  }

  static async pauseAllSkus(req, res) {
    await IntegrationFunctions.getNewTokens()
    await IntegrationFunctions.getNewTokensMagalu()

    try {
      const ids = req.body.ids
      const user = req.user

      const calcularPorcentagemPre = (index, totalAnuncios) => {
        return Math.round((index / totalAnuncios) * 100)
      }

      const calcularPorcentagem = (index) => {
        return Math.round((index / totalAnuncios) * 100)
      }

      let result
      let anunciosProcessados = 0
      const skus = []
      for (const id of ids) {
        result = await prisma.produtos.findUnique({
          where: { id },
          select: {
            sku: true,
            produtosCombo: {
              select: {
                sku: true,
              },
            },
            produtosKit: {
              select: {
                kit: {
                  select: {
                    sku: true,
                  },
                },
              },
            },
          },
        })

        anunciosProcessados += 1

        const porcentagem = calcularPorcentagemPre(anunciosProcessados, ids.length)
        enviarProgresso(req.headers['x-socket-id'], porcentagem, 'Obtendo skus')
        skus.push(
          ...[
            result.sku,
            ...result.produtosCombo.map((combo) => combo.sku),
            ...result.produtosKit.map((kitRelation) => kitRelation.kit.sku),
          ],
        )
      }

      const integracoes = await IntegracaoML.find({
        status: 'active',
        'configs.precificacao.pause': true,
      })
      const anunciosEncontados = []
      let contasProcessadas = 0
      for (const conta of integracoes) {
        const token = conta.lastAccess_token.token

        contasProcessadas += 1
        const porcentagem = calcularPorcentagemPre(contasProcessadas, integracoes.length)
        enviarProgresso(req.headers['x-socket-id'], porcentagem, 'Obtendo anúncios')

        const anuncios = await MercadoLivre.anunciosBySku(
          skus.join(','),
          'ambos',
          true,
          false,
          'ambos',
          token,
          conta.seller_id,
        )

        for (const i of skus) {
          await RandomFunctions.setLogs(Logs, {
            integration: conta.name,
            integrationId: conta._id,
            user: user.name,
            userId: user._id,
            action: 'Pausar anúncios',
            message: 'Pausou todos os anúncios do SKU informado abaixo',
            observacoes: [
              {
                sku: i,
              },
            ],
          })
        }

        for (const anuncio of anuncios) {
          anunciosEncontados.push({
            id: anuncio,
            seller_id: conta.seller_id,
            short_name: conta.short_name,
            conta: conta.name,
            token: token,
          })
        }
      }

      const resultado = dividirEmBlocos(anunciosEncontados, 5)
      anunciosProcessados = 0
      let totalAnuncios = anunciosEncontados.length
      for (const lote of resultado) {
        await Promise.all(
          lote.map((item) => {
            return MercadoLivre.pausarAnuncio(item.id, item.token)
              .catch((error) => {})
              .finally(() => {
                anunciosProcessados += 1
                const porcentagem = calcularPorcentagem(
                  anunciosProcessados,
                  totalAnuncios,
                )
                enviarProgresso(
                  req.headers['x-socket-id'],
                  porcentagem,
                  'Pausando os anuncios',
                )
              })
          }),
        )
      }
      enviarProgresso(req.headers['x-socket-id'], 1, '')

      const integracoesMGL = await IntegracaoMGL.find({
        'configs.precificacao.pause': true,
        status: 'active',
      })
      const anunciosEncontadosMGL = []
      let contasProcessadasMGL = 0
      for (const conta of integracoesMGL) {
        const token = conta.lastAccess_token.token

        contasProcessadasMGL += 1
        const porcentagem = calcularPorcentagemPre(
          contasProcessadasMGL,
          integracoesMGL.length,
        )
        enviarProgresso(
          req.headers['x-socket-id'],
          porcentagem,
          'Obtendo anúncios Magalu',
        )

        for (const i of skus) {
          await RandomFunctions.setLogs(Logs, {
            integration: conta.name,
            integrationId: conta._id,
            user: user.name,
            userId: user._id,
            action: 'Pausar anúncios',
            message: 'Pausou todos os anúncios do SKU informado abaixo',
            observacoes: [
              {
                sku: i,
              },
            ],
          })
        }

        for (const sku of skus) {
          anunciosEncontadosMGL.push({
            id: sku,
            seller_id: conta.seller_id,
            short_name: conta.short_name,
            conta: conta.name,
            token: token,
          })
        }
      }

      const resultadoMagalu = dividirEmBlocos(anunciosEncontadosMGL, 5)
      anunciosProcessados = 0
      totalAnuncios = skus.length
      for (const lote of resultadoMagalu) {
        await Promise.all(
          lote.map((item) => {
            return Magalu.pausarAnuncio(item.token, item.id)
              .catch((error) => {})
              .finally(() => {
                anunciosProcessados += 1
                const porcentagem = calcularPorcentagem(
                  anunciosProcessados,
                  totalAnuncios,
                )
                enviarProgresso(
                  req.headers['x-socket-id'],
                  porcentagem,
                  'Pausando os anuncios na Magalu',
                )
              })
          }),
        )
      }
      enviarProgresso(req.headers['x-socket-id'], 1, '')

      res.status(201).json({ message: 'ok' })
    } catch (error) {
      console.log(error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: ['Ocorreu um erro ao tentar pausar os produtos nas plataformas.'],
      })
    } finally {
      enviarProgresso(req.headers['x-socket-id'], false)
    }
  }
}

class MercadoLivre {
  static async ativarAnuncio(anuncio, estoque, token) {
    const url = `https://api.mercadolibre.com/items/${anuncio}`

    const data = {
      status: 'active',
      ...(estoque ? { available_quantity: estoque } : {}),
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }

    return axios.put(url, data, config)
  }

  static async anunciosBySku(sku, catalogo, simples, full, tipo, token, conta = 1) {
    let url = `https://api.mercadolibre.com/users/${conta}/items/search?seller_sku=${sku}`

    let precificadorMarcas = []

    if (catalogo) {
      if (catalogo !== 'ambos') precificadorMarcas.push(`&catalog_listing=${catalogo}`)
    }
    if (full) {
      if (full !== 'ambos') precificadorMarcas.push(`&logistic_type=${full}`)
    }

    if (simples) precificadorMarcas = []

    if (tipo === 'classico') precificadorMarcas.push('&listing_type_id=gold_special')
    if (tipo === 'premium') precificadorMarcas.push('&listing_type_id=gold_pro')

    if (!full) precificadorMarcas.push('&logistic_type=cross_docking')
    if (!catalogo) precificadorMarcas.push('&catalog_listing=false')

    for (const parametro of precificadorMarcas) {
      url += parametro
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    let allResults = []
    let offset = 0
    const limit = 50

    try {
      while (true) {
        const paginatedUrl = `${url}&offset=${offset}&limit=${limit}`
        const response = await axios.get(paginatedUrl, { headers })

        if (response.data?.results) {
          allResults = allResults.concat(response.data.results)
        }

        const total = response.data.paging.total
        offset += limit

        if (offset >= total) break
      }

      return allResults
    } catch (error) {
      console.log(error)
      return []
    }
  }

  static async getInfoByMLB(mlb, token) {
    const url = `https://api.mercadolibre.com/items/${mlb}?access_token=${token}&&include_attributes=all`
    const response = await axios.get(url)
    return response.data
  }

  static async getPromoById(mlb, token) {
    const url = `https://api.mercadolibre.com/items/${mlb}/prices?access_token=${token}`
    const response = await axios.get(url)

    if (response.status === 200) {
      return response.data
    }
  }

  static async removerPromocao(anuncio, token, type, promotionID) {
    let PROMOTION_TYPE = ''
    if (type === 'ML-P') {
      PROMOTION_TYPE = 'DEAL'
    } else if (type === 'SE-P') {
      PROMOTION_TYPE = 'SELLER_CAMPAIGN'
    }

    const ACCESS_TOKEN = token
    const ITEM_ID = anuncio
    const PROMOTION_ID = promotionID

    //const url = `https://api.mercadolibre.com/seller-promotions/items/${ITEM_ID}`
    const url = `https://api.mercadolibre.com/seller-promotions/items/${ITEM_ID}`
    const headers = {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    }
    const params = {
      // promotion_type: PROMOTION_TYPE,
      // promotion_id: PROMOTION_ID,
      app_version: 'v2',
    }

    const response = await axios.delete(url, {
      headers: headers,
      params: params,
    })

    if (response.status === 200) {
      return 'ok'
    }
  }

  static async precificador(anuncio, preco, token, variation) {
    const url = `https://api.mercadolibre.com/items/${anuncio}?access_token=${token}`

    let body = {}
    if (variation) {
      const variacao = variation.map((i) => ({
        id: i.id,
        price: preco,
      }))

      body = {
        shipping: { mode: 'me2', free_shipping: false },
        variations: variacao,
      }
    } else {
      body = {
        price: preco,
        shipping: { mode: 'me2', free_shipping: false },
      }
    }

    const headers = { 'Content-Type': 'application/json' }
    const response = await axios.put(url, body, { headers })
    return response.data
  }

  static async addPromo(anuncio, preco, token, type, promotionID) {
    let PROMOTION_TYPE = ''
    if (type === 'ML-P') {
      PROMOTION_TYPE = 'DEAL'
    } else if (type === 'SE-P') {
      PROMOTION_TYPE = 'SELLER_CAMPAIGN'
    }

    const url = `https://api.mercadolibre.com/seller-promotions/items/${anuncio}?app_version=v2`
    const data = {
      promotion_id: promotionID,
      promotion_type: PROMOTION_TYPE,
      deal_price: preco,
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const response = await axios.post(url, data, { headers })
    if (response.status === 201) {
      return response.data
    }
  }

  static async changePubliType(anuncio, token, type) {
    const url = `https://api.mercadolibre.com/items/${anuncio}/listing_type`
    const data = {
      id: type,
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const response = await axios.post(url, data, { headers })
    if (response.status === 200 || response.status === 201) {
      return response.data
    }
  }

  static async replicarAnuncio(anuncioPai, token, tipo, descricao, dadosAlteracao) {
    const tagsToRemove = [
      'id',
      'seller_id',
      'family_name',
      'user_product_id',
      'official_store_id',
      'inventory_id',
      'initial_quantity',
      'sold_quantity',
      'start_time',
      'stop_time',
      'end_time',
      'expiration_time',
      'permalink',
      'video_id',
      'seller_address',
      'seller_contact',
      'location',
      'geolocation',
      'coverage_areas',
      'tags',
      'date_created',
      'last_updated',
      'item_relations',
      'original_price',
      'deal_ids',
      'descriptions',
      'base_price',
      'thumbnail',
      'sub_status',
      'warnings',
      'health',
      'listing_source',
      'international_delivery_mode',
      'thumbnail_id',
      'parent_item_id',
      'differential_pricing',
    ]
    const novoAnuncio = removeTags(anuncioPai, tagsToRemove)
    novoAnuncio.listing_type_id = tipo

    function isValidPicture(size) {
      const [width, height] = size.split('x').map(Number)
      return (width >= 500 && height >= 250) || (height >= 500 && width >= 250)
    }

    const filteredPictures = novoAnuncio.pictures.filter((picture, index) => {
      return index === 0 || isValidPicture(picture.size)
    })

    novoAnuncio.pictures = filteredPictures

    let anuncioCriado = false
    try {
      anuncioCriado = await MercadoLivre.createItem(novoAnuncio, token)

      dadosAlteracao.push({
        id: anuncioCriado.id,
        action: 'Criar anúncio',
        status: 'success',
        final: false,
      })
    } catch (error) {
      console.log('error: ', error.response.data.cause)
    }

    if (anuncioCriado) {
      try {
        await MercadoLivre.addDescription(anuncioCriado.id, descricao, token)
        dadosAlteracao.push({
          id: anuncioCriado.id,
          action: 'Postar descrição',
          status: 'success',
          final: false,
        })
      } catch (error) {
        dadosAlteracao.push({
          id: anuncioCriado.id,
          action: 'Postar descrição',
          status: 'error',
          final: false,
        })
      }

      return anuncioCriado
    }

    throw 'Erro'
  }

  static async getDescriptionByMLB(mlb, token) {
    const url = `https://api.mercadolibre.com/items/${mlb}/description?access_token=${token}`
    const response = await axios.get(url)
    return response.data.plain_text
  }

  static async createItem(data, token) {
    const url = 'https://api.mercadolibre.com/items'
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }

    const response = await axios.post(url, data, config)
    return response.data
  }

  static async addDescription(itemId, plainText, token) {
    const url = `https://api.mercadolibre.com/items/${itemId}/description`
    const data = {
      plain_text: plainText,
    }
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }

    const response = await axios.post(url, data, config)
    return response.data
  }

  static async getHealth(mlb, token) {
    const url = `https://api.mercadolibre.com/items/${mlb}/health?access_token=${token}`
    const response = await axios.get(url)
    return response.data
  }

  static async getDetailsCategory(category) {
    const url = `https://api.mercadolibre.com/categories/${category}`
    const response = await axios.get(url)
    return response.data
  }

  static async pausarAnuncio(anuncio, token) {
    const url = `https://api.mercadolibre.com/items/${anuncio}`

    const data = {
      status: 'paused',
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }

    return axios.put(url, data, config)
  }
}

class Magalu {
  static async anuncioBySku(token, sku) {
    try {
      const url = `https://in.integracommerce.com.br/api/Sku/${sku}`
      const accessToken = token

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      return response.data
    } catch (error) {
      return false
    }
  }

  static async ativarAnuncio(token, idSku, quantity) {
    const url = 'https://in.integracommerce.com.br/api/Stock'

    const data = [
      {
        idSku: idSku,
        quantity: Number(quantity),
      },
    ]
    const response = await axios.put(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
    })

    return response.data
  }

  static async precificador(token, idSku, listPrice, salePrice) {
    const url = 'https://in.integracommerce.com.br/api/Price'

    const data = [
      {
        idSku: idSku,
        listPrice: Number.parseFloat(listPrice),
        salePrice: Number.parseFloat(salePrice),
      },
    ]

    const response = await axios.put(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
    })

    return response.data
  }

  static async pausarAnuncio(token, idSku) {
    const url = 'https://in.integracommerce.com.br/api/Stock'

    const data = [
      {
        idSku: idSku,
        quantity: 0,
      },
    ]
    const response = await axios.put(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
    })

    return response.data
  }
}

function dividirEmBlocos(lista, tamanhoBloco) {
  const resultado = []
  for (let i = 0; i < lista.length; i += tamanhoBloco) {
    resultado.push(lista.slice(i, i + tamanhoBloco))
  }
  return resultado
}

function removeTags(json, tagsToRemove) {
  const newJson = { ...json }
  tagsToRemove.forEach((tag) => {
    // biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
    if (newJson.hasOwnProperty(tag)) {
      delete newJson[tag]
    }
  })
  return newJson
}

function organizeData(data, plataforma) {
  const grouped = {}

  data.resultado.forEach((item) => {
    if (!grouped[item.id]) {
      grouped[item.id] = {
        actions: [],
        finalAction: null,
      }
    }

    grouped[item.id].actions.push({
      action: item.action,
      status: item.status,
      ...(item.ml_response && { ml_response: item.ml_response }),
      ...(item.message && { message: item.message }),
      final: item.final,
    })

    if (item.final) {
      grouped[item.id].finalAction = {
        action: item.action,
        status: item.status,
      }
    }
  })

  return Object.entries(grouped).map(([id, { actions, finalAction }]) => ({
    id,
    actions,
    ...(finalAction && { finalAction }),
    plataforma: plataforma,
  }))
}
