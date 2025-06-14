const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()
const axios = require('axios')
const fs = require('node:fs')
const path = require('node:path')

const ProductFunctions = require('../utils/ProductFunctions')
const { ApiTinyController } = require('./ApiTinyController')

const fsSync = require('node:fs').promises

module.exports = class ProductsController {
  static async RegisterProduct(req, res) {
    const produto = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          if (!produto.ean || !produto.sku || !produto.name) {
            response = {
              status: 400,
              body: {
                erroCode: '400',
                erroType: 'validation_error',
                message: ['Dados obrigatórios não fornecidos.'],
              },
            }
            return
          }

          if (hasDuplicateCNPJs(produto.lines)) {
            response = {
              status: 400,
              body: {
                erroCode: '400',
                erroType: 'duplication_error',
                message: [
                  'Fornecedor duplicado. Por favor, envie apenas uma linha de cada fornecedor.',
                ],
              },
            }
            return
          }

          const whereCondition = {
            OR: [
              { gtin: { equals: produto.ean } },
              { tinyId: { equals: produto.tinyId } },
              { sku: { equals: produto.sku } },
            ],
          }

          const existingProduct = await prisma.produtos.findFirst({
            where: whereCondition,
          })

          if (existingProduct) {
            response = {
              status: 400,
              body: {
                erroCode: '400',
                erroType: 'duplicated_product',
                message: [
                  'Esse produto já existe no banco de dados. Por favor insira um produto diferente.',
                ],
              },
            }
            return
          }

          let pickingData = null

          if (produto.endereco) {
            const enderecoExiste = await prisma.pickings.findUnique({
              where: { endereco: produto.endereco },
              include: { produtos: true },
            })

            if (!enderecoExiste) {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'address_not_found',
                  message:
                    'Esse endereço não existe no banco de dados. Verifique se ele está correto ou solicite a criação dele.',
                },
              }
              return
            }

            if (enderecoExiste.isLocate) {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'address_is_not_empty',
                  message:
                    'Esse endereço já está ocupado. Por favor, exclua esse endereço no tiny, tente criar o produto novamente e enderece-o pelo MyAppOne.',
                },
              }
              return
            }

            pickingData = {
              picking: {
                connect: { id: enderecoExiste.id },
              },
            }
          }

          if (produto.reverCompras) {
            const compras = await prisma.produtosNovos.findMany({
              where: {
                sku: produto.sku,
              },
            })

            if (compras.length > 0) {
              response = {
                status: 200,
                body: { message: 'desmembramento', compras: compras },
              }
              return
            }
          }

          produto.cost = Number.parseFloat(
            produto.cost.replace('R$', '').replace(/\./g, '').replace(',', '.'),
          )

          const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
            produto,
            process.env.API,
          )

          if (imagemBaixada === 'error') {
            response = {
              status: 400,
              body: {
                erroCode: '400',
                erroType: 'image_error',
                message:
                  'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde.',
              },
            }
            return
          }

          await prisma.produtos.create({
            data: {
              sku: produto.sku,
              tinyId: produto.tinyId,
              name: produto.name,
              photo: imagemBaixada,
              cost: produto.cost || 0,
              gtin: produto.ean,
              searchform: produto.search,
              confirmform: produto.comfirm,
              ignoreform: produto.ignore,
              ncm: produto.ncm,
              brandrule: produto.brandrule || '0',
              brandrulePremium: produto.brandRulePremium || '0',
              group: produto.group,
              fullrule: produto.fullRule || '0',
              weight: Number.parseFloat(produto.weigth.replace(',', '.')),
              heigth: Number.parseFloat(produto.heigth.replace(',', '.')),
              width: Number.parseFloat(produto.width.replace(',', '.')),
              length: Number.parseFloat(produto.length.replace(',', '.')),
              catalog_id: produto.catalogId,
              ...(produto.categoryId && {
                category: { connect: { id: produto.categoryId } },
              }),
              ...(produto.brandId && {
                brand: { connect: { id: produto.brandId } },
              }),
              ...(pickingData ? pickingData : {}),

              Desmembramento: {
                create: produto.lines.map((desmembramento) => ({
                  fornecedor: desmembramento.fornecedor,
                  cpfCnpj: desmembramento.cpfCnpj,
                  tipo: desmembramento.tipo,
                  quantidade: Number.parseInt(desmembramento.quantidade),
                })),
              },
            },
          })

          response = {
            status: 201,
            body: { message: 'Produto criado com sucesso.' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      await prisma.$transaction(async (prisma) => {
        if (produto.editar) {
          const compras = await prisma.produtosNovos.findMany({
            where: {
              sku: produto.sku,
            },

            include: {
              compra: {
                include: {
                  fornecedor: true,
                },
              },
            },
          })

          await ApiTinyController.editarComprasProdutosNovos(
            compras,
            produto.lines,
            produto.sku,
            produto.tinyId,
          )
        }
      })

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      console.error('Erro ao criar o produto:', error)
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar criar o produto.'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async RegisterCombo(req, res) {
    const combo = req.body

    try {
      const whereCondition = {
        OR: [
          { gtin: { equals: combo.ean } },
          { idTiny: { equals: combo.tinyId } },
          { sku: { equals: combo.sku } },
        ],
      }
      const totalProdutos = await prisma.combos.findFirst({
        where: whereCondition,
        include: {
          produto: true,
        },
      })

      if (totalProdutos) {
        res.status(400).json({
          erroCode: '400',
          erroType: 'duplicated_product',
          message: [
            'Esse combo já existe no banco de dados. Por favor insira um combo diferente !',
          ],
        })
        return
      }

      const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
        combo,
        process.env.API,
      )

      if (imagemBaixada === 'error') {
        return res.status(400).json({
          erroCode: '400',
          erroType: 'image_error',
          message:
            'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde',
        })
      }

      const novoCombo = await prisma.combos.create({
        data: {
          sku: combo.sku,
          idTiny: combo.tinyId,
          name: combo.name,
          photo: imagemBaixada,
          gtin: combo.ean,
          quantity: Number.parseInt(combo.quantity),
          produtoId: combo.fatherId,
        },
      })

      res.status(201).json({ message: 'Combo criado' })
    } catch (error) {
      console.log('Erro ao criar o combo: ', error)
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar criar o combo'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async RegisterKit(req, res) {
    const produto = req.body

    const listCreating = []
    if (produto.pTiny.kit) {
      for (const i of produto.pTiny.kit) {
        const findProduct = await prisma.produtos.findFirst({
          where: { tinyId: i.item.id_produto },
        })

        if (!findProduct) {
          res.status(400).json({
            erroCode: '400',
            erroType: 'no_founded_father',
            message: [
              'Algum produto desse kit não está criado no banco de dados. Por favor confira os produtos e tente novamente',
            ],
          })
          return
        }

        listCreating.push({
          quantity: i.item.quantidade,
          produtoId: findProduct.id,
        })
      }
    }

    try {
      const whereCondition = {
        OR: [
          { gtin: { equals: produto.ean } },
          { idTiny: { equals: produto.tinyId } },
          { sku: { equals: produto.sku } },
        ],
      }
      const totalProdutos = await prisma.kits.findFirst({
        where: whereCondition,
        include: {
          produtos: {
            include: {
              produto: true,
            },
          },
        },
      })

      if (totalProdutos) {
        res.status(400).json({
          erroCode: '400',
          erroType: 'duplicated_product',
          message: [
            'Esse kit já existe no banco de dados. Por favor insira um kit diferente !',
          ],
        })
        return
      }

      const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
        produto,
        process.env.API,
      )

      if (imagemBaixada === 'error') {
        return res.status(400).json({
          erroCode: '400',
          erroType: 'image_error',
          message:
            'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde',
        })
      }

      const novoKit = await prisma.kits.create({
        data: {
          sku: produto.sku,
          idTiny: produto.tinyId,
          name: produto.name,
          photo: imagemBaixada,
          gtin: produto.ean,
          produtos: {
            create: [...listCreating],
          },
        },
      })

      res.status(201).json({ message: 'Kit criado' })
    } catch (error) {
      console.log('Erro ao criar o kit: ', error)
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar criar o kit'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getProductsWithFilters(req, res) {
    const { pageSize, page, value, order, refine } = req.body

    try {
      let brandIds = []
      if (refine === 'brand') {
        const brands = await prisma.marcas.findMany({
          where: {
            name: {
              contains: value,
            },
          },
        })

        brandIds = brands.map((brand) => brand.id)
      }

      let whereCondition
      switch (refine) {
        case 'sku':
          whereCondition = { sku: { equals: value } }
          break
        case 'skup':
          whereCondition = { sku: { contains: value } }
          break
        case 'gtin':
          whereCondition = { gtin: { equals: value } }
          break
        case 'brand':
          whereCondition = {
            brandId: {
              in: brandIds,
            },
          }
          break
        case 'name':
          whereCondition = { name: { contains: value } }
          break
        case 'default':
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
          break
        default:
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
      }

      const skip = (page - 1) * pageSize

      const totalProdutos = await prisma.produtos.count({
        where: whereCondition,
      })

      let totalCombos
      if (refine === 'brand') {
        totalCombos = await prisma.combos.count({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
        })
      } else {
        totalCombos = await prisma.combos.count({
          where: whereCondition,
        })
      }

      let totalKits
      if (refine === 'brand') {
        totalKits = await prisma.kits.count({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
        })
      } else {
        totalKits = await prisma.kits.count({
          where: whereCondition,
        })
      }

      const produtos = await prisma.produtos.findMany({
        where: whereCondition,
        orderBy: {
          [order]: order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
        },
        skip: skip,
        take: pageSize,
        include: {
          picking: true,
          brand: true,
        },
      })

      // if (produtos.length === 0) {
      //   res.status(404).json({
      //     erroCode: '404',
      //     erroType: 'products_not_found',
      //     message: ['Produtos não encontrados'],
      //   })
      //   return
      // }

      const resultado = {
        type: 'simples',
        quantidadeTotalProdutos: totalProdutos,
        quantidadeTotalCombos: totalCombos,
        quantidadeTotalKits: totalKits,
        totalRegistros: totalProdutos + totalCombos + totalKits,
        produtosFiltrados: produtos,
      }

      res.status(200).json(resultado)
    } catch (error) {
      console.log(error)
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar encontrar os produtos'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getCombosWithFilters(req, res) {
    const { pageSize, page, value, order, refine } = req.body

    let brandIds = []
    if (refine === 'brand') {
      const brands = await prisma.marcas.findMany({
        where: {
          name: {
            contains: value,
          },
        },
      })

      brandIds = brands.map((brand) => brand.id)
    }

    try {
      let whereCondition
      switch (refine) {
        case 'sku':
          whereCondition = { sku: { equals: value } }
          break
        case 'skup':
          whereCondition = { sku: { contains: value } }
          break
        case 'gtin':
          whereCondition = { gtin: { equals: value } }
          break
        case 'brand':
          whereCondition = {
            brandId: {
              in: brandIds,
            },
          }
          break
        case 'name':
          whereCondition = { name: { contains: value } }
          break
        case 'default':
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
          break
        default:
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
      }

      const skip = (page - 1) * pageSize

      const totalProdutos = await prisma.produtos.count({
        where: whereCondition,
      })

      let totalCombos
      if (refine === 'brand') {
        totalCombos = await prisma.combos.count({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
        })
      } else {
        totalCombos = await prisma.combos.count({
          where: whereCondition,
        })
      }

      let totalKits
      if (refine === 'brand') {
        totalKits = await prisma.kits.count({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
        })
      } else {
        totalKits = await prisma.kits.count({
          where: whereCondition,
        })
      }

      let combos
      if (refine !== 'brand') {
        combos = await prisma.combos.findMany({
          where: whereCondition,
          orderBy:
            order !== 'cost'
              ? {
                  [order]:
                    order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
                }
              : undefined,
          skip: skip,
          take: pageSize,
          include: {
            produto: {
              include: {
                picking: true,
                brand: true,
              },
            },
          },
        })
      } else {
        combos = await prisma.combos.findMany({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
          orderBy:
            order !== 'cost'
              ? {
                  [order]:
                    order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
                }
              : undefined,
          skip: skip,
          take: pageSize,
          include: {
            produto: {
              include: {
                picking: true,
                brand: true,
              },
            },
          },
        })
      }

      const resultado = {
        type: 'combo',
        quantidadeTotalProdutos: totalProdutos,
        quantidadeTotalCombos: totalCombos,
        quantidadeTotalKits: totalKits,
        totalRegistros: totalProdutos + totalCombos + totalKits,
        produtosFiltrados: combos,
      }

      res.status(200).json(resultado)
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar encontrar os produtos'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getKitsWithFilters(req, res) {
    const { pageSize, page, value, order, refine } = req.body

    let brandIds = []
    if (refine === 'brand') {
      const brands = await prisma.marcas.findMany({
        where: {
          name: {
            contains: value,
          },
        },
      })

      brandIds = brands.map((brand) => brand.id)
    }

    try {
      let whereCondition
      switch (refine) {
        case 'sku':
          whereCondition = { sku: { equals: value } }
          break
        case 'skup':
          whereCondition = { sku: { contains: value } }
          break
        case 'gtin':
          whereCondition = { gtin: { equals: value } }
          break
        case 'brand':
          whereCondition = {
            brandId: {
              in: brandIds,
            },
          }
          break
        case 'name':
          whereCondition = { name: { contains: value } }
          break
        case 'default':
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
          break
        default:
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
      }

      const skip = (page - 1) * pageSize

      const totalProdutos = await prisma.produtos.count({
        where: whereCondition,
      })

      let totalCombos
      if (refine === 'brand') {
        totalCombos = await prisma.combos.count({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
        })
      } else {
        totalCombos = await prisma.combos.count({
          where: whereCondition,
        })
      }

      let totalKits
      if (refine === 'brand') {
        totalKits = await prisma.kits.count({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
        })
      } else {
        totalKits = await prisma.kits.count({
          where: whereCondition,
        })
      }

      let kits
      if (refine !== 'brand') {
        kits = await prisma.kits.findMany({
          where: whereCondition,
          orderBy:
            order !== 'cost'
              ? {
                  [order]:
                    order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
                }
              : undefined,
          skip: skip,
          take: pageSize,
          include: {
            produtos: {
              include: {
                produto: {
                  include: { picking: true, brand: true },
                },
              },
            },
          },
        })
      } else {
        kits = await prisma.kits.findMany({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
          orderBy:
            order !== 'cost'
              ? {
                  [order]:
                    order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
                }
              : undefined,
          skip: skip,
          take: pageSize,
          include: {
            produtos: {
              include: {
                produto: {
                  include: { picking: true, brand: true },
                },
              },
            },
          },
        })
      }

      const resultado = {
        type: 'kits',
        quantidadeTotalProdutos: totalProdutos,
        quantidadeTotalCombos: totalCombos,
        quantidadeTotalKits: totalKits,
        totalRegistros: totalProdutos + totalCombos + totalKits,
        produtosFiltrados: kits,
      }

      res.status(200).json(resultado)
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar encontrar os produtos'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getAllWithFilters(req, res) {
    const { pageSize, page, value, order, refine } = req.body

    let brandIds = []
    if (refine === 'brand') {
      const brands = await prisma.marcas.findMany({
        where: {
          name: {
            contains: value,
          },
        },
      })

      brandIds = brands.map((brand) => brand.id)
    }

    try {
      let whereCondition
      switch (refine) {
        case 'sku':
          whereCondition = { sku: { equals: value } }
          break
        case 'skup':
          whereCondition = { sku: { contains: value } }
          break
        case 'gtin':
          whereCondition = { gtin: { equals: value } }
          break
        case 'brand':
          whereCondition = {
            brandId: {
              in: brandIds,
            },
          }
          break
        case 'name':
          whereCondition = { name: { contains: value } }
          break
        case 'default':
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
          break
        default:
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
      }

      const skip = (page - 1) * pageSize

      const totalProdutos = await prisma.produtos.count({
        where: whereCondition,
      })

      let totalCombos
      if (refine === 'brand') {
        totalCombos = await prisma.combos.count({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
        })
      } else {
        totalCombos = await prisma.combos.count({
          where: whereCondition,
        })
      }

      let totalKits
      if (refine === 'brand') {
        totalKits = await prisma.kits.count({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
        })
      } else {
        totalKits = await prisma.kits.count({
          where: whereCondition,
        })
      }

      //kits
      let kits
      if (refine !== 'brand') {
        kits = await prisma.kits.findMany({
          where: whereCondition,
          orderBy: { [order]: 'asc' },
          skip: skip,
          take: pageSize,
          include: {
            produtos: {
              include: {
                produto: {
                  include: { picking: true, brand: true },
                },
              },
            },
          },
        })
      } else {
        kits = await prisma.kits.findMany({
          where: {
            produtos: {
              some: {
                produto: {
                  brandId: {
                    in: brandIds,
                  },
                },
              },
            },
          },
          orderBy: { [order]: 'asc' },
          skip: skip,
          take: pageSize,
          include: {
            produtos: {
              include: {
                produto: {
                  include: { picking: true, brand: true },
                },
              },
            },
          },
        })
      }

      // Combos
      let combos
      if (refine !== 'brand') {
        combos = await prisma.combos.findMany({
          where: whereCondition,
          orderBy: { [order]: 'asc' },
          skip: skip,
          take: pageSize,
          include: {
            produto: {
              include: {
                picking: true,
                brand: true,
              },
            },
          },
        })
      } else {
        combos = await prisma.combos.findMany({
          where: {
            produto: {
              brandId: {
                in: brandIds,
              },
            },
          },
          orderBy: { [order]: 'asc' },
          skip: skip,
          take: pageSize,
          include: {
            produto: {
              include: {
                picking: true,
                brand: true,
              },
            },
          },
        })
      }

      //produtos
      const produtos = await prisma.produtos.findMany({
        where: whereCondition,
        orderBy: { [order]: 'asc' },
        skip: skip,
        take: pageSize,
        include: {
          picking: true,
          brand: true,
        },
      })

      const listaFinal = []

      for (const kit of kits) {
        kit.type = 'kit'
        listaFinal.push(kit)
      }

      for (const combo of combos) {
        combo.type = 'combo'
        listaFinal.push(combo)
      }

      for (const produto of produtos) {
        produto.type = 'produto'
        listaFinal.push(produto)
      }

      const getSku = (item) => {
        if (item.produtos?.[0]?.sku) {
          return item.produtos[0].sku
        }
        if (item.produto?.sku) {
          return item.produto.sku
        }
        return item.sku
      }

      listaFinal.sort((a, b) => {
        const skuA = getSku(a)
        const skuB = getSku(b)
        return skuA.localeCompare(skuB)
      })

      // if (kits.length === 0 && combos.length === 0 && produtos.length === 0) {
      //   res.status(404).json({
      //     erroCode: '404',
      //     erroType: 'products_not_found',
      //     message: ['Produtos não encontrados'],
      //   })
      //   return
      // }

      const resultado = {
        type: 'Mix',
        quantidadeTotalProdutos: totalProdutos,
        quantidadeTotalCombos: totalCombos,
        quantidadeTotalKits: totalKits,
        totalRegistros: totalProdutos + totalCombos + totalKits,
        produtosFiltrados: listaFinal,
      }

      res.status(200).json(resultado)
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar encontrar os produtos'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getProductTiny(req, res) {
    const { id, method } = req.body

    try {
      if (method === 'id') {
        const response = await axios.get(
          `https://api.tiny.com.br/api2/produto.obter.php?token=${process.env.TOKEN_TINY}&id=${id}&formato=json`,
        )

        const produto = response.data
        res.status(200).json(produto)
        return
      }
      if (method === 'sku') {
        const response = await axios.get(
          `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${process.env.TOKEN_TINY}&pesquisa=${id}&formato=json`,
        )

        const tinyId = response.data.retorno.produtos[0].produto.id

        const produtoResponse = await axios.get(
          `https://api.tiny.com.br/api2/produto.obter.php?token=${process.env.TOKEN_TINY}&id=${tinyId}&formato=json`,
        )
        const produto = produtoResponse.data
        res.status(200).json(produto)
        return
      }
      if (method === 'gtin') {
        const response = await axios.get(
          `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${process.env.TOKEN_TINY}&gtin=${id}&formato=json`,
        )
        const tinyId = response.data.retorno.produtos[0].produto.id

        const produtoResponse = await axios.get(
          `https://api.tiny.com.br/api2/produto.obter.php?token=${process.env.TOKEN_TINY}&id=${tinyId}&formato=json`,
        )
        const produto = produtoResponse.data
        res.status(200).json(produto)
        return
      }
      res.status(404).json({
        erroCode: '404',
        erroType: 'id_not_found',
        message: ['Coloque ao menos um id válido (Sku, Ean, Tiny Id)'],
      })
      return
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'tiny_error',
        message: [
          'Houve um erro ao tentar encontrar o produto no tiny. Certifique-se que ele está criado lá, e preencha as informações manualmente',
        ],
      })
      return
    }
  }

  static async getAllBrands(req, res) {
    try {
      const todasMarcas = await prisma.marcas.findMany()
      res.status(200).json(todasMarcas)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'brand_error',
        message: ['Houve um erro ao tentar obter a lista de marcas'],
      })
      return
    }
  }

  static async getAllCategorys(req, res) {
    try {
      const Categorias = await prisma.categorias.findMany()
      res.status(200).json(Categorias)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'brand_error',
        message: ['Houve um erro ao tentar obter a lista de categorias'],
      })
      return
    }
  }

  static async addCategoryBrand(req, res) {
    const { value, type } = req.body

    try {
      if (type === 'category') {
        const newCategory = await prisma.categorias.create({
          data: {
            name: value,
            isSpecial: false,
          },
        })

        res.status(201).json(newCategory)
        return
      }
      if (type === 'brand') {
        const newBrand = await prisma.marcas.create({
          data: {
            name: value,
          },
        })

        res.status(201).json(newBrand)
        return
      }
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'add_error',
        message: [
          `Houve um erro ao adcionar uma nova ${
            type === 'brand' ? 'marca' : 'categoria'
          }.`,
        ],
      })
      return
    }
  }

  static async getFather(req, res) {
    const id = req.body.id

    try {
      if (!id) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'without_id',
          message: [
            'Por favor, digite algum identificador do produto (SKu, Ean ou Tiny ID)',
          ],
        })
        return
      }

      const produto = await prisma.produtos.findFirst({
        where: {
          OR: [
            { gtin: { equals: id } },
            { tinyId: { equals: id } },
            { sku: { equals: id } },
          ],
        },
      })

      if (!produto) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'father_not_found',
          message: ['Produto pai não encontrado'],
        })
        return
      }

      res.status(201).json(produto)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'father_error',
        message: [
          'Ocorreu um erro ao tentar encontrar o produto pai. Tente novamente mais tarde',
        ],
      })
      return
    }
  }

  static async getProductById(req, res) {
    const id = req.body.id
    try {
      const produto = await prisma.produtos.findFirst({
        where: { id: id },
        include: {
          picking: true,
          brand: true,
          category: true,
          Desmembramento: true,
        },
      })

      res.status(201).json(produto)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do produto. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async getComboById(req, res) {
    const id = req.body.id
    try {
      const combo = await prisma.combos.findFirst({
        where: { id: id },
        include: {
          produto: {
            include: {
              picking: true,
              brand: true,
              category: true,
            },
          },
        },
      })

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

  static async getKitById(req, res) {
    const id = req.body.id
    try {
      const kit = await prisma.kits.findFirst({
        where: { id: id },
        include: {
          produtos: {
            include: {
              produto: {
                include: { picking: true, brand: true },
              },
            },
          },
        },
      })

      res.status(201).json(kit)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações do kit. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async UpdateProduct(req, res) {
    const produto = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const whereCondition = {
            OR: [
              { gtin: { equals: produto.ean } },
              { tinyId: { equals: produto.tinyId } },
              { sku: { equals: produto.sku } },
            ],
          }

          const totalProduto = await prisma.produtos.findFirst({
            where: whereCondition,
          })

          if (totalProduto && totalProduto.id !== produto.id) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'duplicated_product',
                message: [
                  'Já existe um produto com esse SKU / EAN / TinyId. Por favor insira valores diferentes.',
                ],
              },
            }
            return
          }

          const existingProduct = await prisma.produtos.findFirst({
            where: { id: produto.id },
            include: {
              Desmembramento: {
                select: {
                  fornecedor: true,
                  cpfCnpj: true,
                  tipo: true,
                  quantidade: true,
                },
              },
            },
          })

          if (!existingProduct) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Produto não encontrado no banco de dados.'],
              },
            }
            return
          }

          if (hasDuplicateCNPJs(produto.lines)) {
            response = {
              status: 400,
              body: {
                erroCode: '400',
                erroType: 'duplication_error',
                message: [
                  'Fornecedor duplicado. Por favor, envie apenas uma linha de cada fornecedor.',
                ],
              },
            }
            return
          }

          if (produto.detectChanges) {
            const lineChanges = compareArrays(
              produto.lines,
              existingProduct.Desmembramento,
            )

            if (lineChanges) {
              const compras = await prisma.produtosOnCompras.findMany({
                where: {
                  produtoId: existingProduct.id,
                },
                include: {
                  compra: {
                    include: {
                      fornecedor: true,
                    },
                  },
                },
              })

              if (compras.length > 0) {
                response = {
                  status: 200,
                  body: { message: 'desmembramento', compras: compras },
                }
                return
              }
            }
          }

          if (produto.editar) {
            const compras = await prisma.produtosOnCompras.findMany({
              where: {
                produtoId: existingProduct.id,
              },
              include: {
                compra: {
                  include: {
                    fornecedor: true,
                  },
                },
              },
            })

            await ApiTinyController.editarComprasAntigas(
              compras,
              produto.lines,
              existingProduct.sku,
            )
          }

          await prisma.desmembramento.deleteMany({
            where: {
              produtoId: produto.id,
            },
          })

          produto.cost = produto.cost.replace('R$', '').replace(' ', '')

          let updatePicking = {}
          if (
            produto.endereco !== produto.originalAddress.endereco &&
            produto.endereco !== ''
          ) {
            const address = await prisma.pickings.findUnique({
              where: { endereco: produto.endereco },
              include: { produtos: true },
            })

            if (!address) {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'address_not_find',
                  message: [
                    'O endereço selecionado não existe. Escolha um endereço diferente ou solicite a criação deste.',
                  ],
                },
              }
              return
            }

            if (address.isLocate) {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'address_is_not_empty',
                  message: [
                    'O endereço selecionado não está disponível. Por favor selecione outro endereço ou remova o produto atual dele.',
                  ],
                },
              }
              return
            }

            updatePicking = {
              picking: {
                connect: { id: address.id },
              },
            }
          }

          if (produto.endereco === '') {
            updatePicking = { picking: { disconnect: true } }
          }

          let photoProduct = produto.photo

          if (photoProduct && !produto.photo.includes(process.env.API)) {
            const fotoExcluida = await ProductFunctions.excluirFotos(produto.sku)

            if (fotoExcluida === 'error') {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'error_deleting_old_image',
                  message: [
                    'Ocorreu um erro ao tentar deletar a antiga imagem do produto. Por favor tente novamente e se o erro persistir, contate o desenvolvedor.',
                  ],
                },
              }
              return
            }

            const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
              produto,
              process.env.API,
            )

            if (imagemBaixada === 'error') {
              response = {
                status: 400,
                body: {
                  erroCode: '400',
                  erroType: 'image_error',
                  message: [
                    'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde.',
                  ],
                },
              }
              return
            }

            photoProduct = imagemBaixada
          }

          await prisma.produtos.update({
            where: { id: existingProduct.id },
            data: {
              sku: produto.sku,
              tinyId: produto.tinyId,
              name: produto.name,
              photo: photoProduct || '',
              cost:
                Number.parseFloat(produto.cost.replace(/\./g, '').replace(',', '.')) || 0,
              gtin: produto.ean,
              searchform: produto.search,
              confirmform: produto.comfirm,
              ignoreform: produto.ignore,
              ncm: produto.ncm,
              brandrule: produto.brandrule ? produto.brandRule : '0',
              brandrulePremium: produto.brandRulePremium ? produto.brandRulePremium : '0',
              group: produto.group,
              fullrule: produto.fullRule ? produto.fullRule : '0',
              weight: Number.parseFloat(
                produto.weigth ? produto.weigth.replace(',', '.') : 0,
              ),
              heigth: Number.parseFloat(
                produto.heigth ? produto.heigth.replace(',', '.') : 0,
              ),
              width: Number.parseFloat(
                produto.width ? produto.width.replace(',', '.') : 0,
              ),
              length: Number.parseFloat(
                produto.length ? produto.length.replace(',', '.') : 0,
              ),
              catalog_id: produto.catalogId,

              ...(produto.categoryId && {
                category: { connect: { id: produto.categoryId } },
              }),

              ...(produto.brandId && {
                brand: { connect: { id: produto.brandId } },
              }),

              Desmembramento: {
                create: produto.lines.map((desmembramento) => ({
                  fornecedor: desmembramento.fornecedor,
                  cpfCnpj: desmembramento.cpfCnpj,
                  tipo: desmembramento.tipo,
                  quantidade: Number.parseInt(desmembramento.quantidade),
                })),
              },

              ...updatePicking,
            },
          })

          if (produto.endereco !== produto.originalAddress.endereco) {
            const alteracaoTiny = await ProductFunctions.changeAddressTiny(
              produto.tinyId,
              produto.endereco,
            )

            if (alteracaoTiny.data.retorno.status !== 'OK') {
              throw new UserError({
                erroStatus: 400,
                type: 'user',
                erroCode: '400',
                erroType: 'tiny_error',
                message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny.',
              })
            }
          }

          response = {
            status: 200,
            body: { message: 'Produto atualizado com sucesso' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      console.log('error; ', error)
      if (error instanceof UserError) {
        return res.status(error.erroStatus).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar atualizar o produto'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async UpdateCombo(req, res) {
    const produto = req.body

    try {
      const whereCondition = {
        OR: [
          { gtin: { equals: produto.ean } },
          { idTiny: { equals: produto.tinyId } },
          { sku: { equals: produto.sku } },
        ],
      }
      const totalProduto = await prisma.combos.findFirst({
        where: whereCondition,
      })

      if (totalProduto.id !== produto.id) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'duplicated_product',
          message: [
            'Já existe um combo com esse SKU / EAN / TinyId . Por favor insira valores diferentes',
          ],
        })
        return
      }

      const existingCombo = await prisma.combos.findFirst({
        where: { id: produto.id },
        include: {
          produto: true,
        },
      })

      if (!existingCombo) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'not_found',
          message: ['Combo não encontrado no banco de dados.'],
        })
        return
      }

      let photoProduct = produto.photo
      if (!produto.photo.includes(process.env.API)) {
        const fotoExcluida = await ProductFunctions.excluirFotos(produto.sku)

        if (fotoExcluida === 'error') {
          res.status(400).json({
            erroCode: '400',
            erroType: 'error_deleting_old_image',
            message: [
              'Ocorreu um erro ao tentar deletar a antiga imagem do produto. Por favor tente novamente e se o erro persistir, contate o desenvolvedor.',
            ],
          })
          return
        }

        const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
          produto,
          process.env.API,
        )

        if (imagemBaixada === 'error') {
          return res.status(400).json({
            erroCode: '400',
            erroType: 'image_error',
            message:
              'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde',
          })
        }

        photoProduct = imagemBaixada
      }

      const updatedCombo = await prisma.combos.update({
        where: { id: existingCombo.id },
        data: {
          sku: produto.sku,
          idTiny: produto.tinyId,
          name: produto.name,
          photo: photoProduct,
          gtin: produto.ean,
          quantity: Number.parseInt(produto.quantity),
          produtoId: produto.fatherId,
        },
      })

      res.status(200).json({ message: 'Combo atualizado com sucesso' })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar atualizar o combo'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async UpdateKit(req, res) {
    const produto = req.body

    const listCreating = []
    if (produto.components) {
      for (const i of produto.components) {
        const findProduct = await prisma.produtos.findFirst({
          where: { id: i.produtoId },
        })

        if (!findProduct) {
          res.status(404).json({
            erroCode: '404',
            erroType: 'no_founded_father',
            message: [
              'Algum produto desse kit não está criado no banco de dados. Por favor confira os produtos e tente novamente',
            ],
          })
          return
        }

        listCreating.push({
          quantity: Number.parseInt(i.quantity),
          produtoId: findProduct.id,
        })
      }
    }

    try {
      const whereCondition = {
        OR: [
          { gtin: { equals: produto.ean } },
          { idTiny: { equals: produto.tinyId } },
          { sku: { equals: produto.sku } },
        ],
      }
      const existingKit = await prisma.kits.findFirst({
        where: whereCondition,
        include: {
          produtos: true,
        },
      })

      if (!existingKit) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'not_found',
          message: [
            'Esse kit não existe no banco de dados. Por favor insira um kit válido para atualização!',
          ],
        })
        return
      }

      let photoProduct = produto.photo
      if (!produto.photo.includes(process.env.API)) {
        const fotoExcluida = await ProductFunctions.excluirFotos(produto.sku)

        if (fotoExcluida === 'error') {
          res.status(400).json({
            erroCode: '400',
            erroType: 'error_deleting_old_image',
            message: [
              'Ocorreu um erro ao tentar deletar a antiga imagem do produto. Por favor tente novamente e se o erro persistir, contate o desenvolvedor.',
            ],
          })
          return
        }

        const imagemBaixada = await ProductFunctions.downloadAndSaveImage(
          produto,
          process.env.API,
        )

        if (imagemBaixada === 'error') {
          return res.status(400).json({
            erroCode: '400',
            erroType: 'image_error',
            message:
              'Ocorreu um erro ao tentar salvar a imagem do produto no banco de dados. Por favor tente novamente mais tarde',
          })
        }

        photoProduct = imagemBaixada
      }

      const updatedKit = await prisma.kits.update({
        where: { id: existingKit.id },
        data: {
          sku: produto.sku,
          idTiny: produto.tinyId,
          name: produto.name,
          photo: photoProduct,
          gtin: produto.ean,
          produtos: {
            deleteMany: {},
            create: [...listCreating],
          },
        },
      })

      res.status(200).json({ message: 'Kit atualizado com sucesso' })
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar atualizar o combo'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async deleteProduct(req, res) {
    try {
      const productId = req.body.productId
      let deletarCompras = false
      let produtoSku
      let produtoTinyId
      let response = null
      let comprasProduto

      await prisma.$transaction(
        async (prisma) => {
          // Verifica se o produto existe
          const produto = await prisma.produtos.findUnique({
            where: { id: productId },
          })

          if (!produto) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Produto não encontrado.'],
              },
            }
            return
          }

          produtoSku = produto.sku
          produtoTinyId = produto.tinyId

          const compras = await prisma.produtosOnCompras.findMany({
            where: {
              produtoId: produto.id,
            },
            include: {
              compra: {
                include: {
                  fornecedor: true,
                },
              },
            },
          })

          deletarCompras = compras.length > 0

          comprasProduto = compras

          const kits = await prisma.produtosOnKit.findMany({
            where: { produtoId: productId },
          })

          const kitIds = kits.map((kit) => kit.kitId)

          if (kitIds.length > 0) {
            await prisma.kits.deleteMany({
              where: { id: { in: kitIds } },
            })
          }

          await prisma.combos.deleteMany({
            where: { produtoId: productId },
          })

          await prisma.produtos.delete({
            where: { id: productId },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produto.tinyId,
            '',
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny.',
            })
          }

          response = {
            status: 200,
            body: { message: 'Produto deletado com sucesso!' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (deletarCompras) {
        await ApiTinyController.editarComprasSemProdutos(
          comprasProduto,
          produtoSku,
          produtoTinyId,
        )
      }

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      console.log('Erro ao deletar produto: ', error)
      if (error instanceof UserError) {
        return res.status(error.erroStatus).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar excluir o produto.'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async deleteKitCombo(req, res) {
    try {
      const itemId = req.body.id
      const type = req.body.type

      if (type === 'combo') {
        await prisma.combos.delete({
          where: { id: itemId },
        })
      } else if (type === 'kit') {
        const kits = await prisma.produtosOnKit.findMany({
          where: { kitId: itemId },
        })

        const kitIds = kits.map((kit) => kit.kitId)

        if (kitIds.length > 0) {
          await prisma.kits.deleteMany({
            where: {
              id: { in: kitIds },
            },
          })

          await prisma.produtosOnKit.deleteMany({
            where: {
              kitId: itemId,
            },
          })
        }
      }

      res.status(200).json({ message: `${type} deletado com sucesso !` })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar excluir o combo/kit'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getProductsForPricing(req, res) {
    const produtos = await prisma.produtos.findMany({
      orderBy: {
        name: 'asc',
      },
    })

    const A_D = []
    const E_N = []
    const O_Z = []

    for (const produto of produtos) {
      const primeiraLetra = produto.name[0].toUpperCase()

      if (primeiraLetra >= 'A' && primeiraLetra <= 'D') {
        if (A_D.length <= 5000)
          A_D.push([produto.sku, produto.name, produto.cost, produto.id])
      }

      if (primeiraLetra >= 'E' && primeiraLetra <= 'N') {
        if (E_N.length <= 5000)
          E_N.push([produto.sku, produto.name, produto.cost, produto.id])
      }

      if (primeiraLetra >= 'O' && primeiraLetra <= 'Z') {
        if (O_Z.length <= 5000)
          O_Z.push([produto.sku, produto.name, produto.cost, produto.id])
      }
    }

    res.status(200).json({ data: [A_D, E_N, O_Z] })
  }

  static async getProductByEAN(req, res) {
    try {
      const ean = req.body.ean

      const produto = await prisma.produtos.findFirst({
        where: {
          gtin: ean,
        },
        include: {
          picking: true,
        },
      })

      if (produto) {
        res.status(201).json(produto)
        return
      }

      res.status(404).json({
        erroCode: '404',
        erroType: 'product_not_found',
        message: ['Produto não cadastrado no banco de dados'],
      })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter o produto. Por favor atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async checkLocalIsEmpty(req, res) {
    try {
      const endereco = req.body.endereco

      const display = await prisma.pickings.findUnique({
        where: { endereco: endereco },
        include: {
          produtos: true,
        },
      })

      if (!display) {
        res.status(201).json({
          message:
            'Esse endereço não existe no banco de dados. Verifique se ele está correto ou solicite a criação dele.',
          code: '003',
          disponibility: false,
        })

        return
      }

      const qntNoDisplay = display.produtos.length
      const { limit, isLocate, tipo } = display

      if (tipo === 'Caixa Preta' && !isLocate) {
        res.status(201).json({
          message: 'Esse endereço está disponível.',
          code: '001',
          disponibility: true,
        })
        return
      } // falta o else

      if (tipo === 'Prateleira' && !isLocate) {
        res.status(201).json({
          message: 'Esse endereço está disponível.',
          code: '001',
          disponibility: true,
        })
        return
      } // falta o else

      if (tipo === 'Porta Pallet' && !isLocate) {
        res.status(201).json({
          message: 'Esse endereço está disponível.',
          code: '001',
          disponibility: true,
        })
        return
      }

      res.status(201).json({
        message: 'Esse endereço não está disponível.',
        code: '002',
        disponibility: false,
      })
    } catch (error) {
      res.status(504).json({
        erroCode: '504',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter a disponibilidade do endereço. Por favor atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async getEmptyAddressByIa(req, res) {
    try {
      const rua = req.body.rua
      const display = req.body.display
      const coluna = req.body.coluna

      const filter = {
        rua: rua,
        tipo: display,
        isLocate: false,
      }

      let messageError = `Não existe mais ${display.toLowerCase()} disponível na rua ${rua}`
      let complementoMsgError = ''
      if (coluna !== undefined && coluna !== null) {
        filter.coluna = coluna
        complementoMsgError = ` ou na coluna ${coluna}.`
      }

      const endereco = await prisma.pickings.findFirst({
        where: filter,
        orderBy: {
          endereco: 'asc',
        },
      })

      messageError = messageError + complementoMsgError

      if (!endereco) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'no_address_empty',
          message: [messageError],
        })

        return
      }

      res.status(201).json(endereco)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter um endereço disponível. Por favor atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async conference(req, res) {
    try {
      const type = req.body.type
      const endereco = req.body.endereco

      let proximoEndereco
      if (type === 'same') {
        proximoEndereco = await prisma.pickings.findUnique({
          where: {
            endereco: endereco,
          },
          include: {
            produtos: true,
          },
        })
      }

      if (type === 'next') {
        proximoEndereco = await prisma.pickings.findFirst({
          where: {
            endereco: {
              gt: endereco,
            },
          },
          include: {
            produtos: true,
          },
          orderBy: {
            endereco: 'asc',
          },
        })
      }

      if (type === 'before') {
        proximoEndereco = await prisma.pickings.findFirst({
          where: {
            endereco: {
              lt: endereco,
            },
          },
          include: {
            produtos: true,
          },
          orderBy: {
            endereco: 'desc',
          },
        })
      }

      if (!proximoEndereco) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'address_not_found',
          message: [
            'Esse endereço não existe no banco de dados. Escolha um endereço diferente ou solicite a criação desse',
          ],
        })
        return
      }

      // biome-ignore lint/complexity/noForEach: <explanation>
      proximoEndereco.produtos?.forEach((item) => {
        item.foiConfirmado = false
      })

      res.status(201).json({ localizacao: proximoEndereco })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar o endereco seguinte. Por favor atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async enderecarByGtin(req, res) {
    try {
      let response = null
      await prisma.$transaction(
        async (prisma) => {
          const ean = req.body.ean
          const endereco = req.body.endereco
          const forced = req.body.forced

          const produto = await prisma.produtos.findUnique({
            where: {
              gtin: ean,
            },
            include: {
              picking: true,
            },
          })

          if (!produto) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Produto não encontrado no banco de dados.'],
              },
            }
            return
          }

          if (produto.picking && !forced) {
            response = {
              status: 201,
              body: {
                picking: false,
                status: 'product_has_picking',
                produto: produto,
              },
            }
            return
          }

          const picking = await prisma.pickings.findUnique({
            where: { endereco: endereco },
          })

          if (!picking) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'picking_not_found',
                message: ['Esse picking não foi encontrado. Contate o desenvolvedor'],
              },
            }
            return
          }

          if (picking.isLocate) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'picking_is_locate',
                message: ['Esse picking já tem um produto'],
              },
            }
            return
          }

          const updatedProduct = await prisma.produtos.update({
            where: { id: produto.id },
            data: {
              picking: {
                connect: { id: picking.id },
              },
            },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produto.tinyId,
            picking.endereco,
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 201,
            body: {
              picking: true,
              status: 'is_picking',
              message: 'Produto endereçado com sucesso',
            },
          }
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      console.log('Error no bygtin: ', error)
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar adcionar um produto a esse picking. Antes de continuar, contate o desenvolvedor.',
        ],
      })
    }
  }

  static async deleteAddress(req, res) {
    try {
      let response = null
      await prisma.$transaction(
        async (prisma) => {
          const id = req.body.id
          const produto = await prisma.produtos.findUnique({
            where: {
              id: id,
            },
            include: {
              picking: true,
            },
          })

          if (!produto) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Produto não encontrado no banco de dados.'],
              },
            }
            return
          }

          await prisma.produtos.update({
            where: { id: produto.id },
            data: {
              picking: {
                disconnect: true,
              },
            },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produto.tinyId,
            '',
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 201,
            body: { message: 'endereço deletado com sucesso!' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar remover o picking desse produto. Tente novamente e se o erro persistir, contate o desenvolvedor.',
        ],
      })
    }
  }

  static async changeAddress(req, res) {
    const { idProdutoAtual, idNovoProduto, endereco } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const produtoAtual = await prisma.produtos.update({
            where: { id: idProdutoAtual },
            data: { picking: { disconnect: true } },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produtoAtual.tinyId,
            '',
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          const pickingAtual = await prisma.pickings.findUnique({
            where: { endereco: endereco },
            include: {
              produtos: true,
            },
          })

          if (!pickingAtual) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Picking não encontrado.'],
              },
            }
            return
          }

          const novoProdutoAtualizado = await prisma.produtos.update({
            where: { id: idNovoProduto },
            data: {
              picking: {
                connect: { id: pickingAtual.id },
              },
            },
          })

          const novaAlteracaoTiny = await ProductFunctions.changeAddressTiny(
            novoProdutoAtualizado.tinyId,
            endereco,
          )

          if (novaAlteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 200,
            body: { message: 'Endereço alterado com sucesso.' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar alterar esses produtos no picking atual. Verifique no Tiny e no sistema a situação da localização desses produtos.',
        ],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async changeAddressShelf(req, res) {
    const { idNovoProduto, endereco } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const pickingAtual = await prisma.pickings.findUnique({
            where: { endereco: endereco },
            include: {
              produtos: true,
            },
          })

          if (!pickingAtual) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Picking não encontrado.'],
              },
            }
            return
          }

          const novoProdutoAtualizado = await prisma.produtos.update({
            where: { id: idNovoProduto },
            data: {
              picking: {
                connect: { id: pickingAtual.id },
              },
            },
          })

          const novaAlteracaoTiny = await ProductFunctions.changeAddressTiny(
            novoProdutoAtualizado.tinyId,
            endereco,
          )

          if (novaAlteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 200,
            body: { message: 'Endereço alterado com sucesso.' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar alterar esses produtos no picking atual. Verifique no Tiny e no sistema a situação da localização desses produtos.',
        ],
      })
    }
  }

  static async addressByIa(req, res) {
    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const { rua, display, coluna, idProduto } = req.body

          let tipoDisplay
          switch (display) {
            case 'CP':
              tipoDisplay = 'Caixa Preta'
              break
            case 'PT':
              tipoDisplay = 'Prateleira'
              break
            case 'PP':
              tipoDisplay = 'Porta Pallet'
              break
          }

          const filter = {
            rua: rua,
            tipo: tipoDisplay,
            isLocate: false,
          }

          let messageError = `Não existe mais ${tipoDisplay.toLowerCase()} disponível na rua ${rua}`
          let complementoMsgError = ''

          if (coluna) {
            filter.coluna = coluna
            complementoMsgError = ` ou na coluna ${coluna}.`
          }

          const endereco = await prisma.pickings.findFirst({
            where: filter,
            orderBy: {
              endereco: 'asc',
            },
          })

          messageError = messageError + complementoMsgError

          if (!endereco) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'no_address_empty',
                message: [messageError],
              },
            }
            return
          }

          const updatedProduct = await prisma.produtos.update({
            where: { id: idProduto },
            data: {
              picking: {
                connect: { id: endereco.id },
              },
            },
          })

          const novaAlteracaoTiny = await ProductFunctions.changeAddressTiny(
            updatedProduct.tinyId,
            endereco.endereco,
          )

          if (novaAlteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 201,
            body: { message: 'produto endereçado com sucesso !' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar endereçar esse produto com IA. Atualize a página e teste novamente !',
        ],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async tryAddressUnique(req, res) {
    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const { endereco, unique, typeUnique } = req.body

          const picking = await prisma.pickings.findUnique({
            where: { endereco: endereco },
          })

          if (!picking) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'picking_not_found',
                message: [
                  'Esse picking não foi encontrado. Escolha um picking válido ou solicite a criação dele.',
                ],
              },
            }
            return
          }

          if (picking.isLocate) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'picking_is_locate',
                message: ['Esse picking já tem um produto.'],
              },
            }
            return
          }

          const produto = await prisma.produtos.findUnique({
            where: { [typeUnique]: unique },
            include: {
              picking: true,
            },
          })

          if (!produto) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Produto não encontrado no banco de dados.'],
              },
            }
            return
          }

          await prisma.produtos.update({
            where: { id: produto.id },
            data: {
              picking: {
                connect: { id: picking.id },
              },
            },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produto.tinyId,
            picking.endereco,
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny.',
            })
          }

          response = {
            status: 201,
            body: { message: 'Produto endereçado com sucesso!' },
          }
        },
        {
          timeout: 60 * 60 * 1000, // 1 hora
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar endereçar esse produto. Atualize a página e teste novamente!',
        ],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async getColumnsWithFilters(req, res) {
    try {
      const { rua, tipo, display, espaco } = req.query

      const searchDisplay = []
      if (display) {
        if (display.includes('CP')) {
          searchDisplay.push('Caixa Preta')
        }

        if (display.includes('PT')) {
          searchDisplay.push('Prateleira')
        }

        if (display.includes('PP')) {
          searchDisplay.push('Porta Pallet')
        }
      }

      let searchEspaco = 'ambos'
      if (espaco) {
        if (espaco === 'sem_espaco') {
          searchEspaco = 'sem_espaco'
        }

        if (espaco === 'com_espaco') {
          searchEspaco = 'com_espaco'
        }

        if (espaco === 'ambos') {
          searchEspaco = 'ambos'
        }
      }

      const enderecos = await prisma.pickings.findMany({
        where: {
          rua: rua,
          ...(searchDisplay.length > 0 && {
            tipo: {
              in: searchDisplay,
            },
          }),
        },
        orderBy: {
          endereco: 'asc',
        },
      })

      const colunas = []
      for (const i of enderecos) {
        const hasColumn = colunas.find((item) => item.coluna === i.coluna)

        const displaysOcupados = enderecos.filter(
          (item) => item.rua === rua && item.coluna === i.coluna && item.isLocate,
        )

        const totalDisplays = enderecos.filter(
          (item) => item.rua === rua && item.coluna === i.coluna,
        )

        const temEspacoVazio = totalDisplays.length - displaysOcupados.length > 0

        const adicionarColuna = () => {
          colunas.push({
            rua: rua,
            coluna: i.coluna,
            tipo: 'Picking',
            display: i.tipo,
            espacoOcupado: displaysOcupados.length,
            totalDisplays: totalDisplays.length,
          })
        }

        if (!hasColumn) {
          if (searchEspaco === 'ambos') {
            adicionarColuna()
          } else if (searchEspaco === 'com_espaco' && temEspacoVazio) {
            adicionarColuna()
          } else if (searchEspaco === 'sem_espaco' && !temEspacoVazio) {
            adicionarColuna()
          }
        }
      }

      res.status(200).json({
        quantidades: await ProductsController.getQntColumnsWithFilters(
          tipo,
          display,
          espaco,
        ),
        colunas: colunas,
      })
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter os endereços. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async getItemsCaixaPreta(req, res) {
    try {
      const { rua, coluna } = req.query

      const displays = await prisma.pickings.findMany({
        where: {
          rua: rua,
          coluna: coluna,
        },
        include: {
          produtos: {
            select: {
              id: true,
              name: true,
              photo: true,
            },
          },
        },
        orderBy: {
          endereco: 'asc',
        },
      })

      res.status(200).json(displays)
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter os produtos. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async getQntColumnsWithFilters(tipo, display, espaco) {
    const ruas = ['A', 'B', 'C', 'D', 'E']

    const searchDisplay = []
    if (display) {
      if (display.includes('CP')) {
        searchDisplay.push('Caixa Preta')
      }
      if (display.includes('PT')) {
        searchDisplay.push('Prateleira')
      }
      if (display.includes('PP')) {
        searchDisplay.push('Porta Pallet')
      }
    }

    let searchEspaco = 'ambos'
    if (espaco) {
      if (espaco === 'sem_espaco') {
        searchEspaco = 'sem_espaco'
      }
      if (espaco === 'com_espaco') {
        searchEspaco = 'com_espaco'
      }
      if (espaco === 'ambos') {
        searchEspaco = 'ambos'
      }
    }

    const enderecos = await prisma.pickings.findMany({
      where: {
        rua: {
          in: ruas,
        },
        ...(searchDisplay.length > 0 && {
          tipo: {
            in: searchDisplay,
          },
        }),
      },
    })

    const colunasPorRua = {}

    for (const rua of ruas) {
      colunasPorRua[rua] = []
    }

    for (const i of enderecos) {
      const hasColumn = colunasPorRua[i.rua].some((item) => item.coluna === i.coluna)

      const displaysOcupados = enderecos.filter(
        (item) => item.rua === i.rua && item.coluna === i.coluna && item.isLocate,
      )

      const totalDisplays = enderecos.filter(
        (item) => item.rua === i.rua && item.coluna === i.coluna,
      )

      const temEspacoVazio = totalDisplays.length - displaysOcupados.length > 0

      const adicionarColuna = () => {
        colunasPorRua[i.rua].push({
          coluna: i.coluna,
          tipo: 'Picking',
          display: i.tipo,
          espacoOcupado: displaysOcupados.length,
          totalDisplays: totalDisplays.length,
        })
      }

      if (!hasColumn) {
        if (searchEspaco === 'ambos') {
          adicionarColuna()
        } else if (searchEspaco === 'com_espaco' && temEspacoVazio) {
          adicionarColuna()
        } else if (searchEspaco === 'sem_espaco' && !temEspacoVazio) {
          adicionarColuna()
        }
      }
    }

    const resultado = {}
    for (const rua of ruas) {
      resultado[rua] = colunasPorRua[rua].length
    }

    return resultado
  }

  static async deleteAddressProduct(req, res) {
    try {
      let response = null
      const id = req.body.id

      await prisma.$transaction(
        async (prisma) => {
          const produtoAtual = await prisma.produtos.update({
            where: { id: id },
            data: { picking: { disconnect: true } },
          })

          const alteracaoTiny = await ProductFunctions.changeAddressTiny(
            produtoAtual.tinyId,
            '',
          )

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados do produto no Tiny',
            })
          }

          response = {
            status: 200,
            body: { message: 'Endereço alterado com sucesso.' },
          }
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar remover o produto de seu endereço atual. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async inverteTravaEnderecos(req, res) {
    const { idEndereco, trava } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const endereco = await prisma.pickings.findUnique({
            where: {
              id: idEndereco,
            },
            include: {
              produtos: true,
            },
          })

          if (!endereco) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Endereço não encontrado no sistema.'],
              },
            }
            return
          }

          if (endereco.produtos.length >= endereco.limit && !trava) {
            response = {
              status: 500,
              body: {
                erroCode: '500',
                erroType: 'not_limit',
                message: [
                  'Esse endereço já está no limite de produtos cadastrados, por tanto ele não pode ser desbloqueado.',
                ],
              },
            }
            return
          }

          if (trava) {
            await prisma.pickings.update({
              where: {
                id: idEndereco,
              },
              data: {
                isLocate: true,
              },
            })

            response = {
              status: 200,
              body: { message: 'Endereço bloqueado com sucesso.' },
            }
            return
          }

          if (!trava) {
            await prisma.pickings.update({
              where: {
                id: idEndereco,
              },
              data: {
                isLocate: false,
              },
            })

            response = {
              status: 200,
              body: { message: 'Endereço desbloqueado com sucesso.' },
            }
            return
          }
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar remover o produto de seu endereço atual. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async changeLimitAddress(req, res) {
    const { idEndereco, newLimit } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const endereco = await prisma.pickings.findUnique({
            where: {
              id: idEndereco,
            },
            include: {
              produtos: true,
            },
          })

          if (!endereco) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Endereço não encontrado no sistema.'],
              },
            }
            return
          }

          if (endereco.tipo === 'Caixa Preta') {
            response = {
              status: 501,
              body: {
                erroCode: '501',
                erroType: 'impossible_change',
                message: [
                  'O limite de produtos dentro de uma caixa preta não pode ser diferente de 1.',
                ],
              },
            }
            return
          }

          if (endereco.produtos.length > newLimit) {
            response = {
              status: 501,
              body: {
                erroCode: '501',
                erroType: 'limit_too_low',
                message: [
                  'Você não pode definir um limite menor do que a quantidade de produtos que estão nesse endereço.',
                ],
              },
            }
            return
          }

          await prisma.pickings.update({
            where: {
              id: idEndereco,
            },
            data: {
              limit: newLimit,
              isLocate: !(newLimit > endereco.produtos.length),
            },
          })

          response = {
            status: 200,
            body: {
              message: 'Limite de produtos do endereço alterado com sucesso.',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar remover o produto de seu endereço atual. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async deleteDisplayAddress(req, res) {
    const { displayId } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const endereco = await prisma.pickings.findUnique({
            where: {
              id: displayId,
            },
            include: {
              produtos: true,
            },
          })

          if (!endereco) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Endereço não encontrado no sistema.'],
              },
            }
            return
          }

          const itemsTiny = []
          const productsIds = []
          for (const produto of endereco.produtos) {
            itemsTiny.push({ id: produto.tinyId, address: '' })
            productsIds.push(produto.id)
          }

          const alteracaoTiny = await ProductFunctions.changeManyAddressTiny(itemsTiny)

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados dos produtos no Tiny',
            })
          }

          await Promise.all(
            productsIds.map(async (produtoId) => {
              return prisma.produtos.update({
                where: { id: produtoId },
                data: {
                  picking: {
                    disconnect: true,
                  },
                },
              })
            }),
          )

          await prisma.pickings.delete({
            where: {
              id: displayId,
            },
          })

          response = {
            status: 200,
            body: {
              message: 'Limite de produtos do endereço alterado com sucesso.',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar excluir o endereço. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async addNewDisplay(req, res) {
    try {
      const { tipo, coluna, rua, siglaTipo } = req.body

      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const local = await prisma.pickings.findMany({
            where: {
              rua: rua,
              coluna: coluna,
            },
            orderBy: {
              endereco: 'asc',
            },
          })

          const lastRecord = local[local.length - 1]
          const numero = Number.parseInt(lastRecord.display) + 1
          const newEndereco = `${rua}-${coluna}-${siglaTipo}-${numero.toString().padStart(2, '0')}`

          const limitDisplay = tipo === 'Prateleira' ? 3 : 1

          const newPicking = await prisma.pickings.create({
            data: {
              rua: rua,
              coluna: coluna,
              display: numero.toString().padStart(2, '0'),
              tipo: tipo,
              isLocate: false,
              limit: limitDisplay,
              endereco: newEndereco,
            },
          })

          response = {
            status: 200,
            body: {
              message: 'Novo display adcionado com sucesso !',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar adcionar o display solicidato. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async addNewCollum(req, res) {
    const { tipo, street, collumn, qntCP, qntPT, limitPT } = req.body

    try {
      let response = null

      let tipoDisplay
      switch (tipo) {
        case 'CP':
          tipoDisplay = 'Caixa Preta'
          break
        case 'PT':
          tipoDisplay = 'Prateleira'
          break
        case 'PP':
          tipoDisplay = 'Porta Pallet'
          break
      }

      const dataArray = []
      if (tipo === 'CP') {
        if (Number.parseInt(qntCP) > 28) {
          return res.status(501).json({
            erroCode: '501',
            erroType: 'most_than_28',
            message: [
              'Uma coluna suporta até 28 caixas pretas. Mude a quantidade e tente novamente',
            ],
          })
        }

        for (let i = 1; i <= Number.parseInt(qntCP); i++) {
          const newEndereco = `${street}-${collumn}-${tipo}-${i.toString().padStart(2, '0')}`

          dataArray.push({
            rua: street,
            coluna: collumn,
            display: i.toString().padStart(2, '0'),
            tipo: tipoDisplay,
            isLocate: false,
            limit: 1,
            endereco: newEndereco,
          })
        }
      }

      if (tipo === 'PT') {
        if (Number.parseInt(qntPT) > 10) {
          return res.status(501).json({
            erroCode: '501',
            erroType: 'most_than_10',
            message: [
              'Uma coluna suporta até 10 prateleiras. Mude a quantidade e tente novamente',
            ],
          })
        }

        for (let i = 1; i <= Number.parseInt(qntPT); i++) {
          const newEndereco = `${street}-${collumn}-${tipo}-${i.toString().padStart(2, '0')}`

          dataArray.push({
            rua: street,
            coluna: collumn,
            display: i.toString().padStart(2, '0'),
            tipo: tipoDisplay,
            isLocate: false,
            limit: Number.parseInt(limitPT),
            endereco: newEndereco,
          })
        }
      }

      if (tipo === 'PP') {
        if (street !== 'D' && street !== 'E') {
          return res.status(501).json({
            erroCode: '501',
            erroType: 'wrong_street',
            message: [`Não é possível criar colunas de Porta Pallets na rua ${street}`],
          })
        }

        for (let i = 1; i <= 2; i++) {
          const newEndereco = `${street}-${collumn}-${tipo}-${i.toString().padStart(2, '0')}`

          dataArray.push({
            rua: street,
            coluna: collumn,
            display: i.toString().padStart(2, '0'),
            tipo: tipoDisplay,
            isLocate: false,
            limit: 1,
            endereco: newEndereco,
          })
        }
      }

      await prisma.$transaction(
        async (prisma) => {
          const ifCollumnExists = await prisma.pickings.findMany({
            where: {
              rua: street,
              coluna: collumn,
            },
          })

          if (ifCollumnExists.length > 0) {
            response = {
              status: 501,
              body: {
                erroCode: '501',
                erroType: 'collumn_exists',
                message: [
                  'Essa coluna já existe. Por favor reveja as informações e tente novamente !',
                ],
              },
            }
            return
          }

          const newPicking = await prisma.pickings.createMany({
            data: dataArray,
          })

          response = {
            status: 200,
            body: {
              message: 'Novo display adcionado com sucesso !',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      console.log('error: ', error)
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar criar a coluna socilitada. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async deleteCollumAddress(req, res) {
    const { rua, coluna } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const endereco = await prisma.pickings.findMany({
            where: {
              rua: rua,
              coluna: coluna,
            },
            include: {
              produtos: true,
            },
          })

          if (!endereco.length > 0) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Coluna não encontrada no sistema'],
              },
            }
            return
          }

          const produtosTinyApagar = []
          for (const address of endereco) {
            produtosTinyApagar.push(...address.produtos)
          }

          const itemsTiny = []
          const productsIds = []
          for (const produto of produtosTinyApagar) {
            itemsTiny.push({ id: produto.tinyId, address: '' })
            productsIds.push(produto.id)
          }

          const alteracaoTiny = await ProductFunctions.changeManyAddressTiny(itemsTiny)

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados dos produtos no Tiny',
            })
          }

          await Promise.all(
            productsIds.map(async (produtoId) => {
              return prisma.produtos.update({
                where: { id: produtoId },
                data: {
                  picking: {
                    disconnect: true,
                  },
                },
              })
            }),
          )

          await prisma.pickings.deleteMany({
            where: {
              rua: rua,
              coluna: coluna,
            },
          })

          response = {
            status: 200,
            body: {
              message: 'Coluna deletada com sucesso !',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar excluir a coluna. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async cleanCollumAddress(req, res) {
    const { rua, coluna } = req.body

    try {
      let response = null

      await prisma.$transaction(
        async (prisma) => {
          const endereco = await prisma.pickings.findMany({
            where: {
              rua: rua,
              coluna: coluna,
            },
            include: {
              produtos: true,
            },
          })

          if (!endereco.length > 0) {
            response = {
              status: 404,
              body: {
                erroCode: '404',
                erroType: 'not_found',
                message: ['Coluna não encontrada no sistema'],
              },
            }
            return
          }

          const produtosTinyApagar = []
          for (const address of endereco) {
            produtosTinyApagar.push(...address.produtos)
          }

          const itemsTiny = []
          const productsIds = []
          for (const produto of produtosTinyApagar) {
            itemsTiny.push({ id: produto.tinyId, address: '' })
            productsIds.push(produto.id)
          }

          const alteracaoTiny = await ProductFunctions.changeManyAddressTiny(itemsTiny)

          if (alteracaoTiny.data.retorno.status !== 'OK') {
            throw new UserError({
              erroStatus: 400,
              type: 'user',
              erroCode: '400',
              erroType: 'tiny_error',
              message: 'Ocorreu um erro ao atualizar os dados dos produtos no Tiny',
            })
          }

          await Promise.all(
            productsIds.map(async (produtoId) => {
              return prisma.produtos.update({
                where: { id: produtoId },
                data: {
                  picking: {
                    disconnect: true,
                  },
                },
              })
            }),
          )

          response = {
            status: 200,
            body: {
              message: 'Coluna esvaziada com sucesso !',
            },
          }
          return
        },
        {
          timeout: 60 * 60 * 1000,
        },
      )

      if (response) {
        return res.status(response.status).json(response.body)
      }
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus || 400).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar esvaziar a coluna. Atualize a página e tente novamente!',
        ],
      })
    }
  }

  static async addTimePreco(req, res) {
    try {
      const { dia, price, hourAction, ids } = req.body

      const [hour, minute] = hourAction.split(':').map(Number)

      const dateTime = new Date(Date.UTC(2000, 0, 1, hour, minute))

      dateTime.setSeconds(0)

      await prisma.$transaction(async (prisma) => {
        const produtos = await prisma.produtos.findMany({
          where: {
            id: {
              in: ids,
            },
          },
          include: {
            timePrecos: true,
          },
        })

        const produtosCriaveis = [...ids]
        const horasDeletaveis = []

        for (const produto of produtos) {
          for (const hora of produto.timePrecos) {
            const date1 = new Date(hora.date)
            const date2 = new Date(dateTime)
            if (
              Number.parseInt(hora.action) === Number.parseInt(price) &&
              Number.parseInt(hora.day) === Number.parseInt(dia) &&
              date1.getTime() === date2.getTime()
            ) {
              const index = produtosCriaveis.indexOf(produto.id)
              if (index !== -1) {
                produtosCriaveis.splice(index, 1)
              }
            }

            if (
              !(Number.parseInt(hora.action) === Number.parseInt(price)) &&
              Number.parseInt(hora.day) === Number.parseInt(dia) &&
              date1.getTime() === date2.getTime()
            ) {
              horasDeletaveis.push(hora.id)
            }
          }
        }

        const horaAlteracaoData = produtosCriaveis.map((produtoId) => {
          return {
            action: price,
            date: dateTime,
            day: Number.parseInt(dia),
            produtoId: produtoId,
          }
        })

        if (horasDeletaveis.length > 0) {
          await prisma.horaAlteracao.deleteMany({
            where: {
              id: {
                in: horasDeletaveis,
              },
            },
          })
        }

        const quantidade = await prisma.horaAlteracao.count({
          where: {
            day: Number.parseInt(dia),
            date: dateTime,
          },
        })

        if (quantidade >= 100) {
          throw new UserError({
            erroStatus: 400,
            type: 'user',
            erroCode: '400',
            erroType: 'quantity_error',
            message:
              'Esse horário já está completamente ocupado. Cada intervalo de 20 minutos suporta apenas 100 produtos. Por favor, escolha outro horário',
          })
        }

        if (horaAlteracaoData.length > 0) {
          await prisma.horaAlteracao.createMany({
            data: horaAlteracaoData,
          })
        }
      })

      res.status(201).json({ message: 'ok' }).end()
    } catch (error) {
      if (error instanceof UserError) {
        return res.status(error.erroStatus).json({
          erroCode: error.erroCode,
          erroType: error.erroType,
          message: [error.message],
        })
      }

      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_failed',
        message: [
          'Ocorreu um erro ao tentar adicionar o time de preços nesses produtos. Tente novamente mais tarde !',
        ],
      })
    }
  }

  static async removeTimePreco(req, res) {
    try {
      const ids = req.body.ids

      await prisma.horaAlteracao.deleteMany({
        where: {
          produtoId: {
            in: ids,
          },
        },
      })

      res.status(201).json({ message: 'ok' }).end()
    } catch (error) {
      console.log(error)
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar excluir o time de preços desses produtos. Tente novamente mais tarde !',
        ],
      })
    }
  }

  static async getProductsWithFiltersTime(req, res) {
    const { pageSize, page, value, order, refine } = req.body

    try {
      let brandIds = []
      if (refine === 'brand') {
        const brands = await prisma.marcas.findMany({
          where: {
            name: {
              contains: value,
            },
          },
        })

        brandIds = brands.map((brand) => brand.id)
      }

      let whereCondition
      switch (refine) {
        case 'sku':
          whereCondition = { sku: { equals: value } }
          break
        case 'skup':
          whereCondition = { sku: { contains: value } }
          break
        case 'gtin':
          whereCondition = { gtin: { equals: value } }
          break
        case 'brand':
          whereCondition = {
            brandId: {
              in: brandIds,
            },
          }
          break
        case 'name':
          whereCondition = { name: { contains: value } }
          break
        case 'default':
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
          break
        default:
          whereCondition = {
            OR: [
              { gtin: { contains: value } },
              { name: { contains: value } },
              { sku: { equals: value } },
            ],
          }
      }

      const skip = (page - 1) * pageSize

      const totalProdutos = await prisma.produtos.count({
        where: {
          ...whereCondition,
          timePrecos: {
            some: {},
          },
        },
      })

      const produtos = await prisma.produtos.findMany({
        where: {
          ...whereCondition,
          timePrecos: {
            some: {},
          },
        },
        orderBy: {
          [order]: order === 'updatedAt' || order === 'createdAt' ? 'desc' : 'asc',
        },
        skip: skip,
        take: pageSize,
        include: {
          picking: true,
          brand: true,
          timePrecos: {
            orderBy: [{ day: 'asc' }, { date: 'asc' }],
          },
        },
      })

      const resultado = {
        totalProdutos: totalProdutos,
        produtosFiltrados: produtos,
      }

      res.status(200).json(resultado)
    } catch (error) {
      console.log('erros: ', error)
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar encontrar os produtos'],
      })
    } finally {
      await prisma.$disconnect()
    }
  }

  static async removeTimePrecoById(req, res) {
    try {
      const id = req.body.id

      await prisma.horaAlteracao.delete({
        where: {
          id: id,
        },
      })

      res.status(201).json({ message: 'ok' }).end()
    } catch (error) {
      console.log(error)
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: ['Ocorreu um erro ao tentar excluir o time. Por favor tente novamente!'],
      })
    }
  }

  static async addDesmembOpt(req, res) {
    try {
      const { tipo, name } = req.body

      const path = './configs/products/products.json'

      const data = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(data)

      const existsTipo = jsonData.desmembramento.find((item) => item.value === tipo)

      if (existsTipo) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'tipo_exists',
          message: ['Esse tipo já existe no banco de dados.'],
        })
        return
      }

      const existsName = jsonData.desmembramento.find((item) => item.name === name)

      if (existsName) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'tipo_exists',
          message: ['Esse nome já existe no banco de dados.'],
        })
        return
      }

      jsonData.desmembramento.push({ value: tipo, name: name })

      await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

      res.status(201).json({ message: 'ok' })
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: [
          'Ocorreu um erro ao tentar armazenar o novo tipo ao banco de dados. Por favor tente novamente.',
        ],
      })
    }
  }

  static async getDesmembOpt(req, res) {
    try {
      const path = './configs/products/products.json'

      const data = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(data)

      res.status(201).json({ tipos: jsonData.desmembramento })
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: [
          'Ocorreu um erro ao tentar obter a lista de tipos. Por favor tente novamente !',
        ],
      })
    }
  }

  static async getProdutosLimit(req, res) {
    try {
      const value = req.body.value
      const id = req.body.id

      if (id) {
        const totalProdutos = await prisma.produtos.findUnique({
          where: {
            id: id,
          },
          select: {
            id: true,
            name: true,
            gtin: true,
            photo: true,
            sku: true,
          },
        })

        res.status(201).json(totalProdutos)
        return
      }

      const palavras = value
        .toLowerCase()
        .split(/\s+/)
        .filter((palavra) => palavra.length >= 2)

      const whereCondition = {
        AND: palavras.map((palavra) => ({
          OR: [
            { gtin: { contains: palavra } },
            { name: { contains: palavra } },
            { sku: { contains: palavra } },
          ],
        })),
      }

      const totalProdutos = await prisma.produtos.findMany({
        where: whereCondition,
        take: 15,
        select: {
          id: true,
          name: true,
          gtin: true,
          photo: true,
          sku: true,
        },
      })

      const produtosOrdenados = totalProdutos
        .map((produto) => ({
          ...produto,
          similaridade: calcularSimilaridade(produto, value),
        }))
        .sort((a, b) => b.similaridade - a.similaridade)
        .slice(0, 15)

      res.status(201).json(produtosOrdenados)
    } catch (error) {
      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: [
          'Ocorreu um erro ao tentar obter a lista de produtos para a sugestão. Por favor recarregue a página.',
        ],
      })
    }
  }

  static async getComprasWithFilters(req, res) {
    const id = req.body.id
    const dateCompra = req.body.dateCompra
    let dateDe = req.body.dateDe
    let dateAte = req.body.dateAte

    let compras = []
    let quantidade = 0
    let primeiraCompra = false

    if (dateCompra === 'all') {
      compras = await prisma.produtosOnCompras.findMany({
        where: {
          produtoId: id,
        },
        include: {
          compra: {
            include: {
              fornecedor: true,
            },
          },
        },
        orderBy: {
          compra: {
            dataEmissao: 'desc',
          },
        },
      })

      if (compras.length > 0) {
        primeiraCompra = compras[compras.length - 1].compra.dataEmissao
      }

      compras.map((item) => {
        quantidade += item.quantity
      })
    }

    if (dateCompra === 'last') {
      const ultimaCompra = await prisma.$queryRaw`
        SELECT c.dataEmissao
        FROM ProdutosOnCompras poc
        JOIN Compras c ON c.id = poc.compraId
        WHERE poc.produtoId = ${id}
        ORDER BY c.dataEmissao DESC
        LIMIT 1
        
    `

      if (ultimaCompra.length > 0) {
        const dataEmissaoMaisRecente = ultimaCompra[0].dataEmissao

        compras = await prisma.compras.findMany({
          where: {
            dataEmissao: dataEmissaoMaisRecente,
            ProdutosOnCompras: {
              some: {
                produtoId: id,
              },
            },
          },
          include: {
            ProdutosOnCompras: true,
          },
          orderBy: {
            dataEmissao: 'desc',
          },
        })

        primeiraCompra = compras[compras.length - 1].dataEmissao

        compras.map((compra) => {
          compra.ProdutosOnCompras.map((item) => {
            if (item.produtoId === id) {
              quantidade += item.quantity
            }
          })
        })
      }
    }

    if (dateCompra === 'period') {
      dateDe = new Date(dateDe).toISOString()
      dateAte = new Date(dateAte).toISOString()

      compras = await prisma.compras.findMany({
        where: {
          dataEmissao: {
            gte: dateDe,
            lte: dateAte,
          },
          ProdutosOnCompras: {
            some: {
              produtoId: id,
            },
          },
        },
        include: {
          ProdutosOnCompras: true,
        },
        orderBy: {
          dataEmissao: 'desc',
        },
      })

      if (compras.length > 0) {
        primeiraCompra = compras[compras.length - 1].dataEmissao
      }

      compras.map((compra) => {
        compra.ProdutosOnCompras.map((item) => {
          if (item.produtoId === id) {
            quantidade += item.quantity
          }
        })
      })
    }

    res.status(201).json({
      compras: compras.length,
      quantidade: quantidade,
      primeiraCompra,
    })
  }

  static async getVendasWithFilters(req, res) {
    const id = req.body.id
    const dateCompra = req.body.dateCompra
    let dateDe = req.body.dateDe
    let dateAte = req.body.dateAte
    let dateOn = req.body.dateOn

    let compras = []
    let quantidade = 0

    if (dateCompra === 'all' || (dateCompra === 'baseOn' && !dateOn)) {
      compras = await prisma.produtosOnVendas.findMany({
        where: {
          produtoId: id,
        },
        include: {
          venda: true,
        },
      })

      compras.map((item) => {
        quantidade += item.quantity
      })
    }

    if (dateCompra === 'baseOn' && dateOn) {
      dateOn = new Date(dateOn).toISOString()

      compras = await prisma.vendas.findMany({
        where: {
          dataEmissao: {
            gte: dateOn,
          },
          ProdutosOnVendas: {
            some: {
              produtoId: id,
            },
          },
        },
        include: {
          ProdutosOnVendas: true,
        },
      })

      if (compras) {
        compras.map((compra) => {
          compra.ProdutosOnVendas.map((item) => {
            if (item.produtoId === id) {
              quantidade += item.quantity
            }
          })
        })
      }
    }

    if (dateCompra === 'period') {
      dateDe = new Date(dateDe).toISOString()
      dateAte = new Date(dateAte).toISOString()

      compras = await prisma.vendas.findMany({
        where: {
          dataEmissao: {
            gte: dateDe,
            lte: dateAte,
          },
          ProdutosOnVendas: {
            some: {
              produtoId: id,
            },
          },
        },
        include: {
          ProdutosOnVendas: true,
        },
        orderBy: {
          dataEmissao: 'desc',
        },
      })

      compras.map((compra) => {
        compra.ProdutosOnVendas.map((item) => {
          if (item.produtoId === id) {
            quantidade += item.quantity
          }
        })
      })
    }

    res.status(201).json({
      compras: compras.length,
      quantidade: quantidade,
    })
  }
}

class UserError extends Error {
  constructor({ type, erroCode, erroType, message, erroStatus }) {
    super(message)
    this.type = type
    this.erroCode = erroCode
    this.erroType = erroType
    this.erroStatus = erroStatus
  }
}

function hasDuplicateCNPJs(array) {
  const cnpjs = array.map((item) => item.cpfCnpj)
  const uniqueCNPJs = new Set(cnpjs)

  return uniqueCNPJs.size !== cnpjs.length
}

function compareArrays(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return true
  }

  for (let i = 0; i < arr1.length; i++) {
    const obj1 = arr1[i]
    const obj2 = arr2[i]

    for (const key in obj1) {
      if (obj1[key] !== obj2[key]) {
        return true
      }
    }

    for (const key in obj2) {
      if (obj1[key] !== obj2[key]) {
        return true
      }
    }
  }

  return false
}

function calcularSimilaridade(produto, value) {
  const campos = ['gtin', 'name', 'sku']
  let similaridade = 0

  campos.forEach((campo) => {
    if (produto[campo]?.includes(value)) {
      similaridade += (produto[campo].match(new RegExp(value, 'g')) || []).length
    }
  })

  return similaridade
}

// =SEERRO(SUBSTITUIR(ARRED(PROCV(B2;'[Nova Macro (4).xlsm]Planilha1'!$A$1:$C$2720;3;FALSO);2);",";".";1);0)
