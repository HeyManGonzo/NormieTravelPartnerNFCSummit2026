// Lightweight markdown rendering for chat: paragraphs, **bold**, and
// simple "- " bullet lists. We avoid a markdown library to keep the
// bundle small and the output predictable.

function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-[color:var(--color-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}

function renderContent(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let listBuffer = null;
  let paraBuffer = null;

  const flushPara = () => {
    if (paraBuffer && paraBuffer.length) {
      blocks.push({ type: 'p', lines: paraBuffer });
      paraBuffer = null;
    }
  };
  const flushList = () => {
    if (listBuffer && listBuffer.length) {
      blocks.push({ type: 'ul', items: listBuffer });
      listBuffer = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^[-•]\s+/.test(line)) {
      flushPara();
      listBuffer = listBuffer ?? [];
      listBuffer.push(line.replace(/^[-•]\s+/, ''));
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      paraBuffer = paraBuffer ?? [];
      paraBuffer.push(line);
    }
  }
  flushPara();
  flushList();

  return blocks.map((b, i) => {
    if (b.type === 'ul') {
      return (
        <ul key={`ul-${i}`} className="my-2 list-disc space-y-1 pl-5">
          {b.items.map((item, j) => (
            <li key={`li-${i}-${j}`}>{renderInline(item, `li-${i}-${j}`)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={`p-${i}`} className="whitespace-pre-wrap">
        {b.lines.map((l, j) => (
          <span key={`pl-${i}-${j}`}>
            {renderInline(l, `pl-${i}-${j}`)}
            {j < b.lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export default function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  const wrapper = isUser ? 'justify-end' : 'justify-start';
  const bubble = isUser
    ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)] rounded-2xl rounded-br-sm'
    : 'bg-[color:var(--color-surface)] text-[color:var(--color-text)] border border-[color:var(--color-border)] rounded-2xl rounded-bl-sm';

  return (
    <div className={`flex w-full items-end gap-2 ${wrapper}`}>
      {!isUser && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/gemel.svg"
          alt=""
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-0.5"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <div
        className={`max-w-[82%] space-y-2 px-4 py-3 text-[15px] leading-relaxed sm:max-w-[74%] ${bubble}`}
      >
        {renderContent(content)}
      </div>
    </div>
  );
}
