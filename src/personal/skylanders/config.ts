/*
 * None of this is secret. Firebase web config only names the project, and the Firestore rules
 * in firestore.rules decide who may read or write, so it is safe in a public repo.
 */

/** Pasted from the Firebase console, Project settings, Your apps, SDK setup and configuration. */
export const firebaseConfig = {
    apiKey: 'AIzaSyBSg6AAFB3HtqbAkc1nEn9wNea6XmG6cvQ',
    authDomain: 'twannes-claes-skylanders.firebaseapp.com',
    projectId: 'twannes-claes-skylanders',
    appId: '1:28229484699:web:0cc747b05435ada6e9c63e',
};

/**
 * The one shared account. The page only asks for the password, so this email has to match the
 * user created under Authentication and the address named in firestore.rules.
 */
export const accountEmail = 'skylanders@twannes.github.io';
