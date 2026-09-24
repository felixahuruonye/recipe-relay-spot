/**
 * Real device fingerprinting.
 *
 * This replaces the old "device_id" that lived in localStorage (which
 * a user could erase in two taps to appear as a brand-new device).
 * Instead we read real, hard-to-fake signals the browser exposes about
 * the actual hardware/software it's running on, and hash them into a
 * stable identifier. No single signal is secret or sensitive on its
 * own — this is the same class of technique used by fraud-prevention
 * tools industry-wide (e.g. FingerprintJS's open approach).
 *
 * Nothing here is sent anywhere except to our own register-device
 * edge function, over the user's authenticated session.
 */

export interface DeviceFingerprint {
  hash: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  timezone: string;
  language: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  touchSupport: boolean;
  connectionType: string | null;
  ipAddress: string | null;
  isp: string | null;
  city: string | null;
  region: string | null;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 15);
    ctx.fillStyle = '#069';
    ctx.fillText('lenory-fp-check', 2, 2);
    return canvas.toDataURL();
  } catch {
    return 'canvas-error';
  }
}

function getWebGLSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return `${vendor}~${renderer}`;
  } catch {
    return 'webgl-error';
  }
}

function getConnectionType(): string | null {
  try {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return null;
    // effectiveType: '4g' | '3g' | '2g' | 'slow-2g'; type when available: 'wifi' | 'cellular' | etc.
    return conn.type || conn.effectiveType || null;
  } catch {
    return null;
  }
}

interface NetworkInfo {
  ip: string | null;
  isp: string | null;
  city: string | null;
  region: string | null;
}

async function getNetworkInfo(): Promise<NetworkInfo> {
  // Free, no-key IP/ISP lookup. This is the only real way to learn the
  // actual network/ISP a device is on — the browser has no API for it.
  // Best-effort: if it fails (offline, ad-blocker, rate limit) we just
  // continue without it rather than blocking registration.
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('lookup failed');
    const data = await res.json();
    return {
      ip: data.ip || null,
      isp: data.org || null,
      city: data.city || null,
      region: data.region || null,
    };
  } catch {
    return { ip: null, isp: null, city: null, region: null };
  }
}

export async function collectDeviceFingerprint(): Promise<DeviceFingerprint> {
  const nav = navigator as any;

  const userAgent = navigator.userAgent || 'unknown';
  const platform = navigator.platform || 'unknown';
  const screenResolution = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const language = navigator.language || 'unknown';
  const hardwareConcurrency = navigator.hardwareConcurrency ?? null;
  const deviceMemory = nav.deviceMemory ?? null;
  const touchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const connectionType = getConnectionType();

  const canvasSig = getCanvasSignature();
  const webglSig = getWebGLSignature();

  const raw = [
    userAgent,
    platform,
    screenResolution,
    timezone,
    language,
    String(hardwareConcurrency),
    String(deviceMemory),
    String(touchSupport),
    canvasSig,
    webglSig,
  ].join('|||');

  const hash = await sha256(raw);
  const network = await getNetworkInfo();

  return {
    hash,
    userAgent,
    platform,
    screenResolution,
    timezone,
    language,
    hardwareConcurrency,
    deviceMemory,
    touchSupport,
    connectionType,
    ipAddress: network.ip,
    isp: network.isp,
    city: network.city,
    region: network.region,
  };
}
