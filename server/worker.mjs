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

  const outgoing = Array.isArray(body.outgoing) ? body.outgoing : [];
  if (outgoing.length > 30) return reply({error: 'Too many connection messages.'}, 400);
  const statements = [
    db.prepare('UPDATE party_members SET seen = ?, camera = ?, mic = ? WHERE id = ?')
      .bind(now, Number(body.camera === true), Number(body.mic === true), id)
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
  return reply({members: results.at(-2).results, messages: results.at(-1).results});
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
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
    const data = key.endsWith('.webp') ? Uint8Array.from(atob(content), byte => byte.charCodeAt(0)) : content;
    return new Response(request.method === 'HEAD' ? null : data, {headers: {
      'Content-Type': type,
      'Cache-Control': key.endsWith('.webp') ? 'public, max-age=86400' : 'no-cache'
    }});
  }
};
