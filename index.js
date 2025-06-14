const express = require('express')
const app = express()
require('dotenv').config()
const http = require('node:http')
const socketIo = require('socket.io')
const session = require('express-session')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('node:path')
const bodyParser = require('body-parser')

const server = http.createServer(app)

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://10.0.0.166:3000',
      'https://myappone.com.br',
      'http://myappone.com.br:21113',
      'https://api.tiny.com.br',
    ], // Lista de origens permitidas
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-socket-id'],
    credentials: true, // Para permitir cookies e autenticação
  }),
)

// Define o diretório da pasta 'public' como estático
const baseDir = path.join(__dirname, 'public')
app.use(express.static(baseDir))

module.exports = io = socketIo(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://10.0.0.166:3000',
      'https://myappone.com.br',
      'http://myappone.com.br:21113',
      'https://api.tiny.com.br',
    ], // Lista de origens permitidas
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-socket-id'],
    credentials: true, // Para permitir cookies e autenticação
  },
})

require('./websocket/websocket')
const UserRoutes = require('./routes/UserRoutes')
const ProductsRoutes = require('./routes/ProductsRoutes')
const WebhooksRoutes = require('./routes/WebhooksRoutes')
const ApiMercadoLivreRoutes = require('./routes/ApiMercadoLivreRoutes')
const EcommerceRoutes = require('./routes/EcommerceRoutes')
const ApiGoogleSheetsRoutes = require('./routes/ApiGoogleSheetsRoutes')
const ApiMagaluRoutes = require('./routes/ApiMagaluRoutes')
const ApiTinyRoutes = require('./routes/ApiTinyRoutes')
const ApiShopeeRoutes = require('./routes/ApiShopeeRoutes')

app.use(cookieParser())
app.use(bodyParser.json({ limit: '50mb' }))

app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET, // Substitua por uma chave secreta segura
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true, // Garante que o cookie não seja acessível via JavaScript
      secure: process.env.AMBIENT === 'PRODUCTION', // Defina como true em produção quando usar HTTPS
      ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
      maxAge: 24 * 60 * 60 * 1000, // Opcional: define o tempo de vida do cookie em milissegundos
    },
  }),
)

// config json
app.use(express.json())

app.use('/users', UserRoutes)
app.use('/api/products', ProductsRoutes)
app.use('/api/webhooks', WebhooksRoutes)
app.use('/api/api-ml', ApiMercadoLivreRoutes)
app.use('/api/api-gs', ApiGoogleSheetsRoutes)
app.use('/api/api-mgl', ApiMagaluRoutes)
app.use('/api/api-tiny', ApiTinyRoutes)
app.use('/api/api-shopee', ApiShopeeRoutes)
app.use('/api/ecommerce', EcommerceRoutes)

//timers
require('./timers/atualizar_planilha/timer')
require('./timers/regra_da_marca/timer')
require('./timers/tiny/refresh_token/timer')
require('./timers/tiny/compras/timer')
require('./timers/tiny/processar_notas/timer')
require('./timers/tiny/emitir_notas/timer')
require('./timers/shopee/refresh_token/timer')

server.listen(process.env.PORT, () => {
  console.log('O servidor está rodando na porta', process.env.PORT)
})
