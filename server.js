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

// 1. Render Landing Page
app.get('/', (req, res) => {
    res.render('home');
});

// 2. Handle Creation (Redirects to Room with Host Flag)
app.get('/create', (req, res) => {
    const roomId = uuidV4();
    const name = req.query.name;
    // Redirect to room, marking this user as HOST
    res.redirect(`/${roomId}?name=${name}&host=true`);
});

// 3. Render Room
app.get('/:room', (req, res) => {
    // If we renamed view to 'meeting.ejs', use that. If 'room.ejs', use 'room'.
    // We will assume 'meeting' based on previous steps.
    res.render('meeting', { roomId: req.params.room });
});

// Store room hosts: { roomId: socketId }
const roomHosts = {};

io.on('connection', socket => {
    
    // A. User Enters Page
    socket.on('join-room-init', (roomId, name, isHost, peerId) => {
        socket.join(roomId);
        
        if (isHost === 'true') {
            // Register this socket as the Host
            roomHosts[roomId] = socket.id;
            // Host joins immediately
            socket.emit('entry-granted'); 
            socket.to(roomId).emit('user-connected', peerId, name);
        } else {
            // Use is a GUEST. Check if host exists.
            const hostSocket = roomHosts[roomId];
            if (hostSocket) {
                // Ask Host for approval
                io.to(hostSocket).emit('request-entry', { socketId: socket.id, name, peerId });
            } else {
                // No host? Maybe let them in or wait. For now, let them in if no host.
                // Or force them to wait. Let's force wait.
                socket.emit('waiting-for-host'); 
            }
        }
    });

    // B. Host Responds to Request
    socket.on('respond-entry', ({ socketId, peerId, action }) => {
        if (action === 'allow') {
            io.to(socketId).emit('entry-granted'); // Tell guest they are in
            // Tell everyone else (including Host) to connect video
            socket.emit('user-connected', peerId, "Guest"); 
        } else {
            io.to(socketId).emit('entry-denied');
        }
    });

    // Standard Disconnect
    socket.on('disconnect', () => {
        // Handle logic if host leaves (optional)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});