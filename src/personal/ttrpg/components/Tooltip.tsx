import { useEffect, useState } from 'react';

interface Tip
{
    text: string;
    x: number;
    y: number;
    /**
     * Above the element by default, under it near the top of the screen, and to the right of the
     * tool rail, where above would cover the next tool up.
     */
    side: 'above' | 'below' | 'right';
}

/** How long the pointer rests on an element before its tip shows, a little quicker than native. */
const delay = 400;

/**
 * The tip of whatever `title` the mouse rests on, drawn in the app's own style, mounted once in
 * the Shell. The browser's tooltip cannot be styled, so the title is lifted off the element while
 * it is hovered, which keeps the browser from showing its own, and put back when the mouse leaves.
 * Every component keeps writing a plain `title`.
 */
export function TooltipHost()
{
    const [tip, setTip] = useState<Tip | null>(null);

    useEffect(() =>
    {
        let held: HTMLElement | null = null;
        let timer = 0;

        const hide = () =>
        {
            window.clearTimeout(timer);
            setTip(null);
        };

        const release = () =>
        {
            hide();

            // React may have written a new title while it was lifted, which wins over the old one.
            if (held && !held.title)
                held.title = held.dataset.tip ?? '';

            held?.removeAttribute('data-tip');
            held = null;
        };

        const over = (event: PointerEvent) =>
        {
            const element = event.target instanceof Element ? event.target : null;
            const target = element?.closest<HTMLElement>('.ttrpg [title], [data-tip]') ?? null;

            if (target === held)
                return;

            release();

            // A touch has no hover to rest on, the long press it would take belongs to the map.
            if (!target?.title || event.pointerType !== 'mouse')
                return;

            const text = target.title;

            held = target;
            target.dataset.tip = text;
            target.removeAttribute('title');
            timer = window.setTimeout(() =>
            {
                const box = target.getBoundingClientRect();
                const x = box.left + box.width / 2;
                const rail = target.closest('.ttrpg-rail')?.getBoundingClientRect();

                if (rail)
                    setTip({ text, x: rail.right + 8, y: box.top + box.height / 2, side: 'right' });
                else if (box.top < 48)
                    setTip({ text, x, y: box.bottom + 8, side: 'below' });
                else
                    setTip({ text, x, y: box.top - 8, side: 'above' });

            }, delay);
        };

        const out = (event: PointerEvent) =>
        {
            if (!event.relatedTarget)
                release();

        };

        document.addEventListener('pointerover', over);
        document.addEventListener('pointerout', out);
        // A click hides the tip until the mouse comes back, as the browser's own does.
        document.addEventListener('pointerdown', hide);

        return () =>
        {
            release();
            document.removeEventListener('pointerover', over);
            document.removeEventListener('pointerout', out);
            document.removeEventListener('pointerdown', hide);
        };
    }, []);

    if (!tip)
        return null;

    // A shortcut at the end, as in "Walls and doors (W)", shows as keys rather than in brackets.
    const [, words = tip.text, keys] = /^(.*) \(([^()]+)\)$/.exec(tip.text) ?? [];

    return (
        <div
            className={`ttrpg-tip ttrpg-tip--${tip.side}`}
            // Laid out from the left edge first, so the text wraps the same wherever it ends up.
            style={{ left: 0, top: tip.y }}
            aria-hidden="true"
            // Centred on the element, but slid along to stay on screen, which needs its width.
            ref={(node) =>
            {
                const half = node ? node.offsetWidth / 2 : 0;
                const x = tip.side === 'right' ? tip.x : Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8);

                if (node)
                    node.style.left = `${x}px`;

            }}
        >
            {words}
            {keys?.split(' or ').map((key) => <kbd key={key}>{key}</kbd>)}
        </div>
    );
}
