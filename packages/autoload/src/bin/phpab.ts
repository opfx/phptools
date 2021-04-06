#!/usr/bin/env node

import * as proc from 'child_process';
import * as File from 'fs';
import * as Path from 'path';

import * as tool from './../constants';

const spawnArgs = process.argv.slice(2);
const toolPath = Path.resolve(__dirname, '..', `${tool.name}`, `${tool.name}.phar`);
spawnArgs.unshift(toolPath);

// turn on the ability to write to a phar archive
spawnArgs.unshift('-d phar.readonly=Off');

let output;
spawnArgs.forEach((arg, index) => {
  if (arg === '-o' || arg === '--output') {
    output = spawnArgs[index + 1];
  }
});
if (output) {
  output = Path.resolve(output);
  output = output.replace(Path.basename(output), '');
  if (!File.existsSync(output)) {
    File.mkdirSync(output, { recursive: true });
  }
}

const child = proc.spawn('php', spawnArgs, { stdio: 'inherit', windowsHide: true });
child.on('close', (code) => {
  process.exit(code);
});

const handleTerminationSignal = (signal) => {
  process.on(signal, function signalHandler() {
    if (!child.killed) {
      child.kill(signal);
    }
  });
};

handleTerminationSignal('SIGINT');
handleTerminationSignal('SIGTERM');
