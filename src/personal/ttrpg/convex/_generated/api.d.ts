/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as characters from "../characters.js";
import type * as hosts from "../hosts.js";
import type * as http from "../http.js";
import type * as pictures from "../pictures.js";
import type * as play from "../play.js";
import type * as presets from "../presets.js";
import type * as sessions from "../sessions.js";
import type * as sight from "../sight.js";
import type * as summons from "../summons.js";
import type * as usage from "../usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  characters: typeof characters;
  hosts: typeof hosts;
  http: typeof http;
  pictures: typeof pictures;
  play: typeof play;
  presets: typeof presets;
  sessions: typeof sessions;
  sight: typeof sight;
  summons: typeof summons;
  usage: typeof usage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
