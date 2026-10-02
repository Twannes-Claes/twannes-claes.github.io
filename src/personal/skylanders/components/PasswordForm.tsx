import { faBolt, faEye, faEyeSlash, faKey } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';

import type { Db } from '../types';

/**
 * Only set under `npm run dev` with .env.development.local filled in. A production build leaves
 * this undefined, so the auto login button is never shipped.
 */
const devPassword = import.meta.env.DEV ? import.meta.env.VITE_SKYLANDERS_DEV_PASSWORD : undefined;

interface PasswordFormProps
{
    db: Db;
    /** Opens the sample collection, for people without the password. */
    onDemo: () => void;
}

/** The lock screen, styled as the Portal of Power the figures stand on. */
export function PasswordForm({ db, onDemo }: PasswordFormProps)
{
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    // Bumped on every failed try, so the portal remounts and shakes again.
    const [attempt, setAttempt] = useState(0);
    const [visible, setVisible] = useState(false);

    const toggle = useCallback(() => setVisible((shown) => !shown), []);
    const type = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
        [],
    );

    const enter = useCallback(
        async (secret: string) =>
        {
            setBusy(true);
            setError('');

            try
            {
                await db.signIn(secret);
            }
            catch
            {
                setError('The portal does not recognise that password.');
                setAttempt((count) => count + 1);
                setBusy(false);
            }
        },
        [db],
    );

    const submit = useCallback(
        (event: FormEvent) =>
        {
            event.preventDefault();
            void enter(password);
        },
        [enter, password],
    );

    const devEnter = useCallback(() => void enter(devPassword ?? ''), [enter]);

    return (
        <div className="sky-login">
            <div key={attempt} className={`sky-portal${error ? ' sky-portal--error' : ''}`}>
                <FontAwesomeIcon icon={faKey} className="sky-portal__icon" />
            </div>

            <p className="sky-login__hint">Place your password on the Portal of Power</p>

            <form onSubmit={submit} className="sky-panel sky-login__form">
                <div className="sky-password">
                    <input
                        type={visible ? 'text' : 'password'}
                        className="sky-input"
                        aria-label="Password"
                        placeholder="Password"
                        autoComplete="current-password"
                        spellCheck={false}
                        value={password}
                        onChange={type}
                        autoFocus
                    />
                    <button
                        type="button"
                        className="sky-password__toggle"
                        onClick={toggle}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                    >
                        <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
                    </button>
                </div>
                <button type="submit" className="sky-btn" disabled={busy || !password}>
                    {busy ? 'Entering' : 'Enter'}
                </button>
                {error && <p className="sky-error">{error}</p>}
            </form>

            <p className="sky-login__demo">
                No password?{' '}
                <button type="button" onClick={onDemo}>
                    Try the demo
                </button>
            </p>

            {/* A nudge towards the secret way in, see entrance/useSecretEntrance.ts. */}
            <p className="sky-login__secret">
                Psst. On the portfolio, flick between day and night fast enough and a portal
                opens.
            </p>

            {devPassword && (
                <button
                    type="button"
                    className="sky-btn sky-btn--blue sky-btn--small"
                    onClick={devEnter}
                    disabled={busy}
                >
                    <FontAwesomeIcon icon={faBolt} />
                    Dev login
                </button>
            )}
        </div>
    );
}
