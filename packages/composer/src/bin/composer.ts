#!/usr/bin/env node

import * as proc from 'child_process';
import * as Path from 'path';

import * as tool from './../constants';

const spawnArgs = process.argv.slice(2);
const toolPath = Path.resolve(__dirname, '..', `${tool.name}`, `${tool.name}.phar`);
spawnArgs.unshift(toolPath);

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
