const router = require('express').Router()
const WebhooksController = require('../controllers/WebhooksController')

router.post('/tiny-produtos', WebhooksController.TinyProdutos)
router.post('/notas-fiscais-tiny', WebhooksController.notasFiscaisTiny)
router.post('/tiny-teste', WebhooksController.rotaTeste)

module.exports = router
