import {
    faArrowPointer,
    faBorderAll,
    faDrawPolygon,
    faEraser,
    faLocationDot,
    faRotateLeft,
    faRotateRight,
    faTree,
    type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { ToolId } from '../map/tools';

import { typing, useKeydown } from './useKeys';

/** The edit tools, with the key that picks each one. Space also picks Move around, see ToolRail. */
const tools: { id: ToolId; label: string; key: string; icon: IconDefinition }[] = [
    { id: 'select', label: 'Move around', key: 'v', icon: faArrowPointer },
    { id: 'walls', label: 'Walls and doors', key: 'w', icon: faDrawPolygon },
    { id: 'erase', label: 'Erase walls', key: 'e', icon: faEraser },
    { id: 'props', label: 'Props', key: 'p', icon: faTree },
    { id: 'spawn', label: 'Spawn point', key: 's', icon: faLocationDot },
    { id: 'align', label: 'Grid', key: 'g', icon: faBorderAll },
];

interface ToolRailProps
{
    tool: ToolId;
    onTool: (tool: ToolId) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

/** The slim column of edit tools on the left, with undo and redo as one stacked control below. */
export function ToolRail({ tool, onTool, canUndo, canRedo, onUndo, onRedo }: ToolRailProps)
{
    // A plain letter picks a tool, and Space Move around, unless it is typed into a field or held
    // with Ctrl or Cmd.
    useKeydown((event) =>
    {
        if (event.ctrlKey || event.metaKey || event.altKey || typing(event))
            return;

        // Not passed on, or Space would also press the button that has focus.
        if (event.key === ' ')
        {
            event.preventDefault();
            onTool('select');

            return;
        }

        const picked = tools.find((entry) => entry.key === event.key.toLowerCase());

        if (picked)
            onTool(picked.id);

    });

    return (
        <nav className="ttrpg-panel ttrpg-rail" aria-label="Tools">
            {tools.map((entry) => (
                <button
                    key={entry.id}
                    type="button"
                    className="ttrpg-icon-button"
                    aria-pressed={tool === entry.id}
                    aria-label={entry.label}
                    title={`${entry.label} (${entry.id === 'select' ? 'V or Space' : entry.key.toUpperCase()})`}
                    onClick={() => onTool(entry.id)}
                >
                    <FontAwesomeIcon icon={entry.icon} />
                </button>
            ))}

            <span className="ttrpg-rail__gap" />

            <div className="ttrpg-rail__history" role="group" aria-label="History">
                <button
                    type="button"
                    className="ttrpg-icon-button"
                    aria-label="Undo"
                    title="Undo (Ctrl+Z)"
                    disabled={!canUndo}
                    onClick={onUndo}
                >
                    <FontAwesomeIcon icon={faRotateLeft} />
                </button>
                <button
                    type="button"
                    className="ttrpg-icon-button"
                    aria-label="Redo"
                    title="Redo (Ctrl+Y)"
                    disabled={!canRedo}
                    onClick={onRedo}
                >
                    <FontAwesomeIcon icon={faRotateRight} />
                </button>
            </div>
        </nav>
    );
}
