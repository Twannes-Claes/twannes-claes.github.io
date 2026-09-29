import type { ViteReactSSGContext } from 'vite-react-ssg';

/** Taken from the context so nothing depends on @remix-run/router directly. */
type Router = NonNullable<ViteReactSSGContext<true>['router']>;

/**
 * Reports client-side navigations to GoatCounter.
 *
 * The snippet in index.html counts the page a visitor lands on, but project
 * cards navigate with <Link>, so opening a project never reloads the page and
 * would otherwise go unrecorded.
 */
export function trackPageViews(router: Router)
{
    // Seeded with the landing page, which the snippet has already counted.
    let counted = router.state.location.pathname;

    router.subscribe((state) =>
    {
        const { pathname, search } = state.location;

        // subscribe fires several times per navigation. Comparing paths also
        // skips anchor clicks, which are not page views.
        if (pathname === counted)
            return;

        counted = pathname;

        window.goatcounter?.count?.({ path: pathname + search });
    });
}
