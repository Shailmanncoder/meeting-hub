const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');

// 1. Strict Path Setting
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// DEBUGGING: Print all files the server can see
console.log("--- FILE CHECK ---");
try {
  console.log("Files in root:", fs.readdirSync(__dirname));
  console.log("Files in views:", fs.readdirSync(path.join(__dirname, 'views')));
} catch (error) {
  console.log("Error reading files:", error.message);
}
console.log("------------------");

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get('/:room', (req, res) => {
  // CHANGED: Now rendering 'meeting' instead of 'room'
  res.render('meeting', { roomId: req.params.room });
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