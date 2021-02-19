const socketio = require('socket.io');
const socketMain = require('./socketMain');
const express = require('express');
const app = express();
const { reactUrl } = require('./secrets');
const server = require('http').createServer(app);

const clientURL = process.env.REACT_URL || 'http://localhost:8080';
const io = require('socket.io')(server, {
  cors: {
    origin: clientURL
  }
});

const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => console.log(`Master listening on ${PORT}...`))
  io.on('connection', socket => {
    socketMain(io, socket);
  });

