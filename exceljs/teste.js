const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Array de arrays com SKU e ID da marca
const data = [
  ['LB-02855', '44'],
  ['LB-02638', '77'],
  ['LB-01785', '68'],
  ['LB-02694', '104'],
  ['LB-02856', '130'],
  ['LB-00262', '44'],
  ['LB-02104', '54'],
  ['LB-02381', '66'],
  ['LB-02792', '83'],
  ['LB-02096-2', '143'],
  ['LB-02857', '44'],
  ['LB-02417', '20'],
  ['LB-01112', '143'],
  ['LB-02859', '1'],
  ['LB-02844', '44'],
  ['LB-02082', '163'],
  ['LB-02037', '126'],
  ['LB-01815', '164'],
  ['LB-02039', '90'],
  ['LB-02842', '44'],
  ['LB-02484', '28'],
  ['LB-01309', '68'],
  ['LB-02377', '95'],
  ['LB-02096-3', '143'],
  ['LB-02013', '126'],
  ['LB-01345', '151'],
  ['LB-02697', '69'],
  ['LB-01941', '35'],
  ['LB-02029', '126'],
  ['LB-02416', '20'],
  ['LB-02114', '165'],
  ['LB-01396', '19'],
  ['LB-02725', '97'],
  ['LB-01790', '166'],
  ['LB-02681', '74'],
  ['LB-02053', '10'],
  ['LB-02635', '154'],
  ['LB-02384', '7'],
  ['LB-01768', '66'],
  ['LB-02064', '161'],
  ['LB-02840', '44'],
  ['LB-01794', '39'],
  ['LB-02670', '1'],
  ['LB-02698', '97'],
  ['LB-02380', '66'],
  ['LB-00491', '43'],
  ['LB-02096-4', '143'],
  ['LB-02858', '1'],
  ['LB-00883', '69'],
  ['LB-02069', '155'],
  ['LB-00260', '44'],
  ['LB-02096-1', '143'],
  ['LB-02376', '66'],
  ['LB-01758', '119'],
  ['LB-01814', '123'],
  ['LB-02050', '104'],
  ['LB-02860', '40'],
  ['LB-02841', '44'],
  ['LB-01789', '51'],
  ['LB-01925', '114'],
  ['LB-02801', '20'],
  ['LB-01770', '104'],
  ['LB-02083', '163'],
  ['LB-02843', '44'],
  ['LB-02014', '126'],
]

const updateProducts = async () => {
  for (const [sku, brandId] of data) {
    try {
      // Atualiza o produto com o id da marca
      const updatedProduct = await prisma.produtos.update({
        where: { sku: sku },
        data: { brandId: Number.parseInt(brandId) },
      })

      console.log(`Produto ${sku} atualizado com a marca ${brandId}`)
    } catch (error) {
      console.error(`Erro ao atualizar o produto ${sku}:`, error)
    }
  }

  await prisma.$disconnect()
}

updateProducts().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
