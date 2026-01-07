const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// --- PATH CONFIGURATION ---
app.set('view engine', 'ejs');
// Force server to look in the correct 'views' folder
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---

// 1. Home Page
app.get('/', (req, res) => {
    try {
        res.render('home');
    } catch (e) {
        console.error("Home Page Error:", e.message);
        res.send("Error loading home page: " + e.message);
    }
});

// 2. API: Generate New Room ID
app.get('/api/new-room', (req, res) => {
    res.json({ roomId: uuidV4() });
});

// 3. Meeting Room (The critical part)
app.get('/:room', (req, res) => {
    try {
        // We look for 'meeting.ejs'. Make sure your file is named 'meeting.ejs' inside views!
        res.render('meeting', { 
            roomId: req.params.room,
            meetingTopic: req.query.topic || "General Meeting" // Pass topic to view
        });
    } catch (e) {
        console.error("Meeting Page Error:", e.message);
        // If 'meeting.ejs' is missing, it will tell you here
        res.status(500).send("Error loading meeting. Did you rename room.ejs to meeting.ejs? Details: " + e.message);
    }
});

// --- SOCKET LOGIC ---
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
                // Ask Host for approval
                io.to(hostSocket).emit('request-entry', { socketId: socket.id, name, peerId });
            } else {
                // If no host is present, we make them wait
                socket.emit('waiting-for-host');
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