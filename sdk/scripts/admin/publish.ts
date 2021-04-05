/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { spawnSync } from 'child_process';
import { Logger } from './../../lib/util/logging';

import { packages } from './../../lib/packages';

import build from './build';

const allowPublishTagValues = ['alpha', 'beta', 'latest', 'next'];

export interface PublishArgs {
  tag?: string;
  tagCheck?: boolean;
  registry?: string;
}
export default async function (args: PublishArgs, log: Logger) {
  let publishTag = getPublishTagFromVersion();
  if (args['_'][0]) {
    publishTag = args['_'][0];
  }
  if (publishTag.length > 0 && !allowPublishTagValues.includes(publishTag)) {
    log.error(`The value "${publishTag}" provided for "tag" is invalid. Valid values are: "${allowPublishTagValues.join('", "')}".`);
    return 1;
  }
  log.info('Publishing...');
  await build({}, log.createChild('build'));

  return Object.keys(packages)
    .reduce((acc: Promise<void>, name: string) => {
      const pkg = packages[name];
      if (pkg.packageJson['private']) {
        log.debug(`ignoring ${name} (private)`);
        return acc;
      }
      return acc
        .then(() => {
          log.info(`publishing package ${name}`);
          const publishArgs = ['publish', '--tag', publishTag, '--access', 'public'];
          return exec('npm', publishArgs, { cwd: pkg.dist }, log);
        })
        .then((stdout: string) => {
          log.info(stdout);
        });
    }, Promise.resolve())
    .then(
      () => {
        log.info('done');
      },
      (err: Error) => log.fatal(err.message)
    );
}

function exec(command: string, args: string[], opts: { cwd?: string }, log: Logger) {
  //   if (process.platform.startsWith('win')) {
  //     args.unshift('/c', command);
  //     command = 'cmd.exe';
  //   }

  log.info(`executing ${command} ${args.map((arg) => JSON.stringify(arg)).join(', ')}`);
  const { status, error, stderr, stdout } = spawnSync(command, args, { ...opts, shell: true });

  if (status !== 0) {
    log.error(`Command failed: ${command} ${args.map((arg) => JSON.stringify(arg)).join(', ')}`);

    const message = error ? error.message : `STDERR:\n${stderr}`;
    log.error(`Error: ${message}`);
    throw new Error(message);
  } else {
    return stdout.toString();
  }
}

function getPublishTagFromVersion() {
  const rootPackageJson = require('./../../../package.json');
  const version = rootPackageJson['version'];

  const tags = version.match(/([a-z]+)/gm);
  if (tags !== null && tags.length > 0) {
    return tags[0];
  }
  return 'latest';
}
