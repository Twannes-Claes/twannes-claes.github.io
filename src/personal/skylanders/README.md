# Skylanders collection

Private page at `/skylanders`. The list lives in Firestore, behind one shared password.
Names, pictures, elements and games come from the fan wiki at skylanders.fandom.com.

## One-time Firebase setup

1. Create a project at https://console.firebase.google.com (the free Spark plan is plenty).
2. **Authentication**, Get started, enable **Email/Password**.
3. **Authentication**, Users, Add user: email `skylanders@twannes.github.io`, and the
   password you want to share. The page only asks for the password.
4. **Authentication**, Settings, User actions: untick **Enable create (sign-up)**.
5. **Authentication**, Settings, Authorized domains: add `twannes-claes.github.io`
   (`localhost` is there already).
6. **Firestore Database**, Create database, production mode, a region near you (`eur3`).
7. **Firestore Database**, Rules: paste `firestore.rules` and publish.
8. **Project settings**, Your apps, add a Web app, and copy `apiKey`, `authDomain`, `projectId`
   and `appId` into `config.ts`.

To change the password later, reset it on the user under Authentication, Users.
