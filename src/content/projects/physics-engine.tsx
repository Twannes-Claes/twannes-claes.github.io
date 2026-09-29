import { faGithub, faYoutube } from '@fortawesome/free-brands-svg-icons';
import { faFileLines } from '@fortawesome/free-solid-svg-icons';

import type { Project } from '../types';

export const physicsEngine: Project = {
  slug: 'physics-engine',
  title: '2D Physics Engine',
  category: 'Game Dev',
  active: true,
  order: 11,
  cardImage: '/assets/projects/physics-engine/card.png',
  tags: ['C++', 'SDL'],
  sections: [
    {
      label: 'The Research',
      body: (
        <>
          This project was for my Bachelor thesis, where I built a custom 2D physics engine from
          scratch in C++. My research question was how different shapes, circles, boxes, and convex
          polygons, affect a simulation&apos;s accuracy, performance, and determinism.
        </>
      ),
    },
    {
      label: 'The Approach',
      body: (
        <>
          I implemented collision detection and resolution for every combination of shapes, using a
          broad phase (bounding circles) to cheaply rule out most collisions before running the more
          expensive <strong>Separating Axis Theorem</strong> on polygons. Detected collisions get
          resolved through positional correction and an impulse response, factoring in mass,
          elasticity, friction, and inertia.
        </>
      ),
    },
    {
      label: 'Key Findings',
      body: (
        <>
          A fixed time step made the simulation <strong>fully deterministic</strong>, with identical
          results across repeated runs, while a variable time step caused it to diverge within
          seconds. Adding the broad phase also turned an exponential growth in frame time into a{' '}
          <strong>near-linear</strong> one as object count increased.
        </>
      ),
    },
    {
      label: 'What I Built',
      list: [
        'Collision detection for circles, boxes & polygons (SAT)',
        'Broad phase / narrow phase optimization',
        'Positional correction & impulse-based resolution',
        'Euler, Verlet & RK4 integration',
        'Fixed time step for deterministic simulation',
      ],
    },
  ],
  links: [
    {
      url: 'https://github.com/Twannes-Claes/CPP-2D-Physics-Engine',
      icon: faGithub,
      text: 'Visit my repository',
    },
    {
      url: '/assets/documents/TwannesClaes_Thesis.pdf',
      icon: faFileLines,
      text: 'Check out my thesis',
    },
  ],
  images: [
    {
      src: '/assets/projects/physics-engine/card.png',
      href: 'https://youtu.be/3wJ4ew08c00',
      icon: faYoutube,
    },
    { src: '/assets/projects/physics-engine/gallery-1.gif' },
  ],
};
