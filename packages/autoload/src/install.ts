#!/usr/bin/env node

import * as File from 'fs';

import * as Path from 'path';
import { download } from '@phptools/util';

import * as tool from './constants';

const installDir = Path.join(__dirname, `${tool.name}`);
let installedVersion = null;
try {
  installedVersion = File.readFileSync(Path.join(installDir, 'version'), 'utf-8').replace(/^v/, '');
} catch (ignored) {
  // do nothing
}

const toolPhar = Path.join(installDir, `${tool.name}.phar`);

if (installedVersion === tool.version && File.existsSync(toolPhar)) {
  process.exit(0);
}

download({ url: tool.downloadUrl, destFilename: `${tool.name}-${tool.version}.phar`, checksum: tool.checksum }, onDownloadComplete);

function onDownloadComplete(downloadedFile, err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (!File.existsSync(installDir)) {
    File.mkdirSync(installDir, { recursive: true });
  }
  File.copyFile(downloadedFile, toolPhar, (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    File.writeFile(Path.join(installDir, 'version'), tool.version, (err) => {});
  });
}
