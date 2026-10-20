/**
 * Tiny, safe markdown subset for chat bubbles: paragraphs, "- " bullets,
 * **bold** and _italic_. Builds React elements, so AI text can never inject HTML.
 */
import { Fragment } from 'react';

function inline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function renderMarkdown(source = '') {
  const blocks = source.trim().split(/\n{2,}/);
  return blocks.map((block, b) => {
    const lines = block.split('\n');
    const isBullet = (line) => /^\s*[-*•]\s+/.test(line);
    const firstBullet = lines.findIndex(isBullet);
    const listIsTail = firstBullet !== -1 && lines.slice(firstBullet).every(isBullet);

    const paragraphLines = listIsTail ? lines.slice(0, firstBullet) : lines;
    const bulletLines = listIsTail ? lines.slice(firstBullet) : [];

    return (
      <Fragment key={b}>
        {paragraphLines.length > 0 && (
          <p>
            {paragraphLines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(line, `${b}-p${i}`)}
              </Fragment>
            ))}
          </p>
        )}
        {bulletLines.length > 0 && (
          <ul>
            {bulletLines.map((line, i) => (
              <li key={i}>{inline(line.replace(/^\s*[-*•]\s+/, ''), `${b}-l${i}`)}</li>
            ))}
          </ul>
        )}
      </Fragment>
    );
  });
}
