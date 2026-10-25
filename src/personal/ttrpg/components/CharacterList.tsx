import { faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useMutation, useQuery } from 'convex/react';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { confirmAction } from '../services/confirm';

/**
 * The characters kept from joining tables, on the account page, to delete one. Changing one is done
 * on the join form, which saves what the player joins as, see characters.ts.
 */
export function CharacterList()
{
    const characters = useQuery(api.characters.mine);
    const removeCharacter = useMutation(api.characters.remove);

    const remove = (id: Id<'characters'>, name: string) =>
    {
        void confirmAction(`Delete ${name} and its picture?`, 'Delete').then((yes) => (yes ? removeCharacter({ characterId: id }) : undefined));
    };

    if (!characters)
        return null;

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Your characters">
            <h2>Your characters</h2>
            {characters.length === 0 && <p className="ttrpg-dashboard__note">Join a table and your character is kept here for the next game.</p>}
            <ul className="ttrpg-rows">
                {characters.map((character) => (
                    <li key={character.id} className="ttrpg-row">
                        <span className="ttrpg-row__main">
                            <span className="ttrpg-sheet__avatar" style={{ borderColor: character.color }} aria-hidden="true">
                                {character.avatar ? <img src={character.avatar} alt="" /> : character.name.charAt(0)}
                            </span>
                            <span className="ttrpg-row__text">
                                <span className="ttrpg-row__name">{character.name}</span>
                                <span className="ttrpg-row__detail">
                                    HP {character.maxHp} · AC {character.ac} · PP {character.perception}
                                </span>
                            </span>
                        </span>
                        <button
                            type="button"
                            className="ttrpg-icon-button ttrpg-icon-button--small"
                            aria-label={`Delete ${character.name}`}
                            title="Delete"
                            onClick={() => remove(character.id, character.name)}
                        >
                            <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
