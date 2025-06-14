const io = require('../index')
const jwt = require('jsonwebtoken')
const fs = require('node:fs')
const path = require('node:path')
const cookieParser = require('cookie-parser')

const userSocketFile = path.resolve(__dirname, 'userSocketMap.json')

let userSocketMap = {}

// Ler o arquivo userSocketMap.json ao iniciar
try {
  const data = fs.readFileSync(userSocketFile, 'utf8')
  userSocketMap = JSON.parse(data)
} catch (err) {
  console.error('Erro ao ler o arquivo:', err)
}

// Função para salvar o userSocketMap no arquivo
const saveUserSocketMap = () => {
  try {
    fs.writeFileSync(userSocketFile, JSON.stringify(userSocketMap, null, 2), 'utf8')
  } catch (err) {
    console.error('Erro ao escrever no arquivo:', err)
  }
}

const addUserSocket = (userId, socketId, token) => {
  userSocketMap[socketId] = { socketId, token }
  saveUserSocketMap()
}

const removeUserSocket = (socketId) => {
  delete userSocketMap[socketId]
  saveUserSocketMap()
}

io.on('connection', (socket) => {
  const token = socket.handshake.auth.token

  const cookies = socket.request.headers.cookie

  try {
    const parsedCookies = cookieParser.JSONCookies(require('cookie').parse(cookies))
    const myCookieValue = parsedCookies.token

    setTimeout(() => {
      addUserSocket(socket.id, socket.id, myCookieValue)
    }, 1000)

    socket.on('disconnect', () => {
      removeUserSocket(socket.id)
    })
  } catch (error) {}
})

function deslogarUsuario(session, token) {
  // const usuarioAtual = userSocketMap[session]

  const paginas = Object.values(userSocketMap).filter((user) => user.token === session)
  if (paginas) {
    for (const pagina of paginas) {
      io.to(pagina.socketId).emit('end', 'Algum usuário acessou sua conta.')
      removeUserSocket(pagina.socketId)
    }
  }
}

function enviarProgresso(session, percent, message = false) {
  const usuarioAtual = userSocketMap[session]

  if (usuarioAtual) {
    io.to(usuarioAtual.socketId).emit('percent', {
      percent: percent,
      ...(message ? { message: message } : {}),
    })
  }
}

module.exports = { deslogarUsuario, enviarProgresso }
