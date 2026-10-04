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
    increment,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';

import type { Skylander, SkylanderDetails } from '../types';

import { slug, type VersionId } from '../content/variants';

import { accountEmail, firebaseConfig } from './config';

/*
 * Only ever loaded with a dynamic import from pages/Skylanders.tsx, so Firebase stays out of the
 * portfolio bundle and never runs during the static prerender.
 */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const skylanders = collection(db, 'skylanders');

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
            callback(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as Skylander)),
        onError,
    );
}

/**
 * Adds a figure, or counts one more when it is already in the collection, as a plain copy or one
 * of a special version. Resolves to how many of it there are now.
 */
export async function addSkylander(item: SkylanderDetails, variant?: VersionId): Promise<number>
{
    // From the wiki title rather than the shown name, which drops "(character)", so a figure
    // saved before names were cleaned up still matches its document.
    const ref = doc(skylanders, slug(item.title));

    // A transaction, so two people adding the same figure at once both get counted.
    return runTransaction(db, async (transaction) =>
    {
        const existing = await transaction.get(ref);

        if (existing.exists())
        {
            const count = (existing.data().count as number) + 1;

            transaction.update(
                ref,
                variant ? { count, [`variants.${variant}`]: increment(1) } : { count },
            );

            return count;
        }

        transaction.set(ref, {
            ...item,
            count: 1,
            variants: variant ? { [variant]: 1 } : {},
            addedAt: serverTimestamp(),
        });

        return 1;
    });
}

/**
 * Adds or takes away copies, plain ones or of one special version. The total moves along with a
 * variant, because plain copies are the total minus the variants. increment() keeps two quick
 * clicks from overwriting each other.
 */
export async function changeCount(id: string, delta: number, variant?: VersionId): Promise<void>
{
    await updateDoc(
        doc(skylanders, id),
        variant
            ? { count: increment(delta), [`variants.${variant}`]: increment(delta) }
            : { count: increment(delta) },
    );
}

/** Fills in details a figure was saved without, such as a game an older lookup missed. */
export async function updateDetails(id: string, details: Partial<SkylanderDetails>): Promise<void>
{
    await updateDoc(doc(skylanders, id), details);
}

export async function removeSkylander(id: string): Promise<void>
{
    await deleteDoc(doc(skylanders, id));
}
