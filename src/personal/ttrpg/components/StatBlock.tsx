import { blocksOf, spansOf } from '../content/statBlocks';

/** A line with its bold and italics. Text only, so a stat block can never carry a script. */
function Line({ text }: { text: string })
{
    return spansOf(text).map((span, index) =>
    {
        const plain = span.italic ? <em key={index}>{span.text}</em> : span.text;

        return span.bold ? <strong key={index}>{plain}</strong> : <span key={index}>{plain}</span>;
    });
}

/** A monster preset's Markdown as a stat block, see content/statBlocks.ts. */
export function StatBlock({ markdown }: { markdown: string })
{
    return (
        <div className="ttrpg-statblock">
            {blocksOf(markdown).map((block, index) =>
            {
                switch (block.kind)
                {
                    case 'heading':
                        return block.level === 1 ? (
                            <h3 key={index} className="ttrpg-statblock__name">
                                <Line text={block.text} />
                            </h3>
                        ) : (
                            <h4 key={index} className="ttrpg-statblock__section">
                                <Line text={block.text} />
                            </h4>
                        );
                    case 'lines':
                        return (
                            <p key={index}>
                                {block.lines.map((line, at) => (
                                    <span key={at} className="ttrpg-statblock__line">
                                        <Line text={line} />
                                    </span>
                                ))}
                            </p>
                        );
                    case 'list':
                        return (
                            <ul key={index}>
                                {block.items.map((item, at) => (
                                    <li key={at}>
                                        <Line text={item} />
                                    </li>
                                ))}
                            </ul>
                        );
                    case 'table':
                        return (
                            <table key={index}>
                                <thead>
                                    <tr>
                                        {block.head.map((cell, at) => (
                                            <th key={at}>
                                                <Line text={cell} />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {block.rows.map((row, at) => (
                                        <tr key={at}>
                                            {row.map((cell, column) => (
                                                <td key={column}>
                                                    <Line text={cell} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    case 'rule':
                        return <hr key={index} />;
                }
            })}
        </div>
    );
}
