# AI from outside (MCP)

Your AI application (Claude Code, Claude Desktop, Cursor, VS Code and others) connects to Kalketa and works with the sheet you have open: it reads it, explains it, traces where a result comes from and proposes changes. You accept or reject the changes, in the AI side pane.

## Why it is done this way

- **You pay with the subscription you have.** Kalketa calls no AI itself. Your application does, on your subscription (Claude, ChatGPT) or on a local model. You need not buy an API to try it.
- **It is the allowed way.** A Claude subscription may not be used by signing in to other applications (Anthropic forbade it in February 2026). Claude's own applications may connect to a local server: that is what Anthropic meant the MCP protocol for.
- **One standard for all applications.** MCP (Model Context Protocol) is an open standard. Whatever speaks MCP can work with Kalketa; Kalketa need not know each application.
- **The AI changes nothing itself.** Every change comes as a proposal on a card with Accept and Reject. Kalketa computes the sheet with it at once and returns the errors to the AI before you see the proposal.

## Safety

- The server is **off** until you switch it on, and runs **on this computer only** (127.0.0.1). Neither another computer nor a web page in a browser reaches it.
- Every request must carry the **token**. It is a password to your open sheets: do not share it. New token makes the old one void.
- **Read only:** the AI may read and explain, not propose. **Pause:** the AI only gets a message that the connection is paused.
- When the company AI rules forbid AI, the server cannot be switched on.
- The AI sees the sheet **active** in the window and the titles of the other open sheets. What it reads goes to your AI application, as if you had copied the sheet into its window.

## Steps

1. **Switch the server on:** Tools → AI from outside (MCP)… → Switch on. The status bar shows "MCP: waiting for a connection".
2. **Connect the application** in one of the three ways below. Once is enough; the application remembers it.
3. **Ask in the application**, e.g. "Read the sheet in Kalketa and check part 3." It connects to Kalketa by itself when it needs to. Kalketa must be running with the server on.
4. **Decide in Kalketa.** A proposal shows in the AI side pane as a card. Ctrl+Z takes an acceptance back.

## Three ways to connect

The lines with your address, token and the path to Kalketa are in Tools → AI from outside (MCP)…, each with Copy.

### Claude Code: a command for the terminal

Claude Code connects over HTTP. Run the copied `claude mcp add …` once in a terminal (PowerShell); the terminal may then be closed. The server loads in a **new** Claude Code session.

### Claude Desktop and applications that start a server as a program

Claude Desktop (and some other applications) cannot take a local server by its address, only a program they talk to over its standard input and output. For them Kalketa starts itself with `--mcp-stdio`: no window, it only passes messages to the running Kalketa. It takes the address and token from Kalketa's settings, so they do not stand in the application's settings.

Put the copied `mcpServers` block into `%APPDATA%\Claude\claude_desktop_config.json` (with other servers there, add only the `kalketa` entry). Then close Claude Desktop and start it again.

### Cursor, VS Code, Strata, Windsurf, Cline and others: an mcpServers block with the address

Applications that take a server over HTTP get the block with the address and the token header. Put it where the application keeps its MCP servers (e.g. `.cursor/mcp.json`; for Strata at the top level of its model settings file, then start Strata again). If the application cannot do HTTP, use the block for Claude Desktop.

ChatGPT takes only servers on the internet over HTTPS for now, not local ones, so it cannot be connected to Kalketa yet.

## What the AI can do with Kalketa

| Tool | What it does |
|---|---|
| `tabs_list` | the open sheets |
| `sheet_get` | the active sheet: numbered lines, results, errors, checks, the journal of proposals |
| `sheet_trace` | where a value comes from: formula, inputs, table rows |
| `theory_get` | sections of the sources and theory libraries for a question, with ids to cite |
| `language_guide` | the calculation language and the rules of writing |
| `catalog`, `formula_get`, `sample_get` | the formula library and the worked samples |
| `propose_change` | a proposed change of the sheet, checked at once; a correction goes with `replaces` |
| `proposal_status` | what became of the proposals |
| `withdraw_proposals` | withdraws its own tries |
| `propose_new_sheet` | a proposed whole new sheet |
| `python_check` | a check in Python: Kalketa runs the script in its built-in Python and puts the results beside the values of the sheet |

With the first reading of the sheet the AI also gets short rules of working with Kalketa (write with all the letters of the language, a proposal is not in the sheet until you accept it, Python only through `python_check`): some applications do not pass the server's instructions on to their model.

What was proposed over MCP Kalketa keeps in the sheet as a conversation in the AI notes layer. The conversation with the AI itself stays in your application.

## When it does not work

- **"port … is in use":** another program uses the same port. Close the other Kalketa, or that program.
- **The application reports 401:** the token is void (a new one was made). Copy the line again and set the application up again.
- **"Kalketa is not running":** Kalketa is not running, or the server is off.
- **The application does not see Kalketa's tools:** start a new session or restart the application; servers load when it starts.
- Every tool call is written to `logs\mcp.log` in Kalketa's data folder.
