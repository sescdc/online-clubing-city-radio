(() => {
  const el = id => document.getElementById(id);
  const tracks = new Map(window.clubKaraoke.originals.map(song => [song.id, song]));
  const audio = el('stage-audio');
  const sound = el('stage-sound');
  const audioStatus = el('stage-audio-status');
  const signup = el('singer-form');
  const start = el('singer-start');
  const leave = el('singer-leave');
  const status = el('singer-status');
  const list = el('singer-list');
  let current = null;
  let audioTrack = null;
  let soundEnabled = false;
  let playAttempt = 0;
  let singerKey = crypto.randomUUID();
  try {
    const saved = sessionStorage.getItem('club-singer-key');
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) singerKey = saved;
    sessionStorage.setItem('club-singer-key', singerKey);
  } catch {}

  for (const track of tracks.values()) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.title + ' · ' + track.genre;
    el('singer-song').append(option);
  }

  function audioSource(track) {
    if (!track || track.id === audioTrack) return;
    audioTrack = track.id;
    audio.src = track.audio;
    audio.load();
  }

  function mute() {
    playAttempt += 1;
    soundEnabled = false;
    audio.pause();
    sound.textContent = 'Enable sound';
    audioStatus.textContent = '';
  }

  function elapsed(session) {
    return Math.max(0, (session.now - session.live.started_at + performance.now() - session.clock) / 1000);
  }

  function positionAudio(session, force = false) {
    if (current !== session || !session.live || audio.readyState < 1) return;
    const expected = elapsed(session);
    if (expected < audio.duration && (force || Math.abs(audio.currentTime - expected) > 1.5)) {
      audio.currentTime = expected;
    }
  }

  function playAudio(session, track) {
    if (!track) return;
    window.clubKaraoke.stop();
    audioSource(track);
    soundEnabled = true;
    const attempt = ++playAttempt;
    if (session.live) positionAudio(session, true);
    sound.textContent = 'Mute backing track';
    audio.play().catch(error => {
      if (current !== session || playAttempt !== attempt) return;
      mute();
      audioStatus.textContent = error.name === 'NotAllowedError'
        ? 'Tap Enable sound to start the backing track.'
        : 'The backing track could not load. Tap Enable sound to retry.';
    });
  }

  audio.addEventListener('loadedmetadata', () => {
    if (current?.live) positionAudio(current, true);
  });
  audio.addEventListener('playing', () => {
    if (soundEnabled && current) audioStatus.textContent = 'Backing track playing.';
  });
  audio.addEventListener('error', () => {
    if (!current?.live || !soundEnabled) return;
    mute();
    audioTrack = null;
    audioStatus.textContent = 'The backing track could not load. Tap Enable sound to retry.';
  });
  sound.addEventListener('click', () => {
    if (!current?.live) return;
    if (soundEnabled) mute();
    else playAudio(current, tracks.get(current.live.track));
  });

  async function api(session, payload) {
    const url = new URL('/api/karaoke', location.origin);
    url.searchParams.set('room', session.room);
    const response = await fetch(url, {
      ...(payload ? {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({...payload, key:singerKey})
      } : {}),
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'The karaoke stage is unavailable.');
    return data;
  }

  function renderLine(session) {
    if (current !== session) return;
    const turn = session.live;
    const track = turn && tracks.get(turn.track);
    if (!track || session.now + performance.now() - session.clock >= turn.ends_at) {
      el('stage-performer').textContent = '';
      el('stage-lyric').textContent = 'Waiting for a singer';
      el('stage-next-line').textContent = '';
      return;
    }
    const bar = Math.floor(elapsed(session) * track.bpm / 240);
    el('stage-performer').textContent = turn.singer + ' · ' + track.title;
    const line = track.lyrics[Math.min(bar, track.lyrics.length - 1)];
    if (el('stage-lyric').textContent !== line) {
      el('stage-lyric').textContent = line;
      el('stage-next-line').textContent = track.lyrics[bar + 1] ?? '';
    }
  }

  function renderQueue(session) {
    if (session.display) return;
    const own = session.turns.find(turn => turn.id === session.own);
    const waiting = session.turns.filter(turn => turn.started_at === null);
    const ready = own && !session.live && waiting[0]?.id === own.id;
    signup.hidden = Boolean(own);
    el('singer-turn').hidden = !own;
    start.hidden = !ready;
    start.disabled = Boolean(session.busy);
    leave.disabled = Boolean(session.busy);
    leave.textContent = own?.started_at ? 'End my song' : 'Leave list';
    el('singer-submit').disabled = Boolean(session.busy);
    el('singer-empty').hidden = session.turns.length > 0;
    const signature = JSON.stringify([session.turns, session.own]);
    if (signature === session.rendered) return;
    session.rendered = signature;
    list.replaceChildren(...session.turns.map((turn, index) => {
      const item = document.createElement('li');
      item.classList.toggle('is-live', Boolean(turn.started_at));
      item.textContent = (turn.started_at ? 'Singing now: ' : !session.live && index === 0 ? 'Up next: ' : '')
        + turn.singer + (turn.id === session.own ? ' (you)' : '') + ' · ' + (tracks.get(turn.track)?.title ?? '');
      return item;
    }));
  }

  function apply(session, data, requestStarted) {
    if (current !== session) return;
    const previous = session.live;
    session.now = data.now;
    session.clock = (performance.now() + requestStarted) / 2;
    session.turns = data.turns;
    session.live = data.turns.find(turn => turn.started_at !== null);
    const next = session.live ?? session.turns[0];
    sound.disabled = !session.live;
    window.clubParty.singer(session.room, session.live?.performer_id ?? null, data.now);
    if (previous?.id !== session.live?.id) {
      if (session.live) {
        const track = tracks.get(session.live.track);
        if (soundEnabled && (audioTrack !== track?.id || audio.paused)) playAudio(session, track);
        else {
          audioSource(track);
          if (soundEnabled) positionAudio(session, true);
          else audioStatus.textContent = 'Enable sound to hear the backing track.';
        }
      } else {
        audio.pause();
        audioStatus.textContent = '';
      }
    }
    if (!session.live) audioSource(tracks.get(next?.track));
    renderLine(session);
    renderQueue(session);
  }

  async function refresh(session) {
    if (current !== session || session.fetching || session.busy) return;
    session.fetching = true;
    const requestStarted = performance.now();
    const revision = session.revision;
    try {
      const data = await api(session);
      if (current !== session || revision !== session.revision) return;
      if (session.loadFailed) (session.display ? audioStatus : status).textContent = '';
      session.loadFailed = false;
      apply(session, data, requestStarted);
    } catch (error) {
      if (current === session) {
        session.loadFailed = true;
        (session.display ? audioStatus : status).textContent = 'Could not load the singer list. Retrying…';
      }
    } finally {
      session.fetching = false;
    }
  }

  async function mutate(session, payload) {
    session.busy = true;
    session.revision += 1;
    const requestStarted = performance.now();
    renderQueue(session);
    status.textContent = '';
    try {
      const data = await api(session, payload);
      if (current !== session) return;
      if (payload.action === 'join') {
        session.own = data.id;
        try { sessionStorage.setItem('club-turn-' + session.room, String(data.id)); } catch {}
        status.textContent = 'You’re on the singer list.';
      } else if (payload.action === 'leave') {
        session.own = null;
        try { sessionStorage.removeItem('club-turn-' + session.room); } catch {}
        status.textContent = 'You left the singer list.';
      } else {
        apply(session, data, requestStarted);
        status.textContent = 'You’re on stage. Turn on your mic if it’s off.';
      }
    } catch (error) {
      if (current !== session) return;
      if (payload.action === 'start') mute();
      status.textContent = error.message || 'Could not update your turn. Try again.';
    } finally {
      session.busy = false;
      if (current === session) {
        renderQueue(session);
        void refresh(session);
      }
    }
  }

  signup.addEventListener('submit', event => {
    event.preventDefault();
    if (!current || current.busy) return;
    const name = el('singer-name').value.trim();
    if (!name) {
      status.textContent = 'Enter your singer name.';
      return;
    }
    void mutate(current, {action:'join', name, track:el('singer-song').value});
  });
  start.addEventListener('click', () => {
    const session = current;
    if (!session || session.busy || start.hidden) return;
    const party = window.clubParty.identity();
    if (!party || party.room !== session.room) {
      status.textContent = 'Join the singer screen before starting your song.';
      el('party-name').focus();
      return;
    }
    const own = session.turns.find(turn => turn.id === session.own);
    if (!own) return;
    playAudio(session, tracks.get(own.track));
    void mutate(session, {action:'start', id:own.id, party});
  });
  leave.addEventListener('click', () => {
    if (!current || current.busy || !current.own) return;
    if (current.live?.id === current.own) mute();
    void mutate(current, {action:'leave', id:current.own});
  });

  function close() {
    if (current) {
      clearInterval(current.poll);
      clearInterval(current.lyrics);
    }
    current = null;
    mute();
    audio.removeAttribute('src');
    audio.load();
    audioTrack = null;
    sound.disabled = true;
  }

  function open(room, title, display = false) {
    close();
    let own = null;
    try { own = Number(sessionStorage.getItem('club-turn-' + room)) || null; } catch {}
    const session = {room, display, own, turns:[], revision:0};
    current = session;
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('lyrics', room);
    url.searchParams.set('title', title);
    el('stage-popout').href = url.href;
    status.textContent = '';
    el('singer-name').value = el('party-name').value;
    el('singer-song').selectedIndex = 0;
    renderLine(session);
    renderQueue(session);
    void refresh(session);
    session.poll = setInterval(() => void refresh(session), 1100);
    session.lyrics = setInterval(() => renderLine(session), 120);
  }

  window.clubStage = {open, close, mute};
  const params = new URLSearchParams(location.search);
  const room = params.get('lyrics');
  if (room && /^(?:city-[a-z0-9-]{2,24}|nationwide|bay-stl)$/.test(room)) {
    const title = params.get('title')?.slice(0, 70) || 'Online Clubing';
    document.body.classList.add('stage-view-only');
    const display = el('stage-popout-view');
    display.hidden = false;
    el('stage-room-name').textContent = title;
    el('stage-popout').hidden = true;
    const back = new URL(location.pathname, location.origin);
    back.searchParams.set('room', room.replace(/^city-/, ''));
    back.searchParams.set('mode', 'karaoke');
    back.hash = 'radio-deck';
    el('stage-back').href = back.href;
    display.append(el('stage-screen'));
    open(room, title, true);
  }
})();
