const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// 1. Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 2. Home Page
app.get('/', (req, res) => {
    res.render('home');
});

// 3. API: Generate Link (CRITICAL FOR BUTTON TO WORK)
app.get('/api/new-room', (req, res) => {
    console.log("API: Generating new room ID...");
    res.json({ roomId: uuidV4() });
});

// 4. Video Room (Looking for 'video.ejs')
app.get('/:room', (req, res) => {
    try {
        res.render('video', { 
            roomId: req.params.room,
            meetingTopic: req.query.topic || "General Meeting"
        });
    } catch (e) {
        console.error("RENDER ERROR:", e);
        res.status(500).send("Critical Error: " + e.message);
    }
});

// 5. Socket Logic
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

    socket.on('message', (message) => {
        const room = Array.from(socket.rooms).find(r => r !== socket.id);
        if (room) io.to(room).emit('createMessage', message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});