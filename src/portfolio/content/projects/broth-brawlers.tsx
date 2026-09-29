import { faItchIo, faYoutube } from '@fortawesome/free-brands-svg-icons';

import type { Project } from '../types';

export const brothBrawlers: Project = {
    slug: 'broth-brawlers',
    title: 'Broth Brawlers',
    category: 'Game Dev',
    active: true,
    order: 13,
    cardImage: '/assets/projects/broth-brawlers/card.png',
    tags: ['Unity', 'C#', 'Perforce', 'Team'],
    sections:
    [
        {
            label: 'The Game',
            body: (
                <>
                    <p>
                        Broth Brawlers is a small 3D couch party game. It was made as a Game Project
                        by a group of students at DAE Howest.
                    </p>
                    <p>
                        You play as a bowl filled with juicy ramen noodles. As cute as they might
                        look, the bowls are dangerous! They carry sharp chopsticks as weapons, which
                        can be used for jousting the other players in the arena. Nasty! Push the
                        other players around and make them spill soup and noodles, or throw them
                        out! Every player can move, turn, dash and spill soup at will to make others
                        slip. Jousting can be done after charging your attack for long enough. The
                        spilled soup makes you slip but also increases your soup amount as you pick
                        it up.
                    </p>
                    <p>The player with the most noodles left when the timer ends, wins the game!</p>
                </>
            ),
        },
        {
            label: 'My Role',
            body: (
                <>
                    I was the programmer in this project, so <strong>all</strong> the game logic you
                    encounter in this project was done by me, even audio.
                </>
            ),
        },
        {
            label: 'My Implementations',
            list:
            [
                'Player movement',
                'Game Mechanics',
                'Lobby loading',
                'Level interactables',
                'Co-op system',
                'UI Programming',
                'Audio logic',
            ],
        },
    ],
    links:
    [
        { url: 'https://laradadda.itch.io/group-4', icon: faItchIo, text: 'Play on itch.io' },
    ],
    images:
    [
        {
            src: '/assets/projects/broth-brawlers/card.png',
            href: 'https://youtu.be/yH7EkgAuO7k',
            icon: faYoutube,
        },
        { src: '/assets/projects/broth-brawlers/gallery-1.gif' },
        { src: '/assets/projects/broth-brawlers/gallery-2.png' },
        { src: '/assets/projects/broth-brawlers/gallery-3.png' },
    ],
};
