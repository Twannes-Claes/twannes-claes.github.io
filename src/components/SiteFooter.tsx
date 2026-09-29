/** The released version, so a deploy can be confirmed from the page itself. */
export function SiteFooter()
{
    return (
        <footer className="container-page">
            {/* One template string. React separates adjacent text nodes with a
                comment, which would leave v<!-- -->1.0.0 in the built HTML. */}
            <p className="border-t border-edge py-6 text-center font-mono text-xs tracking-[0.15em] opacity-40">
                {`v${__APP_VERSION__}`}
            </p>
        </footer>
    );
}
