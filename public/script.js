const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); 
const myVideo = document.createElement('video');
myVideo.muted = true; // Mute local self

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let myVideoStream;
let isScreenSharing = false;
let pendingSocketId = null;
let pendingPeerId = null;

// 1. INITIALIZE
myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// 2. SERVER LISTENERS
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    startTimer();
});

socket.on('host-offline', () => {
    document.querySelector('#waiting-screen h2').innerText = "Host is Offline";
    document.querySelector('#waiting-screen p').innerText = "Wait for the host to join first.";
    document.querySelector('.spinner').style.display = 'none';
});

socket.on('request-entry', (data) => {
    pendingSocketId = data.socketId;
    pendingPeerId = data.peerId;
    document.getElementById('guest-name').innerText = data.name;
    document.getElementById('admit-modal').classList.remove('hidden');
    document.getElementById('admit-modal').style.display = 'flex';
});

// 3. VIDEO SETUP
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
    }).catch(err => { alert("Camera blocked! Allow permissions."); });
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

    // AVATAR (The Sign)
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.innerHTML = '<i class="fas fa-user"></i>';

    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerHTML = `<span style="height:8px; width:8px; background:#27AE60; border-radius:50%; display:inline-block;"></span> ${uName}`;

    video.srcObject = stream;
    video.muted = isMine; 
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    card.append(avatar);
    card.append(video);
    card.append(nameTag);
    videoGrid.append(card);
}

// 4. MUTE / CAMERA TOGGLE
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
        // STOP VIDEO
        myVideoStream.getVideoTracks()[0].enabled = false;
        setButtonState('.main__video_button', false, 'video');
        
        // Add class to show Avatar
        document.getElementById(`card-${myPeerId}`).classList.add('video-off');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: false });
    } else {
        // START VIDEO
        myVideoStream.getVideoTracks()[0].enabled = true;
        setButtonState('.main__video_button', true, 'video');
        
        // Remove class to show Video
        document.getElementById(`card-${myPeerId}`).classList.remove('video-off');
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'video', status: true });
    }
}

// LISTEN FOR REMOTE TOGGLES
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) status ? card.classList.remove('video-off') : card.classList.add('video-off');
    }
    // Screen share logic (same as before)
    if (type === 'screen-start') {
        const card = document.getElementById(`card-${peerId}`);
        if(card) activateZoomLayout(card.querySelector('video').srcObject, false);
    }
    if (type === 'screen-stop') deactivateZoomLayout();
});

// 5. SCREEN SHARE
window.shareScreen = () => {
    if (isScreenSharing) { stopScreenShare(); return; }
    navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true })
    .then((screenStream) => {
        isScreenSharing = true;
        document.querySelector('.share-btn').classList.add('share-active-btn');
        let videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = function() { stopScreenShare(); };

        for (let peerId in myPeer.connections) {
            let sender = myPeer.connections[peerId][0].peerConnection.getSenders().find(s => s.track.kind === "video");
            if(sender) sender.replaceTrack(videoTrack);
        }
        activateZoomLayout(screenStream, true);
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-start' });
    }).catch(err => console.log(err));
}

function stopScreenShare() {
    isScreenSharing = false;
    document.querySelector('.share-btn').classList.remove('share-active-btn');
    let camTrack = myVideoStream.getVideoTracks()[0];
    for (let peerId in myPeer.connections) {
        let sender = myPeer.connections[peerId][0].peerConnection.getSenders().find(s => s.track.kind === "video");
        if(sender) sender.replaceTrack(camTrack);
    }
    deactivateZoomLayout();
    socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-stop' });
}

function activateZoomLayout(stream, isMine) {
    document.querySelector('.main__left').classList.add('screen-share-active');
    const stage = document.getElementById('screen-stage');
    stage.innerHTML = '';
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.muted = isMine;
    stage.append(v);
}
function deactivateZoomLayout() {
    document.querySelector('.main__left').classList.remove('screen-share-active');
    document.getElementById('screen-stage').innerHTML = '';
}

// 6. UTILS
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
    let t = document.querySelector("#chat_message");
    document.addEventListener("keydown", (e) => { if(e.key==="Enter"&&t.value!==""){socket.emit("message", t.value);t.value="";}});
    socket.on("createMessage", (m) => {
        const l = document.createElement("li"); l.innerHTML=`<span style="color:#00d2ff; font-weight:bold;">User:</span> ${m}`;
        document.querySelector(".messages").append(l);
    });
}
window.toggleChat = () => {
    const c = document.getElementById("chat-section");
    if(c.style.display === "none") c.style.display = "flex"; else c.style.display = "none";
}
window.raiseHand = () => { socket.emit('message', "✋ RAISED HAND"); alert("You raised your hand!"); }
function startTimer() {
    setInterval(() => {
        let t = document.getElementById('meeting-timer'), s = t.innerText.split(':'), m = parseInt(s[0]), sc = parseInt(s[1]);
        sc++; if(sc>=60){sc=0;m++;} t.innerText=(m<10?"0"+m:m)+":"+(sc<10?"0"+sc:sc);
    }, 1000);
}