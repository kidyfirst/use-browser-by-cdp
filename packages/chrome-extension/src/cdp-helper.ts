/**
 * Helper to check CDP status and generate OS-specific launch commands.
 */

export interface CDPStatus {
  cdpPortOpen: boolean;
  serverRunning: boolean;
  connected: boolean;
  browserVersion?: string | null;
  targetId?: string | null;
  currentUrl?: string | null;
  error?: string;
}

export async function checkCDPStatus(serverUrl = 'http://localhost:5173'): Promise<CDPStatus> {
  // 1. Direct probe to local Chrome CDP port 9222
  let directCdpOpen = false;
  let browserVersion: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const cdpRes = await fetch('http://127.0.0.1:9222/json/version', { signal: controller.signal });
    clearTimeout(timer);
    if (cdpRes.ok) {
      const info = (await cdpRes.json()) as any;
      directCdpOpen = true;
      browserVersion = info.Browser || null;
    }
  } catch {
    directCdpOpen = false;
  }

  // 2. Query backend agent server status
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${serverUrl}/api/agent/status`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as any;
      const isCdpOpen = directCdpOpen || Boolean(data.cdpAvailable);
      return {
        cdpPortOpen: isCdpOpen,
        serverRunning: true,
        connected: Boolean(data.connected),
        browserVersion: browserVersion || data.browserVersion || null,
        targetId: data.targetId || null,
        currentUrl: data.url || null,
      };
    }
    return {
      cdpPortOpen: directCdpOpen,
      serverRunning: false,
      connected: false,
      browserVersion,
      error: `Server HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      cdpPortOpen: directCdpOpen,
      serverRunning: false,
      connected: false,
      browserVersion,
      error: err.message,
    };
  }
}

export function getLaunchCommands(): { mac: string; linux: string; win: string } {
  return {
    mac: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-cdp-profile"`,
    linux: `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp-profile`,
    win: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-cdp-profile"`,
  };
}
