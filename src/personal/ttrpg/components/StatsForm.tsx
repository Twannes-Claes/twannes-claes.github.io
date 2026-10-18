import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useActionState } from 'react';

import type { Stats, Token } from '../types';

import { Spinner } from './Feedback';

interface StatsFormProps
{
    token: Token;
    /** Fails with the message to show, see friendly in SessionEditor.tsx. */
    onSave: (stats: Stats) => Promise<void>;
}

/**
 * A token's numbers to change: the game master's for any token, a player's for their own. A
 * token without numbers starts empty and gets them on saving.
 */
export function StatsForm({ token, onSave }: StatsFormProps)
{
    const [failure, save, saving] = useActionState((_: string, form: FormData) =>
    {
        const number = (field: string) => Number(form.get(field));
        const maxHp = number('maxHp');

        return onSave({
            // An empty HP field means full health, the usual reason to leave it.
            hp: form.get('hp') === '' ? maxHp : number('hp'),
            maxHp,
            tempHp: number('tempHp'),
            ac: number('ac'),
            perception: number('perception'),
        })
            .then(() => '')
            .catch((reason: Error) => reason.message);
    }, '');

    return (
        // Keyed on the numbers, so a change from elsewhere, like a hit, fills the fields anew.
        <form
            key={[token.hp, token.maxHp, token.tempHp, token.ac, token.perception].join()}
            action={save}
            className="ttrpg-stats-form"
        >
            <div className="ttrpg-fields">
                <label className="ttrpg-field">
                    HP
                    <input name="hp" type="number" inputMode="numeric" min={0} max={9999} defaultValue={token.hp} />
                </label>
                <label className="ttrpg-field">
                    Max HP
                    <input name="maxHp" type="number" inputMode="numeric" min={1} max={9999} defaultValue={token.maxHp} required />
                </label>
                <label className="ttrpg-field">
                    Temp HP
                    <input name="tempHp" type="number" inputMode="numeric" min={0} max={999} defaultValue={token.tempHp ?? 0} />
                </label>
                <label className="ttrpg-field">
                    AC
                    <input name="ac" type="number" inputMode="numeric" min={0} max={50} defaultValue={token.ac ?? 10} />
                </label>
                <label className="ttrpg-field" title="Passive Perception">
                    Perception
                    <input name="perception" type="number" inputMode="numeric" min={0} max={50} defaultValue={token.perception ?? 10} />
                </label>
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
