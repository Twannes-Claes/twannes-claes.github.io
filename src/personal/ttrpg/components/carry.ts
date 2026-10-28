import type { DragEvent } from 'react';

import type { PropPicture, Token } from '../types';

/**
 * What a monster dragged toward the map looks like there, see setGhost in map/view.ts, or the
 * picture of a prop dragged from the library, see setPropGhost.
 */
export type Carried = Pick<Token, 'name' | 'color' | 'avatar' | 'size'> | PropPicture;

let carried: Carried | null = null;
let blank: HTMLImageElement | null = null;

/**
 * Loads the empty picture a drag shows instead of the browser's own copy of the tile, as a tile
 * is hovered, so it is ready by the time the drag starts.
 */
export function readyCarry()
{
    if (blank)
        return;

    blank = new Image();
    blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}

/**
 * A preset, tray or prop tile starts its drag: the map draws what it carries under the pointer
 * instead of the browser dragging a picture of the tile. The drag's own data only reads on drop,
 * so the look is kept here, until carry(null) as the drag ends.
 */
export function carry(event: DragEvent | null, what: Carried | null)
{
    carried = what;

    if (event && blank)
        event.dataTransfer.setDragImage(blank, 0, 0);

}

/** The monster or picture being dragged, or null. */
export function carrying(): Carried | null
{
    return carried;
}
