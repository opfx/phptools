import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as rimraf from 'rimraf';
import { JsonObject } from './../../lib/types';
import { packages } from './../../lib/packages';
import { Logger } from './../../lib/util/logging';

function exec(command: string, args: string[], opts: { cwd?: string }, log: Logger) {
  const { status, error, stderr, stdout } = spawnSync(command, args, { stdio: 'inherit', ...opts });
  if (status != 0) {
    log.error(`Command failed: ${command}, ${args.map((x) => JSON.stringify(x)).join(', ')}`);
    if (error) {
      log.error(`Error: ` + (error ? error.message : 'undefined'));
      throw error;
    }
    if (stdout !== null) {
      log.error(`STDOUT:\n${stdout}`);
    }
    if (stderr !== null) {
      log.error(`STDERR:\n${stderr}`);
    }
    throw new Error('Unknown error');
  }
}

export default async function (argv: { local?: boolean; snapshot?: boolean }, log: Logger) {
  await clean(log);

  const sortedPackages = sortPackages();

  build(log);

  log.info(`Moving packages to 'dist'...`);
  const packageLog = log.createChild('packages');
  for (const packageName of sortedPackages) {
    packageLog.info(packageName);
    const pkg = packages[packageName];
    // move the main source
    recursiveCopy(pkg.build, pkg.dist, log);
    // move the schema
    if (fs.existsSync(pkg.schema.build)) {
      recursiveCopy(pkg.schema.build, pkg.dist, log);
    }

    const fragments: string[] = (pkg.packageJson.fragments as any) || [];
    for (const fragment of fragments) {
      packageLog.info(`${packageName}/${fragment}`);

      recursiveCopy(pkg.build.replace('src', fragment), path.join(pkg.dist, fragment), log);
    }
  }

  log.info('Copying resources...');
  const resourceLog = log.createChild('resources');
  for (const packageName of sortedPackages) {
    resourceLog.info(packageName);
    const pkg = packages[packageName];

    const files = glob.sync(path.join(pkg.root, '**/*'), { dot: true, nodir: true });
    const packageLog = resourceLog.createChild(packageName);
    packageLog.info(`found ${files.length} files...`);
    const resources = files
      .map((filename) => path.relative(pkg.root, filename))
      .filter((filename: string) => {
        if (filename === 'package.json') {
          return false;
        }
        if (filename === 'jest.config.js') {
          return false;
        }
        // skip node_modules
        if (/(?:^|[\/\\])node_modules[\/\\]/.test(filename)) {
          return false;
        }
        // skip sources, but allow declaration files
        if (filename.endsWith('.ts') && !filename.endsWith('.d.ts')) {
          // verify that we have a build version of the source file
          // bt : disabled because otherwise we can not get rid of the src directory
          // if (!fs.existsSync(path.join(pkg.dist, filename).replace(/ts$/, 'js'))) {
          //   packageLog.fatal(`\nSource found but compiled file not found : '${filename}'.`);
          // }
          return false;
        }
        // skip ts config files
        if (filename.startsWith('tsconfig')) {
          return false;
        }
        // skip version files that might be created during development testing
        if (filename.endsWith('version')) {
          return false;
        }
        if (filename.endsWith('.phar')) {
          return false;
        }

        // skip files from .gitignore
        // TODO
        return true;
      });
    packageLog.info(`found ${resources.length} resource(s)...`);
    resources.forEach((filename) => {
      const targetFilename = filename.replace('src', '');
      copy(path.join(pkg.root, filename), path.join(pkg.dist, targetFilename));
    });
  }

  log.info(`Generating 'package.json' files...`);
  // use the workspace version
  const packageJsonLog = log.createChild('packages');
  const rootPackageJson = require('./../../../package.json');

  const version = rootPackageJson['version'];
  for (const packageName of sortedPackages) {
    packageJsonLog.info(packageName);
    const pkg = packages[packageName];

    const packageJson = pkg.packageJson;
    packageJson['version'] = version;

    for (const depName of Object.keys(packages)) {
      for (const depKey of ['dependencies', 'peerDependencies', 'devDependencies']) {
        let dependenciesSection: JsonObject | null;

        dependenciesSection = packageJson[depKey] as JsonObject | null;

        if (dependenciesSection && typeof dependenciesSection === 'object' && dependenciesSection[depName]) {
          if ((dependenciesSection[depName] as string).match(/\b0\.0\.0\b/)) {
            dependenciesSection[depName] = (dependenciesSection[depName] as string).replace(/\b0\.0\.0\b/, version);
          }
        }
      }
    }

    for (const key of Object.keys(packageJson)) {
      switch (key) {
        case 'publishConfig':
          const publishConfig = packageJson[key];
          for (const setting of Object.keys(publishConfig)) {
            switch (setting) {
              case 'bin':
              // fallthrough
              case 'builders':
              // fallthrough
              case 'main':
              // fallthrough
              case 'schematics':
              // fallthrough
              case 'scripts':
              //fallthrough
              case 'types':
                packageJson[setting] = publishConfig[setting];
                break;
            }
          }
          // fallthrough
          delete packageJson[key];
          break;
        case 'scripts':
          // delete packageJson[key];
          break;
      }
    }
    fs.writeFileSync(path.join(pkg.dist, 'package.json'), JSON.stringify(packageJson));
  }

  log.info(`Done`);
}

function build(log: Logger) {
  log.info('Building...');
  const args = [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'];
  try {
    exec('node', args, {}, log);
  } catch (e) {
    log.fatal('Build failed.');
  }
}

async function clean(logger: Logger) {
  const distDir = path.join(__dirname, './../../../target');
  return new Promise<void>((resolve, reject) => {
    logger.info(`Cleaning... `);
    if (!fs.existsSync(distDir)) {
      resolve();
    }
    logger.info(`    removing 'target/' directory`);

    rimraf(distDir, () => {
      resolve();
    });
  });
}

function recursiveCopy(from: string, to: string, logger: Logger) {
  if (!fs.existsSync(from)) {
    logger.error(`File "${from}" does not exist.`);
    process.exit(4);
  }
  if (fs.statSync(from).isDirectory()) {
    fs.readdirSync(from).forEach((fileName) => {
      recursiveCopy(path.join(from, fileName), path.join(to, fileName), logger);
    });
  } else {
    copy(from, to);
  }
}

function copy(from: string, to: string) {
  // Create parent folder if necessary.
  if (!fs.existsSync(path.dirname(to))) {
    mkdirp(path.dirname(to));
  }

  // Error out if destination already exists.
  if (fs.existsSync(to)) {
    throw new Error(`Path ${to} already exist...`);
  }

  from = path.relative(process.cwd(), from);
  to = path.relative(process.cwd(), to);

  const buffer = fs.readFileSync(from);
  fs.writeFileSync(to, buffer);
}

function mkdirp(p: string) {
  // Create parent folder if necessary.
  if (!fs.existsSync(path.dirname(p))) {
    mkdirp(path.dirname(p));
  }
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p);
  }
}
function sortPackages() {
  const sortedPackages = Object.keys(packages);
  let swapped = false;
  do {
    swapped = false;
    for (let i = 0; i < sortPackages.length - 1; i++) {
      for (let j = i + 1; j < sortedPackages.length; j++) {
        const a = sortedPackages[i];
        const b = sortedPackages[j];

        if (packages[a].dependencies.indexOf(b) != -1) {
          // swap the packages
          [sortedPackages[i], sortedPackages[i + 1]] = [sortedPackages[i + 1], sortedPackages[i]];
          swapped = true;
        }
      }
    }
  } while (swapped);

  return sortedPackages;
}
