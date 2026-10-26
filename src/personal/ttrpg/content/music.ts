/*
 * The GM's music links, see Music in PLAN.md, shared with the server, which stores only the video
 * id a link names, see convex/music.ts.
 */

const idPattern = /^[\w-]{11}$/;
const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];

/**
 * The id of the YouTube video a link points at, or null for anything else. Takes a bare id too,
 * so a saved one can be sent back as it is.
 */
export function videoId(link: string): string | null
{
    const text = link.trim();

    if (idPattern.test(text))
        return text;

    if (!URL.canParse(text))
        return null;

    const url = new URL(text);
    const [first, second] = url.pathname.split('/').filter(Boolean);
    let id: string | null | undefined;

    if (url.hostname === 'youtu.be')
        id = first;
    else if (hosts.includes(url.hostname))
        id = first === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(first ?? '') ? second : undefined;

    return id && idPattern.test(id) ? id : null;
}
