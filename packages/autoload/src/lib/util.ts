import * as path from 'path';
import { name } from './../constants';

/**
 * Returns the path to the PHP autoload builder phar.
 * @returns
 */
export function getAutoloadBuilderPath(relative = false): string {
  let result = path.join(__dirname, '..', name, `${name}.phar`);
  result = path.resolve(result);
  if (relative) {
    let nodeModulesParentPath = path.join(__dirname, '..', '..', '..', '..');
    nodeModulesParentPath = path.resolve(nodeModulesParentPath);
    result = path.relative(nodeModulesParentPath, result);
  }
  return result;
}
