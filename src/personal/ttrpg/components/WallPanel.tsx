import { faDoorClosed, faDrawPolygon, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** What the walls tool does: draw walls, or step the wall clicked through door and back. */
export type WallKind = 'wall' | 'change';

const kinds: { id: WallKind; label: string; title: string; icon: IconDefinition }[] = [
    { id: 'wall', label: 'Draw', title: 'Click to chain walls', icon: faDrawPolygon },
    {
        id: 'change',
        label: 'Doors',
        title: 'Click a wall: closed door, open door, wall',
        icon: faDoorClosed,
    },
];

/** Snap points per cell side, short enough for five in a row, with the full name as the tip. */
const snaps = [
    { steps: 1, label: 'Cell', title: 'Grid corners' },
    { steps: 2, label: '½', title: 'Half cells' },
    { steps: 4, label: '¼', title: 'Quarter cells' },
    { steps: 8, label: '⅛', title: 'Eighth cells' },
    { steps: 0, label: 'Off', title: 'No snapping' },
];

interface WallPanelProps
{
    kind: WallKind;
    onKind: (kind: WallKind) => void;
    /** Snap points per cell side, 0 for none. */
    snap: number;
    onSnap: (snap: number) => void;
}

/**
 * The walls tool's settings: draw walls, or turn a drawn wall into a door and back, and how
 * finely new walls snap to the grid. Alt still places freely.
 */
export function WallPanel({ kind, onKind, snap, onSnap }: WallPanelProps)
{
    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings" aria-label="Walls and doors">
            <h2>Walls and doors</h2>

            <div className="ttrpg-settings__choices">
                {kinds.map((choice) => (
                    <button
                        key={choice.id}
                        type="button"
                        className="ttrpg-segment"
                        aria-pressed={kind === choice.id}
                        title={choice.title}
                        onClick={() => onKind(choice.id)}
                    >
                        <FontAwesomeIcon icon={choice.icon} />
                        {choice.label}
                    </button>
                ))}
            </div>

            {kind !== 'change' && (
                <>
                    <div className="ttrpg-settings__group" role="group" aria-label="Snap">
                        Snap
                        <div className="ttrpg-settings__choices">
                            {snaps.map((choice) => (
                                <button
                                    key={choice.steps}
                                    type="button"
                                    className="ttrpg-segment"
                                    aria-pressed={snap === choice.steps}
                                    aria-label={choice.title}
                                    title={choice.title}
                                    onClick={() => onSnap(choice.steps)}
                                >
                                    {choice.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="ttrpg-settings__hint">
                        Hold <kbd>Alt</kbd>: no snap
                    </p>
                </>
            )}
        </section>
    );
}
