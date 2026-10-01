import './entrance.css';

/*
 * The portal useSecretEntrance.ts opens into the Skylanders page. Drawn straight onto the body
 * rather than through React, because it has to outlive the theme toggle: it covers the screen,
 * the page changes underneath it, and only then does it fade away.
 */

/** The rumble before the portal, which starts while it is still settling. */
const overloadMs = 450;
const portalDelayMs = 250;
const portalMs = 1100;
const fadeMs = 600;
/** Fades out anyway after this long, so a page that never shows cannot leave the screen navy. */
const waitLimitMs = 4000;

function layer(className: string): HTMLDivElement
{
    const element = document.createElement('div');

    element.className = className;
    element.setAttribute('aria-hidden', 'true');

    return element;
}

/**
 * Resolves once something matching the selector is on the page and has had a frame to paint.
 * Checked on timers rather than animation frames, which a hidden tab never fires, so switching
 * tabs mid-way cannot leave the portal stuck over the page.
 */
function painted(selector: string): Promise<void>
{
    const start = performance.now();

    return new Promise((resolve) =>
    {
        function check()
        {
            if (!document.querySelector(selector) && performance.now() - start < waitLimitMs)
            {
                window.setTimeout(check, 50);

                return;
            }

            // Whichever comes first, a painted frame or a moment's wait.
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            window.setTimeout(resolve, 100);
        }

        check();
    });
}

/**
 * Rumbles the page, opens the portal from the middle of the screen, calls enter once it covers
 * everything, and fades out when the Skylanders page is up.
 */
export function openSecretPortal(enter: () => void)
{
    const root = document.documentElement;
    const layers = [layer('secret-portal'), layer('secret-portal__rim')];

    root.classList.add('overloading');
    document.body.append(...layers);

    window.setTimeout(() => root.classList.remove('overloading'), overloadMs);

    window.setTimeout(() =>
    {
        enter();

        painted('.sky').then(() =>
        {
            for (const element of layers)
                element.classList.add('secret-portal--leaving');

            window.setTimeout(() => layers.forEach((element) => element.remove()), fadeMs);
        });
    }, portalDelayMs + portalMs);
}
