#!/usr/bin/env node
/**
 * Load-testing CLI. This is never mounted as an HTTP route.
 * Targets must be in LOADTEST_ALLOWED_HOSTS (default localhost).
 */

import { parseList } from '../../src/config/parsers.js';
import { runHttp } from './http-runner.js';
import { runSockets, disconnectMany } from './socket-runner.js';
import { printReport } from './report.js';

const args = parseArgs(process.argv.slice(2));
const allowed = parseList(process.env.LOADTEST_ALLOWED_HOSTS || '127.0.0.1,localhost');
const allowProduction = ['1', 'true', 'yes'].includes(
  String(process.env.LOADTEST_ALLOW_PRODUCTION || '').toLowerCase(),
);

if (process.env.NODE_ENV === 'production' && !allowProduction) {
  console.error('Refusing to run load tests because NODE_ENV=production');
  process.exit(1);
}

const target = args.target || 'http://127.0.0.1:3000';
const host = new URL(target).hostname;
if (!allowed.includes(host)) {
  console.error(`Refusing target host "${host}". Allowed: ${allowed.join(', ')}`);
  process.exit(1);
}

const users = Number(args.users || 10);
const rps = Number(args.rps || 5);
const duration = Number(args.duration || 5);
const command = args._[0] || 'http';

const sockets = [];

if (command === 'connect') {
  const result = await runSockets({
    target,
    users,
    eventsPerSecond: 0,
    durationSeconds: 1,
    sockets,
  });
  printReport('connect', result);
} else if (command === 'disconnect') {
  const percent = Number(args.percent || 100);
  printReport('disconnect', disconnectMany(sockets, percent));
} else if (command === 'socket') {
  printReport(
    'socket',
    await runSockets({ target, users, eventsPerSecond: rps, durationSeconds: duration, sockets }),
  );
} else if (command === 'combined') {
  const http = await runHttp({ target, path: args.path || '/', rps, durationSeconds: duration });
  const socket = await runSockets({
    target,
    users,
    eventsPerSecond: rps,
    durationSeconds: duration,
    sockets,
  });
  printReport('http', http);
  printReport('socket', socket);
} else {
  printReport(
    'http',
    await runHttp({ target, path: args.path || '/', rps, durationSeconds: duration }),
  );
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = value;
    } else {
      out._.push(item);
    }
  }
  return out;
}
