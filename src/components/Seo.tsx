import { Head } from 'vite-react-ssg';

import { site } from '../content/site';

interface SeoProps
{
    /** Full <title>. Defaults to the site title. */
    title?: string;
    description?: string;
    /** Absolute URL of the share image. */
    image?: string;
    /** Absolute canonical URL for this page. */
    url?: string;
    type?: 'website' | 'article';
}

export function Seo({
    title = site.title,
    description = site.description,
    image = site.ogImage,
    url = site.url,
    type = 'website',
}: SeoProps)
{
    return (
        <Head>
            <title>{title}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={url} />

            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:type" content={type} />
            <meta property="og:url" content={url} />

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
        </Head>
    );
}
