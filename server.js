const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const fs = require('fs');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Home Page
app.get('/', (req, res) => {
    res.render('home');
});

// 2. API: Generate Link (NEW)
app.get('/api/new-room', (req, res) => {
    res.json({ roomId: uuidV4() });
});

// 3. Meeting Room
app.get('/:room', (req, res) => {
    res.render('meeting', { roomId: req.params.room });
});

// 4. Socket Logic (Waiting Room & Chat)
const roomHosts = {};

io.on('connection', socket => {
    socket.on('join-room-init', (roomId, name, isHost, peerId) => {
        socket.join(roomId);
        if (isHost === 'true') {
            roomHosts[roomId] = socket.id;
            socket.emit('entry-granted'); 
            socket.to(roomId).emit('user-connected', peerId, name);
        } else {
            const hostSocket = roomHosts[roomId];
            if (hostSocket) {
                io.to(hostSocket).emit('request-entry', { socketId: socket.id, name, peerId });
            } else {
                // No host found? Let's just let them in for now (or show "Waiting for host")
                // For this version: Auto-allow if no host, or make them wait.
                // Let's auto-allow to prevent getting stuck if host refreshes.
                socket.emit('entry-granted'); 
                socket.to(roomId).emit('user-connected', peerId, name);
            }
        }
    });

    socket.on('respond-entry', ({ socketId, peerId, action }) => {
        if (action === 'allow') {
            io.to(socketId).emit('entry-granted');
            socket.emit('user-connected', peerId, "Guest"); 
        } else {
            io.to(socketId).emit('entry-denied');
        }
    });
    
    // Chat Message Logic
    socket.on('message', (message) => {
        // We need to know which room this socket is in. 
        // Socket.io tracks rooms automatically, but 'to(room)' needs the ID.
        // Quick fix: loop through rooms the socket is in.
        const room = Array.from(socket.rooms).find(r => r !== socket.id);
        if (room) io.to(room).emit('createMessage', message);
    });

    socket.on('disconnect', () => {
        // Cleanup
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});