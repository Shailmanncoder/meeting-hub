const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path'); // IMPORTANT: Imports the path tool

// --- THE FIX IS HERE ---
// 1. Force Express to look in the exact 'views' folder using absolute paths
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 2. Force Express to look in the exact 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
// -----------------------

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get('/:room', (req, res) => {
  // 3. Make sure the file in your 'views' folder is named 'room.ejs' (lowercase)
  res.render('room', { roomId: req.params.room });
});

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    socket.on('message', (message) => {
      io.to(roomId).emit('createMessage', message, userId);
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});