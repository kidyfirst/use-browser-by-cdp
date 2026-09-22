/**
 * Reliable Chrome launcher and CDP port manager.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export interface CDPVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}

export interface LaunchOptions {
  port?: number;
  host?: string;
  userDataDir?: string;
  executablePath?: string;
  headless?: boolean;
  extraArgs?: string[];
  detached?: boolean;
  timeoutMs?: number;
}

export interface LaunchResult {
  alreadyRunning: boolean;
  port: number;
  host: string;
  wsEndpoint: string;
  browser: string;
  executablePath: string;
  userDataDir: string;
  pid?: number;
}

/**
 * Searches for installed Chrome / Chromium / Edge binaries on macOS, Windows, and Linux.
 */
export function findChromeExecutable(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const platform = os.platform();
  const home = os.homedir();

  const candidates: string[] = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
  } else if (platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Checks whether the CDP debugging port is listening and responsive.
 */
export async function getCDPVersion(port = 9222, host = '127.0.0.1'): Promise<CDPVersionInfo | null> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path: '/json/version',
        timeout: 1000,
        headers: { Host: `${host}:${port}` },
      },
      (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.webSocketDebuggerUrl) {
              resolve(data as CDPVersionInfo);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Returns true if CDP port is open and returning a valid webSocketDebuggerUrl.
 */
export async function isCDPOpen(port = 9222, host = '127.0.0.1'): Promise<boolean> {
  const version = await getCDPVersion(port, host);
  return version !== null;
}

/**
 * Cleans up stale Chrome SingletonLock / socket locks that prevent relaunching.
 */
export function cleanStaleLocks(userDataDir: string): void {
  if (!fs.existsSync(userDataDir)) {
    return;
  }

  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];
  for (const file of lockFiles) {
    const lockPath = path.join(userDataDir, file);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Ignore if in use or inaccessible
    }
  }
}

/**
 * Generates recommended bulletproof Chrome command-line arguments for CDP debugging.
 */
export function getRecommendedChromeArgs(options: {
  port: number;
  userDataDir: string;
  headless?: boolean;
}): string[] {
  const args = [
    `--remote-debugging-port=${options.port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${options.userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
  ];

  if (options.headless) {
    args.push('--headless=new', '--disable-gpu');
  }

  return args;
}

/**
 * Launches Chrome with remote-debugging-port in a reliable, cross-platform manner.
 * If Chrome is already running with CDP on the specified port, it reuses it without spawning duplicates.
 */
export async function launchChrome(options: LaunchOptions = {}): Promise<LaunchResult> {
  const port = options.port ?? 9222;
  const host = options.host ?? '127.0.0.1';
  const timeoutMs = options.timeoutMs ?? 10000;
  const detached = options.detached ?? true;

  // 1. Check if port is already active
  const existingVersion = await getCDPVersion(port, host);
  if (existingVersion) {
    return {
      alreadyRunning: true,
      port,
      host,
      wsEndpoint: existingVersion.webSocketDebuggerUrl,
      browser: existingVersion.Browser,
      executablePath: 'already-running',
      userDataDir: options.userDataDir || path.join(os.homedir(), '.moni-chrome-cdp-profile'),
    };
  }

  // 2. Find Chrome executable
  const executablePath = findChromeExecutable(options.executablePath);
  if (!executablePath) {
    throw new Error(
      `Could not locate Google Chrome or Chromium executable on ${os.platform()}. ` +
        'Please install Google Chrome or specify executablePath in options or CHROME_PATH environment variable.'
    );
  }

  // 3. Prepare user data directory (persistent across runs so logins/cookies are kept)
  const userDataDir =
    options.userDataDir || path.join(os.homedir(), '.moni-chrome-cdp-profile');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // 4. Clean stale locks in profile
  cleanStaleLocks(userDataDir);

  // 5. Assemble flags
  const chromeArgs = getRecommendedChromeArgs({
    port,
    userDataDir,
    headless: options.headless,
  });

  if (options.extraArgs && options.extraArgs.length > 0) {
    chromeArgs.push(...options.extraArgs);
  }

  // 6. Spawn Chrome process
  let child: ChildProcess;
  if (detached) {
    child = spawn(executablePath, chromeArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } else {
    child = spawn(executablePath, chromeArgs, {
      stdio: 'inherit',
    });
  }

  // 7. Poll until CDP HTTP endpoint responds
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    const version = await getCDPVersion(port, host);
    if (version) {
      return {
        alreadyRunning: false,
        port,
        host,
        wsEndpoint: version.webSocketDebuggerUrl,
        browser: version.Browser,
        executablePath,
        userDataDir,
        pid: child.pid,
      };
    }
  }

  throw new Error(
    `Chrome was launched (pid: ${child.pid}), but CDP port ${port} did not become responsive within ${timeoutMs}ms.`
  );
}
