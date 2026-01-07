const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); 
const myVideo = document.createElement('video');
myVideo.muted = true; // IMPORTANT: Only mute yourself to prevent echo!

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let myVideoStream;
let isScreenSharing = false;
let pendingSocketId = null;
let pendingPeerId = null;

// 1. SETUP
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    startTimer();
});

socket.on('request-entry', (data) => {
    pendingSocketId = data.socketId;
    pendingPeerId = data.peerId;
    document.getElementById('guest-name').innerText = data.name;
    document.getElementById('admit-modal').classList.remove('hidden');
    document.getElementById('admit-modal').style.display = 'flex';
});

// 2. VIDEO & AUDIO LOGIC
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, myPeerId, userName + " (You)", true);
        
        // Listen for calls
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                // False = This is NOT me, so Audio should be ON
                addVideoStream(video, userVideoStream, call.peer, "Guest", false);
            });
        });

        // Call others
        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream, uName);
        });
        
        setupChat();
    }).catch(err => { console.error("Media Error", err); alert("Microphone/Camera blocked."); });
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

function addVideoStream(video, stream, peerId, uName, isMine) {
    if(document.getElementById(`card-${peerId}`)) return; 

    const card = document.createElement('div');
    card.className = isMine ? 'video-card my-video' : 'video-card';
    card.id = `card-${peerId}`;

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.innerHTML = '<i class="fas fa-user"></i>';

    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerHTML = `<span style="height:8px; width:8px; background:#27AE60; border-radius:50%; display:inline-block;"></span> ${uName}`;

    // AUDIO FIX: Ensure remote videos are NOT muted
    video.srcObject = stream;
    video.muted = isMine; // True if mine, False if others (so you can hear them)
    video.playsInline = true; // Mobile fix
    video.autoplay = true; 
    
    video.addEventListener('loadedmetadata', () => { video.play(); });

    card.append(avatar);
    card.append(video);
    card.append(nameTag);
    videoGrid.append(card);
}

// 3. SCREEN SHARE (Fixes Visibility for Others)
window.shareScreen = () => {
    if (isScreenSharing) { stopScreenShare(); return; }

    navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true })
    .then((screenStream) => {
        isScreenSharing = true;
        document.querySelector('.share-btn').classList.add('share-active-btn');

        let videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = function() { stopScreenShare(); };

        // Replace track for ALL connected peers
        for (let peerId in myPeer.connections) {
            let connections = myPeer.connections[peerId];
            if(connections && connections[0]) {
                let sender = connections[0].peerConnection.getSenders().find(s => s.track.kind === "video");
                if(sender) sender.replaceTrack(videoTrack);
            }
        }

        // Show my screen locally
        activateZoomLayout(screenStream, true);

        // Tell others to switch layout
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-start' });

    }).catch(err => { console.log("Screen share cancelled", err); });
}

function stopScreenShare() {
    isScreenSharing = false;
    document.querySelector('.share-btn').classList.remove('share-active-btn');

    let camTrack = myVideoStream.getVideoTracks()[0];
    for (let peerId in myPeer.connections) {
        let connections = myPeer.connections[peerId];
        if(connections && connections[0]) {
            let sender = connections[0].peerConnection.getSenders().find(s => s.track.kind === "video");
            if(sender) sender.replaceTrack(camTrack);
        }
    }

    deactivateZoomLayout();
    socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-stop' });
}

// 4. LAYOUT MANAGERS
function activateZoomLayout(stream, isMine) {
    document.querySelector('.main__left').classList.add('screen-share-active');
    
    const stage = document.getElementById('screen-stage');
    stage.innerHTML = '';
    
    const stageVideo = document.createElement('video');
    stageVideo.srcObject = stream;
    stageVideo.autoplay = true;
    stageVideo.playsInline = true;
    if(isMine) stageVideo.muted = true; // Mute if it's my own screen
    else stageVideo.muted = false; // Hear audio if sharing tab audio
    
    stage.append(stageVideo);
}

function deactivateZoomLayout() {
    document.querySelector('.main__left').classList.remove('screen-share-active');
    document.getElementById('screen-stage').innerHTML = '';
}

// 5. LISTEN FOR EVENTS
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) status ? card.classList.remove('video-off') : card.classList.add('video-off');
    }
    
    // Remote Screen Share Started
    if (type === 'screen-start') {
        // Find the video element of the person sharing
        const card = document.getElementById(`card-${peerId}`);
        if(card) {
            const videoEl = card.querySelector('video');
            // Move that video stream to the big stage
            activateZoomLayout(videoEl.srcObject, false);
        }
    }
    
    if (type === 'screen-stop') {
        deactivateZoomLayout();
    }
});

// 6. CONTROLS
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

window.playStop = () => {
    let enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        setButtonState('.main__video_button', false, 'video');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: false });
        document.getElementById(`card-${myPeerId}`).classList.add('video-off');
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        setButtonState('.main__video_button', true, 'video');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: true });
        document.getElementById(`card-${myPeerId}`).classList.remove('video-off');
    }
}

window.respondToUser = (action) => {
    socket.emit('respond-entry', { socketId: pendingSocketId, peerId: pendingPeerId, action });
    document.getElementById('admit-modal').style.display = 'none';
};

function setButtonState(btn, active, icon) {
    const b = document.querySelector(btn);
    if(active) { b.innerHTML=`<i class="fas fa-${icon}"></i>`; b.classList.remove('button-red'); }
    else { b.innerHTML=`<i class="fas fa-${icon}-slash"></i>`; b.classList.add('button-red'); }
}

function setupChat() {
    let text = document.querySelector("#chat_message");
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && text.value.length !== 0) {
            socket.emit("message", text.value); text.value = "";
        }
    });
    socket.on("createMessage", (message) => {
        const ul = document.querySelector(".messages");
        const li = document.createElement("li");
        li.innerHTML = `<span style="color:#00d2ff; font-weight:bold;">User:</span> ${message}`;
        ul.append(li);
        let d = document.querySelector('.main__chat_window'); d.scrollTop = d.scrollHeight;
    });
}
window.toggleChat = () => {
    const chat = document.getElementById("chat-section");
    if(chat.classList.contains('active')) chat.classList.remove('active');
    else chat.classList.add('active');
}
window.raiseHand = () => { socket.emit('message', "✋ RAISED HAND"); alert("You raised your hand!"); }
function startTimer() {
    setInterval(() => {
        let t = document.getElementById('meeting-timer');
        let s = t.innerText.split(':');
        let m = parseInt(s[0]), sc = parseInt(s[1]);
        sc++; if(sc>=60){sc=0;m++;}
        t.innerText=(m<10?"0"+m:m)+":"+(sc<10?"0"+sc:sc);
    }, 1000);
}