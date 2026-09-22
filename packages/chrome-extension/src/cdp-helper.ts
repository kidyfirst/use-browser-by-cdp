/**
 * Helper to check CDP status and generate OS-specific launch commands.
 */

export interface CDPStatus {
  connected: boolean;
  serverRunning: boolean;
  targetId?: string | null;
  currentUrl?: string | null;
  error?: string;
}

export async function checkCDPStatus(serverUrl = 'http://localhost:5173'): Promise<CDPStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${serverUrl}/api/agent/status`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        connected: Boolean(data.connected),
        serverRunning: true,
        targetId: data.targetId,
        currentUrl: data.url,
      };
    }
    return { connected: false, serverRunning: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { connected: false, serverRunning: false, error: err.message };
  }
}

export function getLaunchCommands(): { mac: string; linux: string; win: string } {
  return {
    mac: `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp-profile`,
    linux: `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp-profile`,
    win: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-cdp-profile"`,
  };
}
