import { mkdir, open, readFile, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, envelope, validateId, validateSend, verify } from './protocol.mjs';

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function atomic(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = await open(temp, 'wx', 0o600);
  try { await fd.writeFile(JSON.stringify(data)); await fd.sync(); } finally { await fd.close(); }
  await rename(temp, file);
}
const uncertain = id => ({ id, status: 'unknown-do-not-replay', canSubmit: false, deliveryVerified: false, ackVerified: false, resultVerified: false });

export class Bridge {
  constructor({ directory, sourceChatId, targetThreadId, adapter }) {
    if (!directory || !sourceChatId || !targetThreadId) throw new Error('An operator-owned directory and fixed source/target binding are required');
    this.directory = path.resolve(directory);
    this.binding = { sourceChatId, targetThreadId };
    this.adapter = adapter;
  }
  async init() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); }
  folder(id) { return path.join(this.directory, validateId(id)); }
  checkRequest(request) {
    if (request && (request.sourceChatId !== this.binding.sourceChatId || request.targetThreadId !== this.binding.targetThreadId ||
      request.hash !== digest(JSON.stringify(validateSend({ id: request.id, message: request.message }))))) throw new Error('Stored request binding or hash changed');
    return request;
  }
  async status() {
    let online = false;
    try { online = (await this.adapter?.probe()) === true; } catch {}
    return { status: online ? 'ready' : 'offline', online, targetBound: true,
      mode: this.adapter?.mode ?? 'unconfigured', completed: false };
  }
  async send(input) {
    const value = validateSend(input);
    const folder = this.folder(value.id);
    await this.init();
    try { await mkdir(folder, { mode: 0o700 }); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const existing = await readJson(path.join(folder, 'request.json'));
      if (existing && existing.hash !== digest(JSON.stringify(value))) throw new Error('Operation id conflicts with a different task');
      return this.result(value.id);
    }
    const request = { ...value, nonce: randomUUID(), hash: digest(JSON.stringify(value)), ...this.binding };
    await atomic(path.join(folder, 'request.json'), request);
    await atomic(path.join(folder, 'state.json'), { id: value.id, status: 'pending', canSubmit: false,
      deliveryVerified: false, ackVerified: false, resultVerified: false });
    return this.result(value.id);
  }
  async result(id) {
    const folder = this.folder(id);
    try { this.checkRequest(JSON.parse(await readFile(path.join(folder, 'request.json'), 'utf8'))); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      try { await readFile(path.join(folder, 'claim.json')); return uncertain(id); }
      catch (claimError) { if (claimError.code !== 'ENOENT') throw claimError; }
      try { await stat(folder); return uncertain(id); }
      catch (dirError) { if (dirError.code === 'ENOENT') return { id, status: 'not-submitted', canSubmit: true, deliveryVerified: false, ackVerified: false, resultVerified: false }; throw dirError; }
    }
    const state = await readJson(path.join(folder, 'state.json'));
    return state ?? uncertain(id);
  }
  async dispatch(id) {
    const folder = this.folder(id);
    const request = this.checkRequest(await readJson(path.join(folder, 'request.json')));
    if (!request) throw new Error('No registered request');
    if (!(await this.status()).online) return this.result(id);
    let claim;
    try { claim = await open(path.join(folder, 'claim.json'), 'wx', 0o600); }
    catch (e) { if (e.code === 'EEXIST') return this.result(id); throw e; }
    try { await claim.writeFile(JSON.stringify({ hash: request.hash })); await claim.sync(); } finally { await claim.close(); }
    // Persist uncertainty BEFORE calling the remote transport. A crash cannot invite replay.
    await atomic(path.join(folder, 'state.json'), uncertain(id));
    try {
      await this.adapter.send({ threadId: this.binding.targetThreadId, sourceChatId: this.binding.sourceChatId, text: envelope(request) });
      await atomic(path.join(folder, 'state.json'), { ...uncertain(id), status: 'submitted-awaiting-target' });
    } catch {
      // An RPC failure can occur after remote acceptance. Keep the permanent claim.
      return this.result(id);
    }
    return this.refresh(id);
  }
  async drain() {
    // Resume only registered tasks that have not acquired a send claim.
    // Claimed/uncertain tasks never become eligible again.
    await this.init();
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const value = await this.result(entry.name);
        if (value.status === 'pending') await this.dispatch(entry.name);
      } catch { /* A damaged or differently bound operation requires operator inspection. */ }
    }
  }
  async refresh(id) {
    const folder = this.folder(id);
    const request = this.checkRequest(await readJson(path.join(folder, 'request.json')));
    if (!request) return this.result(id);
    const old = await this.result(id);
    try { await stat(path.join(folder, 'claim.json')); } catch(e) { if(e.code === 'ENOENT') return old; throw e; }
    const records = await this.adapter.snapshot({ threadId: this.binding.targetThreadId });
    if (!Array.isArray(records)) throw new Error('Invalid host snapshot');
    const proof = verify(records, request, this.binding);
    // Bounded history can omit old records. Do not erase already verified evidence.
    const merged = { ...old };
    for (const [key, value] of Object.entries(proof)) if (value !== false) merged[key] = value;
    merged.status = merged.resultVerified ? 'completed' : merged.ackVerified ? 'acknowledged-awaiting-result' :
      merged.deliveryVerified ? 'delivered-awaiting-ack' : old.status;
    merged.canSubmit = false;
    await atomic(path.join(folder, 'state.json'), merged);
    return merged;
  }
}
