const maxGuests = 6;
const presenceWindow = 45_000;
const roomPattern = /^(?:city-[a-z0-9-]{2,24}|nationwide|bay-stl)$/;
const uuidPattern = /^[0-9a-f-]{36}$/;
const headers = {'Cache-Control': 'no-store'};

function reply(body, status = 200) {
  return Response.json(body, {status, headers});
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
      db.prepare('DELETE FROM party_members WHERE seen < ?').bind(cutoff),
      db.prepare(`INSERT INTO party_members (id, room, token, name, seen)
        SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM party_members WHERE room = ? AND seen >= ?) < ?`)
        .bind(id, room, token, name, now, room, cutoff, maxGuests)
    ]);
    return results[2].meta.changes ? reply({id, token}) : reply({error: 'This video room is full (6 guests).'}, 409);
  }

  const {id, token} = body;
  if (!uuidPattern.test(id) || !uuidPattern.test(token)) return reply({error: 'Rejoin this room.'}, 401);
  if (path === '/api/party/leave') {
    await db.prepare('DELETE FROM party_members WHERE room = ? AND id = ? AND token = ?')
      .bind(room, id, token).run();
    return reply({});
  }

  const member = await db.prepare('SELECT id FROM party_members WHERE room = ? AND id = ? AND token = ? AND seen >= ?')
    .bind(room, id, token, cutoff).first();
  if (!member) return reply({error: 'Your connection expired. Rejoin the room.'}, 401);

  const turn = await db.prepare('SELECT performer_id FROM karaoke_turns WHERE room = ? AND ends_at > ?')
    .bind(room, now).first();
  const singer = turn?.performer_id ?? null;
  const outgoing = Array.isArray(body.outgoing) ? body.outgoing : [];
  if (outgoing.length > 30) return reply({error: 'Too many connection messages.'}, 400);
  const statements = [
    db.prepare('UPDATE party_members SET seen = ?, camera = ?, mic = ? WHERE id = ?')
      .bind(now, Number(body.camera === true), Number(body.mic === true && (!singer || singer === id)), id)
  ];
  for (const message of outgoing) {
    if (!message || !uuidPattern.test(message.target) || !uuidPattern.test(message.nonce) || message.target === id) continue;
    if (!['offer', 'answer', 'ice'].includes(message.type)) continue;
    if (!message.data || typeof message.data !== 'object') continue;
    statements.push(db.prepare(`INSERT OR IGNORE INTO party_signals (sender, target, nonce, payload, created)
      SELECT ?, id, ?, ?, ? FROM party_members WHERE id = ? AND room = ? AND seen >= ?`)
      .bind(id, message.nonce, JSON.stringify({type: message.type, data: message.data}), now, message.target, room, cutoff));
  }
  const cursor = Number.isSafeInteger(body.cursor) && body.cursor > 0 ? body.cursor : 0;
  statements.push(
    db.prepare('DELETE FROM party_signals WHERE target = ? AND (id <= ? OR created < ?)').bind(id, cursor, now - 90_000),
    db.prepare('SELECT id, name, camera, mic FROM party_members WHERE room = ? AND seen >= ? ORDER BY id').bind(room, cutoff),
    db.prepare('SELECT id, sender, payload FROM party_signals WHERE target = ? AND id > ? ORDER BY id LIMIT 100').bind(id, cursor)
  );
  const results = await db.batch(statements);
  return reply({members: results.at(-2).results, messages: results.at(-1).results, singer, now});
}

const trackDuration = Object.freeze({'city-lights': 30_750, 'after-hours': 35_030});
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
      if (!singer || singer.length > 32 || !Object.hasOwn(trackDuration, input.track)) {
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
      const result = await db.prepare('DELETE FROM karaoke_turns WHERE room = ? AND id = ? AND singer_key = ?')
        .bind(room, input.id, input.key).run();
      if (!result.meta.changes) return reply({error: 'This turn is no longer on your list.'}, 409);
      return reply({ok: true});
    }
    if (input.action === 'start') {
      const party = input.party;
      if (!party || typeof party.id !== 'string' || typeof party.token !== 'string'
        || !uuidPattern.test(party.id) || !uuidPattern.test(party.token)) {
        return reply({error: 'Join the singer screen before starting your song.'}, 409);
      }
      const performer = await db.prepare('SELECT id FROM party_members WHERE room = ? AND id = ? AND token = ? AND seen >= ?')
        .bind(room, party.id, party.token, now - presenceWindow).first();
      if (!performer) return reply({error: 'Rejoin the singer screen before starting your song.'}, 409);
      const own = await db.prepare('SELECT track FROM karaoke_turns WHERE room = ? AND id = ? AND singer_key = ? AND started_at IS NULL')
        .bind(room, input.id, input.key).first();
      const duration = own && trackDuration[own.track];
      if (!duration) return reply({error: 'Your turn is unavailable. Sign up again if it expired.'}, 409);
      const result = await db.prepare(`UPDATE karaoke_turns SET started_at = ?, ends_at = ?, performer_id = ?
        WHERE room = ? AND id = ? AND singer_key = ? AND started_at IS NULL
          AND id = (SELECT MIN(id) FROM karaoke_turns WHERE room = ? AND started_at IS NULL AND created_at >= ?)
          AND NOT EXISTS (SELECT 1 FROM karaoke_turns WHERE room = ? AND ends_at > ?)`)
        .bind(now, now + duration, performer.id, room, input.id, input.key, room, cutoff, room, now).run();
      if (!result.meta.changes) return reply({error: 'Wait until the singer list shows you are up next.'}, 409);
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

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/karaoke') {
      try { return await handleKaraoke(request, env); }
      catch (error) {
        console.error('Karaoke request failed', error.message);
        return reply({error: 'The karaoke stage is temporarily unavailable.'}, 503);
      }
    }
    if (['/api/party/join', '/api/party/sync', '/api/party/leave'].includes(path)) {
      try { return await handleParty(request, env, path); }
      catch (error) {
        console.error('Party request failed', path, error.message);
        return reply({error: 'The room connection is temporarily unavailable.'}, 503);
      }
    }
    const key = path === '/' ? 'index.html' : path.slice(1);
    if (!Object.hasOwn(assets, key)) return new Response('Not found', {status: 404});
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405});
    const [type, content] = assets[key];
    const isAudio = type === 'audio/mpeg';
    const data = /\.(webp|gz|mp3)$/.test(key) ? Uint8Array.from(atob(content), byte => byte.charCodeAt(0)) : content;
    const responseHeaders = {
      'Content-Type': type,
      'Cache-Control': key.endsWith('.webp') || isAudio ? 'public, max-age=86400' : 'no-cache'
    };
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
