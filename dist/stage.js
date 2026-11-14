(() => {
  const el = id => document.getElementById(id);
  const tracks = new Map(window.clubKaraoke.originals.map(song => [song.id, song]));
  const audio = el('stage-audio');
  const sound = el('stage-sound');
  const audioStatus = el('stage-audio-status');
  const signup = el('singer-form');
  const start = el('singer-start');
  const leave = el('singer-leave');
  const practice = el('singer-practice');
  const status = el('singer-status');
  const stage = el('stage-screen');
  const stageHome = stage.parentElement;
  const stageAnchor = stage.nextElementSibling;
  const mainStage = el('karaoke-main-stage');
  const countdown = el('stage-countdown');
  const youtube = el('stage-youtube');
  const youtubeLink = el('stage-youtube-link');
  const songSelect = el('singer-song');
  const isYouTube = track => track?.startsWith('youtube:');
  let youtubeFrame = null;
  let youtubeID = null;
  let youtubePlayer = null;
  let youtubeAPI;
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
    option.textContent = track.title;
    el('singer-song').append(option);
  }

  function showYouTube(id) {
    if (youtubeID === id) return;
    youtubeID = id;
    youtubePlayer?.destroy();
    youtubePlayer = null;
    youtube.replaceChildren();
    youtubeFrame = null;
    youtube.hidden = youtubeLink.hidden = !id;
    if (!id) return;
    youtubeLink.href = 'https://www.youtube.com/watch?v=' + id;
    const player = document.createElement('iframe');
    player.className = 'karaoke-youtube-player';
    player.title = 'YouTube karaoke video';
    player.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    youtube.append(player);
    youtubeFrame = player;
  }

  function videoSource(seconds, autoplay) {
    const url = new URL('https://www.youtube.com/embed/' + youtubeID);
    url.search = new URLSearchParams({
      playsinline: '1', autoplay: String(Number(autoplay)), start: String(Math.floor(seconds)),
      controls: '0', disablekb: '1', enablejsapi: '1', origin: location.origin
    });
    youtubeFrame.src = url.href;
  }

  function loadYouTubeAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    youtubeAPI ??= new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.addEventListener('error', reject, {once:true});
      document.head.append(script);
    }).catch(error => {
      youtubeAPI = null;
      throw error;
    });
    return youtubeAPI;
  }

  async function reportVideoTiming(session, turn, player) {
    if (current !== session || session.live?.id !== turn.id || session.own !== turn.id
      || session.videoTimingTurn === turn.id) return;
    const duration = Math.round(player.getDuration() * 1000);
    if (!Number.isSafeInteger(duration) || duration < 1000) return;
    session.videoTimingTurn = turn.id;
    try {
      await api(session, {action:'video-timing', id:turn.id, duration});
    } catch {
      session.videoTimingTurn = null;
    }
  }

  async function setupVideoEvents(session, turn, frame) {
    try {
      const yt = await loadYouTubeAPI();
      if (frame !== youtubeFrame || current !== session || session.live?.id !== turn.id) return;
      youtubePlayer = new yt.Player(frame, {
        events: {
          onReady: event => void reportVideoTiming(session, turn, event.target),
          onAutoplayBlocked: () => {
            if (frame !== youtubeFrame || current !== session || session.live?.id !== turn.id) return;
            sound.hidden = false;
            audioStatus.textContent = 'Tap Play video to join the song in progress.';
          },
          onStateChange: event => {
            if (frame !== youtubeFrame || current !== session || session.live?.id !== turn.id) return;
            if (event.data === yt.PlayerState.PLAYING) {
              sound.hidden = true;
              audioStatus.textContent = '';
              void reportVideoTiming(session, turn, event.target);
            } else if (event.data === yt.PlayerState.PAUSED && elapsed(session) * 1000 < turn.ends_at - turn.started_at) {
              sound.hidden = false;
              audioStatus.textContent = 'Tap Play video to rejoin the song in progress.';
            }
          }
        }
      });
    } catch {
      // The embed and direct YouTube link are still available.
    }
  }

  function updatePlayback(session, turn, milliseconds) {
    const track = tracks.get(turn.track);
    const video = isYouTube(turn.track);
    const beforeStart = milliseconds < 0;
    countdown.hidden = !beforeStart;
    if (beforeStart) {
      const remaining = 'Starting in ' + Math.min(5, Math.ceil(-milliseconds / 1000));
      if (countdown.textContent !== remaining) countdown.textContent = remaining;
    }
    if (!video || beforeStart) sound.hidden = beforeStart;
    el('stage-display').hidden = video && !beforeStart;
    if (video) {
      showYouTube(turn.track.slice(8));
      youtube.hidden = beforeStart;
      sound.textContent = 'Play video';
      if (!beforeStart && session.playingTurn !== turn.id) {
        session.playingTurn = turn.id;
        sound.hidden = false;
        videoSource(elapsed(session), true);
        void setupVideoEvents(session, turn, youtubeFrame);
        audioStatus.textContent = 'If playback is blocked, tap Play video or Watch on YouTube.';
      }
    } else {
      showYouTube(null);
      if (!beforeStart && session.playingTurn !== turn.id) {
        session.playingTurn = turn.id;
        audio.muted = false;
        if (turn.id === session.own || soundEnabled) playAudio(session, track);
        else audioStatus.textContent = 'Tap Play backing track to hear the music.';
      }
    }
  }

  function audioSource(track) {
    if (!track || (track.id === audioTrack && !audio.error)) return;
    audioTrack = track.id;
    audio.src = track.audio;
    audio.load();
  }

  function mute() {
    playAttempt += 1;
    soundEnabled = false;
    audio.pause();
    audio.muted = false;
    sound.textContent = 'Play backing track';
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
        ? 'Tap Play backing track to hear the music.'
        : 'The backing track could not load. Tap Play backing track to retry.';
    });
  }

  audio.addEventListener('loadedmetadata', () => {
    if (current?.live && tracks.get(current.live.track)?.id === audioTrack) positionAudio(current, true);
  });
  audio.addEventListener('playing', () => {
    if (soundEnabled && current) audioStatus.textContent = 'Backing track playing.';
  });
  audio.addEventListener('error', () => {
    if (!current?.live || !soundEnabled) return;
    mute();
    audioTrack = null;
    audioStatus.textContent = 'The backing track could not load. Tap Play backing track to retry.';
  });
  sound.addEventListener('click', () => {
    if (!current?.live || sound.hidden) return;
    if (isYouTube(current.live.track)) {
      if (typeof youtubePlayer?.seekTo === 'function') {
        youtubePlayer.seekTo(elapsed(current), true);
        youtubePlayer.playVideo();
      } else videoSource(elapsed(current), true);
    } else if (soundEnabled) {
      audio.muted = !audio.muted;
      sound.textContent = audio.muted ? 'Unmute backing track' : 'Mute backing track';
    }
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
    const now = session.now + performance.now() - session.clock;
    const activeTurn = turn && now < turn.ends_at;
    if (!activeTurn) {
      if (turn && !audio.paused) audio.pause();
      countdown.hidden = sound.hidden = true;
      el('stage-display').hidden = false;
      showYouTube(null);
      el('stage-performer').textContent = '';
      el('stage-lyric').textContent = session.selectedVideo ? 'Join the queue to sing this song' : 'Waiting for a singer';
      if (session.selectedVideo && !session.display) {
        youtubeLink.href = 'https://www.youtube.com/watch?v=' + session.selectedVideo;
        youtubeLink.hidden = false;
      } else youtubeLink.hidden = true;
      el('stage-next-line').textContent = '';
      return;
    }
    const remaining = now - turn.started_at;
    updatePlayback(session, turn, remaining);
    el('stage-performer').textContent = turn.singer + ' · ' + (track?.title ?? 'YouTube karaoke');
    if (remaining < 0 || !track) {
      el('stage-lyric').textContent = 'Get ready';
      el('stage-next-line').textContent = '';
      return;
    }
    const bar = Math.floor(elapsed(session) * track.bpm / 240);
    el('stage-performer').textContent = turn.singer + ' · ' + track.title;
    const line = track.lyrics[Math.min(bar, track.lyrics.length - 1)];
    const nextLine = track.lyrics[bar + 1] ?? '';
    if (el('stage-lyric').textContent !== line) el('stage-lyric').textContent = line;
    if (el('stage-next-line').textContent !== nextLine) el('stage-next-line').textContent = nextLine;
  }

  function renderQueue(session) {
    if (session.display) return;
    const own = session.turns.find(turn => turn.id === session.own);
    const waiting = session.turns.filter(turn => turn.started_at === null);
    const ready = own && !session.live && waiting[0]?.id === own.id;
    el('singer-submit').hidden = Boolean(own);
    el('singer-name').hidden = el('singer-name-label').hidden = Boolean(own);
    el('singer-name').required = !own;
    practice.hidden = isYouTube(songSelect.value);
    practice.disabled = Boolean(session.busy || session.live);
    el('singer-song').disabled = Boolean(session.busy);
    el('singer-turn').hidden = !own;
    start.hidden = !ready;
    start.disabled = Boolean(session.busy);
    leave.hidden = !own || own.started_at !== null;
    leave.disabled = Boolean(session.busy);
    el('singer-submit').disabled = Boolean(session.busy);
    el('singer-empty').hidden = session.turns.length > 0;
    const signature = JSON.stringify([session.turns, session.own]);
    if (signature === session.rendered) return;
    session.rendered = signature;
    list.replaceChildren(...session.turns.map((turn, index) => {
      const item = document.createElement('li');
      item.classList.toggle('is-live', Boolean(turn.started_at));
      item.textContent = (turn.started_at ? 'Singing now: ' : !session.live && index === 0 ? 'Up next: ' : '')
        + turn.singer + (turn.id === session.own ? ' (you)' : '') + ' · ' + (tracks.get(turn.track)?.title ?? 'YouTube karaoke');
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
    if (session.own && !session.turns.some(turn => turn.id === session.own)) {
      session.own = null;
      try { sessionStorage.removeItem('club-turn-' + session.room); } catch {}
      if (!session.display) status.textContent = previous ? 'Your turn ended.' : 'Your queue entry expired. Join again to sing.';
    }
    window.clubParty.singer(session.room, session.live?.performer_id ?? null, data.now);
    window.clubParty.spotlight(session.live?.performer_id ?? null);
    el('karaoke-singer-heading').textContent = session.live?.singer ?? 'Singer';
    if (previous?.id !== session.live?.id) {
      session.playingTurn = null;
      if (previous) {
        mute();
        showYouTube(null);
      }
      if (session.live) {
        window.clubKaraoke.stop();
        audioSource(tracks.get(session.live.track));
      }
    }
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
    renderQueue(session);
    status.textContent = '';
    try {
      if (payload.action === 'start') {
        const turn = session.turns.find(item => item.id === session.own);
        const party = await window.clubParty.joinSinger(turn.singer);
        if (current !== session) return;
        if (!party) throw new Error('The singer screen closed. Try starting your song again.');
        payload.party = party;
      }
      const requestStarted = performance.now();
      const data = await api(session, payload);
      if (current !== session) return;
      if (payload.action === 'join') {
        session.own = data.id;
        try { sessionStorage.setItem('club-turn-' + session.room, String(data.id)); } catch {}
        status.textContent = 'You joined the queue.';
      } else if (payload.action === 'leave') {
        session.own = null;
        try { sessionStorage.removeItem('club-turn-' + session.room); } catch {}
        status.textContent = 'You left the queue.';
      } else {
        apply(session, data, requestStarted);
        status.textContent = 'You’re on stage. Turn on your mic when ready.';
        mainStage.scrollIntoView({block:'start'});
        el('party-mic').focus({preventScroll:true});
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
  practice.addEventListener('click', () => {
    if (current && !current.live) window.clubKaraoke.practice(tracks.get(el('singer-song').value));
  });
  start.addEventListener('click', () => {
    const session = current;
    if (!session || session.busy || start.hidden) return;
    const own = session.turns.find(turn => turn.id === session.own);
    if (!own) return;
    // Prime the player on the tap. Release the audio once the room confirms the turn.
    const track = tracks.get(own.track);
    window.clubKaraoke.stop();
    if (track) {
      audioSource(track);
      audio.muted = true;
      void audio.play().catch(() => {});
    }
    void mutate(session, {action:'start', id:own.id});
  });
  leave.addEventListener('click', () => {
    if (!current || current.busy || !current.own || leave.hidden) return;
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
    sound.hidden = countdown.hidden = true;
    showYouTube(null);
    mainStage.hidden = true;
    window.clubParty.spotlight(null);
    if (!document.body.classList.contains('stage-view-only')) stageHome.insertBefore(stage, stageAnchor);
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
    if (el('party-name').value) el('singer-name').value = el('party-name').value;
    songSelect.querySelector('[data-youtube]')?.remove();
    songSelect.selectedIndex = 0;
    if (!display) {
      el('karaoke-song-pane').append(stage);
      mainStage.hidden = false;
    }
    renderLine(session);
    renderQueue(session);
    void refresh(session);
    session.poll = setInterval(() => void refresh(session), 1100);
    session.lyrics = setInterval(() => renderLine(session), 120);
  }

  songSelect.addEventListener('change', () => {
    if (current) renderQueue(current);
  });

  function selectVideo(id, title = 'YouTube karaoke') {
    if (!current || current.display || current.busy) return;
    songSelect.querySelector('[data-youtube]')?.remove();
    const option = new Option(title, 'youtube:' + id, false, true);
    option.dataset.youtube = '';
    songSelect.add(option);
    songSelect.value = option.value;
    current.selectedVideo = id;
    renderQueue(current);
    el('karaoke-video-status').textContent = 'Song selected. Join the queue to sing it.';
    renderLine(current);
    el('singer-signup').scrollIntoView({block:'nearest'});
    el('singer-name').focus({preventScroll:true});
  }

  window.clubStage = {open, close, mute, selectVideo};
  const params = new URLSearchParams(location.search);
  const room = params.get('lyrics');
  if (room && /^(?:city-[a-z0-9-]{2,24}|nationwide|bay-stl)$/.test(room)) {
    const title = params.get('title')?.slice(0, 70) || 'THE CENTRAL STATION';
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
