import { faArrowRight, faComments, faFeather, faImage, faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import type { ChatMessage, ChatSend, Point } from '../types';

import { defaultAccent } from '../map/colours';

import { Spinner } from './Feedback';
import { Popover } from './Popover';
import { MessageMenu } from './TokenMenu';

interface ChatPanelProps
{
    /** What this screen may see of the chat, oldest first. */
    messages: ChatMessage[];
    /** Fails with the message to show. */
    onSend: (message: ChatSend) => Promise<void>;
    /** The GM, who whispers to a player and sends handouts. */
    host?: boolean;
    /** Who can be whispered to, besides the GM for a player. */
    players?: { id: string; name: string }[];
    /** A player's own token, so a whisper to it reads as to them. */
    own?: string;
    /** The GM takes a message out of the chat. */
    onDelete?: (id: string) => void;
    /** On a phone a press beside it closes it, like the dice. */
    phone?: boolean;
    onClose: () => void;
}

/** The chat's button on the dock or the phone, with a dot while something is unread. */
export function ChatButton({ open, unread, onClick }: { open: boolean; unread: boolean; onClick: () => void })
{
    return (
        <button
            type="button"
            className="ttrpg-segment ttrpg-chat__button"
            aria-pressed={open}
            aria-expanded={open}
            aria-label={unread ? 'Chat, unread messages' : 'Chat'}
            title="Chat and handouts"
            onClick={onClick}
        >
            <FontAwesomeIcon icon={faComments} />
            {unread && <span className="ttrpg-chat__dot" />}
        </button>
    );
}

/** A handout full screen, closed by a tap anywhere or Esc. */
function Handout({ message, onClose }: { message: ChatMessage; onClose: () => void })
{
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        dialog.current?.showModal();
    }, []);

    return (
        <dialog ref={dialog} className="ttrpg-handout" aria-label="Handout" onClose={onClose} onClick={onClose}>
            {message.picture && <img src={message.picture} alt={message.text || 'Handout'} />}
            {message.text && !message.picture && <p className="ttrpg-handout__text">{message.text}</p>}
        </dialog>
    );
}

/** The picture picked for a handout, before it is sent. Keyed on the file. */
function Preview({ file }: { file: File })
{
    // Never revoked: a GM picks a few a session. Revoke on unmount if that ever adds up.
    const [src] = useState(() => URL.createObjectURL(file));

    return <img src={src} alt="" />;
}

/**
 * The two ends of a whisper, and the colour of the one it went to: this screen's own end as You.
 * The server fills in the GM's colour, see convex/chat.ts.
 */
function endsOf(message: ChatMessage, host: boolean, own?: string)
{
    const from = message.mine ? 'You' : message.byGm ? 'GM' : message.name;
    const to = message.toGm ? (host ? 'You' : 'GM') : message.to === own ? 'You' : (message.toName ?? 'a player');

    return { from, to, toColor: message.toColor ?? defaultAccent };
}

/** Every handout this screen has, newest first, on a shelf of their own. */
function Handouts({ messages, host, onOpen }: { messages: ChatMessage[]; host: boolean; onOpen: (message: ChatMessage) => void })
{
    // Who a handout is for: on a player's phone one for them alone says so plainly.
    const forWhom = (message: ChatMessage) => (!message.to ? 'Everyone' : host ? `Only ${message.toName ?? 'one player'}` : 'Just for you');

    return (
        <ul className="ttrpg-chat__shelf">
            {[...messages].reverse().map((message) => (
                <li key={message.id}>
                    <button
                        type="button"
                        className="ttrpg-chat__item"
                        onClick={() => onOpen(message)}
                    >
                        {message.picture ? <img className="ttrpg-chat__thumb" src={message.picture} alt="" loading="lazy" /> : <span className="ttrpg-chat__thumb ttrpg-chat__note">{message.text}</span>}
                        <span className="ttrpg-chat__about">
                            <strong>
                                <FontAwesomeIcon icon={message.picture ? faImage : faFeather} />
                                {message.picture ? message.text || 'Picture' : 'Letter'}
                            </strong>
                            <small>
                                {forWhom(message)}
                            </small>
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/**
 * The table chat above the dock or the phone's buttons: one chat for everyone, whispers to the GM
 * or one player, and the GM's handouts, which open full screen and are kept on a shelf of
 * their own. Rolls stay in the dice log.
 */
export function ChatPanel({ messages, onSend, host = false, players = [], own, phone = false, onDelete, onClose }: ChatPanelProps)
{
    const [text, setText] = useState('');
    // A player's token, or gm for a player's whisper to the GM.
    const [to, setTo] = useState('');
    // The GM writing a handout rather than a line of chat, and which kind.
    const [handout, setHandout] = useState(false);
    const [kind, setKind] = useState<'picture' | 'letter'>('picture');
    const [picture, setPicture] = useState<File>();
    // Only the handouts, rather than the whole chat.
    const [shelf, setShelf] = useState(false);
    const [opened, setOpened] = useState<ChatMessage | null>(null);
    // The message the GM right-clicked, and where, for its menu.
    const [menu, setMenu] = useState<{ id: string; at: Point } | null>(null);
    const [failure, setFailure] = useState('');
    const [busy, setBusy] = useState(false);
    const log = useRef<HTMLDivElement>(null);
    const newest = messages.at(-1)?.id;
    const handouts = messages.filter((message) => message.handout);
    const onShelf = shelf && handouts.length > 0;
    const withPicture = handout && kind === 'picture';
    // A player attaches a picture to a line rather than writing a handout.
    const attaching = !host && own !== undefined;
    const ready = !busy && (withPicture ? picture !== undefined : text.trim() !== '' || (attaching && picture !== undefined));
    // Who to whisper to: for a player the GM first, then the others at the table.
    const recipients = host ? players : own !== undefined ? [{ id: 'gm', name: 'the GM' }, ...players] : [];
    const toName = recipients.find((player) => player.id === to)?.name;

    // A player who left is no longer one to whisper to.
    if (to && to !== 'gm' && !players.some((player) => player.id === to))
        setTo('');

    useEffect(() =>
    {
        log.current?.scrollTo({ top: onShelf ? 0 : log.current.scrollHeight });
    }, [newest, onShelf]);

    const closeHandout = () =>
    {
        setHandout(false);
        setPicture(undefined);
    };

    const send = (event: FormEvent) =>
    {
        event.preventDefault();

        if (!ready)
            return;

        setBusy(true);
        setFailure('');
        onSend({ text, to: to && to !== 'gm' ? to : undefined, toGm: to === 'gm' || undefined, handout, picture: withPicture || attaching ? picture : undefined })
            .then(() =>
            {
                setText('');
                closeHandout();
            })
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() => setBusy(false));
    };

    return (
        <Popover title="Chat" className="ttrpg-dock-panel ttrpg-chat" dismissOnOutside={phone} onClose={onClose}>
            {handouts.length > 0 && (
                <div className="ttrpg-chat__tabs ttrpg-chat__tabs--top" role="group" aria-label="Show">
                    <button type="button" aria-pressed={!onShelf} onClick={() => setShelf(false)}>
                        Chat
                    </button>
                    <button type="button" aria-pressed={onShelf} onClick={() => setShelf(true)}>
                        Handouts <span className="ttrpg-chat__count">{handouts.length}</span>
                    </button>
                </div>
            )}

            <div ref={log} className="ttrpg-popover__scroll ttrpg-chat__log" aria-live="polite">
                {messages.length === 0 && <p className="ttrpg-empty">No messages yet.</p>}
                {onShelf ? (
                    <Handouts messages={handouts} host={host} onOpen={setOpened} />
                ) : (
                    <ul className="ttrpg-chat__lines">
                        {messages.map((message, index) =>
                        {
                            const before = messages.at(index - 1);
                            // Like any chat, a name only where the sender changes.
                            const named = index === 0 || before?.name !== message.name || before.mine !== message.mine || Boolean(before.to || before.toGm);
                            // The sender's colour, the same on every screen: a player's ring, or the
                            // GM's colour from the table settings.
                            const ends = message.to || message.toGm ? endsOf(message, host, own) : null;
                            const who = { '--ttrpg-who': message.color ?? defaultAccent, '--ttrpg-to': ends?.toColor } as CSSProperties;

                            return (
                                <li
                                    key={message.id}
                                    className={`ttrpg-chat__line${message.mine ? ' ttrpg-chat__line--mine' : ''}${ends ? ' ttrpg-chat__line--whisper' : ''}`}
                                    style={who}
                                    onContextMenu={(event) =>
                                    {
                                        if (!onDelete)
                                            return;

                                        event.preventDefault();
                                        // Under the bubble, lined up with its edge, wherever on it the click was.
                                        // MessageMenu keeps a few pixels from the point it is given.
                                        const bubble = event.currentTarget.querySelector('.ttrpg-chat__bubble')?.getBoundingClientRect();

                                        setMenu({ id: message.id, at: bubble ? { x: bubble.left - 6, y: bubble.bottom } : { x: event.clientX, y: event.clientY } });
                                    }}
                                >
                                    {ends ? (
                                        <span className="ttrpg-chat__name ttrpg-chat__ends">
                                            <span>{ends.from}</span>
                                            <FontAwesomeIcon icon={faArrowRight} />
                                            <span className="ttrpg-chat__end">{ends.to}</span>
                                        </span>
                                    ) : (
                                        named && <span className="ttrpg-chat__name">{message.mine ? 'You' : message.name}</span>
                                    )}
                                    {message.handout || message.picture ? (
                                        <button type="button" className="ttrpg-chat__bubble ttrpg-chat__handout" onClick={() => setOpened(message)}>
                                            {message.picture ? (
                                                <img src={message.picture} alt="" loading="lazy" />
                                            ) : (
                                                <span className="ttrpg-chat__letter">
                                                    <FontAwesomeIcon icon={faFeather} />
                                                    Handout
                                                </span>
                                            )}
                                            {message.text && <span className="ttrpg-chat__caption">{message.text}</span>}
                                        </button>
                                    ) : (
                                        <span className="ttrpg-chat__bubble">{message.text}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <form className="ttrpg-popover__body ttrpg-chat__form" onSubmit={send}>
                {recipients.length > 0 && (
                    <select className="ttrpg-chat__to" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)}>
                        <option value="">To everyone</option>
                        {recipients.map((player) => (
                            <option key={player.id} value={player.id}>
                                Whisper to {player.name}
                            </option>
                        ))}
                    </select>
                )}
                {handout ? (
                    <section className="ttrpg-chat__new" aria-label="New handout">
                        <header className="ttrpg-chat__new-head">
                            <div className="ttrpg-chat__tabs" role="group" aria-label="Kind of handout">
                                <button type="button" aria-pressed={kind === 'picture'} onClick={() => setKind('picture')}>
                                    <FontAwesomeIcon icon={faImage} />
                                    Picture
                                </button>
                                <button type="button" aria-pressed={kind === 'letter'} onClick={() => setKind('letter')}>
                                    <FontAwesomeIcon icon={faFeather} />
                                    Letter
                                </button>
                            </div>
                            <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Back to the chat" title="Back to the chat" onClick={closeHandout}>
                                <FontAwesomeIcon icon={faXmark} />
                            </button>
                        </header>
                        {kind === 'picture' ? (
                            <>
                                <label className="ttrpg-chat__drop">
                                    {picture ? <Preview key={`${picture.name}${picture.lastModified}`} file={picture} /> : <FontAwesomeIcon icon={faImage} />}
                                    <span>{picture ? 'Change the picture' : 'Pick a picture, a map or a drawing'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="ttrpg-hidden-input"
                                        onChange={(event) =>
                                        {
                                            setPicture(event.target.files?.[0] ?? picture);
                                            event.target.value = '';
                                        }}
                                    />
                                </label>
                                <input type="text" maxLength={1000} aria-label="Caption" placeholder="A caption, if you like" value={text} onChange={(event) => setText(event.target.value)} />
                            </>
                        ) : (
                            <textarea rows={5} maxLength={1000} aria-label="Letter" placeholder="A letter, a note or a clue" value={text} onChange={(event) => setText(event.target.value)} />
                        )}
                        <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={!ready}>
                            {busy ? <Spinner /> : <FontAwesomeIcon icon={faPaperPlane} />}
                            Send to {toName ?? 'everyone'}
                        </button>
                    </section>
                ) : (
                    <>
                        {attaching && picture && (
                            <div className="ttrpg-chat__attached">
                                <Preview key={`${picture.name}${picture.lastModified}`} file={picture} />
                                <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Remove the picture" title="Remove the picture" onClick={() => setPicture(undefined)}>
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            </div>
                        )}
                        <div className="ttrpg-chat__compose">
                            {attaching && (
                                <label className="ttrpg-icon-button" aria-label="Send a picture" title="Send a picture">
                                    <FontAwesomeIcon icon={faImage} />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="ttrpg-hidden-input"
                                        onChange={(event) =>
                                        {
                                            setPicture(event.target.files?.[0] ?? picture);
                                            event.target.value = '';
                                        }}
                                    />
                                </label>
                            )}
                            {host && (
                                <button type="button" className="ttrpg-icon-button" aria-label="New handout" title="New handout: a picture or a letter" onClick={() => setHandout(true)}>
                                    <FontAwesomeIcon icon={faFeather} />
                                </button>
                            )}
                            <input type="text" maxLength={1000} aria-label="Message" placeholder="Message" enterKeyHint="send" value={text} onChange={(event) => setText(event.target.value)} />
                            <button type="submit" className="ttrpg-icon-button ttrpg-chat__send" aria-label="Send" title="Send" disabled={!ready}>
                                {busy ? <Spinner /> : <FontAwesomeIcon icon={faPaperPlane} />}
                            </button>
                        </div>
                    </>
                )}
                {failure && (
                    <p className="ttrpg-error" role="alert">
                        {failure}
                    </p>
                )}
            </form>

            {opened && <Handout message={opened} onClose={() => setOpened(null)} />}
            {menu && onDelete && <MessageMenu at={menu.at} onDelete={() => onDelete(menu.id)} onClose={() => setMenu(null)} />}
        </Popover>
    );
}
