const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined); // Using Public Cloud
const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};

// 1. Get URL Params (Name, Host Status)
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || "User";
const isHost = urlParams.get('host');

let myPeerId = null;
let pendingSocketId = null;
let pendingPeerId = null;
let myVideoStream; // Variable to store our video stream

// 2. Setup Peer
myPeer.on('open', id => {
    myPeerId = id;
    // Don't join yet! Ask Server first.
    socket.emit('join-room-init', ROOM_ID, userName, isHost, id);
});

// 3. Server Responses

// A. ACCESS GRANTED (For Host or Approved Guest)
socket.on('entry-granted', () => {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('main-interface').style.display = 'flex';
    
    // Start Video & Chat features
    startVideo();
});

// B. ACCESS DENIED
socket.on('entry-denied', () => {
    document.querySelector('#waiting-screen h2').innerText = "Access Denied";
    document.querySelector('#waiting-screen p').innerText = "The host declined your request.";
    document.querySelector('.spinner').style.display = 'none';
});

// C. HOST: Request Received
socket.on('request-entry', (data) => {
    pendingSocketId = data.socketId;
    pendingPeerId = data.peerId;
    document.getElementById('guest-name').innerText = data.name;
    document.getElementById('admit-modal').classList.remove('hidden');
    document.getElementById('admit-modal').style.display = 'flex';
});

// 4. Video & Chat Logic (Only runs after entry granted)
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream);
        
        // Answer calls
        myPeer.on('call', call => {
            call.answer(stream);
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream);
            });
        });

        // If new user connected (already approved by host)
        socket.on('user-connected', (peerId, uName) => {
            connectToNewUser(peerId, stream);
        });

        // --- CHAT LOGIC ---
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
            li.innerHTML = `<b>User:</b><br/>${message}`;
            ul.append(li);
            scrollToBottom();
        });

    }).catch(err => {
        console.log("Failed to get stream", err);
    });
}

function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    });
    call.on('close', () => { video.remove(); });
    peers[userId] = call;
}

function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => { video.play(); });
    videoGrid.append(video);
}

function scrollToBottom() {
  let d = document.querySelector('.main__chat_window');
  d.scrollTop = d.scrollHeight;
}

// 5. Host Actions
window.respondToUser = (action) => {
    socket.emit('respond-entry', { 
        socketId: pendingSocketId, 
        peerId: pendingPeerId,
        action: action 
    });
    document.getElementById('admit-modal').style.display = 'none';
};

window.shareLink = () => {
    const cleanURL = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(cleanURL);
    alert("Link Copied! Send this to friends.");
}

// --- CONTROLS: MUTE, STOP VIDEO, SCREEN SHARE ---

window.muteUnmute = () => {
  const enabled = myVideoStream.getAudioTracks()[0].enabled;
  if (enabled) {
    myVideoStream.getAudioTracks()[0].enabled = false;
    setUnmuteButton();
  } else {
    setMuteButton();
    myVideoStream.getAudioTracks()[0].enabled = true;
  }
}

window.playStop = () => {
  let enabled = myVideoStream.getVideoTracks()[0].enabled;
  if (enabled) {
    myVideoStream.getVideoTracks()[0].enabled = false;
    setPlayVideo();
  } else {
    setStopVideo();
    myVideoStream.getVideoTracks()[0].enabled = true;
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

function stopScreenShare() {
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
        document.querySelector(".main__left").style.flex = "0.8";
    } else {
        chat.style.display = "none";
        document.querySelector(".main__left").style.flex = "1";
    }
}

// Button Styling Helpers
const setMuteButton = () => {
  const html = `<i class="fas fa-microphone"></i><span>Mute</span>`;
  document.querySelector('.main__mute_button').innerHTML = html;
  document.querySelector('.main__mute_button').classList.remove("unmute");
}
const setUnmuteButton = () => {
  const html = `<i class="unmute fas fa-microphone-slash"></i><span class="unmute">Unmute</span>`;
  document.querySelector('.main__mute_button').innerHTML = html;
  document.querySelector('.main__mute_button').classList.add("unmute");
}
const setStopVideo = () => {
  const html = `<i class="fas fa-video"></i><span>Stop Video</span>`;
  document.querySelector('.main__video_button').innerHTML = html;
  document.querySelector('.main__video_button').classList.remove("stop");
}
const setPlayVideo = () => {
  const html = `<i class="stop fas fa-video-slash"></i><span class="stop">Play Video</span>`;
  document.querySelector('.main__video_button').innerHTML = html;
  document.querySelector('.main__video_button').classList.add("stop");
}