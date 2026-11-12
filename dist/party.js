(() => {
  const element = id => document.getElementById(id);
  const form = element('party-join');
  const name = element('party-name');
  const join = form.querySelector('button');
  const grid = element('party-grid');
  const controls = element('party-controls');
  const count = element('party-count');
  const status = element('party-status');
  const kinds = {audio: element('party-mic'), video: element('party-camera')};
  const labels = {audio: 'Mic', video: 'Camera'};
  let room = null;
  let active = null;
  let attempt = 0;
  let joining = false;

  async function api(action, body) {
    const response = await fetch('/api/party/' + action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      keepalive: action === 'leave',
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), {status: response.status});
    return data;
  }

  function tile(member, local) {
    const card = document.createElement('article');
    card.className = 'party-tile';
    const avatar = document.createElement('span');
    avatar.className = 'party-avatar';
    avatar.textContent = Array.from(member.name)[0].toUpperCase();
    avatar.setAttribute('aria-hidden', 'true');
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = local;
    video.className = local ? 'self' : '';
    const tag = document.createElement('span');
    tag.className = 'party-tag';
    card.append(avatar, video, tag);
    grid.append(card);
    return {card, video, tag};
  }

  function updateTile(view, member, local) {
    view.tag.textContent = member.name + (local ? ' (you)' : '') + (member.mic ? '' : ' · muted');
    view.video.classList.toggle('camera-off', !member.camera);
  }

  function identity(session) {
    return {room: session.room, id: session.id, token: session.token};
  }

  function queue(session, target, type, data) {
    session.outgoing.push({target, type, data, nonce: crypto.randomUUID()});
  }

  function connection(session, member) {
    const pc = new RTCPeerConnection({
      iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
    });
    const view = tile(member, false);
    const stream = new MediaStream();
    view.video.srcObject = stream;
    const senders = {};
    for (const kind of session.id < member.id ? Object.keys(kinds) : []) {
      const track = session.tracks[kind];
      senders[kind] = pc.addTransceiver(track ?? kind, {direction: 'sendrecv'}).sender;
    }
    const peer = {pc, view, senders, member, pending: [], localIce: [], descriptionQueued: false};
    session.peers.set(member.id, peer);
    pc.ontrack = event => {
      stream.addTrack(event.track);
      view.video.play().catch(() => {
        if (active !== session) return;
        element('party-sound').hidden = false;
      });
    };
    pc.onicecandidate = event => {
      if (!event.candidate || active !== session) return;
      const candidate = event.candidate.toJSON();
      if (peer.descriptionQueued) queue(session, member.id, 'ice', candidate);
      else peer.localIce.push(candidate);
    };
    pc.onconnectionstatechange = () => {
      if (active !== session) return;
      updatePeer(peer);
      if (pc.connectionState === 'failed') {
        status.textContent = 'A guest’s connection failed. Leave and rejoin to try again.';
      }
    };
    return peer;
  }

  function updatePeer(peer) {
    updateTile(peer.view, peer.member, false);
    const state = peer.pc.connectionState;
    if (state !== 'connected') {
      peer.view.tag.textContent += state === 'failed' ? ' · connection failed' : ' · connecting';
    }
  }

  function sendDescription(session, peer, target) {
    const description = peer.pc.localDescription;
    queue(session, target, description.type, description.toJSON());
    peer.descriptionQueued = true;
    for (const candidate of peer.localIce.splice(0)) queue(session, target, 'ice', candidate);
  }

  async function receive(session, message) {
    const peer = session.peers.get(message.sender);
    if (!peer) return;
    const {pc} = peer;
    const {type, data} = JSON.parse(message.payload);
    if (type === 'ice') {
      if (pc.remoteDescription) await pc.addIceCandidate(data);
      else peer.pending.push(data);
      return;
    }
    await pc.setRemoteDescription(data);
    for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate);
    if (type === 'offer') {
      for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track.kind;
        transceiver.direction = 'sendrecv';
        peer.senders[kind] = transceiver.sender;
        await transceiver.sender.replaceTrack(session.tracks[kind] ?? null);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      sendDescription(session, peer, message.sender);
    }
  }

  async function sync(session) {
    const outgoing = session.outgoing.slice(0, 30);
    try {
      const data = await api('sync', {
        ...identity(session), cursor: session.cursor, outgoing,
        camera: Boolean(session.tracks.video), mic: Boolean(session.tracks.audio)
      });
      if (active !== session) return;
      if (session.retrying) status.textContent = '';
      session.retrying = false;
      session.outgoing.splice(0, outgoing.length);
      count.textContent = data.members.length + (data.members.length === 1 ? ' guest' : ' guests');
      const members = new Set(data.members.map(member => member.id));
      for (const [id, peer] of session.peers) {
        if (!members.has(id)) {
          peer.pc.close();
          peer.view.card.remove();
          session.peers.delete(id);
        }
      }
      for (const member of data.members) {
        if (member.id === session.id) continue;
        let peer = session.peers.get(member.id);
        if (!peer) {
          peer = connection(session, member);
          if (session.id < member.id) {
            await peer.pc.setLocalDescription(await peer.pc.createOffer());
            sendDescription(session, peer, member.id);
          }
        }
        peer.member = member;
        updatePeer(peer);
      }
      for (const message of data.messages) {
        try { await receive(session, message); }
        catch { status.textContent = 'A guest’s connection failed. Leave and rejoin to try again.'; }
        session.cursor = message.id;
      }
    } catch (error) {
      if (active !== session) return;
      if (error.status === 401) {
        leave(error.message);
        return;
      }
      session.retrying = true;
      status.textContent = 'Reconnecting to the room…';
    }
    if (active === session) session.timer = setTimeout(() => sync(session), session.outgoing.length && !session.retrying ? 120 : 950);
  }

  function leave(message = '') {
    attempt += 1;
    joining = false;
    const session = active;
    active = null;
    if (session) {
      clearTimeout(session.timer);
      for (const track of Object.values(session.tracks)) track?.stop();
      for (const {pc} of session.peers.values()) pc.close();
      void api('leave', identity(session)).catch(() => {});
    }
    grid.replaceChildren();
    grid.hidden = controls.hidden = count.hidden = true;
    element('party-sound').hidden = true;
    form.hidden = false;
    join.disabled = false;
    status.textContent = message;
  }

  function updateControls(session) {
    for (const [kind, button] of Object.entries(kinds)) {
      const on = Boolean(session.tracks[kind]);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = labels[kind] + (on ? ' on' : ' off');
    }
    updateTile(session.view, {name: session.name, camera: session.tracks.video, mic: session.tracks.audio}, true);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const displayName = name.value.trim();
    if (!room || active || joining) return;
    if (!displayName) {
      status.textContent = 'Enter a display name.';
      name.focus();
      return;
    }
    if (!window.RTCPeerConnection) {
      status.textContent = 'This browser does not support video rooms.';
      return;
    }
    const request = ++attempt;
    const selected = room;
    joining = join.disabled = true;
    status.textContent = 'Joining the video room…';
    try {
      const ticket = await api('join', {room: selected, name: displayName});
      if (attempt !== request) {
        void api('leave', {...ticket, room: selected}).catch(() => {});
        return;
      }
      const view = tile({name: displayName}, true);
      const session = {...ticket, room: selected, name: displayName, view, tracks: {}, peers: new Map(), outgoing: [], cursor: 0};
      active = session;
      form.hidden = true;
      grid.hidden = controls.hidden = count.hidden = false;
      count.textContent = '1 guest';
      status.textContent = '';
      updateControls(session);
      kinds.audio.focus();
      void sync(session);
    } catch (error) {
      if (attempt === request) status.textContent = error.status ? error.message : 'Could not join. Try again.';
    } finally {
      if (attempt === request) joining = join.disabled = false;
    }
  });

  for (const [kind, button] of Object.entries(kinds)) {
    button.addEventListener('click', async () => {
      const session = active;
      if (!session) return;
      button.disabled = true;
      try {
        const previous = session.tracks[kind];
        let track = null;
        if (previous) previous.stop();
        else {
          const constraints = kind === 'video' ? {video: {width: {ideal: 640}, height: {ideal: 360}, frameRate: {ideal: 24}}} : {audio: true};
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          track = stream.getTracks()[0];
          if (active !== session) {
            track.stop();
            return;
          }
          track.addEventListener('ended', () => {
            if (active !== session || session.tracks[kind] !== track) return;
            session.tracks[kind] = null;
            updateControls(session);
          });
        }
        session.tracks[kind] = track;
        if (kind === 'video') session.view.video.srcObject = track ? new MediaStream([track]) : null;
        const changes = await Promise.allSettled([...session.peers.values()].flatMap(peer => peer.senders[kind]?.replaceTrack(track) ?? []));
        if (active !== session) return;
        status.textContent = changes.some(result => result.status === 'rejected') ? 'A guest could not receive your ' + labels[kind].toLowerCase() + '.' : '';
        updateControls(session);
      } catch {
        if (active === session) status.textContent = 'Could not access your ' + labels[kind].toLowerCase() + '. Check your browser permissions.';
      } finally {
        button.disabled = false;
      }
    });
  }

  element('party-sound').addEventListener('click', () => {
    if (!active) return;
    for (const {view} of active.peers.values()) void view.video.play().catch(() => {});
    element('party-sound').hidden = true;
  });
  element('party-leave').addEventListener('click', () => {
    leave();
    name.focus();
  });
  window.addEventListener('pagehide', () => leave());
  window.clubParty = {
    select(next) {
      if (next === room) return;
      leave();
      room = next;
    }
  };
})();
