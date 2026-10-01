import { faEnvelope, faFolderOpen, faUser } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fragment } from 'react';

import { Nav } from '../../shared/components/Nav';
import { Seo } from '../../shared/components/Seo';
import { TiltButton } from '../../shared/components/TiltButton';
import { ProjectShowcase } from '../components/ProjectShowcase';
import { SectionHeading } from '../components/SectionHeading';
import { SiteFooter } from '../components/SiteFooter';
import { aboutBlocks, introParagraphs, skillGroups } from '../content/about';
import { contactLinks, hero } from '../content/home';
import { CATEGORY_HEADINGS, getProjectGroups } from '../content/projects';

/** Vertical rhythm for the top-level sections, with the matching offset for the anchor links. */
const SECTION_SPACING =
    'scroll-mt-[clamp(6rem,5vw+5rem,12.5rem)] my-[clamp(8rem,5vw+5rem,12.5rem)]';

export default function Home()
{
    const groups = getProjectGroups();

    return (
        <>
            <Seo />
            <Nav />

            <header className="container-page">
                <div className="my-[clamp(4rem,2.5vw+2.5rem,6.25rem)] grid grid-cols-3 items-center gap-8 max-[668px]:grid-cols-1 max-[668px]:place-items-center max-[668px]:gap-16">
                    <div className="col-span-2 pe-[20%] max-[992px]:pe-[5%] max-[668px]:col-span-1 max-[668px]:p-0">
                        <div className="tag tag--big max-[1200px]:mb-2">{hero.tag}</div>
                        <h1 className="mb-4 font-mono text-[clamp(1.75rem,2.25vw+1.25rem,3.75rem)] font-light">
                            {hero.heading}
                        </h1>
                        <div className="rich-text mb-6">{introParagraphs}</div>
                    </div>
                    <div className="aspect-square max-h-80 bg-accent">
                        <img
                            src={hero.image}
                            alt=""
                            // The largest thing on screen at load, so it goes before the rest.
                            fetchPriority="high"
                            className="h-full w-full rotate-[-5deg] rounded-[5px] border-2 border-edge object-cover"
                        />
                    </div>
                </div>
            </header>

            <main className="container-page">
                <section id="projects" className={SECTION_SPACING}>
                    <SectionHeading icon={faFolderOpen}>Projects</SectionHeading>

                    {/* Fragments, not wrapper divs, because .group-heading:first-of-type only
                        zeroes the leading margin when the headings are siblings. */}
                    {groups.map((group) => (
                        <Fragment key={group.category}>
                            <h3 className="group-heading">{CATEGORY_HEADINGS[group.category]}</h3>
                            <ProjectShowcase projects={group.projects} />
                        </Fragment>
                    ))}
                </section>

                <section id="about" className={SECTION_SPACING}>
                    <SectionHeading icon={faUser}>About me</SectionHeading>

                    <div className="grid grid-cols-3 gap-8 max-[1200px]:grid-cols-2 max-[992px]:grid-cols-1 max-[992px]:gap-16">
                        <div className="col-span-2 pe-[20%] max-[1200px]:col-span-1 max-[992px]:p-0">
                            {/* Fragments, so .tag--label:first-child zeroes the leading
                                margin on the first label only. */}
                            <div className="rich-text">
                                {aboutBlocks.map((block) => (
                                    <Fragment key={block.label}>
                                        <span className="tag tag--label">{block.label}</span>
                                        {block.body}
                                    </Fragment>
                                ))}
                            </div>
                        </div>

                        <div className="accent-slab-after relative rounded-[5px] border-2 border-edge bg-bg p-6">
                            {skillGroups.map((group) => (
                                <div key={group.title} className="mb-2">
                                    <strong>{group.title}</strong>
                                    <br />
                                    {group.items}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section
                    id="contact"
                    className="scroll-mt-[clamp(6rem,5vw+5rem,12.5rem)] mt-[clamp(8rem,5vw+5rem,12.5rem)] mb-[clamp(4rem,2.5vw+2.5rem,6.25rem)]"
                >
                    <SectionHeading icon={faEnvelope}>Contact &amp; links</SectionHeading>

                    <div className="grid grid-cols-[repeat(2,max-content)] justify-center justify-items-center gap-x-[clamp(10px,0.8vw+4px,24px)] gap-y-[clamp(10px,0.8vw+4px,20px)] max-[600px]:grid-cols-1 min-[600px]:[&>*:nth-child(odd)]:justify-self-end min-[600px]:[&>*:nth-child(even)]:justify-self-start">
                        {contactLinks.map((link) => (
                            <TiltButton key={link.url}>
                                <a href={link.url} target="_blank" rel="noreferrer">
                                    <FontAwesomeIcon icon={link.icon} />
                                    {link.text}
                                </a>
                            </TiltButton>
                        ))}
                    </div>
                </section>
            </main>

            <SiteFooter />
        </>
    );
}
