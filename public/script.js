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
let isScreenSharing = false;

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
    }).catch(err => { console.log("Failed to get stream", err); });
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

// 3. ZOOM STYLE SCREEN SHARE
window.shareScreen = () => {
    if (isScreenSharing) {
        stopScreenShare();
        return;
    }

    navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true })
    .then((screenStream) => {
        isScreenSharing = true;
        const shareBtn = document.querySelector('.share-btn');
        shareBtn.classList.add('share-active-btn'); // Green button

        // 1. Replace my Video Track with Screen Track
        let videoTrack = screenStream.getVideoTracks()[0];
        
        // Handle "Stop Sharing" from the browser popup
        videoTrack.onended = function() { stopScreenShare(); };

        let sender = myPeer.connections[Object.keys(myPeer.connections)[0]]?.[0].peerConnection.getSenders().find(s => s.track.kind === "video");
        
        // Replace track for remote peers
        if(sender) sender.replaceTrack(videoTrack);

        // 2. Update Layout LOCALLY
        activateZoomLayout(myVideo, screenStream, true);

        // 3. Tell everyone "I am sharing screen"
        socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-start' });

    }).catch(err => { console.log("Screen share cancelled", err); });
}

function stopScreenShare() {
    isScreenSharing = false;
    const shareBtn = document.querySelector('.share-btn');
    shareBtn.classList.remove('share-active-btn');

    // Revert to Camera
    let camTrack = myVideoStream.getVideoTracks()[0];
    let sender = myPeer.connections[Object.keys(myPeer.connections)[0]]?.[0].peerConnection.getSenders().find(s => s.track.kind === "video");
    if(sender) sender.replaceTrack(camTrack);

    // Revert Layout
    deactivateZoomLayout();
    
    // Tell everyone
    socket.emit('toggle-media', { roomId: ROOM_ID, peerId: myPeerId, type: 'screen-stop' });
}

// 4. HANDLE LAYOUT CHANGES
function activateZoomLayout(videoElement, stream, isMine) {
    // A. Add class to main container (Moves grid to top)
    document.querySelector('.main__left').classList.add('screen-share-active');

    // B. Show Stage
    const stage = document.getElementById('screen-stage');
    stage.innerHTML = ''; // Clear old
    
    // C. Create Big Video
    const stageVideo = document.createElement('video');
    stageVideo.srcObject = stream;
    stageVideo.autoplay = true;
    if(isMine) stageVideo.muted = true; // Don't hear myself
    
    stage.append(stageVideo);
}

function deactivateZoomLayout() {
    document.querySelector('.main__left').classList.remove('screen-share-active');
    document.getElementById('screen-stage').innerHTML = ''; // Clear stage
}

// 5. LISTEN FOR OTHERS SHARING
socket.on('update-media-status', ({ peerId, type, status }) => {
    if (type === 'video') {
        const card = document.getElementById(`card-${peerId}`);
        if (card) status ? card.classList.remove('video-off') : card.classList.add('video-off');
    }
    
    if (type === 'screen-start') {
        // Someone else started sharing. Find their video element.
        const card = document.getElementById(`card-${peerId}`);
        if(card) {
            const videoEl = card.querySelector('video');
            activateZoomLayout(videoEl, videoEl.srcObject, false);
        }
    }
    
    if (type === 'screen-stop') {
        deactivateZoomLayout();
    }
});

// ... (Rest of Mute/Video/Chat logic remains same) ...
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

function setButtonState(btn, active, icon) {
    const b = document.querySelector(btn);
    if(active) { b.innerHTML=`<i class="fas fa-${icon}"></i>`; b.classList.remove('button-red'); }
    else { b.innerHTML=`<i class="fas fa-${icon}-slash"></i>`; b.classList.add('button-red'); }
}

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
    if(chat.style.display === "none") { chat.style.display = "flex"; mainLeft.style.flex = "0.75"; }
    else { chat.style.display = "none"; mainLeft.style.flex = "1"; }
}
window.raiseHand = () => { socket.emit('message', "✋ RAISED HAND"); alert("You raised your hand!"); }
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    setInterval(() => {
        let timer = document.getElementById('meeting-timer');
        let t = timer.innerText.split(':');
        let m = parseInt(t[0]), s = parseInt(t[1]);
        s++; if(s>=60){s=0;m++;}
        timer.innerText=(m<10?"0"+m:m)+":"+(s<10?"0"+s:s);
    }, 1000);
});