const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---

// 1. Home Page
app.get('/', (req, res) => {
    res.render('home');
});

// 2. API: Generate New Room ID
app.get('/api/new-room', (req, res) => {
    res.json({ roomId: uuidV4() });
});

// 3. Video Room
app.get('/:room', (req, res) => {
    try {
        // We look for 'video.ejs'
        res.render('video', { 
            roomId: req.params.room,
            meetingTopic: req.query.topic || "General Meeting" 
        });
    } catch (e) {
        console.error("Render Error:", e.message);
        res.status(500).send("Error loading meeting: " + e.message);
    }
});

// --- SOCKET LOGIC ---
const roomHosts = {};

io.on('connection', socket => {
    
    // A. User Joins
    socket.on('join-room-init', (roomId, name, isHost, peerId) => {
        socket.join(roomId);
        
        if (isHost === 'true') {
            roomHosts[roomId] = socket.id;
            socket.emit('entry-granted'); 
            socket.to(roomId).emit('user-connected', peerId, name);
        } else {
            const hostSocket = roomHosts[roomId];
            if (hostSocket) {
                // Ask Host for approval
                io.to(hostSocket).emit('request-entry', { socketId: socket.id, name, peerId });
            } else {
                // Auto-admit if no host (fallback)
                socket.emit('entry-granted'); 
                socket.to(roomId).emit('user-connected', peerId, name);
            }
        }
    });

    // B. Host Responds
    socket.on('respond-entry', ({ socketId, peerId, action }) => {
        if (action === 'allow') {
            io.to(socketId).emit('entry-granted');
            socket.emit('user-connected', peerId, "Guest"); 
        } else {
            io.to(socketId).emit('entry-denied');
        }
    });

    // C. Media Toggles (Camera/Mic)
    socket.on('toggle-media', (data) => {
        // Broadcast change to everyone in the room
        socket.to(data.roomId).emit('update-media-status', data); 
    });

    // D. Chat Messages
    socket.on('message', (message) => {
        const room = Array.from(socket.rooms).find(r => r !== socket.id);
        if (room) io.to(room).emit('createMessage', message);
    });

    socket.on('disconnect', () => {
        // Cleanup logic if needed
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});