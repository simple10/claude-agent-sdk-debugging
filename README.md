# Claude SDK Spy

A Docker Compose setup that runs the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) behind an [mitmproxy](https://mitmproxy.org/) sidecar, capturing **all** HTTP/HTTPS traffic for inspection.

Includes a web-based chat interface for interacting with the SDK and a proxy UI for viewing captured requests/responses.

## Quick Start

1. Copy `.env.example` to `.env` and set your credentials:

   ```bash
   cp .env.example .env
   ```

   Set either `ANTHROPIC_API_KEY` or place a `credentials.json` file in the project root (credentials.json takes priority).

2. Start the stack:

   ```bash
   docker compose up -d --build
   ```

3. Open the UIs:

   - **Chat UI:** [http://localhost:3000](http://localhost:3000)
   - **Proxy UI:** [http://localhost:8081/?token=mitmpass](http://localhost:8081/?token=mitmpass)

   > If you change `MITMPROXY_WEB_PASSWORD` in your `.env`, update the `?token=` value in the Proxy UI URL to match.

## How It Works

```text
┌─────────────────────────────────────────────────────┐
│  Shared network namespace (network_mode: service)   │
│                                                     │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │   claude     │         │   proxy (mitmproxy)  │  │
│  │              │         │                      │  │
│  │  Bun app     │ HTTPS_  │  :8080 explicit      │  │
│  │  :3000 chat  │─PROXY──▶│  :8085 transparent   │  │
│  │              │         │  :8081 web UI        │  │
│  └──────────────┘         └──────────────────────┘  │
│        │                          ▲                 │
│        │    iptables REDIRECT     │                 │
│        └──────────────────────────┘                 │
│         (catches traffic ignoring proxy env vars)   │
└─────────────────────────────────────────────────────┘
```

**Two interception layers ensure nothing escapes:**

- **Explicit proxy** (port 8080) &mdash; Apps that respect `HTTPS_PROXY` connect here directly.
- **Transparent proxy** (port 8085) &mdash; iptables NAT rules redirect any remaining port 80/443 traffic (IPv4 + IPv6). Mitmproxy uses `SO_ORIGINAL_DST` to recover the real destination.

## Project Structure

```
├── app/                  # Bun chat server (mounted into claude container)
│   ├── index.ts          # HTTP server with SSE streaming + inline chat UI
│   └── package.json
├── claude/
│   ├── Dockerfile        # Bun image + iptables + CA cert tools
│   └── entrypoint.sh     # CA cert install, iptables setup, app launch
├── proxy/
│   └── Dockerfile        # mitmproxy image
├── docker-compose.yml
├── .env.example
└── credentials.json      # (optional) OAuth credentials, gitignored
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | &mdash; | API key for the Claude SDK |
| `MITMPROXY_WEB_PASSWORD` | `mitmpass` | Password for the mitmproxy web UI (`?token=` param) |

Alternatively, place a `credentials.json` file in the project root for OAuth-based authentication. If present, it takes priority over `ANTHROPIC_API_KEY`.

## Disabling SDK Telemetry

The `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` env var is enabled by default in `docker-compose.yml` to suppress SDK telemetry (Datadog, Sentry, etc.). Comment it out if you want to capture and inspect telemetry traffic too.
