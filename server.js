const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');

app.set('view engine', 'ejs');
app.use(express.static('public'));

// 1. Redirect root URL to a random Room ID
app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

// 2. Render the room
app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

// 3. Socket.io Connection
io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    // Chat Message
    socket.on('message', (message) => {
      io.to(roomId).emit('createMessage', message, userId);
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

// 4. Start Server (Dynamic Port for Cloud)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Meeting Hub running on port ${PORT}`);
});