# job-radar

An [n8n](https://n8n.io) workflow that pulls remote job feeds, scores them against a developer
profile, drafts a digest email — and exposes itself as an **MCP server** so an AI assistant can
query the job market as a tool.

```
Schedule (12h) ─┬─ Remotive ──┐
Run manually ───┤             ├─▶ Normalise + score ─▶ Build digest ─▶ Summarise (Claude) ─▶ Gmail draft
                ├─ RemoteOK ──┤
                └─ Jobicy ────┘

MCP Server Trigger  ──▶  tools: search_remote_jobs(search) · latest_remoteok_jobs()
   http://localhost:5678/mcp/job-radar   (Streamable HTTP, MCP 2025-03-26)
```

## What it does

1. **Fetch** three public feeds (Remotive, RemoteOK, Jobicy) on a 12-hour schedule or on demand.
2. **Normalise + score** in a single Code node: one shape for all feeds, dedupe by URL, then a
   transparent rule-based score — engineering-title gate, title-level blockers (management, mobile,
   other-language stacks), body-level hard blockers (5+ years bars, "US only" / "EU-based only"),
   +15 per stack hit, +10 per geography hit, −10 for Senior titles (ranked lower, not excluded).
   Every row carries a `why` column so the ranking is explainable.
3. **Digest** the top 15 into one text block.
4. **Summarise** with Claude (Anthropic Chat Model → Basic LLM Chain): one line per job,
   *fit in ≤12 words | gap in ≤8 words*. Optional — the workflow runs without it.
5. **Gmail draft** — creates a draft, never sends. Optional credential.
6. **MCP Server Trigger** — the same workflow is an MCP server. Any MCP client (Claude Code,
   Claude Desktop, Cursor…) can call `search_remote_jobs` and `latest_remoteok_jobs` live.

## Run it

```bash
npm install -g n8n            # Node 20/22 (isolated-vm does not build on Node 25)
n8n import:workflow --input=job-radar.workflow.json
n8n update:workflow --id jobradar0001 --active=true
n8n start                      # editor at http://localhost:5678
```

Optional credentials (in the n8n UI): **Anthropic** on "Anthropic Chat Model", **Gmail OAuth2** on
"Gmail draft". Without them, disable those two nodes; fetch → score → digest still runs.

## Use it as an MCP server

```bash
# handshake
curl -s -X POST http://localhost:5678/mcp/job-radar \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' -D -
# → 200, mcp-session-id: …, capabilities: {tools}
```

Claude Code `.mcp.json`:
```json
{ "mcpServers": { "job-radar": { "type": "http", "url": "http://localhost:5678/mcp/job-radar" } } }
```
Then: *"use job-radar to find node.js jobs"* — the assistant calls the workflow.

n8n's HTTP Request Tool wraps arguments as one stringified `input` object:
`{"name":"search_remote_jobs","arguments":{"input":"{\"search\":\"node.js\"}"}}`.

## Notes from building it

- The MCP Server Trigger needs a `webhookId` on the node or n8n registers the webhook under
  `<workflowId>/<node name>/<path>` instead of `<path>`.
- Trigger `typeVersion` 1 is SSE (`/sse` + `/messages`); `typeVersion` 2 is Streamable HTTP at the
  plain path — use 2 for current clients.
- `n8n execute --id …` needs a Manual Trigger node in the workflow; the Schedule Trigger alone is
  not a start node for the CLI.
- Remotive's public API ignores `search`; the scorer is what makes the feed useful.

## Why

Built for my own job search: a small, honest example of a workflow that is also a tool an LLM can
call — the same shape as enterprise "assistant ↔ internal systems via MCP" integrations.
