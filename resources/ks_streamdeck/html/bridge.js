/* Invisible NUI: discovery is automatic; first connection is approved in the desktop plugin. */
(() => {
    let config,
        socket,
        token,
        sessionId,
        clientId,
        pairingCode,
        connected = false;
    let stopped = true,
        retry = 0,
        reconnectUntil = 0,
        timer,
        snapshot,
        epoch = 0;
    const pending = new Set();
    const resumeKey = 'ks_streamdeck.resume.v1';
    // Short-lived, origin-local recovery for a destroyed/recreated NUI frame.
    // The desktop still enforces its existing 30-second session grace period.
    const resumeMs = 25000;
    function clearResume() {
        try {
            localStorage.removeItem(resumeKey);
        } catch {}
    }
    function saveResume() {
        if (!connected || !token || !config?.enabled) return;
        try {
            localStorage.setItem(
                resumeKey,
                JSON.stringify({
                    token,
                    clientId,
                    serverId: config.server.id,
                    port: config.port,
                    expiresAt: Date.now() + resumeMs,
                }),
            );
        } catch {} // Pairing still works when browser storage is unavailable.
    }
    function restoreResume() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(resumeKey));
        } catch {}
        if (!saved) return;
        if (
            saved.serverId !== config.server.id ||
            saved.port !== config.port ||
            !Number.isFinite(saved.expiresAt) ||
            saved.expiresAt <= Date.now() ||
            saved.expiresAt > Date.now() + resumeMs ||
            typeof saved.token !== 'string' ||
            !/^[a-f0-9]{64}$/.test(saved.token) ||
            typeof saved.clientId !== 'string' ||
            !/^[a-zA-Z0-9-]{1,160}$/.test(saved.clientId)
        ) {
            clearResume();
            return;
        }
        token = saved.token;
        clientId = saved.clientId;
        reconnectUntil = saved.expiresAt;
        stopped = false;
        connect();
        return true;
    }
    const post = async (name, data) => {
        const response = await fetch(`https://${GetParentResourceName()}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(4500),
        });
        return response.json();
    };
    const report = (data) => {
        void post('connection', data).catch(() => {});
    };
    const notice = (message) => {
        void post('notice', { message }).catch(() => {});
    };
    const send = (data) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    };
    function sendSnapshot() {
        if (!connected || !snapshot) return;
        saveResume();
        send({
            type: 'snapshot',
            sessionId,
            catalog: Array.isArray(snapshot.catalog) ? snapshot.catalog : [],
            active: snapshot.active || null,
            blocked: snapshot.blocked || null,
        });
    }
    function disconnect(tellPlugin = true) {
        clearResume();
        stopped = true;
        epoch++;
        clearTimeout(timer);
        if (tellPlugin && connected) send({ type: 'bye', sessionId });
        connected = false;
        report({ connected: false });
        const old = socket;
        socket = null;
        old?.close(1000, 'user_disconnect');
        token = sessionId = pairingCode = null;
        snapshot = null;
        pending.clear();
    }
    function suspend() {
        saveResume();
        stopped = true;
        epoch++;
        clearTimeout(timer);
        connected = false;
        report({ connected: false });
        const old = socket;
        socket = null;
        old?.close(1001, 'resource_reload');
        snapshot = null;
        pending.clear();
    }
    function discover() {
        if (!config?.enabled) return;
        stopped = false;
        token = sessionId = pairingCode = null;
        clientId = crypto.randomUUID();
        retry = 0;
        reconnectUntil = 0;
        connect();
    }
    function connect() {
        if (stopped || !config?.enabled) return;
        const ws = new WebSocket(`ws://127.0.0.1:${config.port}/v1/fivem`);
        let resumeBusy = false;
        socket = ws;
        ws.onopen = () => {
            if (socket !== ws || stopped) return;
            send({
                type: token || pairingCode ? 'hello' : 'discover',
                protocol: 1,
                clientId,
                server: config.server,
                ...(token ? { token } : pairingCode ? { code: pairingCode } : {}),
            });
        };
        ws.onmessage = async (event) => {
            if (socket !== ws || stopped) return;
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }
            if (message.type === 'available') {
                retry = 0;
                return;
            }
            if (message.type === 'error') {
                // The previous frame's socket can still be closing during a fast reload.
                if (token && message.message === 'session_in_use' && Date.now() < reconnectUntil) {
                    resumeBusy = true;
                    return;
                }
                notice(message.message);
                disconnect(false);
                if (message.message !== 'invalid_hello') discover();
                return;
            }
            if (message.type === 'welcome') {
                if (
                    message.protocol !== 1 ||
                    typeof message.token !== 'string' ||
                    typeof message.sessionId !== 'string'
                ) {
                    disconnect(false);
                    return;
                }
                token = message.token;
                sessionId = message.sessionId;
                pairingCode = null;
                retry = 0;
                reconnectUntil = 0;
                connected = true;
                saveResume();
                report({ connected: true });
                sendSnapshot();
                return;
            }
            if (
                !connected ||
                message.type !== 'execute' ||
                message.sessionId !== sessionId ||
                typeof message.id !== 'string' ||
                pending.has(message.id)
            )
                return;
            if (
                !Number.isFinite(message.expiresAt) ||
                message.expiresAt < Date.now() ||
                message.expiresAt > Date.now() + 5000
            ) {
                send({
                    type: 'ack',
                    sessionId,
                    id: message.id,
                    ok: false,
                    message: 'Aktion abgelaufen.',
                });
                return;
            }
            pending.add(message.id);
            const currentEpoch = epoch,
                currentSession = sessionId;
            let result;
            try {
                result = await post('execute', {
                    id: message.id,
                    command: message.command,
                    animation: message.animation,
                    remainingMs: Math.max(0, message.expiresAt - Date.now()),
                });
            } catch {
                result = { ok: false, message: config?.locale === 'de' ? 'Keine Antwort vom Animationsskript.' : 'No response from the animation script.' };
            }
            if (
                currentEpoch === epoch &&
                currentSession === sessionId &&
                ws === socket &&
                connected
            )
                send({
                    type: 'ack',
                    sessionId,
                    id: message.id,
                    ok: result.ok === true,
                    message: result.message || '',
                });
            pending.delete(message.id);
        };
        ws.onerror = () => {}; // onclose controls retry; no unhandled promise/socket error.
        ws.onclose = (event) => {
            if (socket !== ws || stopped) return;
            connected = false;
            epoch++;
            report({ connected: false });
            socket = null;
            snapshot = null;
            if (event.code === 1000 || (event.code === 1008 && !resumeBusy)) {
                disconnect(false);
                notice('disconnected');
                if (event.code === 1000) discover();
                return;
            }
            if (!token && !pairingCode) {
                // Wait quietly for the desktop app, including when FiveM starts first.
                timer = setTimeout(connect, Math.min(500 * 2 ** retry++, 4000));
                return;
            }
            reconnectUntil ||= Date.now() + (token ? 20000 : 8000);
            if (Date.now() >= reconnectUntil) {
                disconnect(false);
                notice('unavailable');
                discover();
                return;
            }
            timer = setTimeout(connect, Math.min(500 * 2 ** retry++, 4000));
        };
    }
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'config') {
            const changed =
                config && (config.server.id !== msg.server.id || config.port !== msg.port);
            const needsConnection = !config || changed || (!config.enabled && msg.enabled);
            if (changed) disconnect();
            config = msg;
            if (
                !Number.isInteger(config.port) ||
                config.port < 1024 ||
                config.port > 65535 ||
                config.resource !== 'ks_streamdeck'
            )
                config.enabled = false;
            if (!config.enabled) disconnect();
            else if (needsConnection && !restoreResume()) discover();
        } else if (msg.type === 'pair' && config?.enabled && /^\d{6}$/.test(msg.code)) {
            disconnect();
            stopped = false;
            pairingCode = msg.code;
            clientId = crypto.randomUUID();
            retry = 0;
            reconnectUntil = 0;
            connect();
        } else if (msg.type === 'disconnect') {
            disconnect();
            discover();
        } else if (msg.type === 'suspend') suspend();
        else if (msg.type === 'snapshot') {
            snapshot = msg.data;
            sendSnapshot();
        }
    });
    window.addEventListener('pagehide', suspend);
    void post('ready', {}).catch(() => {});
})();
