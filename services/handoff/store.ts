import { randomBytes } from "node:crypto";
import { validateDocument } from "../../src/document-import";

export class ServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Entry = ReturnType<typeof validateDocument> & { expiresAt: number };
export class HandoffStore {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  constructor(private now = Date.now, private ttlMs = 15 * 60_000,
    private maxEntries = 100, private maxBytes = 60 * 1024 * 1024) {}
  prune() {
    for (const [token, item] of this.entries) if (item.expiresAt <= this.now()) this.delete(token);
  }
  create(name: unknown, html: unknown) {
    this.prune();
    const item = validateDocument(name, html);
    if (this.entries.size >= this.maxEntries || this.bytes + item.bytes > this.maxBytes)
      throw new ServiceError(503, "临时空间已满，请稍后重试或下载 HTML 手动导入。");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(token, { ...item, expiresAt }); this.bytes += item.bytes;
    return { token, expiresAt };
  }
  read(token: unknown) {
    this.prune();
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ServiceError(404, "交接链接已过期或不可用，请重新生成。");
    const item = this.entries.get(token);
    if (!item) throw new ServiceError(404, "交接链接已过期或不可用，请重新生成。");
    return { name: item.name, html: item.source, expiresAt: item.expiresAt };
  }
  delete(token: string) {
    const item = this.entries.get(token);
    if (item) { this.bytes -= item.bytes; this.entries.delete(token); }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}

/** Fixed-window, bounded per-peer limiter. Never trusts X-Forwarded-For. */
export class RateLimit {
  private peers = new Map<string, { until: number; count: number }>();
  constructor(private limit = 30, private windowMs = 60_000, private now = Date.now) {}
  take(peer: string) {
    for (const [key, item] of this.peers) if (item.until <= this.now()) this.peers.delete(key);
    let item = this.peers.get(peer);
    if (!item) {
      if (this.peers.size >= 4096) throw new ServiceError(429, "请求过多，请稍后再试。");
      item = { until: this.now() + this.windowMs, count: 0 }; this.peers.set(peer, item);
    }
    if (++item.count > this.limit) throw new ServiceError(429, "请求过多，请稍后再试。");
  }
}
