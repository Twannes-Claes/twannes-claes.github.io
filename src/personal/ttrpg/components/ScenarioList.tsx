import {
    faCopy,
    faFileImport,
    faImage,
    faPen,
    faPlus,
    faTrashCan,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type ChangeEvent } from 'react';

import type { Scenario } from '../types';

import { confirmAction } from '../services/confirm';

interface ScenarioListProps
{
    scenarios: Scenario[];
    activeId: string;
    onSelect: (id: string) => void;
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
}

/**
 * The scenarios of the session on the right, one battle map each: a dropdown to open one, with
 * rename, duplicate and delete for the open one beside it, then its background. Rename swaps the
 * dropdown for the name, saved on Enter or a click away, and Esc keeps the old one. The last map
 * cannot be deleted.
 * Below, new maps: blank, imported from Dungeondraft or Dungeon Alchemist, or from a picture.
 */
export function ScenarioList({
    scenarios,
    activeId,
    onSelect,
    onRename,
    onDuplicate,
    onDelete,
    onNew,
    onImport,
    onPicture,
    onBackground,
    onRemoveBackground,
}: ScenarioListProps)
{
    const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
    const [renaming, setRenaming] = useState(false);

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
            <h2>Map</h2>

            {/* The open map in one row: pick another, or rename, duplicate or delete this one. */}
            <div className="ttrpg-scenarios__name">
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
                    <select aria-label="Open map" value={active.id} onChange={(event) => onSelect(event.target.value)}>
                        {scenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                                {scenario.name}
                            </option>
                        ))}
                    </select>
                )}
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
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
                    className="ttrpg-icon-button ttrpg-icon-button--small"
                    aria-label="Duplicate"
                    title="Duplicate"
                    onClick={() => onDuplicate(active.id)}
                >
                    <FontAwesomeIcon icon={faCopy} />
                </button>
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
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
                    title="A picture behind this map. The map takes its size; walls and props stay where they are."
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

            <div className="ttrpg-scenarios__add">
                <button type="button" className="ttrpg-segment" title="A new blank map" onClick={onNew}>
                    <FontAwesomeIcon icon={faPlus} />
                    New
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
                    From picture
                    <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        className="ttrpg-hidden-input"
                        onChange={picked(onPicture)}
                    />
                </label>
            </div>
        </aside>
    );
}
