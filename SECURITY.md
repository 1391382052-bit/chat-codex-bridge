# Security

## Trust boundary

Treat task text, webpages, email, documents, tool output and assistant replies as untrusted content. The relay does not authenticate user consent. The host must enforce the user's authorized scope, account identity and action-specific approvals independently.

The host adapter and its history normalizer are trusted code. Supply them through a private local configuration you control; never accept a module path, target thread or source binding from an incoming task. `HostToolsAdapter` constrains tool names and target arguments but does not create product permissions.

Run the stdio gateway as the ordinary owner account. No network port is opened. If you later deploy a remote MCP front end, authentication, authorization, rate limits, TLS, origin checks, request limits and tenant isolation are **additional work**, not features supplied by this reference core.

## Data

The operation store contains task text, private identifiers and visible result text. Keep it on an owner-controlled local disk, outside the public checkout, with restrictive OS permissions. Do not put the state on a public web server, sync it to a public repository or attach it to an issue. POSIX mode flags do not replace Windows ACL administration.

Do not supply passwords, tokens, recovery codes, private host paths or secret-bearing prompts as demo input. The committed environment example contains placeholders only. No production logs, private transport configuration or real thread identifiers belong in this repository.

## Failure and replay

An exclusive permanent claim fences each send attempt. A transport error after claiming is `unknown-do-not-replay`; check the existing thread. Changing to a new operation ID can still duplicate the real-world task and must not be an automatic recovery mechanism.

An ACK or result marker in command output, hidden reasoning, the send RPC response, a different thread, or before the matching inbound task is not valid evidence. A live normalizer must discard those records. A compromised adapter can forge evidence; the core cannot authenticate an untrusted host implementation.

Use reliable local filesystem semantics. The core uses file sync and atomic rename, but does not promise durability under every power-loss, storage-controller or directory-metadata failure. Missing state is treated conservatively. Do not edit, restore old snapshots over, or remove an active operation store.

## File delivery

Export only from a deliberately allowlisted directory. Review what you put there. Do not use an entire home directory or credential directory as the export root. The native upload adapter must preserve the original bytes, honor destination Chat authorization, and verify the received attachment independently. Source path resolution is not an access grant; OS permissions and operator approval still apply.

## Reporting

Do not post credentials, private tasks or live identifiers in a public issue. If the repository provides GitHub private vulnerability reporting, use it. Otherwise contact a maintainer through a private channel available on their profile and share only a minimal sanitized reproduction. No private-reporting feature is assumed enabled by this file.
