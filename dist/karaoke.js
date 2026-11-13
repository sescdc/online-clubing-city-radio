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
  const mobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const appDownload = /Android/i.test(navigator.userAgent)
    ? 'https://www.karafun.com/download/'
    : 'https://apps.apple.com/app/apple-store/id431050674?platform=iphone';
  const el = id => document.getElementById(id);
  const input = el('karaoke-search');
  const songs = el('karaoke-songs');
  const queue = el('karaoke-queue');
  let room = null;
  let active = null;
  let nativeAudio = null;
  let playbackToken = 0;
  const playbackStatus = el('karaoke-playback');
  const setlists = new Map();
  const pageSize = 30;
  const genre = el('karafun-genre');
  const more = el('karafun-more');
  let karaFunSongs = null;
  let catalogRequest = null;
  let visibleCount = pageSize;

  function normalize(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function karaFunURL(id) {
    const url = new URL('https://www.karafun.com/web/');
    url.searchParams.set('song', id);
    return url.href;
  }

  function openLink(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  async function loadKaraFun() {
    const status = el('karafun-results');
    status.textContent = 'Loading the KaraFun catalog…';
    catalogRequest = fetch('karafun-catalog.json.gz');
    try {
      const response = await catalogRequest;
      if (!response.ok) throw new Error('Catalog unavailable');
      const json = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
      karaFunSongs = json.map(([id, title, artist, styles, duet]) => ({
        id, title, artist, duet,
        search: normalize(title + ' ' + artist),
        urban: /(?:^|,)(?:Hip-Hop|Rap|R&B|Soul)(?:,|$)/.test(styles)
      }));
      renderSongs();
    } catch {
      status.textContent = 'Catalog unavailable. Try again or open KaraFun below.';
    } finally {
      catalogRequest = null;
    }
  }

  function addToSetlist(song) {
    const list = setlists.get(room);
    const alreadyAdded = list.includes(song);
    const add = button(alreadyAdded ? 'Added' : 'Add', 'Add ' + song.title + ' to my setlist', () => {
      list.push(song);
      el('karaoke-status').textContent = song.title + ' added to your setlist.';
      add.textContent = 'Added';
      add.disabled = true;
      renderQueue();
    });
    add.disabled = alreadyAdded;
    return add;
  }

  function renderSongs() {
    if (!karaFunSongs) {
      songs.replaceChildren();
      return;
    }
    const terms = normalize(input.value).split(' ').filter(Boolean);
    const filter = genre.value;
    const results = karaFunSongs.filter(song => (filter !== 'urban' || song.urban)
      && (filter !== 'duet' || song.duet) && terms.every(term => song.search.includes(term)));
    const shown = results.slice(0, visibleCount);
    el('karafun-results').textContent = results.length
      ? 'Showing ' + shown.length + ' of ' + results.length.toLocaleString() + ' songs'
      : 'No songs match your search.';
    more.hidden = shown.length >= results.length;
    songs.replaceChildren(...shown.map(song => {
      const row = document.createElement('div');
      row.className = 'karaoke-row';
      row.append(trackControl(song, song.artist), addToSetlist(song));
      return row;
    }));
  }

  function stop() {
    playbackToken += 1;
    active = null;
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

  function showStage(song, closeLabel = 'Stop') {
    stop();
    active = song;
    el('karaoke-stop').textContent = closeLabel;
    el('karaoke-track').textContent = song.title + ' · ' + song.artist;
    el('karaoke-stage').hidden = false;
  }

  function focusStage() {
    el('karaoke-stage').scrollIntoView({block: 'nearest'});
    el('karaoke-stop').focus({preventScroll: true});
  }

  function showMobileSong(song) {
    showStage(song, 'Close');
    const searchText = song.title + ' ' + song.artist;
    const guide = document.createElement('p');
    guide.textContent = 'Copy the song, then paste it into Search in the KaraFun app.';
    const searchValue = document.createElement('input');
    searchValue.className = 'karaoke-copy-field';
    searchValue.value = searchText;
    searchValue.readOnly = true;
    searchValue.setAttribute('aria-label', 'Song title and artist to copy');
    const copy = button('Copy song', 'Copy song title and artist', async () => {
      try {
        await navigator.clipboard.writeText(searchText);
        if (active === song) playbackStatus.textContent = 'Copied. Paste it into Search in KaraFun.';
      } catch {
        if (active !== song) return;
        searchValue.focus();
        searchValue.select();
        playbackStatus.textContent = 'Touch and hold the selected text to copy it.';
      }
    });
    const download = openLink(appDownload);
    download.className = 'catalog-link';
    download.textContent = 'Get the KaraFun app';
    const actions = document.createElement('div');
    actions.className = 'karaoke-copy-actions';
    actions.append(copy, download);
    el('karaoke-video').append(guide, searchValue, actions);
    focusStage();
  }

  function play(song) {
    window.clubStage.mute();
    showStage(song);
    playbackStatus.textContent = 'Loading backing track…';
    playOriginal(song, playbackToken);
    focusStage();
  }

  function trackControl(song, detail) {
    const id = song.id;
    let control;
    let action;
    if (!mobileDevice) {
      control = openLink(karaFunURL(id));
      control.addEventListener('click', () => {
        if (!active) return;
        stop();
        setTimeout(() => {
          if (!active) {
            renderSongs();
            renderQueue();
          }
        }, 0);
      });
      action = 'Play on KaraFun';
    } else {
      control = document.createElement('button');
      control.type = 'button';
      control.addEventListener('click', () => showMobileSong(song));
      action = 'Open options';
      control.setAttribute('aria-pressed', String(song === active));
    }
    control.className = 'karaoke-track-control';
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = song.title;
    const artist = document.createElement('small');
    artist.textContent = detail;
    info.append(title, artist);
    const indicator = document.createElement('span');
    indicator.className = 'karaoke-track-action';
    indicator.textContent = action;
    control.append(info, indicator);
    return control;
  }

  function button(text, label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'button outline compact';
    control.textContent = text;
    control.setAttribute('aria-label', label);
    control.addEventListener('click', action);
    return control;
  }

  function renderQueue() {
    const list = setlists.get(room);
    el('karaoke-empty').hidden = list.length > 0;
    queue.replaceChildren(...list.map((song, index) => {
      const item = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'karaoke-row';
      row.append(trackControl(song, song.artist),
        button('Remove', 'Remove ' + song.title + ' from my setlist', () => {
          list.splice(index, 1);
          el('karaoke-status').textContent = song.title + ' removed.';
          renderQueue();
          renderSongs();
        }));
      item.append(row);
      return item;
    }));
  }

  input.addEventListener('input', () => {
    visibleCount = pageSize;
    renderSongs();
  });
  genre.addEventListener('change', () => {
    visibleCount = pageSize;
    renderSongs();
  });
  more.addEventListener('click', () => {
    const oldCount = visibleCount;
    visibleCount += pageSize;
    renderSongs();
    songs.children[oldCount]?.querySelector('.karaoke-track-control')?.focus();
  });
  const catalog = el('karaoke-solo');
  catalog.addEventListener('toggle', () => {
    if (!catalog.open || !room) return;
    if (karaFunSongs) renderSongs();
    else if (!catalogRequest) loadKaraFun();
  });
  el('karaoke-stop').addEventListener('click', () => {
    stop();
    renderSongs();
    const returnTo = catalog.open ? input : el('singer-practice');
    if (returnTo.getClientRects().length) returnTo.focus({preventScroll:true});
  });

  window.clubKaraoke = {
    originals,
    open(key) {
      stop();
      room = key;
      if (!setlists.has(key)) setlists.set(key, []);
      genre.value = 'all';
      el('karaoke-status').textContent = '';
      input.value = '';
      visibleCount = pageSize;
      catalog.open = false;
      more.hidden = true;
      songs.replaceChildren();
      el('karafun-results').textContent = '';
      renderQueue();
    },
    stop,
    practice: play
  };
})();
