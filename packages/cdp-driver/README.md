# @moni/cdp-driver 🌐

A general-purpose, high-precision Chrome DevTools Protocol (CDP) browser driver for web automation and AI agent actuators.

## Features

- **No AI / Website Coupling**: Pure browser automation primitives.
- **Native WebSocket CDP**: Zero Python dependency, direct connection to Chrome's debugging port.
- **Automatic Chrome Discovery**: Automatically resolves `DevToolsActivePort` on macOS, Linux, and Windows.
- **Pure TypeScript Injected Probes**: `captureSnapshot` and `resolveActionTarget` written in clean TS.
- **5-Layer Pre-flight Guards**: Prevents misclicks through `:disabled`, visibility, geometry bounds, and `elementFromPoint` occlusion testing.
- **Atomic Observation**: Single round-trip DOM and accessibility tree inspection.

## Installation

```bash
pnpm add @moni/cdp-driver
```

## Quick Start

```typescript
import { Browser } from '@moni/cdp-driver';

// Connect to Chrome and navigate
const browser = await Browser.connect('https://example.com');

// Atomically observe interactive controls
const page = await browser.observe();
console.log(`Observed ${page.actions.length} controls on ${page.title}`);

// High-precision physical interaction (auto verifies occlusion)
if (page.actions[0]) {
  await browser.act(page.actions[0]);
}

// Clean up
await browser.close();
```
