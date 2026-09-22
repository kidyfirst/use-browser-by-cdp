import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZipPackage from 'adm-zip';

const AdmZip = AdmZipPackage.default || AdmZipPackage;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirFiltered(srcDir, destDir, filterFn) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath, filterFn);
    } else if (entry.isFile()) {
      if (!filterFn || filterFn(entry.name, srcPath)) {
        copyFile(srcPath, destPath);
      }
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function runPackaging() {
  console.log('📦 Packaging @moni/chrome-extension...');

  // 1. Read package.json and manifest.json
  const pkgPath = path.join(extensionRoot, 'package.json');
  const manifestPath = path.join(extensionRoot, 'manifest.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found at ${manifestPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.manifest_version !== 3) {
    throw new Error(`Invalid manifest_version: ${manifest.manifest_version}. Expected 3.`);
  }

  const version = pkg.version || manifest.version || '0.1.0';
  const releaseDir = path.join(extensionRoot, 'release');
  const unpackedDir = path.join(releaseDir, 'unpacked');

  // 2. Clean and prepare release directory
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
  ensureDir(unpackedDir);

  // 3. Copy root assets
  copyFile(manifestPath, path.join(unpackedDir, 'manifest.json'));
  const popupHtml = path.join(extensionRoot, 'popup.html');
  if (fs.existsSync(popupHtml)) {
    copyFile(popupHtml, path.join(unpackedDir, 'popup.html'));
  }

  // 4. Copy styles
  const stylesDir = path.join(extensionRoot, 'styles');
  if (fs.existsSync(stylesDir)) {
    copyDirFiltered(stylesDir, path.join(unpackedDir, 'styles'));
  }

  // 5. Copy compiled dist files (only .js and .js.map)
  const distDir = path.join(extensionRoot, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ directory not found. Please run "pnpm run build" first.');
  }

  copyDirFiltered(distDir, path.join(unpackedDir, 'dist'), (filename) => {
    return filename.endsWith('.js') || filename.endsWith('.js.map');
  });

  // 6. Copy icons directory if it exists
  const iconsDir = path.join(extensionRoot, 'icons');
  if (fs.existsSync(iconsDir)) {
    copyDirFiltered(iconsDir, path.join(unpackedDir, 'icons'));
  }

  // 7. Verify essential files exist in unpacked
  const requiredFiles = [
    'manifest.json',
    'popup.html',
    'styles/popup.css',
    'dist/background.js',
    'dist/popup.js',
    'dist/cdp-helper.js',
    'dist/storage.js'
  ];

  for (const relFile of requiredFiles) {
    const fullPath = path.join(unpackedDir, relFile);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing required package file: ${relFile}`);
    }
  }

  // 8. Create ZIP archive with AdmZip
  const zip = new AdmZip();
  zip.addLocalFolder(unpackedDir, '');

  const versionedZipName = `moni-chrome-extension-v${version}.zip`;
  const latestZipName = 'moni-chrome-extension-latest.zip';
  const versionedZipPath = path.join(releaseDir, versionedZipName);
  const latestZipPath = path.join(releaseDir, latestZipName);

  zip.writeZip(versionedZipPath);
  fs.copyFileSync(versionedZipPath, latestZipPath);

  const zipStats = fs.statSync(versionedZipPath);

  console.log('\n✅ Packaging completed successfully!');
  console.log(`   Version:      v${version}`);
  console.log(`   Unpacked:     ${unpackedDir}`);
  console.log(`   Release ZIP:  ${versionedZipPath} (${formatBytes(zipStats.size)})`);
  console.log(`   Latest ZIP:   ${latestZipPath}`);
  console.log('\n📋 Packaged files:');

  const zipEntries = zip.getEntries();
  for (const entry of zipEntries) {
    if (!entry.isDirectory) {
      console.log(`   - ${entry.entryName} (${formatBytes(entry.header.size)})`);
    }
  }
  console.log('\n🎉 Ready for Chrome Web Store upload or loading unpacked in chrome://extensions/\n');
}

runPackaging().catch((err) => {
  console.error('\n❌ Packaging failed:', err);
  process.exit(1);
});
