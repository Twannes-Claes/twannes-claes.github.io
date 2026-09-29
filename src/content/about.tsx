import type { ReactNode } from 'react';

export interface AboutBlock {
  label: string;
  body: ReactNode;
}

export const aboutBlocks: AboutBlock[] = [
  {
    label: 'Who I Am',
    body: (
      <>
        Hi, I&apos;m Twannes Claes, a Digital Arts and Entertainment graduate (class of 2024) and
        Game Systems Engineer, with growing experience in software engineering more broadly.
      </>
    ),
  },
  {
    label: "What I'm Looking For",
    body: (
      <>
        Having just wrapped up my time at Vintecc, I&apos;m now looking for my next opportunity in
        C++, C#, or game development, so if you&apos;re hiring, or know someone who is, don&apos;t
        hesitate to reach out!
      </>
    ),
  },
  {
    label: 'What Drives Me',
    body: (
      <>
        <p>
          I am passionate about crafting and improving my skills, whether it&apos;s through
          programming, drawing, cooking, or something else to spark my creativity.
        </p>
        <p>
          Above all, I love programming. There&apos;s nothing more exciting to me than bringing
          ideas to life through code, turning simple thoughts into something real and interactive
          that other people can enjoy. Lately that passion has grown into a deeper interest in
          software engineering as a whole, especially building advanced, well-structured, and
          scalable systems.
        </p>
      </>
    ),
  },
  {
    label: 'Indie Games',
    body: (
      <>
        I&apos;m also a big fan of indie games. I love the creativity and originality small teams
        manage to pack into their work, often with a fraction of the resources bigger studios have.
      </>
    ),
  },
];

export interface SkillGroup {
  title: string;
  items: string;
}

export const skillGroups: SkillGroup[] = [
  {
    title: 'Languages',
    items: 'C++, C#, C, CMake, SQL, Python, Matlab, HLSL, XAML, ASP.NET, CSS, JS, HTML',
  },
  {
    title: 'Architecture & practices',
    items:
      'OOP, DOD/ECS, Dependency Injection (DI), Reflection, Unit Testing, Test-Driven Development (TDD)',
  },
  { title: 'Engines', items: 'Unity, Unreal Engine, Godot, DirectX11, in-house' },
  {
    title: 'DevOps & tooling',
    items: 'CI/CD pipelines, Docker, build automation, editor scripting, release management',
  },
  {
    title: 'Networking',
    items: 'Photon (Bolt, Fusion), Unity Netcode, multiplayer programming',
  },
  { title: 'Source control', items: 'Github, Gitlab, Git, Fork, Perforce, Azure' },
  { title: 'API/Libraries', items: 'PhysX, SDL, FMOD, ImGui, Raylib' },
  { title: 'Databases', items: 'SQL, ERD diagrams' },
  {
    title: 'Soft skills',
    items:
      'Communication, problem-solver, adaptable, quick learner, self-management, life-time learner, helpful',
  },
];

export const introParagraphs: ReactNode = (
  <>
    <p>
      <strong>Hi there, and welcome to my portfolio!</strong>
    </p>
    <p>
      This is a collection of the projects I&apos;m most proud of, showcasing my journey through
      game development and software engineering.
    </p>
    <p>
      You&apos;ll find both personal and collaborative works here, some created during my studies at
      Digital Arts and Entertainment, others from my professional work, and the rest crafted during
      my free time. I hope you enjoy exploring my work as much as I enjoyed creating it!
    </p>
  </>
);
