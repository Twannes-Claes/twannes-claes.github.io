import { faEye, faEyeSlash, faInbox } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { typing, useKeydown } from './useKeys';

interface SelectPanelProps
{
    /** How many tokens are picked, and how many of them are monsters, which the buttons act on. */
    picked: number;
    monsters: number;
    onHide: (hidden: boolean) => void;
    onTray: () => void;
    /** Picks every token on the map, for Ctrl+A. */
    onAll: () => void;
    /** Lets them all go, for Esc. */
    onClear: () => void;
}

/**
 * The Select tool's panel beside the rail: what is picked, and what to do to the picked monsters
 * at once. Moving is dragging any picked token, see setSelection in map/view.ts, and removing
 * them is the eraser's.
 */
export function SelectPanel({ picked, monsters, onHide, onTray, onAll, onClear }: SelectPanelProps)
{
    useKeydown((event) =>
    {
        if (typing(event))
            return;

        if (event.key === 'Escape' && picked > 0 && !document.querySelector('dialog[open], .ttrpg-token-menu'))
            onClear();
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')
        {
            event.preventDefault();
            onAll();
        }
    });

    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings" aria-label="Select">
            <h2 role="status">{picked > 0 ? `Select · ${picked}` : 'Select'}</h2>

            <div className="ttrpg-settings__choices">
                <button type="button" className="ttrpg-segment" disabled={monsters === 0} title="Hide the picked monsters from the players" onClick={() => onHide(true)}>
                    <FontAwesomeIcon icon={faEyeSlash} />
                    Hide
                </button>
                <button type="button" className="ttrpg-segment" disabled={monsters === 0} title="Show the picked monsters to the players" onClick={() => onHide(false)}>
                    <FontAwesomeIcon icon={faEye} />
                    Show
                </button>
                <button type="button" className="ttrpg-segment" disabled={monsters === 0} title="Off the map onto the tray, hidden" onClick={onTray}>
                    <FontAwesomeIcon icon={faInbox} />
                    To tray
                </button>
            </div>

            <ul className="ttrpg-keys" aria-label="Keys">
                <li>Shift+click to add, drag a box for several.</li>
                <li>Ctrl+A for all, Esc for none.</li>
            </ul>
        </section>
    );
}
