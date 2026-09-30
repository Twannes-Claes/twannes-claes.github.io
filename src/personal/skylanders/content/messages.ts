/* What the line under the search says when a figure is added, a different one each time. */

/** A figure new to the collection. The name includes its version, like "Series 2 Spyro". */
const joined: ((name: string) => string)[] = [
    (name) => `${name} leapt through the Portal of Power!`,
    (name) => `${name} has joined the collection!`,
    (name) => `Kaos is furious. ${name} is on our side now!`,
    (name) => `${name} just landed on the portal. Nailed it.`,
    (name) => `Master Eon nods approvingly at ${name}.`,
    (name) => `A wild ${name} appeared!`,
    (name) => `${name} fell out of the sky, straight onto the shelf!`,
    (name) => `Hugo is already writing ${name}'s biography.`,
    (name) => `Glumshanks fainted. ${name} has arrived!`,
    (name) => `${name} brought snacks. Welcome aboard!`,
    (name) => `Skylands just got a little safer. Hi, ${name}!`,
    (name) => `${name} is ready to save Skylands!`,
];

/** Another copy of a figure already in the collection. */
const again: ((name: string, count: number) => string)[] = [
    (name, count) => `${name} number ${count}, reporting for duty!`,
    (name, count) => `The ${name} squad grows to ${count}!`,
    (name, count) => `${count} of ${name}! Hugo is running out of shelf space.`,
    (name, count) => `${name} ×${count}. Kaos will need a bigger army.`,
    (name, count) => `Another ${name}? Why not. That makes ${count}!`,
    (name, count) => `${count} copies of ${name} walk into a portal...`,
    (name, count) => `Is that ${name} again? Yes, all ${count} of them.`,
];

let last = '';

/** Picks one at random, never the same line twice in a row. */
function pick<T extends unknown[]>(lines: ((...args: T) => string)[], ...args: T): string
{
    const options = lines.map((line) => line(...args)).filter((line) => line !== last);

    last = options[Math.floor(Math.random() * options.length)];

    return last;
}

/** The news for a figure that was just added, `count` being how many there are now. */
export function addedMessage(name: string, count: number): string
{
    return count > 1 ? pick(again, name, count) : pick(joined, name);
}
