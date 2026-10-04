import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';

/*
 * Turns the PNG, JPEG and GIF files in public/assets into WebP and points the code at the new
 * files, so `npm run images` after adding a picture is all it takes. A file is only replaced when
 * the WebP comes out smaller. GIFs become animated WebP, which an <img> plays the same way.
 */

const assets = 'public/assets';

/** Where the code names the pictures, rewritten to the new file names. */
const sources = ['src', 'index.html'];

/**
 * Shared on social sites, which do not all read WebP, so they stay JPEG. Paths are relative to
 * public/assets.
 */
const keep = new Set(['site/og-banner.jpg', 'site/linkedin-banner.jpg']);

/**
 * Widest a picture needs to be, by file name, about twice the size it is shown at so it stays
 * sharp on high density screens. Gallery pictures keep their size, the lightbox shows them big.
 */
const maxWidths: [RegExp, number][] = [
    [/\/card\.\w+$/, 900],
    [/\/home-picture\.\w+$/, 800],
];

/** Every file under a folder, at any depth. */
function files(dir: string): string[]
{
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .map((name) => join(dir, name))
        .filter((path) => statSync(path).isFile());
}

/** The URL the site serves a file under public/ at, with forward slashes. */
function url(path: string): string
{
    return `/${relative('public', path).replaceAll('\\', '/')}`;
}

async function toWebp(path: string): Promise<Buffer>
{
    const animated = path.toLowerCase().endsWith('.gif');
    const width = maxWidths.find(([pattern]) => pattern.test(url(path)))?.[1];
    // Read up front, because sharp keeps a file it opened locked on Windows, and the original
    // could not be deleted afterwards.
    let image = sharp(readFileSync(path), { animated });

    // Never enlarges, so a picture already narrower than the cap keeps its size.
    if (width)
        image = image.resize({ width, withoutEnlargement: true });

    return image.webp({ quality: animated ? 75 : 82, effort: 6 }).toBuffer();
}

/** Every file under the source folders the code lives in. */
function sourceFiles(): string[]
{
    return sources.flatMap((source) =>
        statSync(source).isDirectory() ? files(source) : [source],
    );
}

let converted = 0;
let saved = 0;

for (const path of files(assets))
{
    if (!/\.(png|jpe?g|gif)$/i.test(path) || keep.has(relative(assets, path).replaceAll('\\', '/')))
        continue;

    const before = statSync(path).size;
    const webp = await toWebp(path);
    const target = path.replace(/\.\w+$/, '.webp');

    if (webp.length >= before)
    {
        console.log(`kept      ${url(path)}, WebP would not be smaller`);
        continue;
    }

    writeFileSync(target, webp);
    unlinkSync(path);
    converted++;
    saved += before - webp.length;
    console.log(
        `converted ${url(path)}  ${Math.round(before / 1024)} KB -> ${Math.round(webp.length / 1024)} KB`,
    );
}

/**
 * A link to a picture that is now WebP, pointed at the new file. Works from what is on disk rather
 * than this run's conversions, so a run that stopped halfway is finished by the next one.
 */
function relink(link: string): string
{
    const webp = link.replace(/\.\w+$/, '.webp');

    return !existsSync(`public${link}`) && existsSync(`public${webp}`) ? webp : link;
}

for (const file of sourceFiles())
{
    const text = readFileSync(file, 'utf8');
    const next = text.replace(/\/assets\/[\w/.-]+\.(?:png|jpe?g|gif)\b/gi, relink);

    if (next !== text)
    {
        writeFileSync(file, next);
        console.log(`updated   ${file}`);
    }
}

console.log(`\n${converted} pictures converted, ${Math.round(saved / 1024)} KB saved.`);
