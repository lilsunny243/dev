// Copyright 2017-2023 @polkadot/dev authors & contributors
// SPDX-License-Identifier: Apache-2.0

// @ts-check

import JSON5 from 'json5';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CWD_PATH, CWD_URL, MOD_PATH } from './common.js';

/** @typedef {{ filter: string[]; isWildcard?: boolean; path: string, url: URL }} Alias */
/** @typedef {{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }; extends?: string }} JsonConfig */
/** @typedef {{ paths: Record<string, string[]>; url?: URL }} PartialConfig */

/**
 * @internal
 *
 * Extracts the (relevant) tsconfig info, also using extends
 *
 * @param {string} [currentPath]
 * @param {string} [tsconfig]
 * @param {string} [fromFile]
 * @returns {PartialConfig}
 **/
function readConfigFile (currentPath = CWD_PATH, tsconfig = 'tsconfig.json', fromFile) {
  const configFile = path.join(currentPath, tsconfig);

  if (!fs.existsSync(configFile)) {
    console.warn(`No ${configFile}${fromFile ? ` (extended from ${fromFile})` : ''} found, assuming defaults`);

    return { paths: {} };
  }

  try {
    /** @type {JsonConfig} */
    const { compilerOptions, extends: parentConfig } = JSON5.parse(fs.readFileSync(configFile, 'utf8'));

    // ensure that the basePath does point to an actual directory
    /** @type {URL | undefined} */
    let url;

    if (compilerOptions?.baseUrl) {
      const configDir = path.dirname(configFile);

      // the baseParentUrl is relative to the actual config file
      url = pathToFileURL(path.join(configDir, `${compilerOptions.baseUrl}/`));
    }

    // empty paths if none are found
    let paths = compilerOptions?.paths || {};

    if (parentConfig) {
      const extRoot = parentConfig.startsWith('.')
        ? currentPath
        : MOD_PATH;
      const extSubs = parentConfig.split(/[\\/]/);
      const extPath = path.join(extRoot, ...extSubs.slice(0, -1));
      const extConfig = readConfigFile(extPath, extSubs.at(-1), configFile);

      // base configs are overridden by later configs, order here matters
      // FIXME The paths would be relative to the baseUrl at that point... for
      // now we don't care much since we define these 2 together in all @polkadot
      // configs, but it certainly _may_ create and issue at some point (for others)
      paths = { ...extConfig.paths, ...paths };
      url = url || extConfig.url;
    }

    return { paths, url };
  } catch (error) {
    console.error(`FATAL: Error parsing ${configFile}:: ${error.message}`);

    throw error;
  }
}

/**
 * @internal
 *
 * Retrieves all TS aliases definitions
 *
 * @returns {Alias[]}
 **/
function extractAliases () {
  const { paths, url = CWD_URL } = readConfigFile();

  return Object
    .entries(paths)
    // TODO The path value is an array - we only handle the first entry in there,
    // this is a possible fix into the future if it is ever an issue... (may have
    // some impacts on the actual loader where only 1 alias is retrieved)
    .map(([key, [path]]) => {
      const filter = key.split(/[\\/]/);
      const isWildcard = filter.at(-1) === '*';

      // ensure that when we have wilcards specified, they always occur in the last position
      if ((filter.filter((f) => f === '*').length !== (isWildcard ? 1 : 0)) && key) {
        throw new Error(`FATAL: Wildcards in tsconfig.json path entries are only supported in the last position. Invalid ${key}: ${path} mapping`);
      }

      return {
        filter: isWildcard
          ? filter.slice(0, -1)
          : filter,
        isWildcard,
        path,
        url
      };
    });
}

/** We only export the aliases from the config */
export const tsAliases = extractAliases();
