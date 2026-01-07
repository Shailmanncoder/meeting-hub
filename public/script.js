const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); 
const myVideo = document.createElement('video');
myVideo.muted = true; // Mute local video

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let myVideoStream;
let isScreenSharing = false;
let pendingSocketId = null;
let pendingPeerId = null;

// 1. SETUP & HOST CHECK
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// Server Responses
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    startTimer();
});

socket.on('entry-denied', () => {
    document.querySelector('#waiting-screen h2').innerText = "Access Denied";
    document.querySelector('#waiting-screen p').innerText = "Host declined your request.";
    document.querySelector('.spinner').style.display = 'none';
});

socket.on('request-entry', (data) => {
    pendingSocketId = data.socketId;
    pendingPeerId = data.peerId;
    document.getElementById('guest-name').innerText = data.name;
    document.getElementById('admit-modal').classList.remove('hidden');
    document.getElementById('admit-modal').style.display = 'flex';
});

// 2. VIDEO LOGIC
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream, myPeerId, userName + " (You)", true);
        
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, call.peer, "Guest", false);
            });
        });

        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream, uName);
        });
        
        setupChat();
    }).catch(err => { console.error("Media Error", err); });
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

    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    card.append(avatar);
    card.append(video);
    card.append(nameTag);
    videoGrid.append(card);
}

// 3. SCREEN SHARE (ZOOM MODE)
window.shareScreen = () => {
    if (isScreenSharing) { stopScreenShare(); return; }

    navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true })
    .then((screenStream) => {
        isScreenSharing = true;
        document.querySelector('.share-btn').classList.add('share-active-btn');

        // A. Get the Screen Track
        let videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = function() { stopScreenShare(); };

        // B. Replace Track for ALL Peers (Crucial Fix)
        for (let peerId in myPeer.connections) {
            let sender = myPeer.connections[peerId][0].peerConnection.getSenders().find(s => s.track.kind === "video");
            if(sender) sender.replaceTrack(videoTrack);
        }

        // C. Update Local View
        activateZoomLayout(screenStream, true);

        // D. Tell Everyone
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-start' });

    }).catch(err => { console.log("Screen share cancelled", err); });
}

function stopScreenShare() {
    isScreenSharing = false;
    document.querySelector('.share-btn').classList.remove('share-active-btn');

    // Restore Camera
    let camTrack = myVideoStream.getVideoTracks()[0];
    for (let peerId in myPeer.connections) {
        let sender = myPeer.connections[peerId][0].peerConnection.getSenders().find(s => s.track.kind === "video");
        if(sender) sender.replaceTrack(camTrack);
    }

    deactivateZoomLayout();
    socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-stop' });
}

// 4. LAYOUT MANAGERS
function activateZoomLayout(stream, isMine) {
    // Add class to squeeze top bar
    document.querySelector('.main__left').classList.add('screen-share-active');
    
    // Setup Stage
    const stage = document.getElementById('screen-stage');
    stage.innerHTML = '';
    
    const stageVideo = document.createElement('video');
    stageVideo.srcObject = stream;
    stageVideo.autoplay = true;
    if(isMine) stageVideo.muted = true; // Don't hear self
    
    stage.append(stageVideo);
}

function deactivateZoomLayout() {
    document.querySelector('.main__left').classList.remove('screen-share-active');
    document.getElementById('screen-stage').innerHTML = '';
}

// 5. EVENT LISTENERS (Remote Changes)
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) status ? card.classList.remove('video-off') : card.classList.add('video-off');
    }
    
    if (type === 'screen-start') {
        // Find the sharer's video card and clone stream to big stage
        const card = document.getElementById(`card-${peerId}`);
        if(card) {
            const videoEl = card.querySelector('video');
            activateZoomLayout(videoEl.srcObject, false);
        }
    }
    
    if (type === 'screen-stop') {
        deactivateZoomLayout();
    }
});

// 6. CONTROLS (Mute/Video/Host)
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

// 7. EXTRAS
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
    const mainLeft = document.querySelector(".main__left");
    if(chat.style.display === "none") { chat.style.display = "flex"; mainLeft.style.flex = "0.75"; }
    else { chat.style.display = "none"; mainLeft.style.flex = "1"; }
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