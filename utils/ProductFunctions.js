const axios = require('axios')
const fs = require('node:fs')
const path = require('node:path')

module.exports = class ProductFunctions {
  static async changeAddressTiny(tinyId, newAdrdess) {
    const url = 'https://api.tiny.com.br/api2/produto.obter.php'
    const payload = {
      token: process.env.TOKEN_TINY,
      formato: 'JSON',
      id: tinyId,
    }
    const response = await axios.post(url, new URLSearchParams(payload))
    const dict = response.data

    const produto = dict.retorno.produto

    produto.id = undefined
    produto.localizacao = newAdrdess
    produto.preco = 0.1

    const produtos = {
      produtos: [
        {
          produto: {
            // codigo: produto.codigo,
            // unidade: produto.unidade,
            // origem: produto.origem,
            // situacao: produto.situacao,
            // tipo: produto.tipo,
            // nome: produto.nome,

            sequencia: 1,
            ...produto,
          },
        },
      ],
    }

    const url1 = 'https://api.tiny.com.br/api2/produto.alterar.php'

    const payload1 = {
      token: process.env.TOKEN_TINY,
      produto: JSON.stringify(produtos),
      formato: 'JSON',
    }

    const response1 = await axios.post(url1, new URLSearchParams(payload1))

    //console.log(response1.data.retorno.registros[0].registro)

    return response1
  }

  static async changeManyAddressTiny(tinyItems) {
    const url = 'https://api.tiny.com.br/api2/produto.obter.php'

    const produtosTiny = []
    for (const item of tinyItems) {
      const payload = {
        token: process.env.TOKEN_TINY,
        formato: 'JSON',
        id: item.id,
      }
      console.log(payload)

      const response = await axios.post(url, new URLSearchParams(payload))
      produtosTiny.push(response.data.retorno.produto)
    }

    for (const produto of produtosTiny) {
      produto.localizacao = tinyItems.find(
        (item) => item.id === Number.parseInt(produto.id),
      )?.address
      produto.id = undefined
      produto.preco = 0.1
    }

    const novosProdutosTiny = []
    produtosTiny.forEach((produto, index) => {
      novosProdutosTiny.push({
        produto: {
          sequencia: index + 1,
          ...produto,
        },
      })
    })

    const produtos = {
      produtos: [...novosProdutosTiny],
    }

    const url1 = 'https://api.tiny.com.br/api2/produto.alterar.php'

    const payload1 = {
      token: process.env.TOKEN_TINY,
      produto: JSON.stringify(produtos),
      formato: 'JSON',
    }

    const response1 = await axios.post(url1, new URLSearchParams(payload1))

    //console.log(response1.data.retorno.registros[0].registro)

    return response1
  }

  static async downloadAndSaveImage(produto, apiUrl) {
    const ext = path.extname(produto.photo)
    const imagePath = path.resolve(
      __dirname,
      '../public/images/products',
      `${produto.sku}${ext}`,
    )

    let fotoDoProduto

    if (fs.existsSync(imagePath)) {
      fotoDoProduto = `${apiUrl}/images/products/${produto.sku}${ext}`
    } else {
      try {
        const response = await axios.get(produto.photo, {
          responseType: 'stream',
        })

        fs.mkdirSync(path.dirname(imagePath), { recursive: true })

        const writer = fs.createWriteStream(imagePath)
        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
          writer.on('finish', () => {
            fotoDoProduto = `${apiUrl}/images/products/${produto.sku}${ext}`
            resolve(fotoDoProduto)
          })

          writer.on('error', (err) => {
            reject('error')
          })
        })
      } catch (error) {
        return 'error'
      }
    }

    return fotoDoProduto
  }

  static async excluirFotos(nomeBase) {
    const pastaFotos = path.resolve(__dirname, '../public/images/products')

    try {
      const arquivos = await fs.promises.readdir(pastaFotos)

      const arquivosParaExcluir = arquivos.filter((arquivo) => {
        const nomeArquivo = path.parse(arquivo).name
        return nomeArquivo === nomeBase
      })

      if (arquivosParaExcluir.length === 0) {
        return `Nenhuma foto encontrada com o nome "${nomeBase}".`
      }

      const promessas = arquivosParaExcluir.map((arquivo) => {
        return fs.promises.unlink(path.join(pastaFotos, arquivo)).then(() => {})
      })

      await Promise.all(promessas)

      return `Fotos excluídas: ${arquivosParaExcluir.join(', ')}`
    } catch (err) {
      return 'error'
    }
  }
}
