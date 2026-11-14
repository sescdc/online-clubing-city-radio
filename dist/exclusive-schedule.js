const day = 86400000;
const first = Date.UTC(2026, 10, 13);
const pacificDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
});
const pacificOffset = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset'
});
const themes = [
  {id: 'old-school', title: 'Back to ’88', sound: 'Boom bap, vinyl scratches and breakbeats', loop: 38.4},
  {id: 'bay-funk', title: 'Bay Area Funk', sound: 'Up-tempo drums, funk bass and turntable cuts', loop: 64 * 60 / 108},
  {id: 'late-night', title: 'Late Night Groove', sound: 'Slow drums, deep bass and mellow chords', loop: 64 * 60 / 88}
];

function eventAt(index) {
  const date = first + index * 2 * day;
  const zone = pacificOffset.formatToParts(date + 12 * 3600000).find(part => part.type === 'timeZoneName').value;
  const offset = Number(zone.replace('GMT', ''));
  const start = date + (20 - offset) * 3600000;
  const theme = themes[index % themes.length];
  return {...theme, room: 'exclusive-' + new Date(date).toISOString().slice(0, 10), start, end: start + 2 * 3600000};
}

export function exclusiveSchedule(now = Date.now()) {
  const parts = Object.fromEntries(pacificDate.formatToParts(now).map(part => [part.type, part.value]));
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  let index = Math.max(0, Math.floor((today - first) / (2 * day)));
  if (eventAt(index).end <= now) index++;
  const events = Array.from({length: 4}, (_, i) => eventAt(index + i));
  return {events, live: now >= events[0].start};
}
