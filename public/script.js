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
let pendingSocketId = null;
let pendingPeerId = null;
let myVideoStream;

myPeer.on('open', id => {
    myPeerId = id;
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// TIMER LOGIC
function startTimer() {
    let seconds = 0;
    const timerEl = document.getElementById('meeting-timer');
    if(timerEl) {
        setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            timerEl.innerText = `${mins}:${secs}`;
        }, 1000);
    }
}

// SERVER EVENTS
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    startVideo();
    startTimer();
});

socket.on('entry-denied', () => {
    document.querySelector('#waiting-screen h2').innerText = "Access Denied";
    document.querySelector('#waiting-screen p').innerText = "Host declined entry.";
    document.querySelector('.spinner').style.display = 'none';
});

socket.on('request-entry', (data) => {
    pendingSocketId = data.socketId;
    pendingPeerId = data.peerId;
    document.getElementById('guest-name').innerText = data.name;
    document.getElementById('admit-modal').classList.remove('hidden');
    document.getElementById('admit-modal').style.display = 'flex';
});

socket.on('hand-raised', (peerId) => {
    alert("Someone raised their hand! 👋");
});

// VIDEO LOGIC
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        // Add MY video
        addVideoStream(myVideo, stream, userName, true);
        
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            
            // We need to fetch the caller's name somehow. 
            // For now, we use a generic name or wait for data.
            // Simplified: User-connected event usually handles this, 
            // but for incoming calls, we might not have the name instantly.
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, "Participant");
            });
        });

        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream, uName);
        });

        setupChat();

    }).catch(err => {
        console.log("Failed to get stream", err);
    });
}

function connectToNewUser(userId, stream, uName) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, uName);
    });
    call.on('close', () => { 
        video.parentElement.remove(); // Remove the whole card
    });
    peers[userId] = call;
}

// --- NEW FUNCTION: ADDS VIDEO CARD WITH NAME & ICON ---
function addVideoStream(video, stream, uName, isMine = false) {
    // 1. Create the Card Container
    const card = document.createElement('div');
    card.className = 'video-card';

    // 2. Setup the Video Element
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });

    // 3. Create the Name Tag
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerText = uName || "User";

    // 4. Create the Placeholder (Icon for when video is off)
    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.innerHTML = `
        <i class="fas fa-user-circle"></i>
        <span>${uName || "User"}</span>
    `;

    // 5. Detect when video turns OFF/ON (Track Mute Events)
    // This allows the icon to show automatically when someone stops their video
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.onmute = () => { card.classList.add('video-off'); };
        videoTrack.onunmute = () => { card.classList.remove('video-off'); };
        
        // Initial check
        if (!videoTrack.enabled) card.classList.add('video-off');
    }

    // 6. Assemble everything
    card.append(placeholder);
    card.append(video);
    card.append(nameTag);
    videoGrid.append(card);
}

function scrollToBottom() {
  let d = document.querySelector('.main__chat_window');
  d.scrollTop = d.scrollHeight;
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
        scrollToBottom();
    });
}

// --- CONTROLS ---

window.raiseHand = () => {
    socket.emit('message', "✋ RAISED HAND");
    alert("You raised your hand!");
}

window.respondToUser = (action) => {
    socket.emit('respond-entry', { socketId: pendingSocketId, peerId: pendingPeerId, action });
    document.getElementById('admit-modal').style.display = 'none';
};

window.muteUnmute = () => {
  const enabled = myVideoStream.getAudioTracks()[0].enabled;
  if (enabled) {
    myVideoStream.getAudioTracks()[0].enabled = false;
    document.querySelector('.main__mute_button').classList.add("unmute");
    document.querySelector('.main__mute_button').innerHTML = `<i class="fas fa-microphone-slash"></i>`;
  } else {
    myVideoStream.getAudioTracks()[0].enabled = true;
    document.querySelector('.main__mute_button').classList.remove("unmute");
    document.querySelector('.main__mute_button').innerHTML = `<i class="fas fa-microphone"></i>`;
  }
}

window.playStop = () => {
  let enabled = myVideoStream.getVideoTracks()[0].enabled;
  const card = myVideo.closest('.video-card'); // Find MY card

  if (enabled) {
    // TURN OFF
    myVideoStream.getVideoTracks()[0].enabled = false;
    document.querySelector('.main__video_button').classList.add("stop");
    document.querySelector('.main__video_button').innerHTML = `<i class="fas fa-video-slash"></i>`;
    if(card) card.classList.add('video-off'); // Manually trigger for self
  } else {
    // TURN ON
    myVideoStream.getVideoTracks()[0].enabled = true;
    document.querySelector('.main__video_button').classList.remove("stop");
    document.querySelector('.main__video_button').innerHTML = `<i class="fas fa-video"></i>`;
    if(card) card.classList.remove('video-off');
  }
}

window.shareScreen = () => {
  navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false })
  .then((screenStream) => {
    let videoTrack = screenStream.getVideoTracks()[0];
    videoTrack.onended = function() { stopScreenShare(); };
    let sender = myPeer.connections[Object.keys(myPeer.connections)[0]][0].peerConnection.getSenders().find(function(s) {
        return s.track.kind == videoTrack.kind;
    });
    sender.replaceTrack(videoTrack);
    myVideo.srcObject = screenStream;
  });
}

window.stopScreenShare = () => {
    let videoTrack = myVideoStream.getVideoTracks()[0];
    let sender = myPeer.connections[Object.keys(myPeer.connections)[0]][0].peerConnection.getSenders().find(function(s) {
        return s.track.kind == videoTrack.kind;
    });
    sender.replaceTrack(videoTrack);
    myVideo.srcObject = myVideoStream;
}

window.toggleChat = () => {
    const chat = document.getElementById("chat-section");
    if(chat.style.display === "none") {
        chat.style.display = "flex";
        document.querySelector(".main__left").style.flex = "0.75";
    } else {
        chat.style.display = "none";
        document.querySelector(".main__left").style.flex = "1";
    }
}