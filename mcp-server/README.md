# QuoteIQ MCP server

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant (Claude Code, Claude Desktop or any MCP client) look things up in QuoteIQ for you:

| Tool | What it does |
|---|---|
| `search_playbook` | Answers a question from the approved sales-playbook documents, with the passages it cites. Refuses when the playbook doesn't cover it. |
| `get_quotation` | Looks up a quotation by number (`QT-2026-0042`) or id: client, status, line items, totals, notes. |

**Read-only.** Neither tool changes anything in QuoteIQ, and both are marked `readOnlyHint` so clients can run them without asking each time.

**Acts as you.** The server calls the QuoteIQ GraphQL API with your own session, so it sees exactly what you see in the app: a sales rep finds only their own quotations. Each `search_playbook` call counts against your daily AI limit, like asking in the app. The server has no credentials of its own and no database access.

## Setup

```bash
cd mcp-server
npm ci
npm run build
```

Configure it with environment variables:

| Variable | |
|---|---|
| `QUOTEIQ_API_URL` | GraphQL endpoint. Default `http://localhost:4000/graphql`. Must be `https` unless it's localhost. |
| `QUOTEIQ_TOKEN` | Your QuoteIQ access token: the value of the `access_token` cookie (browser dev tools → Application → Cookies, after logging in). Expires with the session (7 days by default). |
| `QUOTEIQ_EMAIL`, `QUOTEIQ_PASSWORD` | Instead of a token: the server logs in and signs in again when the session expires. Handy locally; prefer the token elsewhere, so no password sits in a config file. |

### Claude Code

```bash
claude mcp add quoteiq \
  -e QUOTEIQ_API_URL=http://localhost:4000/graphql \
  -e QUOTEIQ_TOKEN=<your token> \
  -- node /absolute/path/to/quote-iq/mcp-server/dist/index.js
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quoteiq": {
      "command": "node",
      "args": ["/absolute/path/to/quote-iq/mcp-server/dist/index.js"],
      "env": {
        "QUOTEIQ_API_URL": "http://localhost:4000/graphql",
        "QUOTEIQ_TOKEN": "<your token>"
      }
    }
  }
}
```

Then ask, for example: *"What's the status and total of QT-2026-0042, and does its discount need approval under our playbook?"*. The assistant combines both tools.

## Development

```bash
npm test          # node:test, run directly on the TypeScript sources
npm run typecheck
npm run inspect   # MCP Inspector, to call the tools by hand (after npm run build)
```

The tool tests connect a real MCP client to the server in memory, so they go through the protocol (tool listing, input validation, error results), with a fake QuoteIQ API behind it. The API client is tested against a fake `fetch`.
