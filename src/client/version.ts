/**
 * The version the page header advertises.
 *
 * `package.json` remains the package's authority; a unit test compares the two so
 * a release cannot ship a chip that lies about the artifact. The credit text is
 * the mandatory style-contract line and is rendered verbatim from the locale
 * dictionary (`credit`), never paraphrased.
 *
 * @module dsh-session-monitor/client/version
 */

/** Semver of the built artifact. */
export const VERSION = '0.7.1'