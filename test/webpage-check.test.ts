import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import FrameCheck, { frameRefusal } from '../lib/frameCheck.js';
import api from '../widgets/webpage/api.js';

const headers = (h: Record<string, string>) => new Headers(h);
/** Repeated headers, as a server sends them (`Headers.get` joins them with ', '). */
function repeated(name: string, ...values: string[]) {
  const h = new Headers();
  for (const v of values) h.append(name, v);
  return h;
}

describe('frameRefusal', () => {
  it('refuses with X-Frame-Options DENY or SAMEORIGIN, in any case, and ignores ALLOW-FROM as browsers do', () => {
    expect(frameRefusal(headers({ 'X-Frame-Options': 'DENY' }))).toBe('X-Frame-Options: DENY');
    expect(frameRefusal(headers({ 'X-Frame-Options': 'sameorigin' }))).toBe('X-Frame-Options: sameorigin');
    expect(frameRefusal(headers({}))).toBeNull();
    expect(frameRefusal(headers({ 'X-Frame-Options': 'ALLOW-FROM https://x.example' }))).toBeNull();
  });

  it('reads repeated X-Frame-Options as the HTML standard does', () => {
    expect(frameRefusal(repeated('X-Frame-Options', 'SAMEORIGIN', 'SAMEORIGIN'))).toBe('X-Frame-Options: SAMEORIGIN, SAMEORIGIN');
    expect(frameRefusal(repeated('X-Frame-Options', 'DENY', 'SAMEORIGIN'))).toBe('X-Frame-Options: DENY, SAMEORIGIN');
    expect(frameRefusal(repeated('X-Frame-Options', 'nonsense', 'other'))).toBeNull();
  });

  it("lets a policy's frame-ancestors decide, over X-Frame-Options", () => {
    expect(frameRefusal(headers({ 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'" }))).toBe("frame-ancestors 'self'");
    expect(frameRefusal(headers({ 'Content-Security-Policy': "frame-ancestors 'none'" }))).toBe("frame-ancestors 'none'");
    expect(frameRefusal(headers({ 'Content-Security-Policy': 'frame-ancestors' }))).toBe("frame-ancestors 'none'");
    expect(frameRefusal(headers({ 'Content-Security-Policy': 'frame-ancestors https://a.example *.b.example' })))
      .toBe('frame-ancestors https://a.example *.b.example');
    // Frames anywhere, or on any https site: X-Frame-Options isn't read then.
    expect(frameRefusal(headers({ 'Content-Security-Policy': 'frame-ancestors *', 'X-Frame-Options': 'DENY' }))).toBeNull();
    expect(frameRefusal(headers({ 'Content-Security-Policy': "frame-ancestors 'self' https:" }))).toBeNull();
    // A policy without frame-ancestors leaves it to X-Frame-Options (youtube.com's, 2026-10-27).
    expect(frameRefusal(headers({
      'Content-Security-Policy': "base-uri 'self';object-src 'none';script-src 'nonce-x' 'unsafe-inline' 'strict-dynamic' https: http:",
      'X-Frame-Options': 'SAMEORIGIN',
    }))).toBe('X-Frame-Options: SAMEORIGIN');
  });

  it('reads each of several policies, and not a Report-Only one', () => {
    expect(frameRefusal(repeated('Content-Security-Policy', "script-src 'self'", "frame-ancestors 'self'"))).toBe("frame-ancestors 'self'");
    expect(frameRefusal(repeated('Content-Security-Policy', 'frame-ancestors *', "frame-ancestors 'self'"))).toBe("frame-ancestors 'self'");
    expect(frameRefusal(headers({ 'Content-Security-Policy-Report-Only': "frame-ancestors 'none'" }))).toBeNull();
  });
});

describe('FrameCheck', () => {
  const homey = { manifest: { version: '1.1.1' } } as any;
  let fetchMock: ReturnType<typeof vi.fn>;
  let log: Mock<(...args: unknown[]) => void>;
  let debug: Mock<(...args: unknown[]) => void>;
  let frames: FrameCheck;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(async () => new Response('<html></html>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    log = vi.fn();
    debug = vi.fn();
    frames = new FrameCheck(homey, log, debug);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads a 2xx answer's headers, logging a refusal by its host only", async () => {
    fetchMock.mockImplementationOnce(async () => new Response('<html></html>', { status: 200, headers: { 'X-Frame-Options': 'SAMEORIGIN' } }));
    expect(await frames.check('https://www.example.org/map?lat=55.68&lon=12.57')).toEqual({ refused: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://www.example.org/map?lat=55.68&lon=12.57');
    expect(init.headers['User-Agent']).toBe('Widgetkeeper/1.1.1 github.com/thomassidor/widgetkeeper');
    expect(log).toHaveBeenCalledWith("Web Page: www.example.org doesn't allow being shown in a frame (X-Frame-Options: SAMEORIGIN)");
    expect(JSON.stringify([log.mock.calls, debug.mock.calls])).not.toContain('55.68');

    expect(await frames.check('https://example.com/')).toEqual({ refused: false });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("never calls a page refused on an answer that isn't 2xx, or a failed fetch", async () => {
    // A challenge page says SAMEORIGIN too.
    fetchMock.mockImplementationOnce(async () => new Response('Just a moment', { status: 403, headers: { 'X-Frame-Options': 'SAMEORIGIN' } }));
    expect(await frames.check('https://a.example/')).toEqual({ refused: false });
    fetchMock.mockImplementationOnce(async () => { throw new Error('The operation was aborted due to timeout'); });
    expect(await frames.check('https://b.example/')).toEqual({ refused: false });
    expect(log).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith('Web Page: a.example answered HTTP 403, not checked');
  });

  it('fetches only http and https addresses', async () => {
    for (const address of ['javascript:alert(1)', 'not an address', 'file:///etc/passwd', 'ftp://x.example/']) {
      expect(await frames.check(address)).toEqual({ refused: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps an answer 30 min and shares a check under way', async () => {
    const first = frames.check('https://x.example/');
    expect(frames.check('https://x.example/')).toBe(first);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29 * 60e3);
    await frames.check('https://x.example/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * 60e3);
    await frames.check('https://x.example/');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 50 addresses, dropping the oldest', async () => {
    for (let i = 0; i <= 50; i++) await frames.check(`https://x${i}.example/`);
    expect(fetchMock).toHaveBeenCalledTimes(51);
    await frames.check('https://x50.example/');
    expect(fetchMock).toHaveBeenCalledTimes(51);
    await frames.check('https://x0.example/');
    expect(fetchMock).toHaveBeenCalledTimes(52);
  });
});

describe('GET /check', () => {
  it("answers with the app's check, and wants an address", async () => {
    const check = vi.fn(async () => ({ refused: true }));
    const homey = { app: { frameCheck: { check }, log: vi.fn(), debug: vi.fn() } } as any;
    await expect(api.getCheck({ homey, query: { url: 'https://x.example/' } })).resolves.toEqual({ refused: true });
    expect(check).toHaveBeenCalledWith('https://x.example/');
    await expect(api.getCheck({ homey, query: {} })).rejects.toThrow('Missing address');
  });
});
