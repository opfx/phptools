import * as File from "fs";
import * as Os from "os";
import * as Path from "path";
import * as Nugget from "nugget";
import { rc } from "rc";

let tempFileCounter = 0;
class PharDownloader {
  opts: any;
  npmrc: any;
  constructor(opts: any) {
    this.opts = Object.assign({ autodownload: true }, opts);
    this.npmrc = {};
    try {
      rc("npm", this.npmrc);
    } catch (err) {
      console.error(`Failed reading the npm configuration: ${err.message}`);
    }
  }

  get cache(): string {
    let cachePath = this.opts.cache;

    if (cachePath) {
      return cachePath;
    }

    switch (Os.platform()) {
      case "darwin":
        cachePath = Path.join(Os.homedir(), "Library", "Caches", "@phptools");
        break;
      default:
        cachePath = Path.join(Os.homedir(), "@phptools");
    }
    return cachePath;
  }

  get cachedPhar(): string {
    return Path.join(this.cache, this.filename);
  }

  get filename(): string {
    return this.opts.destFilename;
  }

  get headers() {
    return this.opts.headers;
  }

  get proxy() {
    let proxy;

    if (this.npmrc && this.npmrc.proxy) {
      proxy = this.npmrc.proxy;
    }

    if (this.npmrc && this.npmrc["https-proxy"]) {
      proxy = this.npmrc["https-proxy"];
    }

    return proxy;
  }
  get strictSSL() {
    let strictSSL = true;
    if (this.opts.strictSSL === false || this.npmrc["strict-ssl"] === false) {
      strictSSL = false;
    }
    return strictSSL;
  }

  get quiet() {
    return this.opts.quiet || process.stdout.rows < 1;
  }

  protected async verifyIntegrity() {
    return true;
  }

  protected async moveTempFileToDestFile(tempFilename, destFilename) {
    const cache = this.cache;

    return new Promise<void>((resolve, reject) => {
      File.rename(
        Path.join(cache, tempFilename),
        Path.join(cache, destFilename),
        (err) => {
          // err = new Error('sample');
          if (err) {
            File.unlink(cache, (cleanupErr) => {
              if (cleanupErr) {
                console.error(
                  `Error deleting cache dir: ${cleanupErr.message}`
                );
              }
            });
            return reject(err);
          }
          return resolve();
        }
      );
    });
  }

  protected async downloadFile(url, destFilename): Promise<any> {
    const tempFilename = `tmp-${process.pid}-${(tempFileCounter++).toString(
      16
    )}-${Path.basename(destFilename)}`;
    const nuggetOpts = {
      target: tempFilename,
      dir: this.cache,
      resume: true,
      quiet: this.quiet,
      strictSSL: this.strictSSL,
      proxy: this.proxy,
      headers: this.headers,
    };
    return new Promise<void>((resolve, reject) => {
      Nugget(url, nuggetOpts, async (errors) => {
        if (errors) {
          reject(errors[0]);
        }
        try {
          await this.moveTempFileToDestFile(tempFilename, destFilename);
          return resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  protected async downloadPhar() {
    await this.downloadFile(this.opts.url, this.opts.destFilename);
  }

  public async downloadIfNotCached() {
    if (!File.existsSync(this.cachedPhar)) {
      await this.createCacheDir();
      await this.downloadPhar();
    }
    this.verifyIntegrity();
    return this.cachedPhar;
  }

  private async createCacheDir(): Promise<string> {
    return new Promise((resolve, reject) => {
      File.mkdir(this.cache, { recursive: true }, (err) => {
        if (err) {
          reject(err);
        }
        resolve(this.cache);
      });
    });
  }
}

export const download = async (opts, cb) => {
  try {
    const downloader = new PharDownloader(opts);
    const downloadedFile = await downloader.downloadIfNotCached();
    cb(downloadedFile, undefined);
  } catch (err) {
    cb(null, err);
  }
};
