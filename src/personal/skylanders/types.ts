export interface Skylander
{
    /** Firestore document id, derived from the name in db.ts. */
    id: string;
    name: string;
    /** Thumbnail from the Skylanders wiki, empty when the wiki has none. */
    image: string;
    /** Magic, Tech, Water and so on, empty when the wiki page does not say. */
    element: string;
    /** The game the figure first appeared in. */
    game: string;
    /** Wiki page, empty when the name did not match one. */
    url: string;
}
