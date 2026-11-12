(() => {
  const catalog = [
    ['hammer','U Can’t Touch This','MC Hammer','Hip-hop','aZHjn_UhNps','West'],
    ['pac','California Love','2Pac & Dr. Dre','Hip-hop','tnbmPWZNdmc','West'],
    ['snoop','Drop It Like It’s Hot','Snoop Dogg & Pharrell Williams','Hip-hop','Tml2Efv3lNM','West'],
    ['mix','Baby Got Back','Sir Mix-a-Lot','Hip-hop','_3LRjzgMxcw','West'],
    ['bruno','24K Magic','Bruno Mars','R&B / Funk','cxBm6oYTTr8','West'],
    ['nelly','Ride Wit Me','Nelly','Hip-hop','UMrg6lwMSl8','Midwest'],
    ['hot','Hot in Herre','Nelly','Hip-hop','zgyzGPrpPjQ','Midwest'],
    ['em','Lose Yourself','Eminem','Hip-hop','pi-Odu9CDmw','Midwest'],
    ['tlc','No Scrubs','TLC','R&B','CUFIRtDz-Oo','South'],
    ['bey','Crazy in Love','Beyoncé & Jay-Z','R&B','Hm5OjVvLQKI','South'],
    ['dc','Say My Name','Destiny’s Child','R&B','4I4Q-3zUqdI','South'],
    ['missy','Work It','Missy Elliott','Hip-hop','ORcgThE_RJM','South'],
    ['alicia','No One','Alicia Keys','R&B','0lFbFPq8ajo','Northeast'],
    ['salt','Push It','Salt-N-Pepa','Hip-hop','a8JxaRlHm44','Northeast'],
  ].map(([id, title, artist, genre, video, region]) => ({id, title, artist, genre, video, region}));
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
  const catalogMatches = new Map([
    ['13657','hammer'], ['35574','pac'], ['41103','snoop'], ['14483','mix'], ['51925','bruno'],
    ['17214','nelly'], ['6863','hot'], ['8520','tlc'], ['5187','bey'], ['8908','dc'],
    ['13212','alicia'], ['13912','salt']
  ].map(([id, key]) => [id, catalog.find(song => song.id === key)]));
  const directLinks = {
    '17214': 'https://www.karafun.com/karaoke/nelly/ride-wit-me/',
    '6863': 'https://www.karafun.com/karaoke/nelly/hot-in-herre/'
  };
  const cityPicks = {
    bay:['hammer','pac'], la:['snoop','pac'], sea:['mix'], hnl:['bruno'],
    stl:['nelly','hot'], det:['em'], nyc:['alicia','salt'],
    atl:['tlc'], hou:['bey','dc'], orf:['missy']
  };
  const el = id => document.getElementById(id);
  const input = el('karaoke-search');
  const songs = el('karaoke-songs');
  const queue = el('karaoke-queue');
  let city = null;
  let room = null;
  let active = null;
  let nativeAudio = null;
  let videoPlayer = null;
  let videoAPI = null;
  let playbackToken = 0;
  let playbackTimer;
  const playbackStatus = el('karaoke-playback');
  const setlists = new Map();
  const pageSize = 30;
  const genre = el('karafun-genre');
  const more = el('karafun-more');
  let source = 'originals';
  let karaFunSongs = null;
  let catalogRequest = null;
  let visibleCount = pageSize;

  function normalize(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function karaFunLink(song, className) {
    const link = document.createElement('a');
    const url = new URL('https://www.karafun.com/search/');
    url.searchParams.set('query', song.title + ' ' + song.artist);
    link.href = directLinks[song.id] ?? url.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = className + ' karaoke-external';
    link.textContent = 'KaraFun';
    link.setAttribute('aria-label', 'Find ' + song.title + ' by ' + song.artist + ' on KaraFun');
    return link;
  }

  function selectSource(nextSource) {
    source = nextSource;
    const isKaraFun = source === 'karafun';
    el('karaoke-city-picks').setAttribute('aria-pressed', String(source === 'city'));
    el('karaoke-originals').setAttribute('aria-pressed', String(source === 'originals'));
    el('karaoke-karafun').setAttribute('aria-pressed', String(isKaraFun));
    el('karafun-tools').hidden = !isKaraFun;
    el('karaoke-browse').hidden = !isKaraFun;
    more.hidden = true;
    input.value = '';
    visibleCount = pageSize;
    renderSongs();
    if (isKaraFun && !karaFunSongs && !catalogRequest) loadKaraFun();
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
        id, title, artist, styles, duet, karaFun: true,
        search: normalize(title + ' ' + artist),
        urban: /(?:^|,)(?:Hip-Hop|Rap|R&B|Soul)(?:,|$)/.test(styles)
      }));
      if (source === 'karafun') renderSongs();
    } catch {
      if (source === 'karafun') status.textContent = 'Catalog unavailable. Try again or open KaraFun below.';
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

  function renderKaraFun() {
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
      row.append(trackDetails(song, song.artist), startControl(song), addToSetlist(song));
      return row;
    }));
  }

  function stop() {
    playbackToken += 1;
    clearTimeout(playbackTimer);
    active = null;
    if (nativeAudio) {
      nativeAudio.pause();
      nativeAudio.removeAttribute('src');
      nativeAudio.load();
      nativeAudio = null;
    }
    videoPlayer?.destroy();
    videoPlayer = null;
    el('karaoke-video').replaceChildren();
    el('karaoke-stage').hidden = true;
    playbackStatus.textContent = '';
  }

  function loadVideoAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!videoAPI) {
      videoAPI = new Promise((resolve, reject) => {
        window.onYouTubeIframeAPIReady = () => resolve(window.YT);
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = reject;
        document.head.append(script);
      });
    }
    return videoAPI;
  }

  function playOriginal(song, token) {
    const lyrics = document.createElement('div');
    lyrics.className = 'karaoke-lyrics';
    const audio = document.createElement('audio');
    audio.className = 'karaoke-audio';
    audio.controls = true;
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
    audio.play().catch(() => {
      if (token === playbackToken) playbackStatus.textContent = 'Tap Play on the audio controls to start.';
    });
  }

  function playVideo(song, token) {
    const frame = document.createElement('iframe');
    const query = new URLSearchParams({
      autoplay: '1', playsinline: '1', enablejsapi: '1', origin: location.origin
    });
    frame.title = song.title + ' karaoke backing track';
    frame.src = 'https://www.youtube.com/embed/' + song.video + '?' + query;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    el('karaoke-video').append(frame);
    function report(text) {
      if (token !== playbackToken) return;
      clearTimeout(playbackTimer);
      playbackStatus.textContent = text;
    }
    playbackTimer = setTimeout(() => report('Tap Play on the video. If it is unavailable, use a playback link below or choose Club originals.'), 6500);
    loadVideoAPI().then(api => {
      if (token !== playbackToken) return;
      videoPlayer = new api.Player(frame, {events: {
        onStateChange(event) {
          if (event.data === api.PlayerState.PLAYING) report('Playing in this room.');
          if (event.data === api.PlayerState.ENDED) report('Track ended.');
        },
        onAutoplayBlocked() { report('Tap Play on the video to start the backing track.'); },
        onError() { report('This video cannot play here. Use a playback link below or choose Club originals.'); }
      }});
    }).catch(() => report('Tap Play on the video or use a playback link below.'));
  }

  function play(song) {
    const backing = song.karaFun ? catalogMatches.get(song.id) : song;
    if (!backing) return;
    stop();
    active = song;
    const token = playbackToken;
    const provider = song.karaFun ? song : [...catalogMatches].find(([, match]) => match === song);
    const providerSong = Array.isArray(provider) ? {...song, id: provider[0]} : provider;
    const watchLink = el('karaoke-watch');
    const providerLink = el('karaoke-provider');
    watchLink.hidden = !backing.video;
    providerLink.hidden = !providerSong;
    if (backing.video) watchLink.href = 'https://www.youtube.com/watch?v=' + backing.video;
    if (providerSong) providerLink.href = karaFunLink(providerSong, '').href;
    el('karaoke-track').textContent = song.title + ' · ' + song.artist;
    el('karaoke-stage').hidden = false;
    playbackStatus.textContent = 'Loading backing track…';
    if (backing.audio) playOriginal(backing, token);
    else playVideo(backing, token);
    renderSongs();
    el('karaoke-stage').scrollIntoView({block: 'nearest'});
    el('karaoke-stop').focus({preventScroll: true});
  }

  function startControl(song) {
    if (song.karaFun && !catalogMatches.has(song.id)) return karaFunLink(song, 'button outline compact');
    const label = song.audio ? 'Play' : 'Try here';
    const start = button(label, 'Play ' + song.title + ' in the room', () => play(song));
    start.setAttribute('aria-pressed', String(song === active));
    if (!song.karaFun) return start;
    const actions = document.createElement('div');
    actions.className = 'karaoke-track-actions';
    actions.append(start, karaFunLink(song, 'button outline compact'));
    return actions;
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

  function trackDetails(song, detail) {
    const info = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = song.title;
    const artist = document.createElement('small');
    artist.textContent = detail;
    info.append(title, artist);
    return info;
  }

  function renderSongs() {
    if (source === 'karafun') {
      renderKaraFun();
      return;
    }
    const term = input.value.trim().toLowerCase();
    const picks = cityPicks[city.id] ?? [];
    const rank = song => picks.includes(song.id) ? picks.indexOf(song.id) : song.region === city.region ? 10 : 20;
    const results = (source === 'originals' ? originals : catalog).filter(song => [song.title, song.artist, song.genre].join(' ').toLowerCase().includes(term))
      .sort((a, b) => rank(a) - rank(b));
    const rows = results.map(song => {
      const row = document.createElement('div');
      row.className = 'karaoke-row';
      const info = trackDetails(song, song.artist + ' · ' + song.genre);
      row.append(info, startControl(song), addToSetlist(song));
      return row;
    });
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No matches here. Try the KaraFun catalog.';
      rows.push(empty);
    }
    songs.replaceChildren(...rows);
  }

  function renderQueue() {
    const list = setlists.get(room);
    el('karaoke-empty').hidden = list.length > 0;
    queue.replaceChildren(...list.map((song, index) => {
      const item = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'karaoke-row';
      const start = startControl(song);
      row.append(trackDetails(song, song.artist), start,
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
    songs.children[oldCount]?.querySelector('a')?.focus();
  });
  el('karaoke-city-picks').addEventListener('click', () => {
    if (source !== 'city') selectSource('city');
  });
  el('karaoke-originals').addEventListener('click', () => {
    if (source !== 'originals') selectSource('originals');
  });
  el('karaoke-karafun').addEventListener('click', () => {
    if (source !== 'karafun') selectSource('karafun');
    else if (!karaFunSongs && !catalogRequest) loadKaraFun();
  });
  el('karaoke-stop').addEventListener('click', () => {
    stop();
    renderSongs();
    input.focus({preventScroll:true});
  });

  window.clubKaraoke = {
    open(station, key, title) {
      stop();
      city = station;
      room = key;
      if (!setlists.has(key)) setlists.set(key, []);
      el('karaoke-city').textContent = title;
      genre.value = 'all';
      el('karaoke-status').textContent = '';
      selectSource('originals');
      renderQueue();
    },
    stop
  };
})();
