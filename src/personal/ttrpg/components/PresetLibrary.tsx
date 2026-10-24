import { faFileImport, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef, useState, type ChangeEvent, type ReactNode, type WheelEvent } from 'react';

import type { GameSystem, Preset, Token } from '../types';

import { statBlockTemplates, statsOf } from '../content/statBlocks';

import { carry, readyCarry } from './carry';
import { presetDragType } from './MapCanvas';
import { PresetDialog, PresetFace } from './PresetDialog';

/** As long as convex/presets.ts keeps. */
const maxMarkdown = 20_000;

/** The ring a new preset starts with, the monsters' red. */
const monsterRed = '#b4443c';

interface PresetLibraryProps
{
    presets: Preset[];
    /** For the template a new preset starts from. */
    system: GameSystem;
    /** The monsters already on the open map. */
    monsters: Token[];
    /** Adds a preset, or with an id changes that one. Fails with the message to show. */
    onSave: (preset: Omit<Preset, 'id' | 'avatar'>, picture: Blob | null, id?: string) => Promise<string>;
    onRemove: (preset: Preset) => Promise<void>;
    /** Their rows, see MonsterList in Monsters.tsx. */
    children: ReactNode;
    onDone: (message: string) => void;
    onError: (message: string) => void;
}

/**
 * The game master's monster presets, with the Monsters tool in Edit: every monster comes onto a
 * map from one, dragged from its tile, see Monster presets in PLAN.md. A tile opens its stat block
 * to change; New starts from the template of the session's system, and .md files each become one.
 * The monsters already on the open map are listed under it.
 */
export function PresetLibrary({ presets, system, monsters, onSave, onRemove, onDone, onError, children }: PresetLibraryProps)
{
    const [writing, setWriting] = useState<Preset | Omit<Preset, 'id'> | null>(null);
    const list = useRef<HTMLDivElement>(null);

    // The presets and the heading stay put, so a wheel over them scrolls the monsters under them,
    // as the whole panel would. Over presets with more to show, those scroll first.
    const wheel = (event: WheelEvent) =>
    {
        const target = event.target instanceof Element ? event.target : null;
        const library = target?.closest('.ttrpg-library');
        const more = library && (event.deltaY > 0 ? library.scrollTop + library.clientHeight < library.scrollHeight - 1 : library.scrollTop > 0);

        if (!list.current || !target || list.current.contains(target) || more)
            return;

        list.current.scrollBy({ top: event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY });
    };

    // Each .md file picked becomes a preset, named by its # heading or else by the file.
    const upload = (event: ChangeEvent<HTMLInputElement>) =>
    {
        const files = [...(event.target.files ?? [])];

        // Cleared, so picking the same file again still adds it.
        event.target.value = '';
        Promise.all(
            files.map(async (file) =>
            {
                const markdown = await file.text();

                if (markdown.length > maxMarkdown)
                    throw new Error(`${file.name} is too long for a stat block.`);

                const name = statsOf(markdown).name || file.name.replace(/\.\w+$/, '');

                return onSave({ name, markdown, downs: false, color: monsterRed }, null);
            }),
        )
            .then(() => onDone(files.length === 1 ? 'The preset is in your library.' : `${files.length} presets are in your library.`))
            .catch((reason: Error) => onError(reason.message));
    };

    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings ttrpg-presets" aria-label="Monsters" onWheel={wheel}>
            <h2>Monsters</h2>

            {/* The presets stay put, so a long list of monsters under them never pushes them away. */}
            <div className="ttrpg-presets__top">
                {presets.length === 0 ? (
                    <p className="ttrpg-empty">Make a preset to drag monsters onto the map.</p>
                ) : (
                    <ul className="ttrpg-library ttrpg-library--presets">
                        {presets.map((preset) => (
                            <li key={preset.id}>
                                <button
                                    type="button"
                                    className="ttrpg-library__item ttrpg-preset-tile"
                                    title={`${preset.name}: drag onto the map, or click to edit`}
                                    draggable
                                    onPointerEnter={readyCarry}
                                    onDragStart={(event) =>
                                    {
                                        event.dataTransfer.setData(presetDragType, preset.id);
                                        event.dataTransfer.effectAllowed = 'copy';
                                        carry(event, { ...preset, size: statsOf(preset.markdown).size ?? 'medium' });
                                    }}
                                    onDragEnd={() => carry(null, null)}
                                    onClick={() => setWriting(preset)}
                                >
                                    <PresetFace preset={preset} />
                                    <span className="ttrpg-preset-tile__name">{preset.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="ttrpg-settings__pair">
                    <button
                        type="button"
                        className="ttrpg-segment"
                        onClick={() => setWriting({ name: '', markdown: statBlockTemplates[system], downs: false, color: monsterRed })}
                    >
                        <FontAwesomeIcon icon={faPlus} />
                        New preset
                    </button>
                    <label className="ttrpg-segment">
                        <FontAwesomeIcon icon={faFileImport} />
                        Upload .md
                        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple className="ttrpg-hidden-input" onChange={upload} />
                    </label>
                </div>
            </div>

            {monsters.length > 0 && <h3 className="ttrpg-subhead ttrpg-presets__head">{`On this map · ${monsters.length}`}</h3>}

            <div ref={list} className="ttrpg-popover__scroll">
                {monsters.length > 0 && children}

                <ul className="ttrpg-keys" aria-label="Keys">
                    <li>Drag a preset onto the map, or onto the tray to keep it ready. It starts hidden.</li>
                </ul>
            </div>

            {writing && (
                <PresetDialog
                    preset={writing}
                    onSave={(preset, picture) => onSave(preset, picture, 'id' in writing ? writing.id : undefined).then(() => undefined)}
                    onRemove={'id' in writing ? () => onRemove(writing) : undefined}
                    onClose={() => setWriting(null)}
                />
            )}
        </section>
    );
}
