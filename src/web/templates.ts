export const stylesCss = `
:root{
  --bg: #07070A;
  --card: rgba(255,255,255,0.06);
  --border: rgba(248,250,252,0.14);
  --text: #F8FAFC;
  --muted: #A1A1AA;
  --primary: #F8FAFC;
  --success: #34D399;
  --warn: #FBBF24;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
  background: radial-gradient(1200px 700px at 10% 0%, rgba(248,250,252,0.10), transparent 55%),
              radial-gradient(900px 520px at 90% 20%, rgba(248,250,252,0.06), transparent 50%),
              var(--bg);
  color: var(--text);
}
.wrap{max-width:980px;margin:0 auto;padding:22px}
.header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
.brand{display:flex;flex-direction:column;gap:2px}
.title{font-size:22px;font-weight:800;letter-spacing:0.2px}
.subtitle{font-size:13px;color:var(--muted)}
.badge{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:rgba(255,255,255,0.04);padding:8px 10px;border-radius:999px}
.dot{width:8px;height:8px;border-radius:99px;background:rgba(148,163,184,0.6)}
.dot.ok{background:var(--success)}
.badge span{font-size:12px;font-weight:700}
.card{
  border:1px solid var(--border);
  background: var(--card);
  border-radius:16px;
  padding:14px;
  box-shadow: 0 18px 40px rgba(0,0,0,0.22);
}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.label{font-size:12px;font-weight:800;color:var(--muted);letter-spacing:0.6px;text-transform:uppercase}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.actionsBottom{margin-top:10px;justify-content:flex-end}
button{
  appearance:none;
  border:1px solid var(--border);
  background: rgba(255,255,255,0.06);
  color: var(--text);
  border-radius:12px;
  padding:10px 12px;
  font-weight:800;
  cursor:pointer;
}
button.primary{background:rgba(248,250,252,0.14);border-color:rgba(248,250,252,0.28);color:var(--text)}
button:active{transform: translateY(1px)}
.preview{
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  font-size: 14px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(248,250,252,0.10);
  min-height: 180px;
}
.hint{margin-top:10px;color:var(--muted);font-size:12px;line-height:1.45}
.meta{margin-top:10px;color:var(--muted);font-size:12px;display:flex;gap:12px;flex-wrap:wrap}
code{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace}
`;

export const appJs = `
(() => {
  try {
    const $ = (id) => document.getElementById(id);
    const textEl = $('sharedText');
    const updatedEl = $('updatedAt');
    const sizeEl = $('size');
    const copyBtn = $('copyBtn');
    const dotEl = $('dot');
    const statusEl = $('status');

    const safeStatus = (ok, label) => {
      if (statusEl) statusEl.textContent = label;
      if (dotEl && dotEl.classList) dotEl.classList.toggle('ok', !!ok);
    };

    if (!textEl || !updatedEl || !sizeEl || !copyBtn) {
      safeStatus(false, 'UI error');
      return;
    }

    const setStatus = (ok, label) => {
      statusEl.textContent = label;
      dotEl.classList.toggle('ok', ok);
    };

    const formatBytes = (n) => {
      if (!Number.isFinite(n)) return '—';
      if (n < 1024) return n + ' B';
      const kb = n / 1024;
      if (kb < 1024) return kb.toFixed(1) + ' KB';
      const mb = kb / 1024;
      return mb.toFixed(1) + ' MB';
    };

    const apiUrl = '/data';
    const fallbackUrl = '/data.json';
    let lastAppliedUpdatedAt = null;
    let mode = 'api'; // 'sse' | 'api' | 'offline'
    let inFlight = false;
    let failStreak = 0;
    let lastGoodAt = 0;
    let pollBackoffMs = 800;
    let pollTimer = null;
    let es = null;

    const setOptimisticStatus = () => {
      if (mode === 'sse') {
        setStatus(true, 'Connected');
        return;
      }
      if (mode === 'api') {
        setStatus(true, 'Connected');
        return;
      }
      if (mode === 'fallback') {
        setStatus(true, 'Connected');
        return;
      }
      const now = Date.now();
      if (lastGoodAt && now - lastGoodAt < 15000) {
        setStatus(false, 'Reconnecting…');
      } else {
        setStatus(false, 'Connecting…');
      }
    };

    const applySnapshot = (data) => {
      const nextText = typeof data.text === 'string' ? data.text : '';
      const nextUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;
      const nextSize = typeof data.size === 'number' ? data.size : (nextText || '').length;

      if (nextUpdatedAt && nextUpdatedAt !== lastAppliedUpdatedAt) {
        textEl.textContent = nextText || '—';
        lastAppliedUpdatedAt = nextUpdatedAt;
      }

      updatedEl.textContent = nextUpdatedAt ? new Date(nextUpdatedAt).toLocaleString() : '—';
      sizeEl.textContent = formatBytes(nextSize);
      lastGoodAt = Date.now();
      failStreak = 0;
      pollBackoffMs = 800;
      setOptimisticStatus();
    };

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      try {
        const now = Date.now();
        const tryApi = async () => {
          const res = await fetch(apiUrl + '?ts=' + now, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        };

        const tryFallback = async () => {
          const res = await fetch(fallbackUrl + '?ts=' + now, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        };

        let data = null;
        data = await tryApi();
        if (mode !== 'sse') mode = 'api';
        applySnapshot(data);
      } catch (e) {
        failStreak += 1;
        mode = 'offline';
        setOptimisticStatus();
      } finally {
        inFlight = false;
      }
    }

    async function copyText() {
      const value = textEl.textContent === '—' ? '' : (textEl.textContent || '');
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        copyBtn.textContent = 'Copied';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyBtn.textContent = 'Copied';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      }
    }

    copyBtn.addEventListener('click', copyText);

    const startPolling = () => {
      if (pollTimer) return;
      const loop = async () => {
        pollTimer = setTimeout(loop, pollBackoffMs);
        if (mode === 'sse' && Date.now() - lastGoodAt < 2500) return;
        await tick();
        if (mode === 'offline') pollBackoffMs = Math.min(12000, Math.round(pollBackoffMs * 1.6));
      };
      loop();
    };

    const startSse = () => {
      if (typeof EventSource !== 'function') return;
      try {
        es = new EventSource('/events');
        mode = 'sse';
        setOptimisticStatus();
        es.addEventListener('snapshot', (e) => {
          try {
            applySnapshot(JSON.parse(e.data));
          } catch {
            // ignore parse errors
          }
        });
        es.onopen = () => {
          mode = 'sse';
          setOptimisticStatus();
        };
        es.onerror = () => {
          // EventSource reconnects automatically. Keep it optimistic.
          if (mode === 'sse') mode = 'api';
          setOptimisticStatus();
          startPolling();
        };
      } catch {
        // fall back to polling
      }
    };

    startSse();
    startPolling();
  } catch {
    try {
      const statusEl = document.getElementById('status');
      if (statusEl) statusEl.textContent = 'Script error';
    } catch {
      // ignore
    }
  }
})();
`;

export const indexHtml = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>EZCP • Live Text</title>
    <style>
      ${stylesCss}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div class="brand">
          <div class="title">EZCP</div>
          <div class="subtitle">Live text from your hotspot / Wi‑Fi host</div>
        </div>
        <div class="badge" aria-live="polite">
          <div id="dot" class="dot"></div>
          <span id="status">Connecting…</span>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div class="label">Live Text</div>
        </div>

        <div id="sharedText" class="preview">—</div>

        <div class="actions actionsBottom">
          <button id="copyBtn" class="primary" type="button">Copy</button>
        </div>

        <div class="meta">
          <div>Updated: <code id="updatedAt">—</code></div>
          <div>Size: <code id="size">—</code></div>
        </div>

        <div class="hint">
          This page updates automatically while the host is sharing. Tap Copy to copy the latest text.
        </div>
      </div>
    </div>
    <script>
      ${appJs}
    </script>
  </body>
</html>
`;
