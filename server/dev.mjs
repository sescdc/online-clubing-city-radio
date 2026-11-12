import './build.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
const {default: worker} = await import('../dist/server/index.js');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../drizzle/0000_party_rooms.sql', import.meta.url), 'utf8'));

function prepare(sql, values = []) {
  const statement = sqlite.prepare(sql);
  return {
    bind: (...next) => prepare(sql, next),
    first: () => statement.get(...values),
    run: () => ({meta: statement.run(...values)}),
    all: () => ({results: statement.all(...values)}),
    execute() { return /^\s*SELECT/i.test(sql) ? this.all() : this.run(); }
  };
}
const DB = {
  prepare,
  batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const result = statements.map(statement => statement.execute());
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
};
const {values} = parseArgs({options: {
  host: {type: 'string', default: '0.0.0.0'},
  port: {type: 'string', default: process.env.PORT ?? '3000'},
  strictPort: {type: 'boolean'}
}});
createServer(async (incoming, outgoing) => {
  try {
    const body = [];
    for await (const chunk of incoming) body.push(chunk);
    const protocol = incoming.headers['x-forwarded-proto'] ?? 'http';
    const host = incoming.headers['x-forwarded-host'] ?? incoming.headers.host;
    const request = new Request(protocol + '://' + host + incoming.url, {
      method: incoming.method,
      headers: incoming.headers,
      body: body.length ? Buffer.concat(body) : undefined
    });
    const response = await worker.fetch(request, {DB});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
}).listen(Number(values.port), values.host);
