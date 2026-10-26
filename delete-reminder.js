// Disabled legacy one-off deletion utility.
// This file previously deleted a hard-coded reminder ID when executed.
// Use the authenticated MCP delete_reminder tool after confirming the target instead.
console.error("Legacy reminder deletion utility is disabled for safety.");
process.exitCode = 1;
