const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); 
const myVideo = document.createElement('video');
myVideo.muted = true;

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let myVideoStream;
let pendingSocketId = null;
let pendingPeerId = null;

// 1. Setup
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// 2. Video Stream Handling
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        // Add MY video card
        addVideoStream(myVideo, stream, myPeerId, userName + " (You)", true);
        
        // Answer Incoming Calls
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, call.peer, "Guest", false);
            });
        });

        // Listen for new users
        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream, uName);
        });

        // Chat Logic
        setupChat();

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
}

// 3. UI Builder: Create Video Card
function addVideoStream(video, stream, peerId, uName, isMine) {
    if(document.getElementById(`card-${peerId}`)) return; 

    const card = document.createElement('div');
    card.className = isMine ? 'video-card my-video' : 'video-card';
    card.id = `card-${peerId}`;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.innerHTML = '<i class="fas fa-user"></i>';

    // WhatsApp Style Name Tag
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerHTML = `<span style="height:8px; width:8px; background:#27AE60; border-radius:50%; display:inline-block;"></span> ${uName}`;

    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    card.append(avatar);
    card.append(video);
    card.append(nameTag);
    videoGrid.append(card);
}

// 4. Mute / Unmute Logic
window.muteUnmute = () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        setButtonState('.main__mute_button', false, 'microphone');
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        setButtonState('.main__mute_button', true, 'microphone');
    }
}

// 5. Video On / Off Logic
window.playStop = () => {
    let enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        setButtonState('.main__video_button', false, 'video');
        
        // Update Local UI
        const card = document.getElementById(`card-${myPeerId}`);
        if(card) card.classList.add('video-off');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: false });
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        setButtonState('.main__video_button', true, 'video');
        
        const card = document.getElementById(`card-${myPeerId}`);
        if(card) card.classList.remove('video-off');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: true });
    }
}

// Helper: Change Button Icon & Color
function setButtonState(buttonClass, isActive, iconName) {
    const button = document.querySelector(buttonClass);
    if (isActive) {
        button.innerHTML = `<i class="fas fa-${iconName}"></i>`;
        button.classList.remove('button-red');
    } else {
        button.innerHTML = `<i class="fas fa-${iconName}-slash"></i>`;
        button.classList.add('button-red');
    }
}

// 6. Listen for Remote Media Toggles
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) {
            if (status) card.classList.remove('video-off');
            else card.classList.add('video-off');
        }
    }
});

// 7. Chat & Features
function setupChat() {
    let text = document.querySelector("#chat_message");
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && text.value.length !== 0) {
            socket.emit("message", text.value);
            text.value = "";
        }
    });
    socket.on("createMessage", (message) => {
        const ul = document.querySelector(".messages");
        const li = document.createElement("li");
        li.innerHTML = `<span style="color:#00d2ff; font-weight:bold;">User:</span> ${message}`;
        ul.append(li);
        let d = document.querySelector('.main__chat_window');
        d.scrollTop = d.scrollHeight;
    });
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

window.raiseHand = () => {
    socket.emit('message', "✋ RAISED HAND");
    alert("You raised your hand!");
}

window.shareScreen = () => {
    navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false })
    .then((screenStream) => {
        let videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = function() { 
            // Revert to camera
            let camTrack = myVideoStream.getVideoTracks()[0];
            let sender = myPeer.connections[Object.keys(myPeer.connections)[0]][0].peerConnection.getSenders().find(s => s.track.kind == camTrack.kind);
            sender.replaceTrack(camTrack);
            const card = document.getElementById(`card-${myPeerId}`);
            card.querySelector('video').srcObject = myVideoStream;
        };
        
        let sender = myPeer.connections[Object.keys(myPeer.connections)[0]][0].peerConnection.getSenders().find(s => s.track.kind == videoTrack.kind);
        sender.replaceTrack(videoTrack);
        
        // Show screen on local view
        const card = document.getElementById(`card-${myPeerId}`);
        card.querySelector('video').srcObject = screenStream;
    });
}

// 8. Meeting Logic (Entry & Timer)
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    
    // Start Timer
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