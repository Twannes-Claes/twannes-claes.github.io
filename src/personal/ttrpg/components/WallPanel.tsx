import { faDoorClosed, faDrawPolygon, faRotate, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** What the walls tool does: draw walls, draw closed doors, or change the wall clicked. */
export type WallKind = 'wall' | 'door' | 'change';

const kinds: { id: WallKind; label: string; title: string; icon: IconDefinition }[] = [
    { id: 'wall', label: 'Wall', title: 'Click, click, click for a chain of walls', icon: faDrawPolygon },
    { id: 'door', label: 'Door', title: 'Click, click for a closed door', icon: faDoorClosed },
    {
        id: 'change',
        label: 'Change',
        title: 'Click a wall: it becomes a closed door, then an open door, then a wall again',
        icon: faRotate,
    },
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
 * The walls tool's settings: draw walls or doors, or turn a drawn wall into a door and back, and
 * how finely new walls snap to the grid. Alt still places freely.
 */
export function WallPanel({ kind, onKind, snap, onSnap }: WallPanelProps)
{
    return (
        <section className="ttrpg-panel ttrpg-properties" aria-label="Walls and doors">
            <h2>Walls and doors</h2>

            <div className="ttrpg-properties__choices">
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
                    <label>
                        Snap
                        <select value={snap} onChange={(event) => onSnap(Number(event.target.value))}>
                            <option value={1}>Grid corners</option>
                            <option value={2}>Half cell</option>
                            <option value={4}>Quarter cell</option>
                            <option value={8}>Eighth cell</option>
                            <option value={0}>Off</option>
                        </select>
                    </label>
                    <p className="ttrpg-properties__hint">Hold Alt to place a point anywhere.</p>
                </>
            )}
        </section>
    );
}
