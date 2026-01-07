const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const path = require('path');

// CONFIG
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ROUTES
app.get('/', (req, res) => {
    res.render('home');
});

app.get('/api/new-room', (req, res) => {
    res.json({ roomId: uuidV4() });
});

app.get('/:room', (req, res) => {
    try {
        res.render('video', { 
            roomId: req.params.room,
            meetingTopic: req.query.topic || "General Meeting" 
        });
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});

// --- HOST CONTROL LOGIC ---
const roomHosts = {}; // Store: { roomId: socketId }

io.on('connection', socket => {
    
    // 1. User Joins Room
    socket.on('join-room-init', (roomId, name, isHost, peerId) => {
        socket.join(roomId);
        
        if (isHost === 'true') {
            // REGISTER HOST
            roomHosts[roomId] = socket.id;
            console.log(`Host registered for room ${roomId}: ${name}`);
            
            // Host enters immediately
            socket.emit('entry-granted'); 
            socket.to(roomId).emit('user-connected', peerId, name);
        } else {
            // GUEST JOINING
            const hostSocket = roomHosts[roomId];
            
            if (hostSocket) {
                // Host is online -> Ask for permission
                console.log(`Guest ${name} asking permission from Host ${hostSocket}`);
                io.to(hostSocket).emit('request-entry', { 
                    socketId: socket.id, 
                    name: name, 
                    peerId: peerId 
                });
            } else {
                // Host is offline -> Tell guest to wait
                // (Optional: You could auto-admit here if you prefer)
                socket.emit('host-offline'); 
            }
        }
    });

    // 2. Host Responds (Allow/Deny)
    socket.on('respond-entry', ({ socketId, peerId, action }) => {
        if (action === 'allow') {
            io.to(socketId).emit('entry-granted'); // Tell guest to enter
            socket.emit('user-connected', peerId, "Guest"); // Tell host to connect video
        } else {
            io.to(socketId).emit('entry-denied');
        }
    });

    // 3. Media Toggles (Sync icons/avatars)
    socket.on('toggle-media', (data) => {
        socket.to(data.roomId).emit('update-media-status', data); 
    });

    // 4. Chat
    socket.on('message', (message) => {
        const room = Array.from(socket.rooms).find(r => r !== socket.id);
        if (room) io.to(room).emit('createMessage', message);
    });

    // 5. Cleanup
    socket.on('disconnect', () => {
        // We don't delete the host immediately in case they just refreshed
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 