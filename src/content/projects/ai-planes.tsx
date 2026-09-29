import { faGithub } from '@fortawesome/free-brands-svg-icons';

import type { Project } from '../types';

export const aiPlanes: Project = {
  slug: 'ai-planes',
  title: 'AI Airplanes',
  category: 'Game Dev',
  active: true,
  order: 14,
  cardImage: '/assets/projects/ai-planes/card.png',
  tags: ['Unity', 'C#', 'ML-Agents'],
  sections: [
    {
      label: 'The Game',
      body: (
        <>
          I developed a game that combines aviation and AI, where players navigate an airplane
          through a challenging checkpoint course while racing against AI-controlled planes. The AI
          planes were trained using <strong>Unity&apos;s ML-Agents</strong>, a toolkit that
          leverages reinforcement learning (PPO) to create intelligent agents.
        </>
      ),
    },
    {
      label: 'The Approach',
      body: (
        <>
          This project allowed me to combine game development and machine learning, focusing on
          designing effective observations and reward systems to optimize AI performance/learning.
          It was an exciting opportunity to research this topic, showcasing the capabilities of AI
          in a game related environment.
        </>
      ),
    },
    {
      label: 'Technical Details',
      list: [
        <>
          <strong>Observations</strong>: velocity, checkpoint position/direction, raycasts
        </>,
        <>
          <strong>Rewards</strong>: checkpoint progress vs. collisions and idling
        </>,
        <>
          <strong>Training</strong>: PPO, monitored through TensorBoard
        </>,
      ],
    },
  ],
  links: [
    {
      url: 'https://github.com/Twannes-Claes/AI_Research_Topic',
      icon: faGithub,
      text: 'More info on my repository',
    },
  ],
  images: [
    { src: '/assets/projects/ai-planes/gallery-1.gif' },
    { src: '/assets/projects/ai-planes/gallery-2.png' },
  ],
};
