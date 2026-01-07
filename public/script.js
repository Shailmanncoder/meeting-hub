const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); 
const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let myVideoStream;
let pendingSocketId = null;
let pendingPeerId = null;

// 1. Setup Connection
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// 2. Video Handling
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        // Add MY video card
        addVideoStream(myVideo, stream, myPeerId, userName, true);
        
        // Handle Calls
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                // In a real app, we'd sync names via data connection. Using 'Guest' for now.
                addVideoStream(video, userVideoStream, call.peer, "Guest", false);
            });
        });

        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream, uName);
        });

    }).catch(err => {
        console.log("Failed to get stream", err);
    });
}

function connectToNewUser(userId, stream, uName) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, userId, uName, false);
    });
    call.on('close', () => { 
        const card = document.getElementById(`card-${userId}`);
        if(card) card.remove();
    });
    peers[userId] = call;
}

// 3. CREATE VIDEO CARD (New UI Logic)
function addVideoStream(video, stream, peerId, uName, isMine) {
    if(document.getElementById(`card-${peerId}`)) return; // Prevent duplicates

    const card = document.createElement('div');
    card.className = isMine ? 'video-card my-video' : 'video-card';
    card.id = `card-${peerId}`;

    // Create Avatar
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.innerHTML = '<i class="fas fa-user"></i>';

    // Create Name Tag
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerText = isMine ? "You" : uName;

    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    // Assemble Card
    card.append(avatar);
    card.append(video);
    card.append(nameTag);

    videoGrid.append(card);
}

// 4. Handle Camera Toggle (Local & Remote)
window.playStop = () => {
    let enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        // Turn Off
        myVideoStream.getVideoTracks()[0].enabled = false;
        setStopVideo();
        // Update Local Card
        const card = document.getElementById(`card-${myPeerId}`);
        if(card) card.classList.add('video-off');
        // Tell Others
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: false });
    } else {
        // Turn On
        myVideoStream.getVideoTracks()[0].enabled = true;
        setPlayVideo();
        const card = document.getElementById(`card-${myPeerId}`);
        if(card) card.classList.remove('video-off');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: true });
    }
}

// Listen for remote toggles
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) {
            if (status) card.classList.remove('video-off');
            else card.classList.add('video-off');
        }
    }
});

// --- HELPER FUNCTIONS ---
window.muteUnmute = () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if(enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        setUnmuteButton();
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        setMuteButton();
    }
}

window.raiseHand = () => {
    socket.emit('message', "✋ RAISED HAND");
    alert("You raised your hand!");
}

window.toggleChat = () => {
    const chat = document.getElementById("chat-section");
    const mainLeft = document.querySelector(".main__left");
    if(chat.style.display === "none") {
        chat.style.display = "flex";
        mainLeft.style.flex = "0.75";
    } else {
        chat.style.display = "none";
        mainLeft.style.flex = "1";
    }
}

// Button Stylers
const setMuteButton = () => { document.querySelector('.main__mute_button').innerHTML = `<i class="fas fa-microphone"></i>`; }
const setUnmuteButton = () => { document.querySelector('.main__mute_button').innerHTML = `<i class="fas fa-microphone-slash" style="color:#EB534B;"></i>`; }
const setStopVideo = () => { document.querySelector('.main__video_button').innerHTML = `<i class="fas fa-video-slash" style="color:#EB534B;"></i>`; }
const setPlayVideo = () => { document.querySelector('.main__video_button').innerHTML = `<i class="fas fa-video"></i>`; }

// Timer
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    setInterval(() => {
        let timer = document.getElementById('meeting-timer');
        let time = timer.innerText.split(':');
        let min = parseInt(time[0]);
        let sec = parseInt(time[1]);
        sec++;
        if (sec >= 60) { sec = 0; min++; }
        timer.innerText = (min < 10 ? "0" + min : min) + ":" + (sec < 10 ? "0" + sec : sec);
    }, 1000);
});