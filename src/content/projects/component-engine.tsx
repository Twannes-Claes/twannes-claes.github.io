import { faGithub } from '@fortawesome/free-brands-svg-icons';

import type { Project } from '../types';

export const componentEngine: Project = {
  slug: 'component-engine',
  title: '2D Component Engine',
  category: 'Game Dev',
  active: true,
  order: 15,
  cardImage: '/assets/projects/component-engine/cover.svg',
  tags: ['C++', 'SDL', 'SteamSDK', 'Imgui'],
  sections: [
    {
      label: 'The Project',
      body: (
        <>
          <p>
            This project was my first attempt at making a game engine from scratch. Doing this
            project, I learned a lot about programming patterns, engine features and various other
            programming techniques.
          </p>
          <p>
            With the result of my engine I tried recreating the first 3 levels of an old arcade game
            called &quot;Bubble Bobble&quot;.
          </p>
          <p>
            This went fairly well, but{' '}
            <strong>I didn&apos;t have time to add physics to the game</strong>. In my free time I
            am now looking to combine my 2D engine with my 2D physics engine, so I have a ready to
            use C++ engine when I want to make a 2D game in C++.
          </p>
        </>
      ),
    },
    {
      label: 'Features',
      list: [
        'GameObjects and Components',
        'Observers and Event Queue',
        'Lobby loading',
        'Multithreaded Audio System',
        'Sprite + text rendering',
        'Gamepad & Keyboard input',
        'Scene management',
        'Resource management',
        'Steam achievements',
      ],
    },
    {
      label: 'Implemented Patterns',
      list: [
        'Game Loop',
        'Update method',
        'Dirty flag',
        'Observer',
        'Event Queue',
        'Command',
        'Singleton',
        'Service Locator',
      ],
    },
  ],
  links: [
    {
      url: 'https://github.com/Twannes-Claes/2D-Component-Engine',
      icon: faGithub,
      text: 'Visit my repository',
    },
  ],
  images: [{ src: '/assets/projects/component-engine/cover.svg' }],
};
