const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// USE PUBLIC PEER CLOUD (Crucial for online deployment)
const myPeer = new Peer(undefined); 

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};
let myVideoStream;

navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  myVideoStream = stream;
  addVideoStream(myVideo, stream);

  myPeer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
  });

  socket.on('user-connected', userId => {
    connectToNewUser(userId, stream);
  });

  // Chat Logic
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
});

socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close();
});

myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id);
});

// FUNCTIONS
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

// BUTTONS
const muteUnmute = () => {
  const enabled = myVideoStream.getAudioTracks()[0].enabled;
  if (enabled) {
    myVideoStream.getAudioTracks()[0].enabled = false;
    setUnmuteButton();
  } else {
    setMuteButton();
    myVideoStream.getAudioTracks()[0].enabled = true;
  }
}

const playStop = () => {
  let enabled = myVideoStream.getVideoTracks()[0].enabled;
  if (enabled) {
    myVideoStream.getVideoTracks()[0].enabled = false;
    setPlayVideo();
  } else {
    setStopVideo();
    myVideoStream.getVideoTracks()[0].enabled = true;
  }
}

const shareScreen = () => {
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
const toggleChat = () => {
    const chat = document.getElementById("chat-section");
    if(chat.style.display === "none") {
        chat.style.display = "flex";
        document.querySelector(".main__left").style.flex = "0.8";
    } else {
        chat.style.display = "none";
        document.querySelector(".main__left").style.flex = "1";
    }
}