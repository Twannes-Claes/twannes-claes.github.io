import { faEye, faEyeSlash, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useActionState } from 'react';

import type { CreatureSize, Live, Point } from '../types';

import { confirmAction } from '../services/confirm';

import { Popover } from './Popover';

const sizes: CreatureSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

interface MonstersProps
{
    live: Live;
    /** Where a new monster goes: the middle of the game master's screen. */
    at: () => Point;
    onClose: () => void;
    /** Hears what worked, for the editor's toast. */
    onDone: (message: string) => void;
    onError: (message: string) => void;
}

/**
 * The game master's monsters and NPCs on the map being played, opened from the play dock. Adding
 * one puts it in the middle of the screen, so pan there first; drag it from there. Hidden ones
 * stay off every player's screen and the table screen, except while peeking.
 */
export function Monsters({ live, at, onClose, onDone, onError }: MonstersProps)
{
    const monsters = live.tokens.filter((token) => token.kind === 'npc');

    // The form clears itself after each one, so a pack of goblins is quick to add.
    const [failure, add, adding] = useActionState((_: string, form: FormData) =>
    {
        const picture = form.get('picture');
        const monster = {
            name: String(form.get('name')),
            color: String(form.get('color')),
            size: String(form.get('size')) as CreatureSize,
            hidden: form.get('hidden') === 'on',
            picture: picture instanceof File && picture.size > 0 ? picture : null,
        };

        return live
            .addMonster(monster, at())
            .then(() =>
            {
                onDone(`${monster.name.trim()} is on the map${monster.hidden ? ', hidden' : ''}.`);

                return '';
            })
            .catch((reason: Error) => reason.message);
    }, '');

    const remove = (id: string, name: string) =>
    {
        void confirmAction(`Remove ${name} from the map?`, 'Remove')
            .then(async (yes) =>
            {
                if (!yes)
                    return;

                await live.removeMonster(id);
                onDone(`${name} is off the map.`);
            })
            .catch((reason: Error) => onError(reason.message));
    };

    return (
        <Popover title="Monsters" className="ttrpg-dock-panel" onClose={onClose}>
            <form action={add} className="ttrpg-popover__body">
                <label className="ttrpg-field">
                    Name
                    <input name="name" maxLength={30} autoComplete="off" required />
                </label>
                <div className="ttrpg-monsters__row">
                    <label className="ttrpg-field">
                        Size
                        <select name="size" className="ttrpg-select" defaultValue="medium">
                            {sizes.map((size) => (
                                <option key={size} value={size}>
                                    {size[0].toUpperCase() + size.slice(1)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="ttrpg-field">
                        Ring
                        <input name="color" type="color" defaultValue="#b4443c" />
                    </label>
                </div>
                <label className="ttrpg-field">
                    Picture
                    <input name="picture" type="file" accept="image/*" />
                </label>
                <label className="ttrpg-check">
                    <input name="hidden" type="checkbox" />
                    Hidden from the players
                </label>
                {failure && (
                    <p className="ttrpg-error" role="alert">
                        {failure}
                    </p>
                )}
                <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={adding}>
                    {adding ? 'Adding' : 'Add to the middle of the screen'}
                </button>
            </form>

            {monsters.length > 0 && (
                <div className="ttrpg-popover__body">
                    <h3 className="ttrpg-subhead">{`On this map · ${monsters.length}`}</h3>
                    <ul className="ttrpg-rows">
                        {monsters.map((monster) => (
                            <li key={monster.id} className={`ttrpg-row${monster.hidden ? ' ttrpg-row--hidden' : ''}`}>
                                <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                    <span className="ttrpg-swatch" style={{ background: monster.color }} />
                                    {monster.name}
                                </span>
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={monster.hidden ? `Show ${monster.name}` : `Hide ${monster.name}`}
                                    aria-pressed={monster.hidden === true}
                                    title={monster.hidden ? 'Hidden from the players: show it' : 'Shown to the players: hide it'}
                                    onClick={() =>
                                        live.hide(monster.id, !monster.hidden).catch((reason: Error) => onError(reason.message))}
                                >
                                    <FontAwesomeIcon icon={monster.hidden ? faEyeSlash : faEye} />
                                </button>
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={`Remove ${monster.name}`}
                                    title="Remove"
                                    onClick={() => remove(monster.id, monster.name)}
                                >
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Popover>
    );
}
