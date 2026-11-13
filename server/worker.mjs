const presenceWindow = 45_000;
const roomPattern = /^(?:city-[a-z0-9-]{2,24}|nationwide|bay-stl)$/;
const uuidPattern = /^[0-9a-f-]{36}$/;
const headers = {'Cache-Control': 'no-store'};

function reply(body, status = 200) {
  return Response.json(body, {status, headers});
}

const backdrops = new Set(['city', 'wave', 'sunset', 'studio', 'neon', 'vip', 'rooftop',
  'velvet', 'warehouse', 'disco', 'tropical', 'arcade', 'vinyl', 'tunnel']);
const inviteLifetime = 2 * 60_000;
const meetingLifetime = 60 * 60_000;

const activeMeeting = `SELECT m.id, m.host, m.guest FROM party_meetings m
  JOIN party_members h ON h.id = m.host AND h.seen >= ?
  JOIN party_members g ON g.id = m.guest AND g.seen >= ?
  WHERE m.room = ? AND (m.host = ? OR m.guest = ?) AND m.accepted = 1 AND m.expires > ?`;

async function updateMeeting(db, body, now, cutoff) {
  const {room, id, action, target, invite} = body;
  if (action === 'invite' && uuidPattern.test(target) && target !== id) {
    const result = await db.prepare(`INSERT INTO party_meetings (id, room, host, guest, expires)
      SELECT ?, ?, ?, ?, ? FROM party_members WHERE id = ? AND room = ? AND seen >= ?
      AND NOT EXISTS (
        SELECT 1 FROM party_meetings m
        JOIN party_members h ON h.id = m.host AND h.seen >= ?
        JOIN party_members g ON g.id = m.guest AND g.seen >= ?
        WHERE m.room = ? AND m.expires > ?
        AND (m.host IN (?, ?) OR m.guest IN (?, ?))
      )`).bind(crypto.randomUUID(), room, id, target, now + inviteLifetime,
        target, room, cutoff, cutoff, cutoff, room, now, id, target, id, target).run();
    return result.meta.changes ? reply({}) : reply({error: 'That guest is no longer available for an invite.'}, 409);
  }
  if (!uuidPattern.test(invite)) return reply({error: 'Choose a valid invitation.'}, 400);
  if (action === 'accept') {
    const result = await db.prepare(`UPDATE party_meetings SET accepted = 1, expires = ?
      WHERE id = ? AND room = ? AND guest = ? AND accepted = 0 AND expires > ?
      AND EXISTS (SELECT 1 FROM party_members WHERE id = party_meetings.host AND seen >= ?)
      AND NOT EXISTS (SELECT 1 FROM karaoke_turns k WHERE k.room = party_meetings.room
        AND k.ends_at > ? AND k.performer_id IN (party_meetings.host, party_meetings.guest))`)
      .bind(now + meetingLifetime, invite, room, id, now, cutoff, now).run();
    return result.meta.changes ? reply({}) : reply({error: 'The invite is unavailable. A singer can join after their turn ends.'}, 409);
  }
  if (action === 'message') {
    const message = typeof body.text === 'string' ? body.text.trim() : '';
    if (!message || message.length > 500) return reply({error: 'Enter a message up to 500 characters.'}, 400);
    const results = await db.batch([
      db.prepare(`INSERT INTO party_meeting_messages (meeting, sender, text)
        SELECT m.id, ?, ? FROM (${activeMeeting}) m WHERE m.id = ?`)
        .bind(id, message, cutoff, cutoff, room, id, id, now, invite),
      db.prepare(`DELETE FROM party_meeting_messages WHERE meeting = ?
        AND id NOT IN (SELECT id FROM party_meeting_messages WHERE meeting = ? ORDER BY id DESC LIMIT 50)`)
        .bind(invite, invite)
    ]);
    return results[0].meta.changes ? reply({}) : reply({error: 'This private room has ended.'}, 409);
  }
  if (action === 'dismiss') {
    const result = await db.prepare('DELETE FROM party_meetings WHERE id = ? AND room = ? AND (host = ? OR guest = ?)')
      .bind(invite, room, id, id).run();
    return result.meta.changes ? reply({}) : reply({error: 'This invitation or meetup has already ended.'}, 409);
  }
  return reply({error: 'Unknown meeting action.'}, 400);
}

async function handleParty(request, env, path) {
  if (request.method !== 'POST') return reply({error: 'Method unavailable.'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return reply({error: 'Open the room from Online Clubing.'}, 403);
  }
  if (!env.DB) return reply({error: 'Video rooms are temporarily unavailable.'}, 503);
  const raw = await request.text();
  if (raw.length > 120_000) return reply({error: 'Request is too large.'}, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return reply({error: 'Invalid request.'}, 400); }
  if (!body || !roomPattern.test(body.room)) return reply({error: 'Unknown room.'}, 404);

  const db = env.DB.withSession?.('first-primary') ?? env.DB;
  const {room} = body;
  const now = Date.now();
  const cutoff = now - presenceWindow;
  if (path === '/api/party/join') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 32) : '';
    if (!name) return reply({error: 'Enter a display name.'}, 400);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const results = await db.batch([
      db.prepare('DELETE FROM party_signals WHERE created < ?').bind(now - 90_000),
      db.prepare('DELETE FROM party_meetings WHERE expires <= ?').bind(now),
      db.prepare('DELETE FROM party_members WHERE seen < ?').bind(cutoff),
      db.prepare('DELETE FROM party_backdrops WHERE member_id NOT IN (SELECT id FROM party_members)'),
      db.prepare(`INSERT INTO party_members (id, room, token, name, seen)
        VALUES (?, ?, ?, ?, ?)`).bind(id, room, token, name, now)
    ]);
    let iceServers;
    try {
      const configured = JSON.parse(env.PARTY_ICE_SERVERS ?? 'null');
      if (Array.isArray(configured)) iceServers = configured;
    } catch { /* Use the default STUN server when no valid configuration is supplied. */ }
    return results.at(-1).meta.changes ? reply({id, token, iceServers}) : reply({error: 'Could not join this room.'}, 503);
  }

  const {id, token} = body;
  if (!uuidPattern.test(id) || !uuidPattern.test(token)) return reply({error: 'Rejoin this room.'}, 401);
  if (path === '/api/party/leave') {
    await db.batch([
      db.prepare(`DELETE FROM party_backdrops WHERE member_id = ?
        AND EXISTS (SELECT 1 FROM party_members WHERE room = ? AND id = ? AND token = ?)`)
        .bind(id, room, id, token),
      db.prepare(`DELETE FROM party_meetings WHERE room = ? AND (host = ? OR guest = ?)
        AND EXISTS (SELECT 1 FROM party_members WHERE room = ? AND id = ? AND token = ?)`)
        .bind(room, id, id, room, id, token),
      db.prepare('DELETE FROM party_members WHERE room = ? AND id = ? AND token = ?').bind(room, id, token)
    ]);
    return reply({});
  }

  const member = await db.prepare('SELECT id FROM party_members WHERE room = ? AND id = ? AND token = ? AND seen >= ?')
    .bind(room, id, token, cutoff).first();
  if (!member) return reply({error: 'Your connection expired. Rejoin the room.'}, 401);

  if (path === '/api/party/meet') return updateMeeting(db, body, now, cutoff);
  if (path === '/api/party/backdrop') {
    if (typeof body.image !== 'string' || body.image.length > 65_536 || body.image.length % 4 !== 0
      || !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
      return reply({error: 'Choose a supported photo and try again.'}, 400);
    }
    const version = crypto.randomUUID();
    const result = await db.prepare(`INSERT INTO party_backdrops (member_id, version, image)
      SELECT id, ?, ? FROM party_members WHERE room = ? AND id = ? AND token = ? AND seen >= ?
      ON CONFLICT(member_id) DO UPDATE SET version = excluded.version, image = excluded.image`)
      .bind(version, body.image, room, id, token, cutoff).run();
    return result.meta.changes ? reply({version}) : reply({error: 'Rejoin the room to upload a photo.'}, 401);
  }

  const meeting = await db.prepare(activeMeeting).bind(cutoff, cutoff, room, id, id, now).first();
  const channel = meeting?.id ?? '';
  const expectedChannel = typeof body.channel === 'string' ? body.channel : '';
  const turn = !channel && await db.prepare('SELECT performer_id FROM karaoke_turns WHERE room = ? AND ends_at > ?')
    .bind(room, now).first();
  const singer = turn?.performer_id ?? null;
  let backdrop = backdrops.has(body.backdrop) ? body.backdrop : '';
  if (typeof body.backdrop === 'string' && body.backdrop.startsWith('custom:')) {
    const version = body.backdrop.slice(7);
    if (uuidPattern.test(version) && await db.prepare('SELECT 1 FROM party_backdrops WHERE member_id = ? AND version = ?')
      .bind(id, version).first()) backdrop = body.backdrop;
  }
  const outgoing = Array.isArray(body.outgoing) ? body.outgoing : [];
  if (outgoing.length > 30) return reply({error: 'Too many connection messages.'}, 400);
  const statements = [
    db.prepare('UPDATE party_members SET seen = ?, camera = ?, mic = ?, backdrop = ? WHERE id = ?')
      .bind(now, Number(channel === expectedChannel && body.camera === true),
        Number(channel === expectedChannel && body.mic === true && (!singer || singer === id)), backdrop, id)
  ];
  if (channel && channel !== expectedChannel) {
    statements.push(db.prepare('DELETE FROM party_signals WHERE target = ? AND channel = ?').bind(id, ''));
  }
  for (const message of channel === expectedChannel ? outgoing : []) {
    if (!message || !uuidPattern.test(message.target) || !uuidPattern.test(message.nonce) || message.target === id) continue;
    if (!['offer', 'answer', 'ice'].includes(message.type)) continue;
    if (!message.data || typeof message.data !== 'object') continue;
    if (meeting && message.target !== (meeting.host === id ? meeting.guest : meeting.host)) continue;
    statements.push(db.prepare(`INSERT OR IGNORE INTO party_signals (sender, target, nonce, payload, created, channel)
      SELECT ?, id, ?, ?, ?, ? FROM party_members p WHERE id = ? AND room = ? AND seen >= ?
        AND (? <> '' OR NOT EXISTS (
          SELECT 1 FROM party_meetings m
          JOIN party_members h ON h.id = m.host AND h.seen >= ?
          JOIN party_members g ON g.id = m.guest AND g.seen >= ?
          WHERE m.room = p.room AND m.accepted = 1 AND m.expires > ? AND p.id IN (m.host, m.guest)
        ))`)
      .bind(id, message.nonce, JSON.stringify({type: message.type, data: message.data}), now, channel,
        message.target, room, cutoff, channel, cutoff, cutoff, now));
  }
  const cursor = Number.isSafeInteger(body.cursor) && body.cursor > 0 ? body.cursor : 0;
  const members = meeting
    ? db.prepare('SELECT id, name, camera, mic, backdrop FROM party_members WHERE id IN (?, ?) AND seen >= ?')
        .bind(meeting.host, meeting.guest, cutoff)
    : db.prepare(`SELECT p.id, p.name, p.camera, p.mic, p.backdrop FROM party_members p
        WHERE p.room = ? AND p.seen >= ? AND NOT EXISTS (
          SELECT 1 FROM party_meetings m
          JOIN party_members h ON h.id = m.host AND h.seen >= ?
          JOIN party_members g ON g.id = m.guest AND g.seen >= ?
          WHERE m.room = p.room AND m.accepted = 1 AND m.expires > ? AND p.id IN (m.host, m.guest)
        ) ORDER BY p.rowid`).bind(room, cutoff, cutoff, cutoff, now);
  statements.push(
    db.prepare('DELETE FROM party_signals WHERE target = ? AND (created < ? OR (channel = ? AND id <= ?))')
      .bind(id, now - 90_000, expectedChannel, cursor),
    members,
    db.prepare(`SELECT id, sender, payload FROM party_signals
      WHERE target = ? AND channel = ? AND id > ? ORDER BY id LIMIT 100`)
      .bind(id, channel, channel === expectedChannel ? cursor : 0),
    db.prepare(`SELECT m.id, m.host, h.name AS hostName, g.name AS guestName FROM party_meetings m
      JOIN party_members h ON h.id = m.host AND h.seen >= ?
      JOIN party_members g ON g.id = m.guest AND g.seen >= ?
      WHERE m.room = ? AND (m.host = ? OR m.guest = ?) AND m.accepted = 0 AND m.expires > ?`)
      .bind(cutoff, cutoff, room, id, id, now)
  );
  const results = await db.batch(statements);
  const chat = channel ? (await db.prepare(`SELECT id, sender, text FROM party_meeting_messages
    WHERE meeting = ? ORDER BY id`).bind(channel).all()).results : [];
  return reply({
    chat, members: results.at(-3).results, messages: results.at(-2).results,
    invite: results.at(-1).results[0] ?? null, channel, singer, now
  });
}

const trackDuration = Object.freeze({'city-lights': 30_750, 'after-hours': 35_030});
const youtubeTrack = /^youtube:[A-Za-z0-9_-]{11}$/;
const countdown = 5000;
const videoStartupWindow = 90_000;
const maxVideoDuration = 12 * 60 * 60_000;
const queueLifetime = 2 * 60 * 60 * 1000;

async function handleKaraoke(request, env) {
  if (!env.DB) return reply({error: 'The singer list is temporarily unavailable.'}, 503);
  const url = new URL(request.url);
  const room = url.searchParams.get('room');
  if (!room || !roomPattern.test(room)) return reply({error: 'Unknown room.'}, 404);
  const db = env.DB.withSession?.('first-primary') ?? env.DB;
  const now = Date.now();
  const cutoff = now - queueLifetime;
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return reply({error: 'Open this room from Online Clubing.'}, 403);
    const raw = await request.text();
    if (raw.length > 1000) return reply({error: 'Request is too large.'}, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({error: 'Invalid request.'}, 400); }
    if (!input || typeof input.key !== 'string' || !uuidPattern.test(input.key)) return reply({error: 'Refresh the room and try again.'}, 400);
    if (input.action === 'join') {
      const singer = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
      if (!singer || singer.length > 32 || !(typeof input.track === 'string' && (Object.hasOwn(trackDuration, input.track) || youtubeTrack.test(input.track)))) {
        return reply({error: 'Enter a singer name and pick a stage song.'}, 400);
      }
      const results = await db.batch([
        db.prepare(`DELETE FROM karaoke_turns WHERE room = ?
          AND (ends_at <= ? OR (started_at IS NULL AND created_at < ?))`).bind(room, now, cutoff),
        db.prepare(`INSERT OR IGNORE INTO karaoke_turns (room, singer_key, singer, track, created_at)
          SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM karaoke_turns WHERE room = ?) < 30`)
          .bind(room, input.key, singer, input.track, now, room),
        db.prepare('SELECT id FROM karaoke_turns WHERE room = ? AND singer_key = ?').bind(room, input.key)
      ]);
      const own = results[2].results[0];
      if (!own) return reply({error: 'The singer list is full. Try again after a turn ends.'}, 409);
      return reply({id: own.id});
    }
    if (!Number.isSafeInteger(input.id) || input.id < 1) return reply({error: 'Choose a valid turn.'}, 400);
    if (input.action === 'leave') {
      const result = await db.prepare(`DELETE FROM karaoke_turns
        WHERE room = ? AND id = ? AND singer_key = ? AND started_at IS NULL`)
        .bind(room, input.id, input.key).run();
      return result.meta.changes ? reply({ok: true}) : reply({error: 'Only waiting singers can leave the queue.'}, 409);
    }
    if (input.action === 'start') {
      const party = input.party;
      if (!party || typeof party.id !== 'string' || typeof party.token !== 'string'
        || !uuidPattern.test(party.id) || !uuidPattern.test(party.token)) {
        return reply({error: 'Join the singer screen before starting your song.'}, 409);
      }
      const performer = await db.prepare('SELECT id FROM party_members WHERE room = ? AND id = ? AND token = ? AND seen >= ?')
        .bind(room, party.id, party.token, now - presenceWindow).first();
      const meeting = performer && await db.prepare(activeMeeting)
        .bind(now - presenceWindow, now - presenceWindow, room, performer.id, performer.id, now).first();
      if (!performer || meeting) return reply({error: 'Rejoin the singer screen before starting your song.'}, 409);
      const own = await db.prepare('SELECT track FROM karaoke_turns WHERE room = ? AND id = ? AND singer_key = ? AND started_at IS NULL')
        .bind(room, input.id, input.key).first();
      const duration = own && (youtubeTrack.test(own.track) ? videoStartupWindow : trackDuration[own.track]);
      if (!duration) return reply({error: 'Your turn is unavailable. Sign up again if it expired.'}, 409);
      const result = await db.prepare(`UPDATE karaoke_turns SET started_at = ?, ends_at = ?, performer_id = ?
        WHERE room = ? AND id = ? AND singer_key = ? AND started_at IS NULL
          AND id = (SELECT MIN(id) FROM karaoke_turns WHERE room = ? AND started_at IS NULL AND created_at >= ?)
          AND NOT EXISTS (SELECT 1 FROM karaoke_turns WHERE room = ? AND ends_at > ?)
          AND NOT EXISTS (${activeMeeting})`)
        .bind(now + countdown, now + countdown + duration, performer.id, room, input.id, input.key, room, cutoff, room, now,
          now - presenceWindow, now - presenceWindow, room, performer.id, performer.id, now).run();
      if (!result.meta.changes) return reply({error: 'Wait until the singer list shows you are up next.'}, 409);
    } else if (input.action === 'video-timing') {
      const {duration} = input;
      if (!Number.isSafeInteger(duration) || duration < 1000 || duration > maxVideoDuration) {
        return reply({error: 'This video length could not be used.'}, 400);
      }
      // Commit the length once. A local pause, seek or ended event cannot change the shared deadline.
      await db.prepare(`UPDATE karaoke_turns SET ends_at = started_at + ?
        WHERE room = ? AND id = ? AND singer_key = ? AND track LIKE 'youtube:%'
          AND started_at <= ? AND ends_at > ? AND ends_at = started_at + ?`)
        .bind(duration === videoStartupWindow ? duration + 1 : duration, room, input.id, input.key,
          now, now, videoStartupWindow).run();
    } else {
      return reply({error: 'Unknown karaoke action.'}, 400);
    }
  } else if (request.method !== 'GET') {
    return reply({error: 'Method unavailable.'}, 405);
  }

  const stateTime = Date.now();
  const {results} = await db.prepare(`SELECT id, singer, track, started_at, ends_at, performer_id
    FROM karaoke_turns WHERE room = ?
      AND ((started_at IS NULL AND created_at >= ?) OR ends_at > ?)
    ORDER BY started_at IS NULL, id LIMIT 30`).bind(room, stateTime - queueLifetime, stateTime).all();
  return reply({now: stateTime, turns: results});
}

async function searchKaraoke(request, env) {
  if (request.method !== 'GET') return reply({error: 'Method unavailable.'}, 405);
  if (!env.YOUTUBE_DATA_API_KEY) return reply({available: false});
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 150);
  if (!query) return reply({available: true});
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    key: env.YOUTUBE_DATA_API_KEY, q: query + ' karaoke with lyrics', part: 'snippet',
    type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', maxResults: '5'
  });
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(5000)});
    if (!response.ok) return reply({available: false});
    const data = await response.json();
    return reply({available: true, videos: data.items.map(item => ({
      id: item.id.videoId, title: item.snippet.title, channel: item.snippet.channelTitle
    }))});
  } catch {
    return reply({available: false});
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/karaoke/search') return searchKaraoke(request, env);
    if (path === '/api/party/backdrop' && request.method === 'GET') {
      const version = new URL(request.url).searchParams.get('v');
      if (!env.DB || !uuidPattern.test(version ?? '')) return new Response(null, {status: 404});
      const entry = await env.DB.prepare(`SELECT b.image FROM party_backdrops b
        JOIN party_members p ON p.id = b.member_id WHERE b.version = ? AND p.backdrop = ? AND p.seen >= ?`)
        .bind(version, 'custom:' + version, Date.now() - presenceWindow).first();
      if (!entry) return new Response(null, {status: 404, headers});
      return new Response(Uint8Array.from(atob(entry.image), byte => byte.charCodeAt(0)), {headers:{
        ...headers, 'Content-Type':'image/jpeg', 'X-Content-Type-Options':'nosniff', 'Cross-Origin-Resource-Policy':'same-origin'
      }});
    }
    if (path === '/api/karaoke') {
      try { return await handleKaraoke(request, env); }
      catch (error) {
        console.error('Karaoke request failed', error.message);
        return reply({error: 'The karaoke stage is temporarily unavailable.'}, 503);
      }
    }
    if (['/api/party/join', '/api/party/sync', '/api/party/leave', '/api/party/meet', '/api/party/backdrop'].includes(path)) {
      try { return await handleParty(request, env, path); }
      catch (error) {
        console.error('Party request failed', path, error.message);
        return reply({error: 'The room connection is temporarily unavailable.'}, 503);
      }
    }
    const key = path === '/' ? 'index.html' : path.slice(1);
    if (!Object.hasOwn(assets, key)) return new Response('Not found', {status: 404});
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405});
    const [type, content, encoding] = assets[key];
    const isAudio = type === 'audio/mpeg';
    const data = encoding || /\.(webp|gz|mp3)$/.test(key) ? Uint8Array.from(atob(content), byte => byte.charCodeAt(0)) : content;
    const responseHeaders = {
      'Content-Type': type,
      'Cache-Control': key.endsWith('.webp') || isAudio ? 'public, max-age=86400' : 'no-cache'
    };
    if (encoding) responseHeaders['Content-Encoding'] = encoding;
    if (isAudio) {
      responseHeaders['Accept-Ranges'] = 'bytes';
      const range = request.headers.get('Range');
      if (range && request.method === 'GET') {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const size = data.length;
        const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
        const end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
        if (!match || start > end || start >= size) {
          return new Response(null, {status: 416, headers: {...responseHeaders, 'Content-Range': 'bytes */' + size}});
        }
        return new Response(data.subarray(start, end + 1), {status: 206, headers: {
          ...responseHeaders,
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Content-Length': String(end - start + 1)
        }});
      }
      responseHeaders['Content-Length'] = String(data.length);
    }
    return new Response(request.method === 'HEAD' ? null : data, {headers: responseHeaders});
  }
};
