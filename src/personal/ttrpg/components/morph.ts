import { flushSync } from 'react-dom';

/*
 * One box at the bottom of the screen turning into the dice and back, for the roll pop-up and the
 * GM's initiative, see RollSheet.tsx and InitiativePanel.tsx. Both boxes carry .ttrpg-roll-swap,
 * see styles/ttrpg.css, and only one shows at a time.
 */

/** How long a landed roll's total shows before the box turns back. */
export const readMs = 1500;

/** How long the boxes take to morph into each other. */
const morphMs = 500;

/** The box that shows. */
const swapBox = () => document.querySelector<HTMLElement>('.ttrpg-roll-swap');

/**
 * Swaps one box for the other, the new box growing or shrinking from where the old one was while
 * its content fades in. The real box moves rather than a view transition's picture of it, as a
 * picture cannot blur the map behind it. flushSync renders the new box at once, so it can be
 * measured. People who reduce motion just get the swap. Settles once the new box is in place.
 */
export function morph(update: () => void): Promise<void>
{
    const from = swapBox()?.getBoundingClientRect();

    flushSync(update);

    const box = swapBox();

    if (!from || !box || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return Promise.resolve();

    const to = box.getBoundingClientRect();
    // Sizes inside the box are in its zoomed pixels, see the control size in useScreenSettings.ts.
    const zoom = Number(getComputedStyle(box).getPropertyValue('--ttrpg-ui')) || 1;
    const frame = (rect: DOMRect, rise: number) => ({ width: `${rect.width / zoom}px`, height: `${rect.height / zoom}px`, translate: `-50% ${rise / zoom}px` });
    const motion = box.animate([frame(from, from.bottom - to.bottom), frame(to, 0)], { duration: morphMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });

    // Its content keeps its size, clipped by the box while it grows, see .ttrpg-roll-swap--morphing,
    // and fades in after the old one is gone.
    box.classList.add('ttrpg-roll-swap--morphing');
    motion.onfinish = motion.oncancel = () => box.classList.remove('ttrpg-roll-swap--morphing');

    for (const child of box.children)
        child.animate({ opacity: [0, 1] }, { duration: morphMs * 0.6, delay: morphMs * 0.4, fill: 'backwards' });

    // A cancelled morph, like the box closing in the middle of it, still counts as done.
    return motion.finished.then(
        () => undefined,
        () => undefined,
    );
}

/**
 * What glides inside the box: its rows, and its title bar, which would otherwise sit still as the
 * box's top edge passes it.
 */
const gliding = '[data-glide], .ttrpg-popover__header';

/** How long the box and its rows take to glide after a change, see glide. */
const glideMs = 300;

/** Where the box, its title bar and its rows were, to glide from after a change. */
export interface Placed
{
    box: DOMRect;
    rows: Map<string, DOMRect>;
}

/** Where the box and its rows are now. None while it morphs, when they are on their way. */
export function place(): Placed | null
{
    const box = swapBox();

    if (!box || box.classList.contains('ttrpg-roll-swap--morphing'))
        return null;

    // A glide still running is ended first, so this is where things are, not where they pass.
    for (const motion of box.getAnimations({ subtree: true }))
    {
        if (motion.id === 'glide')
            motion.cancel();
    }

    const rows = [...box.querySelectorAll<HTMLElement>(gliding)];

    return { box: box.getBoundingClientRect(), rows: new Map(rows.map((row) => [row.dataset.glide ?? 'header', row.getBoundingClientRect()])) };
}

/**
 * Glides the box and its rows from where they were to where a change put them, like a roll moving
 * a token from the waiting list into the order: the box's height eases while its content keeps to
 * the bottom it grows up from, see .ttrpg-roll-swap--gliding, each row slides from its old place,
 * and a new one fades in.
 */
export function glide(from: Placed, to: Placed)
{
    const box = swapBox();

    if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;

    // Moves inside the box are in its zoomed pixels, see the control size in useScreenSettings.ts.
    const zoom = Number(getComputedStyle(box).getPropertyValue('--ttrpg-ui')) || 1;
    const timing = { id: 'glide', duration: glideMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

    if (from.box.height !== to.box.height)
    {
        const motion = box.animate({ height: [`${from.box.height / zoom}px`, `${to.box.height / zoom}px`] }, timing);

        box.classList.add('ttrpg-roll-swap--gliding');
        motion.onfinish = motion.oncancel = () => box.classList.remove('ttrpg-roll-swap--gliding');
    }

    for (const row of box.querySelectorAll<HTMLElement>(gliding))
    {
        const was = from.rows.get(row.dataset.glide ?? 'header');
        const now = to.rows.get(row.dataset.glide ?? 'header');

        if (!was)
            row.animate({ opacity: [0, 1] }, timing);
        else if (now && was.top !== now.top)
            row.animate({ translate: [`0 ${(was.top - now.top) / zoom}px`, '0 0'] }, timing);

    }
}
