import { faArrowRightToBracket, faCamera, faPen, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useActionState, useState } from 'react';

import type { CreatureSize } from '../types';

import { api } from '../convex/_generated/api';
import { ringColours } from '../map/colours';
import { explain, uploadAvatar } from '../services/backend';
import { confirmAction } from '../services/confirm';
import { toAvatar } from '../services/images';

import { Spinner } from './Feedback';
import { RingPicker } from './RingPicker';
import { SizePicker } from './SizePicker';

interface PictureRingProps
{
    name: string;
    color: string;
    avatar?: string;
}

/** The picture in its ring, which is also the file field named picture, showing what was picked. */
export function PictureRing({ name, color, avatar }: PictureRingProps)
{
    const [preview, setPreview] = useState<string | null>(null);
    const shown = preview ?? avatar;

    const pick = (file: File | undefined) =>
    {
        if (preview)
            URL.revokeObjectURL(preview);

        setPreview(file ? URL.createObjectURL(file) : null);
    };

    return (
        <label className="ttrpg-piece-form__picture" style={{ borderColor: color }} title="Choose a picture">
            {shown ? <img src={shown} alt="" /> : <span aria-hidden="true">{name.charAt(0)}</span>}
            <span className="ttrpg-piece-form__camera" aria-hidden="true">
                <FontAwesomeIcon icon={faCamera} />
            </span>
            <input name="picture" type="file" accept="image/*" className="ttrpg-hidden-input" aria-label="Picture" onChange={(event) => pick(event.target.files?.[0])} />
        </label>
    );
}

/** What the form starts from. A character has a ring colour and Perception, a summon neither. */
interface Piece
{
    name?: string;
    color?: string;
    size?: CreatureSize;
    maxHp?: number;
    ac?: number;
    perception?: number;
    initiative?: number;
    avatar?: string;
}

interface Fields
{
    name: string;
    color: string;
    size: CreatureSize;
    maxHp: number;
    ac: number;
    perception: number;
    /** Only a character's, left out when not filled in. */
    initiative?: number;
}

interface PieceFormProps
{
    title: string;
    start: Piece;
    character: boolean;
    /** The ring a summon shows, its character's. */
    ring?: string;
    /** Saves the fields and gives where the picture goes, see uploadAvatar in backend.ts. */
    onSave: (fields: Fields) => Promise<Parameters<typeof uploadAvatar>[0]>;
    onDone: () => void;
    /** Joining a table as an anonymous player, which saves nothing and has no way back. */
    joining?: boolean;
}

/**
 * A character's or a companion's picture, name, ring, size and numbers, new or changed, on the
 * account page and the join form.
 */
export function PieceForm({ title, start, character, ring, onSave, onDone, joining }: PieceFormProps)
{
    const authToken = useAuthToken();
    const [size, setSize] = useState<CreatureSize>(start.size ?? 'medium');
    const [color, setColor] = useState(start.color ?? ringColours[0]);
    const name = start.name ?? '';

    // The picture is shrunk first, and goes up once the character or summon exists.
    const [failure, save, saving] = useActionState((_: string, form: FormData) =>
    {
        const picture = form.get('picture');
        const avatar = picture instanceof File && picture.size > 0 ? toAvatar(picture) : Promise.resolve(null);
        const initiative = String(form.get('initiative') ?? '').trim();
        const fields = {
            name: String(form.get('name')),
            color,
            size,
            maxHp: Number(form.get('maxHp')),
            ac: Number(form.get('ac')),
            perception: Number(form.get('perception') ?? 10),
            ...(initiative === '' ? {} : { initiative: Number(initiative) }),
        };

        return avatar.then(
            (blob) =>
                onSave(fields)
                    .then(async (to) =>
                    {
                        if (blob && !(await uploadAvatar(to, blob, authToken)))
                            return 'That picture was refused. Pick another one.';

                        onDone();

                        return '';
                    })
                    .catch((reason: unknown) => explain(reason, 'That did not save. Check the connection and try again.')),
            () => 'That picture could not be read. Pick another one, or go on without one.',
        );
    }, '');

    return (
        <form action={save} className="ttrpg-piece-form">
            <h3 className="ttrpg-subhead">{title}</h3>
            <div className="ttrpg-piece-form__top">
                <PictureRing name={name} color={character ? color : (ring ?? ringColours[0])} avatar={start.avatar} />
                <label className="ttrpg-field ttrpg-piece-form__name">
                    Name
                    <input name="name" maxLength={30} autoComplete="off" required autoFocus defaultValue={name} />
                </label>
            </div>
            {character && (
                <div className="ttrpg-field">
                    Ring colour
                    <RingPicker value={color} onChange={setColor} />
                </div>
            )}
            <div className="ttrpg-field">
                Size
                <SizePicker size={size} onChange={setSize} />
            </div>
            <div className="ttrpg-settings">
                <label>
                    Max HP
                    <input name="maxHp" type="number" inputMode="numeric" min={1} max={9999} required defaultValue={start.maxHp} />
                </label>
                <label>
                    AC
                    <input name="ac" type="number" inputMode="numeric" min={0} max={50} required defaultValue={start.ac} />
                </label>
                {character && (
                    <label title="Passive Perception">
                        Perception
                        <input name="perception" type="number" inputMode="numeric" min={0} max={50} required defaultValue={start.perception} />
                    </label>
                )}
                {character && (
                    <label title="Your initiative modifier in your system, or the one a feat gives you">
                        Initiative
                        <input name="initiative" type="number" inputMode="numeric" min={-20} max={30} placeholder="+0" defaultValue={start.initiative} />
                    </label>
                )}
            </div>
            {failure && <p className="ttrpg-error" role="alert">{failure}</p>}
            <div className="ttrpg-popover__foot">
                {!joining && (
                    <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={onDone}>
                        Cancel
                    </button>
                )}
                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={saving}>
                    {joining ? (saving ? 'Joining' : 'Join') : saving ? 'Saving' : 'Save'}
                </button>
            </div>
        </form>
    );
}

interface AvatarProps
{
    name: string;
    color: string;
    avatar?: string;
    small?: boolean;
}

/** A round picture in its ring, or the initial without one. */
export function Avatar({ name, color, avatar, small }: AvatarProps)
{
    return (
        <span className={`ttrpg-sheet__avatar${small ? ' ttrpg-sheet__avatar--small' : ''}`} style={{ borderColor: color }} aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : name.charAt(0)}
        </span>
    );
}

/** As many as convex/characters.ts and convex/summons.ts keep. */
const maxCharacters = 20;
const maxSummons = 4;

type Character = NonNullable<FunctionReturnType<typeof api.characters.mine>>[number];

/**
 * The characters kept for joining tables, with their companions: a card each, to make, change or
 * delete, see characters.ts. On the join form each card also joins the table as it, with onJoin.
 */
export function CharacterList({ onJoin }: { onJoin?: (character: Character) => Promise<unknown> })
{
    const characters = useQuery(api.characters.mine);
    const saveCharacter = useMutation(api.characters.save);
    const removeCharacter = useMutation(api.characters.remove);
    const saveCompanion = useMutation(api.characters.saveCompanion);
    const removeCompanion = useMutation(api.characters.removeCompanion);
    // What is open: a character or summon by id, 'new', or 'summon' plus the character's id.
    const [editing, setEditing] = useState<string | null>(null);
    const done = () => setEditing(null);
    // The character joining the table as, and why that did not work.
    const [joiningAs, setJoiningAs] = useState<string | null>(null);
    const [joinFailure, setJoinFailure] = useState('');

    const join = (character: Character) =>
    {
        if (!onJoin)
            return;

        setJoiningAs(character.id);
        setJoinFailure('');
        onJoin(character)
            .catch((reason: unknown) => setJoinFailure(explain(reason, 'Joining did not work. Check the connection and try again.')))
            .finally(() => setJoiningAs(null));
    };

    const remove = (name: string, action: () => Promise<unknown>) =>
    {
        void confirmAction(`Delete ${name} and its picture?`, 'Delete').then((yes) => (yes ? action() : undefined));
    };

    if (!characters)
        return null;

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Your characters">
            <h2>Your characters</h2>
            {characters.length === 0 && editing !== 'new' && <p className="ttrpg-dashboard__note">{onJoin ? 'Make a character to join with. It is kept for the next game.' : 'Make one here, or join a table and it is kept for the next game.'}</p>}
            <ul className="ttrpg-summons">
                {characters.map((character) => (
                    <li key={character.id} className="ttrpg-summon">
                        {editing === character.id ? (
                            <PieceForm
                                title={`Change ${character.name}`}
                                start={character}
                                character
                                onSave={(fields) => saveCharacter({ characterId: character.id, ...fields }).then((id) => ({ character: id }))}
                                onDone={done}
                            />
                        ) : (
                            <>
                                <div className="ttrpg-summon__head">
                                    <Avatar {...character} />
                                    <span className="ttrpg-row__text">
                                        <span className="ttrpg-row__name">{character.name}</span>
                                        <span className="ttrpg-row__detail">
                                            HP {character.maxHp} · AC {character.ac} · PP {character.perception}
                                        </span>
                                    </span>
                                </div>
                                <div className="ttrpg-summon__actions">
                                    {onJoin && (
                                        <button
                                            type="button"
                                            className="ttrpg-segment ttrpg-segment--confirm ttrpg-summon__wide"
                                            disabled={joiningAs !== null}
                                            onClick={() => join(character)}
                                        >
                                            {joiningAs === character.id ? <Spinner /> : <FontAwesomeIcon icon={faArrowRightToBracket} />}
                                            {joiningAs === character.id ? 'Joining' : `Join as ${character.name}`}
                                        </button>
                                    )}
                                    <button type="button" className="ttrpg-segment" onClick={() => setEditing(character.id)}>
                                        <FontAwesomeIcon icon={faPen} />
                                        Change
                                    </button>
                                    <button type="button" className="ttrpg-segment ttrpg-summon__delete" onClick={() => remove(character.name, () => removeCharacter({ characterId: character.id }))}>
                                        <FontAwesomeIcon icon={faTrashCan} />
                                        Delete
                                    </button>
                                </div>
                            </>
                        )}
                        <div className="ttrpg-kept-summons">
                            <h3 className="ttrpg-subhead">Companions</h3>
                            {character.companions.length > 0 && (
                                <ul className="ttrpg-rows">
                                    {character.companions.map((companion) =>
                                        editing === companion.id ? (
                                            <li key={companion.id}>
                                                <PieceForm
                                                    title={`Change ${companion.name}`}
                                                    start={companion}
                                                    character={false}
                                                    ring={character.color}
                                                    onSave={({ name, size, maxHp, ac }) =>
                                                        saveCompanion({ characterId: character.id, companionId: companion.id, name, size, maxHp, ac }).then((id) => ({ companion: id }))
                                                    }
                                                    onDone={done}
                                                />
                                            </li>
                                        ) : (
                                            <li key={companion.id} className="ttrpg-row">
                                                <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                                    <Avatar {...companion} color={character.color} small />
                                                    <span className="ttrpg-row__text">
                                                        <span className="ttrpg-row__name">{companion.name}</span>
                                                        <span className="ttrpg-row__detail">
                                                            HP {companion.maxHp} · AC {companion.ac}
                                                        </span>
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                                    aria-label={`Change ${companion.name}`}
                                                    title="Change"
                                                    onClick={() => setEditing(companion.id)}
                                                >
                                                    <FontAwesomeIcon icon={faPen} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                                    aria-label={`Delete ${companion.name}`}
                                                    title="Delete"
                                                    onClick={() => remove(companion.name, () => removeCompanion({ companionId: companion.id }))}
                                                >
                                                    <FontAwesomeIcon icon={faTrashCan} />
                                                </button>
                                            </li>
                                        ),
                                    )}
                                </ul>
                            )}
                            {editing === `summon${character.id}` ? (
                                <PieceForm
                                    title={`New companion for ${character.name}`}
                                    start={{}}
                                    character={false}
                                    ring={character.color}
                                    onSave={({ name, size, maxHp, ac }) => saveCompanion({ characterId: character.id, name, size, maxHp, ac }).then((id) => ({ companion: id }))}
                                    onDone={done}
                                />
                            ) : (
                                character.companions.length < maxSummons && (
                                    <button type="button" className="ttrpg-segment ttrpg-add" onClick={() => setEditing(`summon${character.id}`)}>
                                        <FontAwesomeIcon icon={faPlus} />
                                        New companion
                                    </button>
                                )
                            )}
                        </div>
                    </li>
                ))}
                {editing === 'new' && (
                    <li className="ttrpg-summon">
                        <PieceForm title="New character" start={{}} character onSave={(fields) => saveCharacter(fields).then((id) => ({ character: id }))} onDone={done} />
                    </li>
                )}
            </ul>
            {joinFailure && <p className="ttrpg-error" role="alert">{joinFailure}</p>}
            {editing !== 'new' && characters.length < maxCharacters && (
                <button type="button" className="ttrpg-segment ttrpg-add" onClick={() => setEditing('new')}>
                    <FontAwesomeIcon icon={faPlus} />
                    New character
                </button>
            )}
        </section>
    );
}
