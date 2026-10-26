import { faEraser, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef, useState } from 'react';

import type { Condition, GameSystem } from '../types';

import { cleanConditions, conditionsOf, type ConditionKind } from '../content/conditions';

interface ConditionPickerProps
{
    system: GameSystem;
    conditions: Condition[];
    /** A player at 0 HP, who gets death saves, or Dying in Pathfinder. */
    down?: boolean;
    /** Whether the Death saves block shows, off for a player while the GM keeps them secret. */
    saves?: boolean;
    /** Fails with the message to show, see friendly in SessionEditor.tsx. */
    onChange: (conditions: Condition[]) => Promise<void>;
}

/**
 * A token's conditions to turn on and off, the session's system's list, saved on each press. One
 * with levels, like Exhaustion, gets a minus and a plus once it is on; the minus at 1 takes it off.
 * Death saves, and Pathfinder's Dying and Wounded, come first in a block of their own.
 */
export function ConditionPicker({ system, conditions, down = false, saves = true, onChange }: ConditionPickerProps)
{
    // What was pressed, shown until every save of it is back, so quick presses build on each other.
    const [held, setHeld] = useState<Condition[] | null>(null);
    const saving = useRef(0);
    const [failure, setFailure] = useState('');
    const current = held ?? conditions;

    const change = (next: Condition[]) =>
    {
        const clean = cleanConditions(system, next);

        setHeld(clean);
        setFailure('');
        saving.current++;
        onChange(clean)
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() =>
            {
                saving.current--;

                if (saving.current === 0)
                    setHeld(null);

            });
    };

    const valueOf = (kind: ConditionKind) => current.find((condition) => condition.id === kind.id)?.value ?? (current.some((condition) => condition.id === kind.id) ? 1 : 0);

    // 0 takes it off.
    const setTo = (kind: ConditionKind, value: number) =>
        change([...current.filter((condition) => condition.id !== kind.id), ...(value > 0 ? [{ id: kind.id, value }] : [])]);

    const kinds = conditionsOf(system);
    // While up, only the ones still on, like Wounded, to take off.
    const saveKinds = saves ? kinds.filter((kind) => kind.save && (down || valueOf(kind) > 0)) : [];
    const plain = kinds.filter((kind) => !kind.save);

    const stepper = (kind: ConditionKind, value: number, max: number) => (
        <span className="ttrpg-condition__value">
            <button
                type="button"
                className="ttrpg-icon-button ttrpg-icon-button--small"
                aria-label={value > 1 ? `Lower ${kind.name}` : `Take off ${kind.name}`}
                disabled={value === 0}
                onClick={() => setTo(kind, value - 1)}
            >
                <FontAwesomeIcon icon={faMinus} />
            </button>
            <span className="ttrpg-condition__number">{value}</span>
            <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label={`Raise ${kind.name}`} disabled={value >= max} onClick={() => setTo(kind, value + 1)}>
                <FontAwesomeIcon icon={faPlus} />
            </button>
        </span>
    );

    // A death save or Dying as a row of pips, one a mark, the last one lit taking it back when
    // pressed. Wounded, with more levels, gets a minus and a plus.
    const saveRow = (kind: ConditionKind) =>
    {
        const value = valueOf(kind);
        const max = kind.max ?? 1;

        return (
            <div key={kind.id} className={`ttrpg-save ttrpg-save--${kind.id}`}>
                <span className="ttrpg-save__name">
                    <FontAwesomeIcon icon={kind.icon} />
                    {kind.full && value === max ? <span className="ttrpg-save__result">{kind.full}</span> : (kind.short ?? kind.name)}
                </span>
                {max <= 5 ? (
                    <span className="ttrpg-pips">
                        {Array.from({ length: max }, (_, index) => (
                            <button
                                key={index}
                                type="button"
                                className="ttrpg-pip"
                                aria-label={`${kind.name} ${index + 1}`}
                                aria-pressed={index < value}
                                onClick={() => setTo(kind, index + 1 === value ? index : index + 1)}
                            />
                        ))}
                    </span>
                ) : (
                    stepper(kind, value, max)
                )}
            </div>
        );
    };

    const row = (kind: ConditionKind) =>
    {
        const value = valueOf(kind);

        return (
            <div key={kind.id} className={kind.max ? 'ttrpg-condition ttrpg-condition--levels' : 'ttrpg-condition'}>
                <button type="button" className="ttrpg-segment" aria-pressed={value > 0} onClick={() => setTo(kind, value > 0 ? 0 : 1)}>
                    <FontAwesomeIcon icon={kind.icon} />
                    {kind.name}
                </button>
                {value > 0 && kind.max !== undefined && stepper(kind, value, kind.max)}
            </div>
        );
    };

    return (
        <div className="ttrpg-conditions" role="group" aria-label="Conditions">
            {saveKinds.length > 0 && (
                <section className="ttrpg-saves" aria-label="Death saves">
                    <h4 className="ttrpg-subhead">Death saves</h4>
                    {saveKinds.map(saveRow)}
                </section>
            )}
            <div className="ttrpg-subhead ttrpg-subhead--row">
                <h4>Conditions</h4>
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
                    aria-label="Clear conditions"
                    title="Take off every condition"
                    disabled={!plain.some((kind) => valueOf(kind) > 0)}
                    onClick={() => change(current.filter((condition) => !plain.some((kind) => kind.id === condition.id)))}
                >
                    <FontAwesomeIcon icon={faEraser} />
                </button>
            </div>
            {plain.map(row)}
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
        </div>
    );
}
