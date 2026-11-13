(() => {
  const originals = [
    {
      id: 'city-lights', title: 'City Lights', artist: 'Online Clubing', genre: 'Hip-hop',
      audio: 'karaoke-city-lights.mp3', bpm: 96,
      lyrics: [
        'Get ready…', 'I see the city lights', 'We’re coming out tonight',
        'From the Bay to the East', 'Every block got a beat', 'Put your hands in the air',
        'Send the rhythm everywhere', 'I see the city lights', 'We’re coming out tonight',
        'Every voice in the room', 'Let me hear you sing it too', 'City lights, city lights'
      ]
    },
    {
      id: 'after-hours', title: 'After Hours', artist: 'Online Clubing', genre: 'R&B',
      audio: 'karaoke-after-hours.mp3', bpm: 84,
      lyrics: [
        'Get ready…', 'When the streets slow down', 'I can hear that sound',
        'Stay a little longer', 'Let the feeling grow', 'Underneath the moonlight',
        'Take it nice and slow', 'After hours with you', 'There’s nowhere else to be',
        'After hours with you', 'Keep a little time for me', 'After hours with you'
      ]
    }
  ];
  const el = id => document.getElementById(id);
  const search = el('karaoke-search');
  const videoLink = el('karaoke-youtube-link');
  const videoStatus = el('karaoke-video-status');
  let nativeAudio = null;
  let playbackToken = 0;
  const playbackStatus = el('karaoke-playback');

  function youtubeVideoId(value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      let id;
      if (url.hostname === 'youtu.be') {
        id = parts[0];
      } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
        if (url.pathname === '/watch') id = url.searchParams.get('v');
        else if (['shorts', 'live', 'embed'].includes(parts[0])) id = parts[1];
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null;
    } catch {
      return null;
    }
  }

  function stop() {
    playbackToken += 1;
    if (nativeAudio) {
      nativeAudio.pause();
      nativeAudio.removeAttribute('src');
      nativeAudio.load();
      nativeAudio = null;
    }
    el('karaoke-video').replaceChildren();
    el('karaoke-stage').hidden = true;
    el('karaoke-download').hidden = true;
    playbackStatus.textContent = '';
  }

  function playOriginal(song, token) {
    const lyrics = document.createElement('div');
    lyrics.className = 'karaoke-lyrics';
    const audio = document.createElement('audio');
    audio.className = 'karaoke-audio';
    audio.controls = true;
    audio.preload = 'auto';
    audio.src = song.audio;
    audio.setAttribute('aria-label', song.title + ' backing track');
    nativeAudio = audio;
    el('karaoke-video').append(lyrics, audio);
    function showLine() {
      const bar = Math.floor(audio.currentTime * song.bpm / 240);
      lyrics.textContent = song.lyrics[Math.min(bar, song.lyrics.length - 1)];
    }
    showLine();
    audio.addEventListener('timeupdate', showLine);
    audio.addEventListener('playing', () => {
      if (token === playbackToken) playbackStatus.textContent = 'Playing in this room.';
    });
    audio.addEventListener('pause', () => {
      if (token === playbackToken && !audio.ended) playbackStatus.textContent = 'Track paused.';
    });
    audio.addEventListener('ended', () => {
      if (token === playbackToken) playbackStatus.textContent = 'Track ended. Press Play to sing it again.';
    });
    function showAudioLink() {
      if (token !== playbackToken) return;
      const link = el('karaoke-download');
      link.href = song.audio;
      link.textContent = 'Open backing track';
      link.hidden = false;
      playbackStatus.textContent = 'The player could not load this track. Open the audio directly.';
    }
    audio.addEventListener('error', showAudioLink);
    audio.play().catch(error => {
      if (token !== playbackToken) return;
      if (error.name === 'NotAllowedError') {
        playbackStatus.textContent = 'Tap Play on the audio controls to start.';
      } else {
        showAudioLink();
      }
    });
  }

  function showStage(title, closeLabel = 'Stop') {
    stop();
    el('karaoke-stop').textContent = closeLabel;
    el('karaoke-track').textContent = title;
    el('karaoke-stage').hidden = false;
  }

  function focusStage() {
    el('karaoke-stage').scrollIntoView({block: 'nearest'});
    el('karaoke-stop').focus({preventScroll: true});
  }

  function playYouTube(id) {
    window.clubStage.mute();
    showStage('YouTube karaoke', 'Close video');
    const player = document.createElement('iframe');
    player.className = 'karaoke-youtube-player';
    player.title = 'YouTube karaoke video';
    player.src = 'https://www.youtube-nocookie.com/embed/' + id + '?playsinline=1';
    player.allow = 'encrypted-media; fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    el('karaoke-video').append(player);
    playbackStatus.textContent = 'Tap play to sing along on this device.';
    const link = el('karaoke-download');
    link.href = 'https://www.youtube.com/watch?v=' + id;
    link.textContent = 'Watch on YouTube';
    link.hidden = false;
    focusStage();
  }

  function play(song) {
    window.clubStage.mute();
    showStage(song.title + ' · ' + song.artist);
    playbackStatus.textContent = 'Loading backing track…';
    playOriginal(song, playbackToken);
    focusStage();
  }

  el('karaoke-search-form').addEventListener('submit', event => {
    const query = search.value.trim();
    if (!query) {
      event.preventDefault();
      search.setCustomValidity('Enter a song or artist.');
      search.reportValidity();
      return;
    }
    el('karaoke-search-query').value = query + ' karaoke with lyrics';
  });
  search.addEventListener('input', () => search.setCustomValidity(''));

  el('karaoke-video-form').addEventListener('submit', event => {
    event.preventDefault();
    const id = youtubeVideoId(videoLink.value.trim());
    videoStatus.textContent = id ? '' : 'Paste a YouTube video link, such as a link from Share.';
    if (id) playYouTube(id);
    else videoLink.focus();
  });
  el('karaoke-stop').addEventListener('click', () => {
    const returnTo = el('karaoke-video').querySelector('iframe') ? videoLink : el('singer-practice');
    stop();
    if (returnTo.getClientRects().length) returnTo.focus({preventScroll: true});
  });

  window.clubKaraoke = {
    originals,
    open() {
      stop();
      search.value = '';
      search.setCustomValidity('');
      videoLink.value = '';
      videoStatus.textContent = '';
      el('karaoke-solo').open = false;
    },
    stop,
    practice: play
  };
})();
