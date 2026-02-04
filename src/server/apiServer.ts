import TcpSocket from 'react-native-tcp-socket';

type ApiServerOptions = {
  port: number;
  getSnapshot: () => { text: string; updatedAt: string };
  onRemoteText: (nextText: string) => void;
};

type ApiServerHandle = {
  stopAsync: () => Promise<void>;
};

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export function startApiServer({
  port,
  getSnapshot,
  onRemoteText,
}: ApiServerOptions): ApiServerHandle {
  const server = TcpSocket.createServer((socket: any) => {
    handleSocket(socket, getSnapshot, onRemoteText);
  });

  server.on('error', () => {
    // no-op; caller will see broken API behavior and can restart
  });

  server.listen({ port, host: '0.0.0.0' });

  return {
    stopAsync: () =>
      new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
      }),
  };
}

function handleSocket(
  socket: any,
  getSnapshot: () => { text: string; updatedAt: string },
  onRemoteText: (t: string) => void,
) {
  let buffer = '';

  socket.on('data', (data: any) => {
    buffer += decodeChunk(data);

    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const headerBlock = buffer.slice(0, headerEnd);
    const lines = headerBlock.split('\r\n');
    const requestLine = lines.shift() ?? '';
    const [methodRaw, pathRaw] = requestLine.split(' ');
    const method = (methodRaw ?? '').toUpperCase();
    const path = pathRaw ?? '/';

    const headers = parseHeaders(lines);
    const contentLength = toInt(headers['content-length'] ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      writeResponse(socket, 413, 'Payload Too Large', 'text/plain', 'Too large');
      return;
    }

    const totalNeeded = headerEnd + 4 + contentLength;
    if (buffer.length < totalNeeded) return;

    const body = buffer.slice(headerEnd + 4, totalNeeded);
    buffer = buffer.slice(totalNeeded);

    try {
      routeRequest({ method, path, headers, body }, getSnapshot, onRemoteText, socket);
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

function routeRequest(
  req: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  },
  getSnapshot: () => { text: string; updatedAt: string },
  onRemoteText: (t: string) => void,
  socket: any,
) {
  if (req.method === 'OPTIONS') {
    writeEmpty(socket, 204, 'No Content');
    return;
  }

  if (req.method === 'GET' && (req.path === '/data' || req.path === '/data/')) {
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

  if (req.method === 'POST' && (req.path === '/data' || req.path === '/data/')) {
    const contentType = (req.headers['content-type'] ?? '').toLowerCase();
    const nextText = parseTextFromBody(contentType, req.body);
    onRemoteText(nextText);
    writeResponse(socket, 200, 'OK', 'application/json', JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && req.path.startsWith('/ping')) {
    writeResponse(socket, 200, 'OK', 'text/plain', 'ok');
    return;
  }

  writeResponse(socket, 404, 'Not Found', 'text/plain', 'Not found');
}

function parseTextFromBody(contentType: string, body: string): string {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.text === 'string') return parsed.text;
      if (typeof parsed === 'string') return parsed;
      return '';
    } catch {
      return '';
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const text = params.get('text');
    return text ?? '';
  }

  return body ?? '';
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

function writeEmpty(socket: any, status: number, statusText: string) {
  const headers = [
    `HTTP/1.1 ${status} ${statusText}`,
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Methods: GET,POST,OPTIONS',
    'Access-Control-Allow-Headers: Content-Type',
    'Access-Control-Max-Age: 86400',
    'Cache-Control: no-store',
    'Connection: close',
    '\r\n',
  ].join('\r\n');
  socket.write(headers);
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
  const byteLength = utf8ByteLength(bodyStr);

  const headers = [
    `HTTP/1.1 ${status} ${statusText}`,
    `Content-Type: ${contentType}; charset=utf-8`,
    `Content-Length: ${byteLength}`,
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Methods: GET,POST,OPTIONS',
    'Access-Control-Allow-Headers: Content-Type',
    'Cache-Control: no-store',
    'Connection: close',
    '\r\n',
  ].join('\r\n');

  socket.write(headers + bodyStr);
  socket.end();
}

function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // surrogate pair
      i += 1;
      bytes += 4;
    } else bytes += 3;
  }
  return bytes;
}

function decodeChunk(data: any): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;

  try {
    if (data instanceof ArrayBuffer) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return new TextDecoder('utf-8').decode(new Uint8Array(data));
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(data)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return new TextDecoder('utf-8').decode(data);
    }
  } catch {
    // fall through
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new TextDecoder('utf-8').decode(data);
  } catch {
    return String(data);
  }
}
