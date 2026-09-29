import { useCallback, useState, type FormEvent } from 'react';

import type { Db } from '../types';

import { TiltButton } from '../../../shared/components/TiltButton';

import { TextInput } from './TextInput';

export function PasswordForm({ db }: { db: Db })
{
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = useCallback(
        async (event: FormEvent) =>
        {
            event.preventDefault();
            setBusy(true);
            setError('');

            try
            {
                await db.signIn(password);
            }
            catch
            {
                setError('That password is not right.');
                setBusy(false);
            }
        },
        [db, password],
    );

    return (
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
            <label className="flex flex-col gap-2">
                Password
                <TextInput
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoFocus
                />
            </label>
            {error && <p className="text-red-400">{error}</p>}
            <TiltButton>
                <button type="submit" disabled={busy || !password}>
                    Open
                </button>
            </TiltButton>
        </form>
    );
}
