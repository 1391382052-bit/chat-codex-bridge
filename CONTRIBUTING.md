# Contributing

Use synthetic fixtures. Never add live transcripts, production configuration, real thread identifiers, private domains, operator filesystem paths or credentials.

Before proposing a change, run `node --test`, `node scripts/scan-public.mjs` and `node examples/demo.mjs`. Add meaningful regression cases for replay, causality, binding and attachment verification behavior. Do not make uncertainty automatically resendable.

Keep host adapters explicit and independently testable. Changes that add an HTTP server, desktop injector, token broker, automatic approval or public file hosting materially change the trust boundary and do not belong in the reference core by default.

Contributions are licensed under Apache-2.0. Do not copy code whose license or ownership is unclear. The initial implementation was written afresh from generic workflow requirements; private deployment files are not its source distribution.
