import {exclusiveSchedule} from './exclusive-schedule.js';

const byId = id => document.getElementById(id);
const enter = byId('exclusive-enter');
const booth = byId('exclusive-booth');
const video = byId('exclusive-video');
const audio = byId('exclusive-audio');
const sound = byId('exclusive-sound');
const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});
let shownRoom;
let joinedRoom;
let rendered;
let playing = false;

function stop() {
  joinedRoom = null;
  playing = false;
  video.pause();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  sound.hidden = true;
}

function play() {
  const {events: [event], live} = exclusiveSchedule();
  if (!live || joinedRoom !== event.room) return;
  if (!audio.hasAttribute('src')) audio.src = '/dj-' + event.id + '.mp3';
  const activeRoom = joinedRoom;
  const align = () => {
    if (joinedRoom !== activeRoom) return;
    const elapsed = Math.max(0, (Date.now() - event.start) / 1000);
    audio.currentTime = elapsed % event.loop;
    if (video.duration) video.currentTime = elapsed % video.duration;
  };
  if (audio.readyState) align();
  else audio.addEventListener('loadedmetadata', align, {once: true});
  if (!video.readyState) video.addEventListener('loadedmetadata', () => {
    if (joinedRoom === activeRoom && video.duration) video.currentTime = (Date.now() - event.start) / 1000 % video.duration;
  }, {once: true});
  void video.play().catch(() => {});
  audio.play().then(() => {
    if (joinedRoom !== activeRoom) return;
    playing = true;
    sound.textContent = 'Mute DJ';
  }).catch(() => {
    if (joinedRoom !== activeRoom) return;
    playing = false;
    sound.textContent = 'Enable DJ sound';
  });
}

function render() {
  const now = Date.now();
  const {events: [event, ...upcoming], live} = exclusiveSchedule(now);
  const key = event.room + live;
  if (rendered !== key) {
    rendered = key;
    byId('exclusive-theme').textContent = event.title;
    byId('exclusive-date').textContent = dateFormat.format(event.start);
    byId('exclusive-sound-style').textContent = event.sound;
    enter.disabled = !live;
    enter.textContent = live ? 'Enter exclusive party' : 'Room opens at 8 p.m. Pacific';
    byId('exclusive-upcoming').replaceChildren(...upcoming.map(next => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const time = document.createElement('time');
      title.textContent = next.title;
      time.dateTime = new Date(next.start).toISOString();
      time.textContent = dateFormat.format(next.start);
      item.append(title, time);
      return item;
    }));
  }
  const mins = Math.max(0, Math.ceil(((live ? event.end : event.start) - now) / 60000));
  const hours = Math.floor(mins / 60);
  byId('exclusive-countdown').textContent = (live ? 'Ends in ' : 'Starts in ') + (hours ? hours + 'h ' : '') + mins % 60 + 'm';
  if (shownRoom && (!live || shownRoom !== event.room)) byId('close-player').click();
}

enter.addEventListener('click', () => {
  const {events: [event], live} = exclusiveSchedule();
  if (live) window.clubOpenExclusive(event, enter);
});

window.addEventListener('club-exclusive-room', ({detail}) => {
  shownRoom = detail?.room ?? null;
  booth.hidden = !detail;
  if (detail) byId('exclusive-dj-theme').textContent = detail.title;
  else stop();
});
window.addEventListener('club-party-joined', ({detail}) => {
  if (detail !== shownRoom) return;
  joinedRoom = detail;
  sound.hidden = false;
  sound.textContent = 'Enable DJ sound';
  play();
});
window.addEventListener('club-party-left', ({detail}) => { if (detail === joinedRoom) stop(); });
window.addEventListener('club-meeting', ({detail}) => {
  if (!shownRoom) return;
  if (detail) stop();
  else if (window.clubParty.isInside(shownRoom)) {
    joinedRoom = shownRoom;
    sound.hidden = false;
    play();
  }
});
sound.addEventListener('click', () => {
  if (playing) {
    audio.pause();
    playing = false;
    sound.textContent = 'Enable DJ sound';
  } else play();
});

const requested = new URL(location.href).searchParams.get('room');
const {events: [event], live} = exclusiveSchedule();
render();
if (requested === event.room && live) window.clubOpenExclusive(event, enter);
setInterval(render, 1000);
