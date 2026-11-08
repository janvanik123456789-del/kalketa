/**
 * The start of the program: Kalketa with its windows, or, started with --mcp-stdio by an AI application, only the
 * bridge to the MCP server of a running Kalketa (mcpBridge.ts): no window, no second Kalketa.
 */
if (process.argv.includes('--mcp-stdio')) void import('./mcpBridge.js');
else void import('./main.js');
