import { faItchIo } from '@fortawesome/free-brands-svg-icons';

import type { Project } from '../types';

export const cityCrawlers: Project = {
  slug: 'city-crawlers',
  title: 'City Crawlers',
  category: 'Game Jam',
  // Hidden from the site, kept in the repo. Flip to true to publish it again.
  active: false,
  order: 20,
  cardImage: '/assets/projects/city-crawlers/card.png',
  tags: ['Unity', 'C#', 'GAME JAM'],
  sections: [
    {
      label: 'The Game',
      body: (
        <>
          Explore the city and survive hordes of zombies while you complete quests for other
          survivors to ensure your survival.
        </>
      ),
    },
    {
      label: 'The Jam',
      body: (
        <>
          This was one of the first game jams I joined, for the Kenney Game Jam with the theme
          Exploration, where we could only use assets provided by Kenney, the jam&apos;s organizer.
          Our team only formed on one of the last days of the jam, so between the short timeframe
          and it being one of my first jams,{' '}
          <strong>we had a blast but didn&apos;t manage to finish the project</strong>.
        </>
      ),
    },
    {
      label: 'My Implementations',
      list: ['Character Controller', 'Player Behaviour', 'Weapons'],
    },
  ],
  links: [
    {
      url: 'https://wardergrip.itch.io/city-crawlers',
      icon: faItchIo,
      text: 'Play on itch.io',
    },
  ],
  images: [{ src: '/assets/projects/city-crawlers/card.png' }],
};
