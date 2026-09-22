import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanStaleLocks,
  findChromeExecutable,
  getRecommendedChromeArgs,
  isCDPOpen,
} from '../src/launcher.js';

describe('Chrome Launcher & CDP Port Manager', () => {
  it('finds chrome executable or handles custom paths', () => {
    const detected = findChromeExecutable();
    // On our Mac test environment, Chrome exists
    if (os.platform() === 'darwin' && fs.existsSync('/Applications/Google Chrome.app')) {
      expect(detected).toContain('Google Chrome');
    }
  });

  it('generates recommended bulletproof Chrome arguments', () => {
    const args = getRecommendedChromeArgs({
      port: 9222,
      userDataDir: '/tmp/test-profile',
      headless: true,
    });

    expect(args).toContain('--remote-debugging-port=9222');
    expect(args).toContain('--remote-allow-origins=*');
    expect(args).toContain('--user-data-dir=/tmp/test-profile');
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--no-default-browser-check');
    expect(args).toContain('--headless=new');
  });

  it('cleans stale locks without throwing errors', () => {
    const tempDir = path.join(os.tmpdir(), `test-cdp-profile-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const lockFile = path.join(tempDir, 'SingletonLock');
    fs.writeFileSync(lockFile, 'test');

    expect(fs.existsSync(lockFile)).toBe(true);
    cleanStaleLocks(tempDir);
    expect(fs.existsSync(lockFile)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false for unreachable CDP port', async () => {
    // Port 59999 should not have a CDP server
    const open = await isCDPOpen(59999);
    expect(open).toBe(false);
  });
});
