import { faBookOpen, faCheck, faEye, faEyeSlash, faSkull, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useActionState, useState } from 'react';

import type { MonsterControls, Token } from '../types';

import { unhurried } from '../services/busy';

import { ConditionPicker } from './ConditionPicker';
import { Spinner } from './Feedback';
import { Popover } from './Popover';
import { RowEditor } from './RowEditor';
import { useOpenRow } from './useOpenRow';
import { StatBlock } from './StatBlock';
import { StatChips, StatsForm } from './StatsForm';

interface MonstersProps
{
    controls: MonsterControls;
    /** The monsters on the open map, whether the session runs or not. */
    monsters: Token[];
    onClose: () => void;
    /** Takes one off the map, after asking. */
    onRemove: (monster: Token) => void;
    onError: (message: string) => void;
}

/** A monster's name, ring and whether it goes down at 0, to change under its row. */
export function DetailsForm({ monster, onSave }: { monster: Token; onSave: (details: { name: string; color: string; downs: boolean }) => Promise<void> })
{
    const [downs, setDowns] = useState(monster.downs === true);
    const [failure, save, saving] = useActionState(
        (_: string, form: FormData) =>
            unhurried(onSave({ name: String(form.get('name')), color: String(form.get('color')), downs }))
                .then(() => '')
                .catch((reason: Error) => reason.message),
        '',
    );

    return (
        <form key={`${monster.name} ${monster.color}`} action={save} className="ttrpg-stats-form ttrpg-settings">
            <label>
                Name
                <input name="name" maxLength={30} autoComplete="off" defaultValue={monster.name} required />
            </label>
            <label>
                Ring
                <input name="color" type="color" defaultValue={monster.color} />
            </label>
            <div className="ttrpg-settings__group" role="group" aria-label="At 0 HP">
                At 0 HP
                <div className="ttrpg-settings__choices">
                    <button type="button" className="ttrpg-segment" aria-pressed={!downs} onClick={() => setDowns(false)}>
                        Dies
                    </button>
                    <button type="button" className="ttrpg-segment" aria-pressed={downs} onClick={() => setDowns(true)}>
                        <FontAwesomeIcon icon={faSkull} />
                        Goes down
                    </button>
                </div>
            </div>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={saving}>
                {saving ? <Spinner /> : <FontAwesomeIcon icon={faCheck} />}
                {saving ? 'Saving' : 'Save'}
            </button>
        </form>
    );
}

interface MonsterListProps
{
    controls: MonsterControls;
    /** The monsters on the open map, whether the session runs or not. */
    monsters: Token[];
    /** Takes one off the map, after asking. */
    onRemove: (monster: Token) => void;
    onError: (message: string) => void;
    /** Where an open stat block sits: beside the Edit panel, or in the top left over the map. */
    statBlockClass?: string;
}

/**
 * The monsters on the open map, in the GM view's Monsters panel and under the presets in Edit.
 * A row shows the name, the numbers and whether players see it; a click opens it underneath, with
 * its numbers, conditions and details to change, and its stat block.
 */
export function MonsterList({ controls, monsters, onRemove, onError, statBlockClass = 'ttrpg-statblock-panel' }: MonsterListProps)
{
    // The one monster opened under its row, and the one folding away.
    const rows = useOpenRow();
    // The preset whose stat block is open beside the panel.
    const [reading, setReading] = useState<string | null>(null);
    const read = controls.presets.find((preset) => preset.id === reading);


    return (
        <>
            <ul className="ttrpg-rows">
                {monsters.map((monster) => (
                    <li key={monster.id} className={`ttrpg-row${rows.open === monster.id ? ' ttrpg-row--open' : ''}`}>
                        <button
                            type="button"
                            className="ttrpg-row__main ttrpg-row__main--swatch"
                            aria-expanded={rows.open === monster.id}
                            onClick={() => rows.toggle(monster.id)}
                        >
                            <span className="ttrpg-swatch" style={{ background: monster.color }} />
                            {/* The name, with the numbers under it. */}
                            <span className="ttrpg-row__text">
                                <span className="ttrpg-row__name">{monster.name}</span>
                                <StatChips token={monster} />
                            </span>
                        </button>
                        {controls.presets.some((preset) => preset.id === monster.presetId) && (
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label={`Stat block of ${monster.name}`}
                                aria-pressed={reading === monster.presetId}
                                title="Stat block"
                                onClick={() => setReading(reading === monster.presetId ? null : (monster.presetId ?? null))}
                            >
                                <FontAwesomeIcon icon={faBookOpen} />
                            </button>
                        )}
                        <button
                            type="button"
                            className="ttrpg-icon-button ttrpg-icon-button--small"
                            aria-label={monster.hidden ? `Show ${monster.name}` : `Hide ${monster.name}`}
                            aria-pressed={monster.hidden === true}
                            title={monster.hidden ? 'Show to the players' : 'Hide from the players'}
                            onClick={() => controls.hide(monster.id, !monster.hidden).catch((reason: Error) => onError(reason.message))}
                        >
                            <FontAwesomeIcon icon={monster.hidden ? faEyeSlash : faEye} />
                        </button>
                        <button
                            type="button"
                            className="ttrpg-icon-button ttrpg-icon-button--small"
                            aria-label={`Remove ${monster.name}`}
                            title="Remove"
                            onClick={() => onRemove(monster)}
                        >
                            <FontAwesomeIcon icon={faTrash} />
                        </button>
                        {(rows.open === monster.id || rows.closing === monster.id) && (
                            <RowEditor
                                closing={rows.open !== monster.id}
                                onClosed={rows.folded}
                                tabs={[
                                    { id: 'numbers', label: 'Numbers', content: <StatsForm token={monster} onSave={(next) => controls.setStats(monster.id, next)} /> },
                                    {
                                        id: 'conditions',
                                        label: 'Conditions',
                                        scrolls: true,
                                        content: (
                                            <ConditionPicker
                                                system={controls.system}
                                                conditions={monster.conditions ?? []}
                                                onChange={(conditions) => controls.setConditions(monster.id, conditions)}
                                            />
                                        ),
                                    },
                                    { id: 'details', label: 'Details', content: <DetailsForm monster={monster} onSave={(details) => controls.setMonster(monster.id, details)} /> },
                                ]}
                            />
                        )}
                    </li>
                ))}
            </ul>

            {read && (
                <Popover title="Stat block" className={statBlockClass} onClose={() => setReading(null)}>
                    <div className="ttrpg-popover__body">
                        <StatBlock markdown={read.markdown} />
                    </div>
                </Popover>
            )}
        </>
    );
}

/**
 * The monsters and NPCs on the open map, from the play dock in the GM view, whether the session
 * runs or not, see MonsterList. They come onto the map from the presets in Edit, see
 * PresetLibrary.tsx.
 */
export function Monsters({ controls, monsters, onClose, onRemove, onError }: MonstersProps)
{
    return (
        <Popover title="Monsters" className="ttrpg-dock-panel" onClose={onClose}>
            <div className="ttrpg-popover__body">
                {monsters.length === 0 ? (
                    <p className="ttrpg-empty">No monsters on this map. Drag one on from the Monsters tool in Edit.</p>
                ) : (
                    <MonsterList controls={controls} monsters={monsters} onRemove={onRemove} onError={onError} />
                )}
            </div>
        </Popover>
    );
}
