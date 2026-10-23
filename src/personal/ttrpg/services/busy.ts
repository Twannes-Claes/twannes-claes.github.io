/** The shortest a button shows it is saving, so a quick save does not flash past. */
const leastBusy = 300;

/** Work that takes at least a moment to the eye, for a button's spinner, see leastBusy. */
export function unhurried<T>(work: Promise<T>): Promise<T>
{
    return Promise.all([work, new Promise((done) => setTimeout(done, leastBusy))]).then(([result]) => result);
}
