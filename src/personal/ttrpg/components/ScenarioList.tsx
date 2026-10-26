import {
    faChevronDown,
    faCopy,
    faFileImport,
    faImage,
    faPen,
    faPlus,
    faTrashCan,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, useSyncExternalStore, type ChangeEvent } from 'react';

import type { Scenario } from '../types';

import { defaultOutside, outsideColours } from '../map/colours';
import { confirmAction } from '../services/confirm';
import { fileSize } from '../services/images';

import { RingPicker } from './RingPicker';

interface ScenarioListProps
{
    scenarios: Scenario[];
    activeId: string;
    onSelect: (id: string) => void;
    /** Puts the map at index in the list, the order the session keeps. */
    onMove: (id: string, index: number) => void;
    onRename: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onNew: () => void;
    onImport: (file: File) => void;
    /** A new map from a plain picture. */
    onPicture: (file: File) => void;
    /** A picture behind the open map, or a new one in place of its old one. */
    onBackground: (file: File) => void;
    /** Takes the open map's picture away; the map keeps its size. */
    onRemoveBackground: () => void;
    /** The colour around the open map, on every screen. */
    onOutside: (colour: string) => void;
    /** The open map's picture's file size, for the tip of its button. Missing when unknown. */
    backgroundBytes?: number;
}

/** Where the map panel remembers being folded, in this browser only. */
const foldedKey = 'ttrpg-map-folded';

function readFolded(): boolean
{
    try
    {
        return localStorage.getItem(foldedKey) === 'yes';
    }
    catch
    {
        // Blocked storage: the panel opens unfolded, as it would the first time.
        return false;
    }
}

function fold(folded: boolean)
{
    try
    {
        localStorage.setItem(foldedKey, folded ? 'yes' : 'no');
    }
    catch
    {
        // Blocked storage: the fold still holds until the page reloads.
    }
}

/**
 * Nothing to subscribe to: the details element keeps its own open state, and a later render reads
 * back the fold it just saved, so the open prop always agrees with it.
 */
const noChange = () => () => undefined;

/**
 * The scenarios of the session in the top right corner, one battle map each: a list to open one,
 * dragged or moved with Alt+Up and Alt+Down to reorder, rename, duplicate and delete for the open one under it, then its background. Rename swaps
 * the dropdown for the name, saved on Enter or a click away, and Esc keeps the old one. The last
 * map cannot be deleted. Below, new maps: blank, imported from Dungeondraft or Dungeon Alchemist,
 * or from a picture. The title folds it to the open map's name, remembered in this browser.
 */
export function ScenarioList({
    scenarios,
    activeId,
    onSelect,
    onMove,
    onRename,
    onDuplicate,
    onDelete,
    onNew,
    onImport,
    onPicture,
    onBackground,
    onRemoveBackground,
    onOutside,
    backgroundBytes,
}: ScenarioListProps)
{
    const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
    const [renaming, setRenaming] = useState(false);
    // The map being dragged and the row it hovers, which shows where it lands.
    const [dragged, setDragged] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const folded = useSyncExternalStore(noChange, readFolded, () => false);

    const picked = (handle: (file: File) => void) => (event: ChangeEvent<HTMLInputElement>) =>
    {
        const file = event.target.files?.[0];

        if (file)
            handle(file);

        // Cleared, so picking the same file again still imports it.
        event.target.value = '';
    };

    return (
        <aside className="ttrpg-panel ttrpg-scenarios" aria-label="Scenarios">
            {/* Folds to its title and the open map's name, to give the map more room. */}
            <details open={!folded} onToggle={(event) => fold(!event.currentTarget.open)}>
                <summary>
                    <h2>Map</h2>
                    <span className="ttrpg-scenarios__current">{active.name}</span>
                    <FontAwesomeIcon icon={faChevronDown} className="ttrpg-scenarios__chevron" />
                </summary>
                <div className="ttrpg-settings ttrpg-scenarios__body">

                    {/* The open map, or its name while renaming, then what can be done to it, like the grid's
                choices in GridPanel.tsx. */}
                    {renaming ? (
                        <input
                            defaultValue={active.name}
                            aria-label="Map name"
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={(event) =>
                            {
                                const name = event.target.value.trim();

                                if (name && name !== active.name)
                                    onRename(active.id, name);

                                setRenaming(false);
                            }}
                            onKeyDown={(event) =>
                            {
                                if (event.key === 'Enter')
                                    event.currentTarget.blur();

                                // Back to the old name: set it before the blur saves the field.
                                if (event.key === 'Escape')
                                {
                                    event.currentTarget.value = active.name;
                                    event.currentTarget.blur();
                                }
                            }}
                        />
                    ) : (
                        <ol className="ttrpg-scenarios__maps" aria-label="Maps">
                            {scenarios.map((scenario, index) => (
                                <li key={scenario.id}>
                                    <button
                                        type="button"
                                        aria-current={scenario.id === active.id}
                                        data-over={over === scenario.id && dragged !== scenario.id ? true : undefined}
                                        title="Open, or drag to reorder"
                                        draggable
                                        onClick={() => onSelect(scenario.id)}
                                        onKeyDown={(event) =>
                                        {
                                            const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;

                                            if (!event.altKey || !step || !scenarios[index + step])
                                                return;

                                            event.preventDefault();
                                            onMove(scenario.id, index + step);
                                        }}
                                        onDragStart={(event) =>
                                        {
                                            event.dataTransfer.effectAllowed = 'move';
                                            setDragged(scenario.id);
                                        }}
                                        onDragEnd={() =>
                                        {
                                            setDragged(null);
                                            setOver(null);
                                        }}
                                        onDragOver={(event) =>
                                        {
                                            if (!dragged)
                                                return;

                                            event.preventDefault();
                                            setOver(scenario.id);
                                        }}
                                        onDrop={(event) =>
                                        {
                                            if (!dragged)
                                                return;

                                            // Not a file for the editor to open, see dropped in MapEditor.tsx.
                                            event.preventDefault();
                                            event.stopPropagation();

                                            if (dragged !== scenario.id)
                                                onMove(dragged, index);

                                        }}
                                    >
                                        {scenario.name}
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                    <div className="ttrpg-settings__choices" role="group" aria-label="This map">
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-label="Rename"
                            aria-pressed={renaming}
                            title="Rename"
                            // The field keeps focus on the press; the click then saves it by letting go of it,
                            // as a click away would, rather than closing it unsaved.
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() =>
                            {
                                if (!renaming)
                                    setRenaming(true);
                                else if (document.activeElement instanceof HTMLInputElement)
                                    document.activeElement.blur();

                            }}
                        >
                            <FontAwesomeIcon icon={faPen} />
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-label="Duplicate"
                            title="Duplicate"
                            onClick={() => onDuplicate(active.id)}
                        >
                            <FontAwesomeIcon icon={faCopy} />
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-label="Delete"
                            title="Delete"
                            disabled={scenarios.length === 1}
                            onClick={() =>
                                void confirmAction(`Delete ${active.name}? Its walls, props and fog go with it.`, 'Delete').then(
                                    (yes) => yes && onDelete(active.id),
                                )}
                        >
                            <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                    </div>

                    <div className="ttrpg-scenarios__background">
                        <label
                            className="ttrpg-segment"
                            title={backgroundBytes === undefined ? 'A picture behind this map' : `This map's picture, ${fileSize(backgroundBytes)}`}
                        >
                            <FontAwesomeIcon icon={faImage} />
                            {active.background ? 'Change background' : 'Add background'}
                            <input
                                type="file"
                                accept="image/png,image/webp,image/jpeg"
                                className="ttrpg-hidden-input"
                                onChange={picked(onBackground)}
                            />
                        </label>
                        {active.background && (
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label="Remove background"
                                title="Remove background"
                                onClick={onRemoveBackground}
                            >
                                <FontAwesomeIcon icon={faXmark} />
                            </button>
                        )}
                    </div>

                    <h3 className="ttrpg-subhead">Around the map</h3>
                    <RingPicker value={active.outside ?? defaultOutside} onChange={onOutside} label="Around the map" colours={outsideColours} />

                    <h3 className="ttrpg-subhead">New map</h3>
                    <div className="ttrpg-settings__choices">
                        <button type="button" className="ttrpg-segment" title="A new blank map" onClick={onNew}>
                            <FontAwesomeIcon icon={faPlus} />
                            Blank
                        </button>
                        <label className="ttrpg-segment" title="A new map from Dungeondraft or Dungeon Alchemist">
                            <FontAwesomeIcon icon={faFileImport} />
                            Import
                            <input
                                type="file"
                                accept=".dd2vtt,.uvtt,.json"
                                className="ttrpg-hidden-input"
                                onChange={picked(onImport)}
                            />
                        </label>
                        <label className="ttrpg-segment" title="A new map from a picture">
                            <FontAwesomeIcon icon={faImage} />
                            Picture
                            <input
                                type="file"
                                accept="image/png,image/webp,image/jpeg"
                                className="ttrpg-hidden-input"
                                onChange={picked(onPicture)}
                            />
                        </label>
                    </div>
                </div>
            </details>
        </aside>
    );
}
