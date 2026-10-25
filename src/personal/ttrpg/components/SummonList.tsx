import { faArrowRightFromBracket, faBandage, faArrowRightToBracket, faImage, faPen, faPlus, faRotateRight, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useActionState, useState } from 'react';

import type { Condition, CreatureSize, GameSystem, Token } from '../types';

import { conditionKind } from '../content/conditions';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { confirmAction } from '../services/confirm';
import { explain, uploadAvatar } from '../services/backend';
import { toAvatar } from '../services/images';

import { ConditionPicker } from './ConditionPicker';
import { SizePicker } from './SizePicker';

/** On the map, waiting off it, or fallen at 0 HP, which also waits off it. */
function stateOf(summon: Token): 'on' | 'off' | 'fallen'
{
    if (summon.hp === 0)
        return 'fallen';

    return summon.tray ? 'off' : 'on';
}

const stateNames = { on: 'On map', off: 'Off', fallen: 'Fallen' };

interface SummonListProps
{
    sessionId: Id<'sessions'>;
    system: GameSystem;
    onError: (text: string) => void;
}

/**
 * A player's summons and companions, in the phone's settings: call one onto the map beside them or
 * send it off, summon it again at full HP, change it as they level up, make a new one, or delete
 * one, see convex/summons.ts.
 */
export function SummonList({ sessionId, system, onError }: SummonListProps)
{
    const summons = useQuery(api.summons.mine, { sessionId });
    const add = useMutation(api.summons.add);
    const setOn = useMutation(api.summons.setOn);
    const removeSummon = useMutation(api.summons.remove);
    const resummon = useMutation(api.summons.resummon);
    const editSummon = useMutation(api.summons.edit);
    const saveConditions = useMutation(api.play.setConditions);
    const authToken = useAuthToken();
    const [adding, setAdding] = useState(false);
    // The summon whose name and numbers are being changed, as the player levels up.
    const [editing, setEditing] = useState<string | null>(null);
    // The companion whose conditions are open under its card.
    const [conditionsOf, setConditionsOf] = useState<string | null>(null);
    const [size, setSize] = useState<CreatureSize>('medium');
    const [pictureName, setPictureName] = useState('');

    const fail = (fallback: string) => (reason: unknown) => onError(explain(reason, fallback));

    const changeConditions = (id: string, conditions: Condition[]) =>
        saveConditions({ tokenId: id as Id<'tokens'>, conditions }).then(
            () => undefined,
            (reason: unknown) =>
            {
                throw new Error(explain(reason, 'That did not save. Check the connection and try again.'));
            },
        );

    // Asked first, as it heals it whole and moves it beside the player, wherever it was.
    const again = (id: string, name: string) =>
    {
        void confirmAction(`Summon ${name} again? It comes back beside you at full HP.`, 'Summon').then((yes) =>
            yes ? resummon({ tokenId: id as Id<'tokens'> }).catch(fail('That did not go through. Try again.')) : undefined,
        );
    };

    const remove = (id: string, name: string) =>
    {
        void confirmAction(`Delete ${name}?`, 'Delete').then((yes) =>
            yes ? removeSummon({ tokenId: id as Id<'tokens'> }).catch(fail('That did not go through. Try again.')) : undefined,
        );
    };

    // The picture is shrunk first, and goes up once the summon exists, like a player's on joining.
    const [failure, create, creating] = useActionState((_: string, form: FormData) =>
    {
        const picture = form.get('picture');
        const avatar = picture instanceof File && picture.size > 0 ? toAvatar(picture) : Promise.resolve(null);

        setPictureName('');

        return avatar.then(
            (blob) =>
                add({ sessionId, name: String(form.get('name')), size, maxHp: Number(form.get('maxHp')), ac: Number(form.get('ac')) })
                    .then(async (tokenId) =>
                    {
                        if (blob)
                            await uploadAvatar({ session: sessionId, token: tokenId }, blob, authToken);

                        setAdding(false);
                        setSize('medium');

                        return '';
                    })
                    .catch((reason: unknown) => explain(reason, 'That did not go through. Check the connection and try again.')),
            () => 'That picture could not be read. Pick another one, or add it without one.',
        );
    }, '');

    const [saveFailure, save, saving] = useActionState(
        (_: string, form: FormData) =>
            editSummon({ tokenId: editing as Id<'tokens'>, name: String(form.get('name')), maxHp: Number(form.get('maxHp')), ac: Number(form.get('ac')) })
                .then(() =>
                {
                    setEditing(null);

                    return '';
                })
                .catch((reason: unknown) => explain(reason, 'That did not save. Check the connection and try again.')),
        '',
    );

    if (!summons)
        return null;

    return (
        <section className="ttrpg-shortcuts" aria-label="Your companions">
            <h3 className="ttrpg-subhead">Companions</h3>
            {summons.length > 0 && (
                <ul className="ttrpg-summons">
                    {summons.map((summon) =>
                        editing === summon.id ? (
                            <li key={summon.id}>
                                <form action={save} className="ttrpg-check-form">
                                    <label className="ttrpg-field">
                                        Name
                                        <input name="name" maxLength={30} autoComplete="off" required autoFocus defaultValue={summon.name} />
                                    </label>
                                    <div className="ttrpg-fields">
                                        <label className="ttrpg-field">
                                            Max HP
                                            <input name="maxHp" type="number" inputMode="numeric" min={1} max={9999} required defaultValue={summon.maxHp} />
                                        </label>
                                        <label className="ttrpg-field">
                                            AC
                                            <input name="ac" type="number" inputMode="numeric" min={0} max={50} required defaultValue={summon.ac} />
                                        </label>
                                    </div>
                                    {saveFailure && <p className="ttrpg-error" role="alert">{saveFailure}</p>}
                                    <div className="ttrpg-popover__foot">
                                        <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => setEditing(null)}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={saving}>
                                            {saving ? 'Saving' : 'Save'}
                                        </button>
                                    </div>
                                </form>
                            </li>
                        ) : (
                            <li key={summon.id} className="ttrpg-summon">
                                <div className="ttrpg-summon__head">
                                    <span className="ttrpg-sheet__avatar" style={{ borderColor: summon.color }} aria-hidden="true">
                                        {summon.avatar ? <img src={summon.avatar} alt="" /> : summon.name.charAt(0)}
                                    </span>
                                    <span className="ttrpg-row__text">
                                        <span className="ttrpg-row__name">{summon.name}</span>
                                        <span className="ttrpg-row__detail">
                                            HP {summon.hp}/{summon.maxHp} · AC {summon.ac}
                                            {(summon.conditions ?? []).map((condition) => ` · ${conditionKind(condition.id)?.name ?? condition.id}${condition.value ? ` ${condition.value}` : ''}`).join('')}
                                        </span>
                                    </span>
                                    <span className={`ttrpg-summon__state ttrpg-summon__state--${stateOf(summon)}`}>{stateNames[stateOf(summon)]}</span>
                                </div>
                                <div className="ttrpg-summon__actions">
                                    {stateOf(summon) === 'fallen' ? (
                                        <button type="button" className="ttrpg-segment ttrpg-segment--confirm ttrpg-summon__wide" onClick={() => again(summon.id, summon.name)}>
                                            <FontAwesomeIcon icon={faRotateRight} />
                                            Summon again
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="ttrpg-segment"
                                                onClick={() => void setOn({ tokenId: summon.id as Id<'tokens'>, on: summon.tray === true }).catch(fail('That did not go through. Try again.'))}
                                            >
                                                <FontAwesomeIcon icon={summon.tray ? faArrowRightToBracket : faArrowRightFromBracket} />
                                                {summon.tray ? 'Call' : 'Send off'}
                                            </button>
                                            <button type="button" className="ttrpg-segment" onClick={() => again(summon.id, summon.name)}>
                                                <FontAwesomeIcon icon={faRotateRight} />
                                                Summon again
                                            </button>
                                            <button
                                                type="button"
                                                className="ttrpg-segment"
                                                aria-expanded={conditionsOf === summon.id}
                                                onClick={() => setConditionsOf(conditionsOf === summon.id ? null : summon.id)}
                                            >
                                                <FontAwesomeIcon icon={faBandage} />
                                                Conditions
                                            </button>
                                        </>
                                    )}
                                    <button type="button" className="ttrpg-segment" onClick={() => setEditing(summon.id)}>
                                        <FontAwesomeIcon icon={faPen} />
                                        Change
                                    </button>
                                    <button
                                        type="button"
                                        className={`ttrpg-segment ttrpg-summon__delete${stateOf(summon) === 'fallen' ? '' : ' ttrpg-summon__wide'}`}
                                        onClick={() => remove(summon.id, summon.name)}
                                    >
                                        <FontAwesomeIcon icon={faTrashCan} />
                                        Delete
                                    </button>
                                </div>
                                {conditionsOf === summon.id && stateOf(summon) !== 'fallen' && (
                                    <ConditionPicker system={system} conditions={summon.conditions ?? []} onChange={(conditions) => changeConditions(summon.id, conditions)} />
                                )}
                            </li>
                        ),
                    )}
                </ul>
            )}
            {adding ? (
                <form action={create} className="ttrpg-check-form">
                    <label className="ttrpg-field">
                        Name
                        <input name="name" maxLength={30} autoComplete="off" required autoFocus />
                    </label>
                    <div className="ttrpg-field">
                        Size
                        <SizePicker size={size} onChange={setSize} />
                    </div>
                    <div className="ttrpg-fields">
                        <label className="ttrpg-field">
                            Max HP
                            <input name="maxHp" type="number" inputMode="numeric" min={1} max={9999} required />
                        </label>
                        <label className="ttrpg-field">
                            AC
                            <input name="ac" type="number" inputMode="numeric" min={0} max={50} required />
                        </label>
                    </div>
                    <label className="ttrpg-segment">
                        <FontAwesomeIcon icon={faImage} />
                        <span>{pictureName || 'Choose a picture'}</span>
                        <input name="picture" type="file" accept="image/*" className="ttrpg-hidden-input" onChange={(event) => setPictureName(event.target.files?.[0]?.name ?? '')} />
                    </label>
                    {failure && <p className="ttrpg-error" role="alert">{failure}</p>}
                    <div className="ttrpg-popover__foot">
                        <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => setAdding(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={creating}>
                            {creating ? 'Adding' : 'Add beside you'}
                        </button>
                    </div>
                </form>
            ) : (
                summons.length < 4 && (
                    <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => setAdding(true)}>
                        <FontAwesomeIcon icon={faPlus} />
                        New companion
                    </button>
                )
            )}
        </section>
    );
}
