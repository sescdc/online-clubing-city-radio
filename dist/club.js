const stationRows = [
  ['bay','SF Bay Area','BAY','West','106.1 KMEL','1061-kmel-293'],
  ['nyc','New York','NYC','Northeast','Power 105.1','power-1051-1481'],
  ['la','Los Angeles','LA','West','Real 92.3','real-923-181'],
  ['atl','Atlanta','ATL','South','96.1 The Beat','961-the-beat-741'],
  ['chi','Chicago','CHI','Midwest','107.5 WGCI','1075-wgci-841'],
  ['hou','Houston','HOU','South','93.7 The Beat','937-the-beat-2265'],
  ['phl','Philadelphia','PHL','Northeast','Power 99','power-99-2009'],
  ['dfw','Dallas–Fort Worth','DFW','South','97.9 The Beat','979-the-beat-8957'],
  ['dc','Washington, DC','DC','South','93.9 WKYS','939-wkys-8981'],
  ['mia','Miami','MIA','South','103.5 The Beat','1035-the-beat-581'],
  ['det','Detroit','DET','Midwest','97.9 WJLB','979-wjlb-1141'],
  ['bos','Boston','BOS','Northeast',"JAM’N 94.5",'jamn-945-1089'],
  ['sea','Seattle','SEA','West','KUBE 93.3 HD2','kube-933-hd2-9346'],
  ['phx','Phoenix','PHX','West','101.1 The Bounce','https://101bounce.com/'],
  ['den','Denver','DEN','West','KS 107.5','https://www.audacy.com/ks1075'],
  ['sd','San Diego','SD','West',"JAM’N 95.7",'jamn-957-261'],
  ['bal','Baltimore','BAL','South','92Q','92q-8937'],
  ['lv','Las Vegas','LV','West','Real 103.9','real-1039-6967'],
  ['pdx','Portland','PDX','West',"JAM’N 107.5",'https://jamn1075.iheart.com/'],
  ['msp','Minneapolis–St. Paul','MSP','Midwest','Hot 102.5','https://hot1025.iheart.com/'],
  ['stl','St. Louis','STL','Midwest','100.3 The Beat','1003-the-beat-1289'],
  ['cle','Cleveland','CLE','Midwest','Z107.9','z1079-8949'],
  ['nola','New Orleans','NOLA','South','Q93','q93-1037'],
  ['mem','Memphis','MEM','South','K97','k97-2141'],
  ['sac','Sacramento','SAC','West','V101.1','v1011-225'],
  ['sat','San Antonio','SAT','South','The Beat 98.5','the-beat-985-fm-5187'],
  ['atx','Austin','ATX','South','102.3 The Beat','1023-the-beat-2169'],
  ['orl','Orlando','ORL','South','104.5 The Beat','1045-the-beat-6471'],
  ['tpa','Tampa Bay','TPA','South','WiLD 94.1','wild-941-6746'],
  ['clt','Charlotte','CLT','South','Power 98 FM','power-98-fm-6748'],
  ['rdu','Raleigh–Durham','RDU','South','K97.5','k975-8971'],
  ['bna','Nashville','BNA','South','101.1 The Beat','1011-the-beat-2153'],
  ['ind','Indianapolis','IND','Midwest','Hot 100.9','hot-1009-8961'],
  ['cmh','Columbus','CMH','Midwest','Power 107.5 / 106.3','power-1075-1063-8955'],
  ['mke','Milwaukee','MKE','Midwest','V100.7','v1007-2673'],
  ['jax','Jacksonville','JAX','South','93.3 The Beat','933-the-beat-517'],
  ['kc','Kansas City','KC','Midwest','Hot 103 Jamz','hot-103-jamz-8181'],
  ['hnl','Honolulu','HNL','West','93.9 The Beat','939-the-beat-825'],
  ['okc','Oklahoma City','OKC','South','Power 103.5','https://kvsp.com/'],
  ['slc','Salt Lake City','SLC','West','92.5 The Beat','https://listen.streamon.fm/kuuu'],
  ['pit','Pittsburgh','PIT','Northeast','WAMO 107.3','wamo-1073-10953'],
  ['orf','Hampton Roads','757','South','103 Jamz','103-jamz-2453'],
  ['fresno','Fresno','FRE','West','B95','b95-141'],
  ['cin','Cincinnati','CIN','Midwest','101.1 The Wiz','1011-the-wiz-8946'],
];
const colors = {West:'#84c1ff', Northeast:'#b2d8ff', South:'#ffb176', Midwest:'#ff9a53'};
const streamOverrides = {
  phx:'https://ice42.securenetsystems.net/KZCE',
  den:'https://live.amperwave.net/direct/audacy-kqksfmaac-imc',
  pdx:'https://stream.revma.ihrhls.com/zc4319',
  msp:'https://stream.revma.ihrhls.com/zc6913',
  okc:'https://crystalout.surfernetwork.com:8001/KVSP_MP3',
  slc:'https://ais-sa1.streamon.fm/7166_48k.aac',
  dfw:'https://playerservices.streamtheworld.com/api/livestream-redirect/KBFBFMAAC.aac',
  bal:'https://playerservices.streamtheworld.com/api/livestream-redirect/WERQFMAAC.aac',
  dc:'https://playerservices.streamtheworld.com/api/livestream-redirect/WKYSFMAAC_SC',
  cle:'https://playerservices.streamtheworld.com/api/livestream-redirect/WENZFMAAC.aac',
  rdu:'https://playerservices.streamtheworld.com/api/livestream-redirect/WQOKFMAAC.aac',
  clt:'https://playerservices.streamtheworld.com/api/livestream-redirect/WPEGFMAACHI_SC',
  ind:'https://playerservices.streamtheworld.com/api/livestream-redirect/WHHHFMAAC.aac',
  tpa:'https://playerservices.streamtheworld.com/api/livestream-redirect/WLLDFMAAC.aac',
  kc:'https://playerservices.streamtheworld.com/api/livestream-redirect/KPRSFMAAC_SC?dist=',
  pit:'https://live.amperwave.net/direct/audacy-wdsyhd2aac-imc',
  cin:'https://playerservices.streamtheworld.com/api/livestream-redirect/WIZFFMAAC.aac'
};
const stations = stationRows.map(([id, city, code, region, name, source]) => {
  const embed = !source.startsWith('https://');
  const url = embed ? 'https://www.iheart.com/live/' + source + '/' : source;
  const stream = streamOverrides[id] ?? (embed ? 'https://stream.revma.ihrhls.com/zc' + source.split('-').at(-1) : null);
  return {id, city, code, region, name, embed, url, stream};
});
const relay = stations.filter(station => station.embed);
const byId = id => document.getElementById(id);
const deck = byId('radio-deck');
const search = byId('city-search');
const grid = byId('city-grid');
const radioAudio = document.createElement('audio');
radioAudio.hidden = true;
radioAudio.disableRemotePlayback = true;
byId('player').append(radioAudio);
// Prime this same element from the join gesture using a short silent WAV.
const silentAudio = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
const hour = 60 * 60 * 1000;
const timeFormat = new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit',timeZoneName:'short'});
let current = null;
let musicMode = 'radio';
let radioStartupTimer;
let radioPlayback;
let filter = 'All cities';
let opener = null;
let lastHour = -1;
let saved = new Set();

try {
  const stored = JSON.parse(localStorage.getItem('online-clubing-cities') ?? '[]');
  if (Array.isArray(stored)) saved = new Set(stored);
} catch {}

function slotAt(timestamp) {
  return Math.floor(timestamp / hour);
}

function relayAt(slot) {
  return relay[slot % relay.length];
}

function updateNation() {
  const slot = slotAt(Date.now());
  if (slot === lastHour) return;
  lastHour = slot;
  const now = relayAt(slot);
  const next = relayAt(slot + 1);
  byId('featured-city').textContent = now.city;
  byId('featured-station').textContent = now.name;
  byId('next-up').textContent = 'Next: ' + next.city + ' · ' + timeFormat.format((slot + 1) * hour);
  if (current?.national && current.station.id !== now.id) {
    byId('deck-feedback').textContent = now.city + ' is featured now. Open the nationwide room again to switch stations.';
  }
}

const filterButtons = new Map();
for (const name of ['All cities','West','Northeast','South','Midwest','Saved']) {
  const button = document.createElement('button');
  button.className = 'filter';
  button.type = 'button';
  button.textContent = name;
  button.addEventListener('click', () => {
    filter = name;
    renderRooms();
  });
  filterButtons.set(name, button);
  byId('filters').append(button);
}

function renderRooms() {
  for (const [name, button] of filterButtons) button.setAttribute('aria-pressed', name === filter);
  const term = search.value.trim().toLowerCase();
  const shown = stations.filter(({city, code, name, region, id}) => {
    const inFilter = filter === 'All cities' || filter === region || (filter === 'Saved' && saved.has(id));
    return inFilter && [city, code, name].some(value => value.toLowerCase().includes(term));
  });
  byId('results').textContent = shown.length + (shown.length === 1 ? ' city room' : ' city rooms');
  grid.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = filter === 'Saved' && !saved.size ? 'Open a city room to save it here.' : 'No rooms match your search.';
    grid.append(empty);
  }
  for (const station of shown) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city';
    button.dataset.city = station.id;
    button.style.setProperty('--accent', colors[station.region]);
    button.setAttribute('aria-current', current?.station.id === station.id && !current.national && !current.match ? 'true' : 'false');
    const code = document.createElement('span');
    code.className = 'city-code';
    code.setAttribute('aria-hidden','true');
    code.textContent = station.code;
    const info = document.createElement('span');
    const city = document.createElement('strong');
    city.textContent = station.city;
    const name = document.createElement('small');
    name.textContent = station.name;
    info.append(city,name);
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.setAttribute('aria-hidden','true');
    button.append(code,info,arrow);
    button.addEventListener('click', () => openRoom(station, false, button));
    grid.append(button);
  }
}

function setRoomURL(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('room', id);
  else url.searchParams.delete('room');
  history.replaceState(null,'',url);
  return url;
}

function updateSavedButton() {
  const button = byId('save-room');
  button.hidden = current.national || current.match;
  const isSaved = saved.has(current.station.id);
  button.textContent = isSaved ? 'Remove saved city' : 'Save city';
  button.setAttribute('aria-pressed', String(isSaved));
}

function stopRadio() {
  clearTimeout(radioStartupTimer);
  radioPlayback?.abort();
  radioPlayback = null;
  if (radioAudio.hasAttribute('src')) {
    radioAudio.pause();
    radioAudio.removeAttribute('src');
    radioAudio.load();
  }
  byId('station-link').hidden = true;
  byId('radio-status').textContent = '';
}

function showRadio() {
  stopRadio();
  const {station, room} = current;
  if (!window.clubParty.isInside(room)) {
    byId('radio-status').textContent = 'Join the party to hear the music.';
    return;
  }
  const status = byId('radio-status');
  const stationLink = byId('station-link');
  if (!station.stream) {
    status.textContent = 'The live stream is unavailable in this room.';
    stationLink.hidden = false;
    return;
  }

  radioPlayback = new AbortController();
  const {signal} = radioPlayback;
  radioAudio.src = station.stream;
  status.textContent = 'Connecting to ' + station.name + '…';

  function unavailable() {
    if (signal.aborted) return;
    stopRadio();
    status.textContent = 'Could not connect to ' + station.name + '. Choose Clubbin’ to retry.';
    stationLink.hidden = false;
  }

  radioStartupTimer = setTimeout(unavailable, 15000);
  radioAudio.addEventListener('error', unavailable, {signal});
  radioAudio.addEventListener('playing', () => {
    if (signal.aborted) return;
    clearTimeout(radioStartupTimer);
    status.textContent = station.name + ' is playing live.';
  }, {signal});
  radioAudio.play().catch(error => {
    if (signal.aborted) return;
    if (error.name === 'NotAllowedError') {
      stopRadio();
      status.textContent = 'Your browser blocked the music. Choose Clubbin’ to try again.';
    } else unavailable();
  });
}

function setMusicMode(mode) {
  musicMode = mode;
  const radio = mode === 'radio';
  byId('mode-radio').setAttribute('aria-pressed', String(radio));
  byId('mode-karaoke').setAttribute('aria-pressed', String(!radio));
  byId('radio-panel').hidden = !radio;
  byId('karaoke-panel').hidden = radio;
  deck.classList.toggle('karaoke-mode', !radio);
  byId('party-screen-title').textContent = radio ? 'Video party' : 'Singer screen';
  byId('party-join-button').textContent = radio ? 'Join Party' : 'Join singer screen';
  const roomURL = new URL(location.href);
  if (radio) roomURL.searchParams.delete('mode');
  else roomURL.searchParams.set('mode', 'karaoke');
  history.replaceState(null, '', roomURL);
  if (radio) {
    window.clubKaraoke.stop();
    window.clubStage.close();
    showRadio();
  } else {
    stopRadio();
    const title = byId('deck-title').textContent;
    window.clubKaraoke.open(current.room);
    window.clubStage.open(current.room, title);
  }
}

function openRoom(station, national, trigger = null, match = false, mode = 'radio') {
  const previous = current;
  if (trigger && !trigger.closest('#match-stations')) opener = trigger;
  const partyRoom = match ? 'bay-stl' : national ? 'nationwide' : 'city-' + station.id;
  current = {station, national, match, room: partyRoom};
  window.clubParty.select(partyRoom);
  window.clubPhotoBooth.select(national || match ? null : station);
  byId('match-stations').hidden = !match;
  byId('match-bay').setAttribute('aria-pressed', String(match && station.id === 'bay'));
  byId('match-stl').setAttribute('aria-pressed', String(match && station.id === 'stl'));
  byId('deck-label').textContent = match ? 'SHARED PARTY' : national ? 'NATIONWIDE FLOOR' : 'CITY ROOM';
  byId('deck-title').textContent = match ? 'Bay Area vs. St. Louis' : national ? 'Coast to Coast' : station.city;
  byId('deck-info').textContent = national ? station.city + ' · ' + station.name : station.name;
  byId('deck-feedback').textContent = '';
  byId('room-link-fallback').hidden = true;
  byId('station-link').href = station.url;
  updateSavedButton();
  deck.hidden = false;
  if (previous?.room !== partyRoom || previous.station.id !== station.id || trigger) {
    setMusicMode(mode);
  }
  setRoomURL(match ? 'bay-stl' : national ? 'nationwide' : station.id);
  for (const button of grid.querySelectorAll('[data-city]')) {
    button.setAttribute('aria-current', String(!match && !national && button.dataset.city === station.id));
  }
  if (trigger) {
    deck.scrollIntoView({block:'start'});
    byId('deck-title').focus({preventScroll:true});
  }
}

window.addEventListener('club-party-joining', ({detail: room}) => {
  if (current?.room !== room || musicMode !== 'radio') return;
  radioAudio.src = silentAudio;
  void radioAudio.play().catch(() => {});
});

window.addEventListener('club-party-joined', ({detail: room}) => {
  if (current?.room === room && musicMode === 'radio') showRadio();
});

window.addEventListener('club-party-left', ({detail: room}) => {
  if (current?.room === room && musicMode === 'radio') showRadio();
});

window.addEventListener('club-meeting', event => {
  deck.classList.toggle('meeting-mode', event.detail);
  byId('party-screen-title').textContent = event.detail ? 'Private Meet & Greet'
    : musicMode === 'karaoke' ? 'Singer screen' : 'Video party';
  if (!current) return;
  if (event.detail) {
    stopRadio();
    window.clubKaraoke.stop();
    window.clubStage.close();
  } else {
    setMusicMode(musicMode);
  }
});

byId('mode-radio').addEventListener('click', () => {
  if (!current) return;
  if (musicMode !== 'radio' || !radioPlayback) setMusicMode('radio');
  deck.scrollIntoView({block:'start'});
  byId('deck-title').focus({preventScroll:true});
});
byId('mode-karaoke').addEventListener('click', () => {
  if (musicMode !== 'karaoke') {
    setMusicMode('karaoke');
    byId('karaoke-panel').scrollIntoView({block:'start'});
  }
});

const bay = stations.find(station => station.id === 'bay');
const stl = stations.find(station => station.id === 'stl');
byId('open-match').addEventListener('click', event => openRoom(bay, false, event.currentTarget, true));
byId('match-bay').addEventListener('click', event => openRoom(bay, false, event.currentTarget, true));
byId('match-stl').addEventListener('click', event => openRoom(stl, false, event.currentTarget, true));

search.addEventListener('input', renderRooms);
byId('join-national').addEventListener('click', event => {
  openRoom(relayAt(slotAt(Date.now())), true, event.currentTarget);
});
byId('close-player').addEventListener('click', () => {
  const oldTrigger = opener?.isConnected ? opener : grid.querySelector('[aria-current=true]') ?? search;
  window.clubParty.select(null);
  window.clubPhotoBooth.select(null);
  deck.hidden = true;
  stopRadio();
  window.clubKaraoke.stop();
  window.clubStage.close();
  const closeURL = new URL(location.href);
  closeURL.searchParams.delete('mode');
  history.replaceState(null, '', closeURL);
  current = null;
  opener = null;
  setRoomURL(null);
  for (const button of grid.querySelectorAll('[aria-current=true]')) button.setAttribute('aria-current','false');
  oldTrigger.focus();
});
byId('save-room').addEventListener('click', () => {
  const id = current.station.id;
  const remove = saved.has(id);
  if (remove) saved.delete(id);
  else saved.add(id);
  try {
    localStorage.setItem('online-clubing-cities', JSON.stringify([...saved]));
    byId('deck-feedback').textContent = remove ? 'City removed from Saved.' : 'City added to Saved.';
  } catch {
    byId('deck-feedback').textContent = 'City preferences are available for this visit.';
  }
  updateSavedButton();
  renderRooms();
});
byId('share-room').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.hash = 'radio-deck';
  try {
    await navigator.clipboard.writeText(url.href);
    byId('room-link-fallback').hidden = true;
    byId('deck-feedback').textContent = 'Room link copied.';
  } catch {
    const field = byId('room-link-value');
    field.value = url.href;
    byId('room-link-fallback').hidden = false;
    byId('deck-feedback').textContent = 'Select and copy this room link.';
    field.focus();
    field.select();
  }
});

renderRooms();
updateNation();
setInterval(updateNation, 5000);
const roomParams = new URL(location.href).searchParams;
const room = roomParams.get('room');
const requestedStation = stations.find(station => station.id === room);
const requestedMode = roomParams.get('mode') === 'karaoke' ? 'karaoke' : 'radio';
if (room === 'bay-stl') openRoom(bay, false, null, true, requestedMode);
else if (room === 'nationwide') openRoom(relayAt(slotAt(Date.now())), true, null, false, requestedMode);
else if (requestedStation) openRoom(requestedStation, false, null, false, requestedMode);
if (current && location.hash === '#radio-deck') deck.scrollIntoView({block:'start'});
