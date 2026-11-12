(() => {
  const catalog = [
    ['hammer','U Can’t Touch This','MC Hammer','Hip-hop','aZHjn_UhNps','West'],
    ['pac','California Love','2Pac & Dr. Dre','Hip-hop','tnbmPWZNdmc','West'],
    ['snoop','Drop It Like It’s Hot','Snoop Dogg & Pharrell Williams','Hip-hop','Tml2Efv3lNM','West'],
    ['mix','Baby Got Back','Sir Mix-a-Lot','Hip-hop','_3LRjzgMxcw','West'],
    ['bruno','24K Magic','Bruno Mars','R&B / Funk','cxBm6oYTTr8','West'],
    ['nelly','Ride Wit Me','Nelly','Hip-hop','wNYiYbNCW3Q','Midwest'],
    ['hot','Hot in Herre','Nelly','Hip-hop','byYMGY8_0BQ','Midwest'],
    ['em','Lose Yourself','Eminem','Hip-hop','pi-Odu9CDmw','Midwest'],
    ['tlc','No Scrubs','TLC','R&B','CUFIRtDz-Oo','South'],
    ['bey','Crazy in Love','Beyoncé & Jay-Z','R&B','Hm5OjVvLQKI','South'],
    ['dc','Say My Name','Destiny’s Child','R&B','4I4Q-3zUqdI','South'],
    ['missy','Work It','Missy Elliott','Hip-hop','ORcgThE_RJM','South'],
    ['alicia','No One','Alicia Keys','R&B','0lFbFPq8ajo','Northeast'],
    ['salt','Push It','Salt-N-Pepa','Hip-hop','a8JxaRlHm44','Northeast'],
  ].map(([id, title, artist, genre, video, region]) => ({id, title, artist, genre, video, region}));
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
  const setlists = new Map();

  function stop() {
    active = null;
    el('karaoke-video').replaceChildren();
    el('karaoke-stage').hidden = true;
  }

  function play(song) {
    active = song;
    el('karaoke-track').textContent = song.title + ' · ' + song.artist;
    el('karaoke-watch').href = 'https://www.youtube.com/watch?v=' + song.video;
    const player = document.createElement('iframe');
    player.title = song.title + ' karaoke backing track';
    player.src = 'https://www.youtube.com/embed/' + song.video + '?autoplay=1&playsinline=1';
    player.allow = 'autoplay; encrypted-media; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    el('karaoke-video').replaceChildren(player);
    el('karaoke-stage').hidden = false;
    el('karaoke-status').textContent = 'Selected ' + song.title + '.';
    renderSongs();
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
    const term = input.value.trim().toLowerCase();
    const picks = cityPicks[city.id] ?? [];
    const rank = song => picks.includes(song.id) ? picks.indexOf(song.id) : song.region === city.region ? 10 : 20;
    const results = catalog.filter(song => [song.title, song.artist, song.genre].join(' ').toLowerCase().includes(term))
      .sort((a, b) => rank(a) - rank(b));
    const list = setlists.get(room);
    const rows = results.map(song => {
      const row = document.createElement('div');
      row.className = 'karaoke-row';
      const info = trackDetails(song, song.artist + ' · ' + song.genre);
      const start = button('Play', 'Play ' + song.title, () => {
        play(song);
        el('karaoke-stop').focus({preventScroll:true});
      });
      start.setAttribute('aria-pressed', String(song === active));
      const add = button(list.includes(song) ? 'Added' : 'Add', 'Add ' + song.title + ' to my setlist', () => {
        list.push(song);
        el('karaoke-status').textContent = song.title + ' added to your setlist.';
        add.textContent = 'Added';
        add.disabled = true;
        renderQueue();
      });
      add.disabled = list.includes(song);
      row.append(info, start, add);
      return row;
    });
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No matches in this list. Try the full catalog below.';
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
      row.append(trackDetails(song, song.artist), button('Play', 'Play queued ' + song.title, () => play(song)),
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

  input.addEventListener('input', renderSongs);
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
      input.value = '';
      el('karaoke-status').textContent = '';
      renderSongs();
      renderQueue();
    },
    stop
  };
})();
