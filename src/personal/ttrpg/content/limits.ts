/*
 * The limits the server holds to and the pages show before asking, kept here so the two never
 * disagree. How often someone may do something is convex/limits.ts.
 */

/** Players at one table, past any real group, so one password cannot fill the tokens or storage. */
export const maxPlayers = 12;
/** A familiar, a mount, an animal companion and a summoned spell, at once. */
export const maxSummons = 4;
/** Saved characters per account, far past any one player's party of alts. */
export const maxCharacters = 20;
/** A stat block's Markdown, far past the longest, a dragon with lair and legendary actions. */
export const maxMarkdown = 20_000;
