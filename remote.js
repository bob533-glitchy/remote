(() => {
  const cfg = window.TLD_REMOTE_CONFIG || {};
  const server = cfg.SIGNAL_SERVER;
  const $ = id => document.getElementById(id);
  const statusText = $("statusText"), status = document.querySelector(".status");
  const connectPanel = $("connectPanel"), screenPanel = $("screenPanel");
  const video = $("remoteVideo"), empty = $("emptyScreen");
  let socket = null, pc = null, channel = null, connected = false;

  function setStatus(text, good=false) {
    statusText.textContent = text;
    status.classList.toggle("connected", good);
  }
  function message(text) { $("message").textContent = text; }
  function cleanup() {
    connected = false;
    if (channel) { try { channel.close(); } catch {} }
    if (pc) { try { pc.close(); } catch {} }
    if (socket) { socket.disconnect(); }
    channel = pc = socket = null;
    video.srcObject = null;
    connectPanel.classList.remove("hidden");
    screenPanel.classList.add("hidden");
    setStatus("Not connected");
  }
  function sendInput(payload) {
    if (channel && channel.readyState === "open") channel.send(JSON.stringify(payload));
  }

  $("connectBtn").addEventListener("click", async () => {
    message("");
    const code = $("pairCode").value.replace(/\D/g, "").slice(0, 6);
    if (!server || server.includes("YOUR-RAILWAY")) return message("Set SIGNAL_SERVER in config.js before connecting.");
    if (code.length !== 6) return message("Enter the 6-digit code from your Windows app.");
    $("connectBtn").disabled = true;
    setStatus("Connecting…");
    try {
      socket = io(server, { transports: ["websocket", "polling"], timeout: 12000 });
      socket.on("connect", () => socket.emit("viewer:join", { code }));
      socket.on("connect_error", () => { message("Could not reach the connection server."); cleanup(); $("connectBtn").disabled=false; });
      socket.on("viewer:joined", async () => {
        connectPanel.classList.add("hidden");
        screenPanel.classList.remove("hidden");
        setStatus("Waiting for desktop…");
        pc = new RTCPeerConnection({ iceServers: [{urls:"stun:stun.l.google.com:19302"}] });
        pc.ontrack = e => { video.srcObject = e.streams[0]; empty.classList.add("hidden"); setStatus("Connected", true); };
        pc.ondatachannel = e => { channel = e.channel; };
        pc.onicecandidate = e => { if(e.candidate) socket.emit("signal", {code, data:{type:"candidate",candidate:e.candidate}}); };
        socket.on("signal", async ({data}) => {
          try {
            if(data.type==="offer") {
              await pc.setRemoteDescription(data);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("signal",{code,data:pc.localDescription});
            } else if(data.type==="candidate" && data.candidate) await pc.addIceCandidate(data.candidate);
          } catch(err) { message("WebRTC setup failed: "+err.message); }
        });
      });
      socket.on("server:error", data => { message(data.message || "Connection rejected."); cleanup(); $("connectBtn").disabled=false; });
      socket.on("session:ended", () => { message("The Windows app ended the session."); cleanup(); $("connectBtn").disabled=false; });
      socket.on("host:ready", () => setStatus("Pairing accepted", true));
    } catch(err) {
      message(err.message); cleanup(); $("connectBtn").disabled=false;
    }
  });

  $("disconnectBtn").addEventListener("click", () => {
    if(socket) socket.emit("viewer:leave");
    cleanup(); $("connectBtn").disabled=false;
  });

  const wrap = $("screenWrap");
  wrap.tabIndex = 0;
  wrap.addEventListener("pointerdown", e => {
    wrap.focus();
    const r=video.getBoundingClientRect();
    if(!video.srcObject || !r.width || !r.height) return;
    sendInput({type:"mouse",action:"move",x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
    if(e.button===0 || e.button===2) sendInput({type:"mouse",action:"button",button:e.button===2?"right":"left",down:true});
  });
  window.addEventListener("pointerup", e => {
    if(e.button===0 || e.button===2) sendInput({type:"mouse",action:"button",button:e.button===2?"right":"left",down:false});
  });
  wrap.addEventListener("pointermove", e => {
    if(e.buttons===0) return;
    const r=video.getBoundingClientRect();
    if(r.width && r.height) sendInput({type:"mouse",action:"move",x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
  });
  wrap.addEventListener("wheel", e => sendInput({type:"mouse",action:"scroll",delta:Math.sign(e.deltaY)*3}), {passive:true});
  wrap.addEventListener("contextmenu", e => e.preventDefault());
  wrap.addEventListener("keydown", e => {
    if(["Tab","Alt","Meta","Control"].includes(e.key)) return;
    e.preventDefault();
    sendInput({type:"key",action:"down",key:e.key});
  });
  wrap.addEventListener("keyup", e => sendInput({type:"key",action:"up",key:e.key}));
  window.addEventListener("beforeunload", cleanup);
})();
