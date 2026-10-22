import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef, useState } from 'react';

import type { Condition, GameSystem } from '../types';

import { cleanConditions, conditionsOf, type ConditionKind } from '../content/conditions';

interface ConditionPickerProps
{
    system: GameSystem;
    conditions: Condition[];
    /** Fails with the message to show, see friendly in SessionEditor.tsx. */
    onChange: (conditions: Condition[]) => Promise<void>;
}

/**
 * A token's conditions to turn on and off, the session's system's list, saved on each press. One
 * with levels, like Exhaustion, gets a minus and a plus once it is on; the minus at 1 takes it off.
 */
export function ConditionPicker({ system, conditions, onChange }: ConditionPickerProps)
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

    const toggle = (kind: ConditionKind) =>
        change(current.some((condition) => condition.id === kind.id) ? current.filter((condition) => condition.id !== kind.id) : [...current, { id: kind.id }]);

    const setValue = (kind: ConditionKind, value: number) =>
        change(current.map((condition) => (condition.id === kind.id ? { ...condition, value } : condition)));

    return (
        <div className="ttrpg-conditions" role="group" aria-label="Conditions">
            {conditionsOf(system).map((kind) =>
            {
                const on = current.find((condition) => condition.id === kind.id);
                const value = on?.value ?? 1;

                return (
                    <div key={kind.id} className="ttrpg-condition">
                        <button type="button" className="ttrpg-segment" aria-pressed={Boolean(on)} onClick={() => toggle(kind)}>
                            <FontAwesomeIcon icon={kind.icon} />
                            {kind.name}
                        </button>
                        {on && kind.max !== undefined && (
                            <span className="ttrpg-condition__value">
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={value > 1 ? `Lower ${kind.name}` : `Take off ${kind.name}`}
                                    onClick={() => (value > 1 ? setValue(kind, value - 1) : toggle(kind))}
                                >
                                    <FontAwesomeIcon icon={faMinus} />
                                </button>
                                <span className="ttrpg-condition__number">{value}</span>
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={`Raise ${kind.name}`}
                                    disabled={value >= kind.max}
                                    onClick={() => setValue(kind, value + 1)}
                                >
                                    <FontAwesomeIcon icon={faPlus} />
                                </button>
                            </span>
                        )}
                    </div>
                );
            })}
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
        </div>
    );
}
