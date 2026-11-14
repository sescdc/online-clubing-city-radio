(() => {
  const originals = [
    {
      id: 'city-lights', title: 'City Lights', artist: 'THE CENTRAL STATION', genre: 'Hip-hop',
      audio: 'karaoke-city-lights.mp3', bpm: 96,
      lyrics: [
        'Get ready…', 'I see the city lights', 'We’re coming out tonight',
        'From the Bay to the East', 'Every block got a beat', 'Put your hands in the air',
        'Send the rhythm everywhere', 'I see the city lights', 'We’re coming out tonight',
        'Every voice in the room', 'Let me hear you sing it too', 'City lights, city lights'
      ]
    },
    {
      id: 'after-hours', title: 'After Hours', artist: 'THE CENTRAL STATION', genre: 'R&B',
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

  function play(song) {
    window.clubStage.mute();
    showStage(song.title + ' · ' + song.artist);
    playbackStatus.textContent = 'Loading backing track…';
    playOriginal(song, playbackToken);
    focusStage();
  }

  const results = el('karaoke-search-results');
  const searchStatus = el('karaoke-search-status');
  const searchLink = el('karaoke-youtube-search');
  const inRoomButton = el('karaoke-search-in-room');
  let searchVersion = 0;


  el('karaoke-search-form').addEventListener('submit', async event => {
    const query = search.value.trim();
    if (!query) {
      event.preventDefault();
      search.setCustomValidity('Enter a song or artist.');
      search.reportValidity();
      return;
    }
    const version = ++searchVersion;
    const url = new URL('https://www.youtube.com/results');
    const terms = query + ' karaoke with lyrics';
    url.searchParams.set('search_query', terms);
    el('karaoke-search-query').value = terms;
    searchLink.href = url.href;
    searchLink.hidden = false;
    results.replaceChildren();
    if (event.submitter !== inRoomButton) {
      searchStatus.textContent = 'Choose a karaoke video from the YouTube results.';
      return;
    }
    event.preventDefault();
    searchStatus.textContent = 'Searching…';
    try {
      const response = await fetch('/api/karaoke/search?q=' + encodeURIComponent(query));
      const data = await response.json();
      if (version !== searchVersion) return;
      if (!data.available || !data.videos.length) {
        searchStatus.textContent = 'Open the YouTube results, then paste your song’s Share link below.';
        searchLink.focus();
        return;
      }
      searchStatus.textContent = 'Select a song for the stage.';
      for (const video of data.videos) {
        if (!/^[A-Za-z0-9_-]{11}$/.test(video.id)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button outline';
        const title = video.title;
        button.textContent = title + ' · ' + video.channel;
        button.addEventListener('click', () => window.clubStage.selectVideo(video.id, title));
        results.append(button);
      }
    } catch {
      if (version === searchVersion) searchStatus.textContent = 'Open the YouTube results, then paste your song’s Share link below.';
    }
  });
  // Restore the searched title and working link when a browser reloads after going Back.
  window.addEventListener('pageshow', () => {
    const query = search.value.trim();
    if (!query || !searchLink.hidden) return;
    const url = new URL('https://www.youtube.com/results');
    url.searchParams.set('search_query', query + ' karaoke with lyrics');
    searchLink.href = url.href;
    searchLink.hidden = false;
  });
  search.addEventListener('input', () => search.setCustomValidity(''));

  el('karaoke-video-form').addEventListener('submit', event => {
    event.preventDefault();
    const id = youtubeVideoId(videoLink.value.trim());
    videoStatus.textContent = id ? '' : 'Paste a YouTube video link from Share.';
    if (id) window.clubStage.selectVideo(id);
    else videoLink.focus();
  });
  el('karaoke-stop').addEventListener('click', () => {
    const returnTo = el('singer-practice');
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
      searchVersion += 1;
      searchStatus.textContent = '';
      results.replaceChildren();
      searchLink.hidden = true;
    },
    stop,
    practice: play
  };
})();
