/** Convex Auth signs its own tokens, so the deployment trusts itself. */
export default {
    providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: 'convex' }],
};
