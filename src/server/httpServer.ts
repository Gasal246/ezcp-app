import TcpSocket from 'react-native-tcp-socket';
import { appJs, indexHtml, stylesCss } from '../web/templates';

type HttpServerOptions = {
  port: number;
  getSnapshot: () => { text: string; updatedAt: string };
};

type HttpServerHandle = {
  stopAsync: () => Promise<void>;
};

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export async function startHttpServerAsync({
  port,
  getSnapshot,
}: HttpServerOptions): Promise<HttpServerHandle> {
  return new Promise<HttpServerHandle>((resolve, reject) => {
    const sseClients = new Set<any>();
    let lastBroadcastUpdatedAt: string | null = null;
    let broadcastTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const safeDropClient = (socket: any) => {
      if (!sseClients.has(socket)) return;
      sseClients.delete(socket);
      try {
        socket.end?.();
      } catch {
        // ignore
      }
      try {
        socket.destroy?.();
      } catch {
        // ignore
      }
    };

    const safeWrite = (socket: any, data: string) => {
      try {
        socket.write(data);
      } catch {
        safeDropClient(socket);
      }
    };

    const broadcastSnapshotIfChanged = () => {
      if (sseClients.size === 0) return;
      const snap = getSnapshot();
      const updatedAt = snap.updatedAt ?? '';
      if (!updatedAt || updatedAt === lastBroadcastUpdatedAt) return;
      lastBroadcastUpdatedAt = updatedAt;
      const text = snap.text ?? '';
      const payload = JSON.stringify({ text, size: text.length, updatedAt });
      const msg = `event: snapshot\ndata: ${payload}\n\n`;
      for (const client of sseClients) safeWrite(client, msg);
    };

    const server = TcpSocket.createServer((socket: any) => {
      handleSocket(socket, (req) => {
        if (req.method === 'GET' && req.path === '/events') {
          sseClients.add(socket);

          socket.on?.('error', () => safeDropClient(socket));
          socket.on?.('close', () => safeDropClient(socket));
          socket.on?.('end', () => safeDropClient(socket));

          safeWrite(
            socket,
            [
              'HTTP/1.1 200 OK',
              'Content-Type: text/event-stream; charset=utf-8',
              'Cache-Control: no-store',
              'Connection: keep-alive',
              'X-Accel-Buffering: no',
              'Access-Control-Allow-Origin: *',
              'Access-Control-Allow-Methods: GET,POST,OPTIONS',
              'Access-Control-Allow-Headers: Content-Type',
              '\r\n',
            ].join('\r\n'),
          );

          // Initial snapshot immediately
          const snap = getSnapshot();
          const updatedAt = snap.updatedAt ?? new Date().toISOString();
          const text = snap.text ?? '';
          lastBroadcastUpdatedAt = updatedAt;
          safeWrite(
            socket,
            `event: snapshot\ndata: ${JSON.stringify({ text, size: text.length, updatedAt })}\n\n`,
          );
          return;
        }

        routeRequest(req, getSnapshot, socket);
      });
    });

    let settled = false;

    server.on('error', (err: any) => {
      if (settled) return;
      settled = true;
      const message = err?.message ? String(err.message) : 'Server error';
      reject(new Error(message));
    });

    server.listen({ port, host: '0.0.0.0' }, () => {
      if (settled) return;
      settled = true;

      broadcastTimer = setInterval(broadcastSnapshotIfChanged, 350);
      heartbeatTimer = setInterval(() => {
        if (sseClients.size === 0) return;
        for (const client of sseClients) safeWrite(client, ': ping\n\n');
      }, 15000);

      resolve({
        stopAsync: () =>
          new Promise<void>((res) => {
            try {
              if (broadcastTimer) clearInterval(broadcastTimer);
              if (heartbeatTimer) clearInterval(heartbeatTimer);
              for (const client of Array.from(sseClients)) safeDropClient(client);
              server.close(() => res());
            } catch {
              res();
            }
          }),
      });
    });
  });
}

function handleSocket(
  socket: any,
  handleRequest: (req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }) => void,
) {
  let buffer = '';

  socket.on('data', (data: any) => {
    buffer += decodeChunk(data);

    const parsedHeaderEnd = findHeaderEnd(buffer);
    if (!parsedHeaderEnd) return;
    const { headerEnd, separatorLength, lineSeparator } = parsedHeaderEnd;

    const headerBlock = buffer.slice(0, headerEnd);
    const lines = headerBlock.split(lineSeparator);
    const requestLine = lines.shift() ?? '';
    const [methodRaw, pathRaw] = requestLine.split(' ');
    const method = (methodRaw ?? '').toUpperCase();
    const fullPath = normalizeRequestTarget(pathRaw ?? '/');
    const path = fullPath.split('?')[0] ?? '/';

    const headers = parseHeaders(lines);
    const contentLength = toInt(headers['content-length'] ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      writeResponse(socket, 413, 'Payload Too Large', 'text/plain', 'Too large');
      return;
    }

    const totalNeeded = headerEnd + separatorLength + contentLength;
    if (buffer.length < totalNeeded) return;

    const body = buffer.slice(headerEnd + separatorLength, totalNeeded);
    buffer = buffer.slice(totalNeeded);

    try {
      handleRequest({ method, path, headers, body });
    } catch {
      writeResponse(socket, 500, 'Internal Server Error', 'text/plain', 'Error');
    }
  });

  socket.on('error', () => {
    try {
      socket.destroy?.();
    } catch {
      // ignore
    }
  });
}

function normalizeRequestTarget(target: string): string {
  const trimmed = (target ?? '').trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      if (typeof URL === 'undefined') return trimmed;
      const u = new URL(trimmed);
      return `${u.pathname}${u.search}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed || '/';
}

function findHeaderEnd(buffer: string):
  | { headerEnd: number; separatorLength: number; lineSeparator: '\r\n' | '\n' }
  | null {
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1) return { headerEnd: crlf, separatorLength: 4, lineSeparator: '\r\n' };
  const lf = buffer.indexOf('\n\n');
  if (lf !== -1) return { headerEnd: lf, separatorLength: 2, lineSeparator: '\n' };
  return null;
}

function routeRequest(
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  },
  getSnapshot: () => { text: string; updatedAt: string },
  socket: any,
) {
  if (req.method === 'OPTIONS') {
    writeEmpty(socket, 204, 'No Content');
    return;
  }

  if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
    writeResponse(socket, 200, 'OK', 'text/html', indexHtml);
    return;
  }

  if (req.method === 'GET' && req.path === '/styles.css') {
    writeResponse(socket, 200, 'OK', 'text/css', stylesCss);
    return;
  }

  if (req.method === 'GET' && req.path === '/app.js') {
    writeResponse(socket, 200, 'OK', 'application/javascript', appJs);
    return;
  }

  if (req.method === 'GET' && (req.path === '/data' || req.path === '/data/' || req.path === '/data.json')) {
    const snap = getSnapshot();
    const text = snap.text ?? '';
    const payload = {
      text,
      size: text.length,
      updatedAt: snap.updatedAt ?? new Date().toISOString(),
    };
    writeResponse(socket, 200, 'OK', 'application/json', JSON.stringify(payload));
    return;
  }

  if (req.method === 'GET' && req.path.startsWith('/ping')) {
    writeResponse(socket, 200, 'OK', 'text/plain', 'ok');
    return;
  }

  writeResponse(socket, 404, 'Not Found', 'text/plain', 'Not found');
}

function parseHeaders(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function writeCommonHeaders(status: number, statusText: string, extra: string[]) {
  return [
    `HTTP/1.1 ${status} ${statusText}`,
    ...extra,
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Methods: GET,POST,OPTIONS',
    'Access-Control-Allow-Headers: Content-Type',
    'Access-Control-Max-Age: 86400',
    'Cache-Control: no-store',
    'Connection: close',
    '\r\n',
  ].join('\r\n');
}

function writeEmpty(socket: any, status: number, statusText: string) {
  socket.write(writeCommonHeaders(status, statusText, []));
  socket.end();
}

function writeResponse(
  socket: any,
  status: number,
  statusText: string,
  contentType: string,
  body: string,
) {
  const bodyStr = body ?? '';
  const headers = writeCommonHeaders(status, statusText, [
    `Content-Type: ${contentType}; charset=utf-8`,
  ]);
  socket.write(headers + bodyStr);
  socket.end();
}

function decodeChunk(data: any): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;

  const bytes = extractBytes(data);
  if (bytes) {
    return decodeUtf8Bytes(bytes);
  }

  if (typeof data === 'object' && typeof data.toString === 'function') {
    try {
      return data.toString('utf8');
    } catch {
      try {
        return data.toString();
      } catch {
        // ignore
      }
    }
  }

  try {
    return new TextDecoder('utf-8').decode(data);
  } catch {
    return String(data);
  }
}

function extractBytes(data: any): Uint8Array | null {
  try {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(data)) {
      return new Uint8Array(data);
    }
  } catch {
    // ignore
  }

  try {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
  } catch {
    // ignore
  }

  return null;
}

function decodeUtf8Bytes(bytes: Uint8Array): string {
  try {
    const TD = (globalThis as any).TextDecoder as undefined | (new (...args: any[]) => { decode: (b: Uint8Array) => string });
    if (typeof TD === 'function') {
      return new TD('utf-8').decode(bytes);
    }
  } catch {
    // fall back
  }

  // Minimal UTF-8 decoder (sufficient for HTTP headers + arbitrary text bodies).
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      continue;
    }

    if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const b1 = bytes[++i]!;
      const cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      out += String.fromCharCode(cp);
      continue;
    }

    if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const b1 = bytes[++i]!;
      const b2 = bytes[++i]!;
      const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
      out += String.fromCharCode(cp);
      continue;
    }

    if ((b0 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      const b1 = bytes[++i]!;
      const b2 = bytes[++i]!;
      const b3 = bytes[++i]!;
      const cp =
        ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      out += String.fromCodePoint(cp);
      continue;
    }

    // invalid byte sequence, replace
    out += '\uFFFD';
  }
  return out;
}
