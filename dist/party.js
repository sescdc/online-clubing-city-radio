(() => {
  const element = id => document.getElementById(id);
  const form = element('party-join');
  const name = element('party-name');
  const join = form.querySelector('button');
  const grid = element('party-grid');
  const controls = element('party-controls');
  const count = element('party-count');
  const status = element('party-status');
  const openBrowser = element('party-open-browser');
  const kinds = {audio: element('party-mic'), video: element('party-camera')};
  const labels = {audio: 'Mic', video: 'Camera'};
  const meet = element('party-meet');
  const meetToggle = element('party-meet-toggle');
  const meetStatus = element('party-meet-status');
  const meetActions = element('party-meet-actions');
  const chat = element('meet-chat');
  const chatMessages = element('meet-messages');
  const chatForm = element('meet-form');
  const chatInput = element('meet-message');
  const chatSend = chatForm.querySelector('button');
  const backdrop = element('party-backdrop');
  const backdropPreview = element('party-backdrop-preview');
  const backdropFile = element('party-backdrop-file');
  const backdropStatus = element('party-backdrop-status');
  const customOption = backdrop.querySelector('option[value="custom"]');
  const spotlight = element('karaoke-singer-video');
  let spotlightId = null;
  let room = null;
  let active = null;
  let attempt = 0;
  let joining = false;
  let customPhoto = null;
  let savedBackdrop = '';
  try {
    const saved = localStorage.getItem('club-party-backdrop');
    if (saved && saved !== 'custom' && [...backdrop.options].some(option => option.value === saved)) {
      backdrop.value = savedBackdrop = saved;
    }
  } catch {}
  backdropPreview.dataset.backdrop = backdrop.value;

  function paintBackdrop(card, choice) {
    if (card.dataset.backdrop === choice) return;
    card.dataset.backdrop = choice;
    const version = /^custom:([a-f0-9-]{36})$/.exec(choice)?.[1];
    card.style.backgroundImage = version ? 'url("/api/party/backdrop?v=' + version + '")'
      : choice === 'custom' && customPhoto ? 'url("data:image/jpeg;base64,' + customPhoto + '")' : '';
  }

  function currentBackdrop(session) {
    return backdrop.value === 'custom' ? session.backdropVersion ? 'custom:' + session.backdropVersion : '' : backdrop.value;
  }

  async function uploadBackdrop(session, photo) {
    const data = await api('backdrop', {...identity(session), image:photo});
    if (active !== session) return;
    session.backdropVersion = data.version;
  }

  async function readBackdrop(file) {
    if (file.size > 15 * 1024 * 1024) throw new Error('Choose a photo under 15 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('This photo could not be opened. Try a JPG, PNG, or WebP.'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 448;
      canvas.height = 252;
      const context = canvas.getContext('2d');
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      for (const quality of [0.78, 0.6, 0.42, 0.25]) {
        const photo = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        if (photo && photo.length <= 65_536) return photo;
      }
      throw new Error('This photo is too large. Choose another photo.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function describeMediaError(kind, error) {
    const device = labels[kind].toLowerCase();
    const policy = document.permissionsPolicy ?? document.featurePolicy;
    const permission = kind === 'video' ? 'camera' : 'microphone';
    const embedded = window.self !== window.top;
    const blockedByPreview = embedded && (policy?.allowsFeature?.(permission) === false
      || !navigator.mediaDevices?.getUserMedia || error.name === 'NotAllowedError' || error.name === 'SecurityError');
    if (blockedByPreview) {
      openBrowser.href = location.href;
      openBrowser.hidden = false;
      return 'Open this room directly in your browser, then join again and tap ' + labels[kind] + ' to allow access.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'Camera and mic access needs a supported browser on the secure site. Open Online Clubing in Safari, Chrome, Edge, or Firefox.';
    }
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Allow the ' + device + ' in this site’s browser settings, then tap ' + labels[kind] + ' again. On a phone or tablet, also check the browser’s device permissions.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No ' + device + ' was found. Connect or enable one, then try again.';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'The ' + device + ' could not start. Close other apps or tabs using it and try again.';
      default:
        return 'Could not start the ' + device + '. Check that it’s enabled on your device and try again.';
    }
  }

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
    video.setAttribute('playsinline', '');
    video.className = local ? 'self' : '';
    const tag = document.createElement('span');
    tag.className = 'party-tag';
    card.append(avatar, video, tag);
    grid.append(card);
    return {card, video, tag};
  }

  function renderSpotlight() {
    const view = !active ? null
      : spotlightId === active.id || (!spotlightId && !element('karaoke-main-stage').hidden) ? active.view
      : active.peers.get(spotlightId)?.view ?? active.audience.get(spotlightId);
    const old = spotlight.firstElementChild;
    if (old && old !== view?.card) grid.append(old);
    if (view && old !== view.card) spotlight.append(view.card);
    element('karaoke-singer-empty').hidden = Boolean(view);
  }

  function updateTile(view, member, local) {
    view.tag.textContent = member.name + (local ? ' (you)' : '') + (member.mic ? '' : ' · muted');
    view.video.classList.toggle('camera-off', !member.camera);
    paintBackdrop(view.card, member.backdrop ?? '');
  }

  function identity(session) {
    return {room: session.room, id: session.id, token: session.token};
  }

  function queue(session, target, type, data) {
    session.outgoing.push({target, type, data, nonce: crypto.randomUUID()});
  }

  function connection(session, member) {
    const pc = new RTCPeerConnection({
      iceServers: session.iceServers ?? [{urls: 'stun:stun.l.google.com:19302'}]
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
      if (!event.candidate || active !== session || session.peers.get(member.id)?.pc !== pc) return;
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

  function micLocked(session) {
    return Boolean(session.singer && session.singer !== session.id);
  }

  function applySinger(session, singer, time) {
    if (time < (session.singerTime ?? 0)) return;
    session.singerTime = time;
    if (session.singer === singer) return;
    session.singer = singer;
    if (micLocked(session) && session.tracks.audio) {
      session.tracks.audio.stop();
      session.tracks.audio = null;
      for (const peer of session.peers.values()) {
        void peer.senders.audio?.replaceTrack(null).catch(() => {});
      }
    }
    for (const peer of session.peers.values()) updatePeer(peer);
    updateControls(session);
  }

  function updatePeer(peer) {
    const singer = active?.singer;
    peer.view.video.muted = Boolean(singer && singer !== peer.member.id);
    peer.view.card.classList.toggle('party-singing', singer === peer.member.id);
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

  function clearPeers(session) {
    for (const peer of session.peers.values()) {
      peer.pc.close();
      peer.view.video.srcObject = null;
      peer.view.card.remove();
    }
    session.peers.clear();
  }

  function switchChannel(session, channel) {
    if (session.channel === channel) return;
    clearPeers(session);
    session.channel = channel;
    chatInput.value = '';
    chatMessages.replaceChildren();
    session.chatLast = null;
    chat.hidden = !channel;
    session.cursor = 0;
    session.outgoing = [];
    // Restart muted and with the camera off at both privacy boundaries.
    for (const track of Object.values(session.tracks)) track?.stop();
    session.tracks = {};
    session.view.video.srcObject = null;
    element('party-sound').hidden = true;
    updateControls(session);
    window.dispatchEvent(new CustomEvent('club-meeting', {detail: Boolean(channel)}));
    if (channel) showMeet(session, true);
  }

  function showMeet(session, open) {
    session.meetOpen = open;
    meet.hidden = !open;
    meetToggle.setAttribute('aria-expanded', String(open));
  }

  function renderMeet(session) {
    const invite = session.invite;
    const otherGuests = session.members.filter(member => member.id !== session.id);
    const state = JSON.stringify([session.channel, invite, otherGuests.map(({id, name}) => [id, name]), session.meetBusy, session.meetError]);
    if (session.meetState === state) return;
    session.meetState = state;
    meetActions.replaceChildren();
    function action(label, name, details, primary = false) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button compact ' + (primary ? 'primary' : 'outline');
      button.textContent = label;
      button.disabled = session.meetBusy;
      button.addEventListener('click', async () => {
        session.meetBusy = true;
        session.meetError = '';
        // Keep focus on the chosen control until the server returns.
        button.disabled = true;
        try { await api('meet', {...identity(session), action: name, ...details}); }
        catch (error) { session.meetError = error.message || 'Try again.'; }
        finally {
          session.meetBusy = false;
          if (active === session) {
            session.meetState = null;
            renderMeet(session);
          }
        }
      });
      meetActions.append(button);
    }
    if (session.channel) {
      meetStatus.textContent = 'Private room with ' + (otherGuests[0]?.name ?? 'your guest') + '. Turn on your mic or camera when ready.';
      action('Return to party', 'dismiss', {invite: session.channel}, true);
    } else if (invite) {
      const incoming = invite.host !== session.id;
      meetStatus.textContent = incoming ? invite.hostName + ' invited you to Meet & Greet.'
        : 'Waiting for ' + invite.guestName + ' to accept.';
      if (incoming) action('Accept invite', 'accept', {invite: invite.id}, true);
      action(incoming ? 'Decline invite' : 'Cancel invite', 'dismiss', {invite: invite.id});
    } else {
      meetStatus.textContent = otherGuests.length ? 'Invite a guest from this party.' : 'Wait for another guest to join the party.';
      for (const member of otherGuests) action('Invite ' + member.name, 'invite', {target: member.id});
    }
    if (session.meetError) meetStatus.textContent += ' ' + session.meetError;
  }

  function renderChat(session, messages) {
    const latest = messages.at(-1)?.id ?? null;
    if (session.chatLast === latest) return;
    session.chatLast = latest;
    const guest = session.members.find(member => member.id !== session.id);
    chatMessages.replaceChildren(...messages.map(message => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = message.sender === session.id ? 'You' : guest?.name ?? 'Guest';
      row.append(name, document.createTextNode(' ' + message.text));
      return row;
    }));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatForm.addEventListener('submit', async event => {
    event.preventDefault();
    const session = active;
    const message = chatInput.value.trim();
    if (!session?.channel || !message || chatSend.disabled) return;
    chatSend.disabled = true;
    try {
      await api('meet', {...identity(session), action: 'message', invite: session.channel, text: message});
      if (chatInput.value.trim() === message) chatInput.value = '';
    } catch (error) {
      if (active === session) status.textContent = error.message || 'Could not send your message.';
    } finally {
      chatSend.disabled = false;
    }
  });

  async function sync(session) {
    const outgoing = session.outgoing.slice(0, 30);
    try {
      const data = await api('sync', {
        ...identity(session), cursor: session.cursor, outgoing, channel: session.channel,
        backdrop: currentBackdrop(session),
        camera: Boolean(session.tracks.video), mic: Boolean(session.tracks.audio)
      });
      if (active !== session) return;
      if (session.retrying) status.textContent = '';
      session.retrying = false;
      const nextChannel = data.channel ?? '';
      if (nextChannel === session.channel) session.outgoing.splice(0, outgoing.length);
      else switchChannel(session, nextChannel);
      applySinger(session, data.singer ?? null, data.now ?? 0);
      if (data.invite?.id !== session.invite?.id && data.invite?.host !== session.id && data.invite) showMeet(session, true);
      session.invite = data.invite;
      session.members = data.members;
      renderMeet(session);
      if (session.channel) renderChat(session, data.chat ?? []);
      count.textContent = data.members.length + (data.members.length === 1 ? ' guest' : ' guests');
      // Keep the peer mesh bounded. All other members are visible as audience tiles.
      const mediaSeats = data.members.filter(member => member.id !== data.singer).slice(0, data.singer ? 5 : 6);
      const performer = data.members.find(member => member.id === data.singer);
      if (performer) mediaSeats.unshift(performer);
      const media = new Set(mediaSeats.map(member => member.id));
      const connected = media.has(session.id);
      const guests = new Set(data.members.map(member => member.id));
      for (const [id, peer] of session.peers) {
        if (!connected || !media.has(id)) {
          peer.pc.close();
          peer.view.card.remove();
          session.peers.delete(id);
          session.outgoing = session.outgoing.filter(message => message.target !== id);
        }
      }
      for (const [id, view] of session.audience) {
        if (!guests.has(id) || (connected && media.has(id))) {
          view.card.remove();
          session.audience.delete(id);
        }
      }
      session.audienceOnly = !connected;
      updateControls(session);
      for (const member of data.members) {
        if (member.id === session.id) continue;
        if (!connected || !media.has(member.id)) {
          const view = session.audience.get(member.id) ?? tile(member, false);
          session.audience.set(member.id, view);
          updateTile(view, {...member, camera: false, mic: false}, false);
          view.tag.textContent = member.name + ' · audience';
          continue;
        }
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
      renderSpotlight();
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
      clearPeers(session);
      if (session.channel) window.dispatchEvent(new CustomEvent('club-meeting', {detail: false}));
      window.dispatchEvent(new CustomEvent('club-party-left', {detail: session.room}));
      void api('leave', identity(session)).catch(() => {});
    }
    grid.replaceChildren();
    spotlight.replaceChildren();
    renderSpotlight();
    grid.hidden = controls.hidden = count.hidden = true;
    element('party-audience').hidden = true;
    element('party-sound').hidden = true;
    meet.hidden = true;
    meetToggle.setAttribute('aria-expanded', 'false');
    meetActions.replaceChildren();
    chat.hidden = true;
    chatInput.value = '';
    chatMessages.replaceChildren();
    form.hidden = false;
    join.disabled = false;
    status.textContent = message;
    openBrowser.hidden = true;
  }

  function updateControls(session) {
    for (const [kind, button] of Object.entries(kinds)) {
      const on = Boolean(session.tracks[kind]);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = labels[kind] + (on ? ' on' : ' off');
    }
    element('party-audience').hidden = !session.audienceOnly;
    if (session.audienceOnly) {
      for (const [kind, track] of Object.entries(session.tracks)) {
        track?.stop();
        session.tracks[kind] = null;
      }
      session.view.video.srcObject = null;
    }
    kinds.audio.disabled = session.audienceOnly || micLocked(session) || session.pendingMedia.has('audio');
    kinds.video.disabled = session.audienceOnly || session.pendingMedia.has('video');
    if (session.audienceOnly) {
      kinds.audio.textContent = 'Audience mic off';
      kinds.video.textContent = 'Audience camera off';
    }
    if (micLocked(session)) kinds.audio.textContent = 'Mic locked for singer';
    session.view.card.classList.toggle('party-singing', session.singer === session.id);
    updateTile(session.view, {name: session.name, camera: session.tracks.video, mic: session.tracks.audio, backdrop: backdrop.value}, true);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    try { await joinRoom(name.value.trim()); }
    catch (error) { status.textContent = error.message; }
  });

  async function joinRoom(displayName, focusMic = true) {
    if (active && !active.channel) return identity(active);
    if (!room || active || joining) throw new Error('The video room is busy. Try again.');
    if (!displayName) {
      name.focus();
      throw new Error('Enter a display name.');
    }
    if (!window.RTCPeerConnection) throw new Error('This browser does not support video rooms.');
    const request = ++attempt;
    const selected = room;
    joining = join.disabled = true;
    status.textContent = 'Joining the video room…';
    window.dispatchEvent(new CustomEvent('club-party-joining', {detail: selected}));
    try {
      const ticket = await api('join', {room: selected, name: displayName});
      if (attempt !== request) {
        void api('leave', {...ticket, room: selected}).catch(() => {});
        return null;
      }
      name.value = displayName;
      const view = tile({name: displayName}, true);
      const session = {...ticket, room: selected, name: displayName, view, tracks: {}, peers: new Map(), audience: new Map(), outgoing: [], cursor: 0, channel: '', members: [], pendingMedia: new Set()};
      active = session;
      const singerName = element('singer-name');
      if (!singerName.value) singerName.value = displayName;
      form.hidden = true;
      grid.hidden = controls.hidden = count.hidden = false;
      count.textContent = '1 guest';
      status.textContent = '';
      openBrowser.hidden = true;
      updateControls(session);
      if (focusMic) kinds.audio.focus();
      if (customPhoto && backdrop.value === 'custom') {
        backdropFile.disabled = true;
        void uploadBackdrop(session, customPhoto).catch(() => {
          if (active === session) {
            backdrop.value = savedBackdrop;
            paintBackdrop(backdropPreview, savedBackdrop);
            updateControls(session);
            backdropStatus.textContent = 'Your upload could not be shared in this room. Choose a photo to retry.';
          }
        }).finally(() => { if (active === session) backdropFile.disabled = false; });
      } else backdropFile.disabled = false;
      window.dispatchEvent(new CustomEvent('club-party-joined', {detail: selected}));
      void sync(session);
      return identity(session);
    } catch (error) {
      if (attempt !== request) return null;
      const message = error.status ? error.message : 'Could not join the video room. Try again.';
      status.textContent = message;
      throw new Error(message);
    } finally {
      if (attempt === request) joining = join.disabled = false;
    }
  }

  for (const [kind, button] of Object.entries(kinds)) {
    button.addEventListener('click', async () => {
      const session = active;
      if (!session || session.audienceOnly || (kind === 'audio' && micLocked(session))) return;
      button.disabled = true;
      session.pendingMedia.add(kind);
      const channel = session.channel;
      try {
        openBrowser.hidden = true;
        const previous = session.tracks[kind];
        let track = null;
        if (previous) previous.stop();
        else {
          const constraints = kind === 'video'
            ? {video: {width: {ideal: 640}, height: {ideal: 360}, frameRate: {ideal: 24}}}
            : {audio: true};
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          } catch (error) {
            if (kind !== 'video' || !['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)
              || active !== session || channel !== session.channel) throw error;
            stream = await navigator.mediaDevices.getUserMedia({video: true});
          }
          [track] = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
          if (!track) throw new DOMException('No ' + kind + ' device track', 'NotFoundError');
          if (active !== session || channel !== session.channel || session.audienceOnly || (kind === 'audio' && micLocked(session))) {
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
        if (kind === 'video') {
          session.view.video.srcObject = track ? new MediaStream([track]) : null;
          if (track) void session.view.video.play().catch(() => {});
        }
        const changes = await Promise.allSettled([...session.peers.values()].flatMap(peer => peer.senders[kind]?.replaceTrack(track) ?? []));
        if (active !== session) return;
        status.textContent = changes.some(result => result.status === 'rejected') ? 'A guest could not receive your ' + labels[kind].toLowerCase() + '.' : '';
        updateControls(session);
      } catch (error) {
        if (active === session && channel === session.channel) status.textContent = describeMediaError(kind, error);
      } finally {
        session.pendingMedia.delete(kind);
        if (active === session) updateControls(session);
      }
    });
  }

  meetToggle.addEventListener('click', () => {
    if (active) showMeet(active, !active.meetOpen);
  });
  backdrop.addEventListener('change', () => {
    if (backdrop.value !== 'custom') {
      savedBackdrop = backdrop.value;
      try { localStorage.setItem('club-party-backdrop', savedBackdrop); } catch {}
    }
    backdropStatus.textContent = '';
    paintBackdrop(backdropPreview, backdrop.value);
    if (active) updateControls(active);
  });
  backdropFile.addEventListener('change', async () => {
    const session = active;
    const file = backdropFile.files[0];
    if (!session || !file) return;
    backdropFile.disabled = true;
    backdropStatus.textContent = 'Preparing photo…';
    try {
      const photo = await readBackdrop(file);
      if (active !== session) return;
      await uploadBackdrop(session, photo);
      if (active !== session) return;
      customPhoto = photo;
      customOption.hidden = false;
      backdrop.value = 'custom';
      backdropPreview.dataset.backdrop = '';
      session.view.card.dataset.backdrop = '';
      paintBackdrop(backdropPreview, 'custom');
      updateControls(session);
      backdropStatus.textContent = 'Your photo is ready. It appears when your camera is off.';
    } catch (error) {
      if (active === session) backdropStatus.textContent = error.message || 'Could not upload your photo.';
    } finally {
      if (active === session) {
        backdropFile.disabled = false;
        backdropFile.value = '';
      }
    }
  });
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
    spotlight(id) {
      spotlightId = id;
      renderSpotlight();
    },
    joinSinger(displayName) { return joinRoom(displayName, false); },
    isInside(selected) { return active?.room === selected && !active.channel; },
    singer(nextRoom, id, time) {
      if (active?.room === nextRoom && !active.channel) applySinger(active, id, time);
    },
    select(next) {
      if (next === room) return;
      leave();
      room = next;
    }
  };
})();
