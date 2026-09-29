import { initializeApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
} from 'firebase/auth';
import {
    collection,
    deleteDoc,
    doc,
    getFirestore,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
} from 'firebase/firestore';

import type { Skylander } from '../types';

import { accountEmail, firebaseConfig } from './config';

/*
 * Only ever loaded with a dynamic import from pages/Skylanders.tsx, so Firebase stays out of the
 * portfolio bundle and never runs during the static prerender.
 */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const skylanders = collection(db, 'skylanders');

/** Lowercased and dashed, so the same figure typed twice lands on the same document. */
function idFor(name: string): string
{
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

export function watchSignedIn(callback: (signedIn: boolean) => void): () => void
{
    return onAuthStateChanged(auth, (user) => callback(user !== null));
}

export async function signIn(password: string): Promise<void>
{
    await signInWithEmailAndPassword(auth, accountEmail, password);
}

export async function signOut(): Promise<void>
{
    await firebaseSignOut(auth);
}

export function watchCollection(
    callback: (items: Skylander[]) => void,
    onError: (error: Error) => void,
): () => void
{
    return onSnapshot(
        query(skylanders, orderBy('name')),
        (snapshot) =>
            callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Skylander)),
        onError,
    );
}

/** Resolves to false when the Skylander is already in the collection. */
export async function addSkylander(item: Omit<Skylander, 'id'>): Promise<boolean>
{
    const ref = doc(skylanders, idFor(item.name));

    // A transaction, so two people adding the same figure at once cannot both succeed.
    return runTransaction(db, async (transaction) =>
    {
        if ((await transaction.get(ref)).exists())
            return false;

        transaction.set(ref, { ...item, addedAt: serverTimestamp() });

        return true;
    });
}

export async function removeSkylander(id: string): Promise<void>
{
    await deleteDoc(doc(skylanders, id));
}
