import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './protocol.mjs';

export class ArtifactBridge {
  constructor({ root, destinationChatId, adapter, maxBytes = 50 * 1024 * 1024 }) {
    this.root = root; this.destinationChatId = destinationChatId; this.adapter = adapter; this.maxBytes = maxBytes;
  }
  async deliver(relativePath) {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('An allowlisted relative path is required');
    const root = await realpath(this.root);
    const file = await realpath(path.resolve(root, relativePath));
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('File leaves the approved export directory');
    const info = await stat(file);
    if (!info.isFile() || info.size > this.maxBytes) throw new Error('Not a regular file or exceeds the configured limit');
    if (!this.adapter) throw new Error('No native attachment adapter; a local path is not a Chat attachment');
    const bytes = await readFile(file);
    const sha256 = digest(bytes);
    const expected = { filename: path.basename(file), bytes: bytes.length, sha256 };
    const receipt = await this.adapter.publishOriginal({ path: file, chatId: this.destinationChatId, expected });
    if (!receipt?.nativeReference || receipt.chatId !== this.destinationChatId) throw new Error('Native reference or destination binding missing');
    // This must inspect the actual attachment received in that same Chat, not echo expected metadata.
    const actual = await this.adapter.inspectReceived({ nativeReference: receipt.nativeReference, chatId: this.destinationChatId });
    if (actual.chatId !== this.destinationChatId || actual.filename !== expected.filename || actual.bytes !== expected.bytes || actual.sha256 !== sha256) throw new Error('Received original attachment does not match');
    if (digest(await readFile(file)) !== sha256) throw new Error('Source changed during delivery');
    return { ...expected, nativeReference: receipt.nativeReference, attachmentVerified: true, phoneSaveVerified: false };
  }
}
