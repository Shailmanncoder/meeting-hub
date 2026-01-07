const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => { res.render('home'); });
app.get('/api/new-room', (req, res) => { res.json({ roomId: uuidV4() }); });
app.get('/:room', (req, res) => {
    try {
        res.render('video', { roomId: req.params.room, meetingTopic: req.query.topic || "Meeting" });
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

const roomHosts = {}; // Store Host IDs

io.on('connection', socket => {
    
    // 1. JOINING LOGIC
    socket.on('join-room-init', (roomId, name, isHost, peerId) => {
        socket.join(roomId);
        
        if (isHost === 'true') {
            // YOU ARE HOST: Overwrite any old host ID
            roomHosts[roomId] = socket.id;
            socket.emit('entry-granted'); // Let host in
            socket.to(roomId).emit('user-connected', peerId, name);
        } else {
            // YOU ARE GUEST
            const hostSocket = roomHosts[roomId];
            if (hostSocket) {
                // Host exists -> Ask permission
                io.to(hostSocket).emit('request-entry', { socketId: socket.id, name, peerId });
            } else {
                // Host offline -> Tell guest to wait
                socket.emit('host-offline');
            }
        }
    });

    // 2. HOST DECISION
    socket.on('respond-entry', ({ socketId, peerId, action }) => {
        if (action === 'allow') {
            io.to(socketId).emit('entry-granted');
            socket.emit('user-connected', peerId, "Guest"); 
        } else {
            io.to(socketId).emit('entry-denied');
        }
    });

    // 3. SYNC CAMERA/MUTE ICONS
    socket.on('toggle-media', (data) => {
        socket.to(data.roomId).emit('update-media-status', data); 
    });

    // 4. CHAT
    socket.on('message', (message) => {
        const room = Array.from(socket.rooms).find(r => r !== socket.id);
        if (room) io.to(room).emit('createMessage', message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});