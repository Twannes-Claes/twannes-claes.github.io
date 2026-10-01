import { faSteam } from '@fortawesome/free-brands-svg-icons';

import type { Project } from '../types';

export const replaceable: Project = {
    slug: 'replaceable',
    title: 'The Pack - Replaceable',
    category: 'Professional Work',
    active: true,
    order: 2,
    cardImage: '/assets/projects/replaceable/card.webp',
    tags: ['Unity', 'C#', 'DOTS', 'CI/CD'],
    sections:
    [
        {
            label: 'The Role',
            body: (
                <>
                    Freelance, April - May 2025. I was brought on as an all-round Unity developer at{' '}
                    <strong>The Pack</strong> to help keep <strong>Replaceable</strong>, their Unity
                    DOTS/ECS-based stealth adventure, moving forward while the core team was
                    heads-down on other projects.
                </>
            ),
        },
        {
            label: 'Key Contributions',
            body: (
                <>
                    I added new gameplay features and fixed bugs across the DOTS/ECS codebase, and
                    playtested regularly to give feedback within the team.
                </>
            ),
        },
        {
            label: 'Automated Build System',
            body: (
                <>
                    I built a custom automated daily build system so the team always had a fresh,
                    testable build ready without any manual steps.
                </>
            ),
        },
        {
            label: 'About the Game',
            body: (
                <>
                    Replaceable is a dark, atmospheric sci-fi adventure where you command a team of
                    robots to solve real-time stealth puzzles and take back control of a ruined
                    facility from a hostile AI.
                </>
            ),
        },
    ],
    links:
    [
        {
            url: 'https://store.steampowered.com/app/2145980/Replaceable/',
            icon: faSteam,
            text: 'Check out on Steam',
        },
    ],
    images: [{ src: '/assets/projects/replaceable/header.webp' }],
};
