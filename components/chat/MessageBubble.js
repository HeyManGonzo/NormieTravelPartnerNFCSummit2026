// Lightweight markdown rendering for chat: paragraphs, **bold**,
// [text](url) links, and simple "- " bullet lists. We avoid a markdown
// library to keep the bundle small and the output predictable.

// Tolerates one space between ] and ( since the model sometimes emits
// it; otherwise the link falls back to plain text. The label group
// accepts one level of nested square brackets so event titles like
// "VIBE-A-THON [CoLab x NFC Summit]" still render as links.
const LINK_RE = /\[((?:[^\[\]]+|\[[^\[\]]*\])+)\]\s?\(([^)\s]+)\)/g;
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

// Models sometimes wrap a link in bold (**[label](url)**), which leaves
// dangling ** markers around our parsed link. Strip the wrapper before
// rendering — the link styling already gives the label visual weight.
const BOLD_LINK_RE = /\*\*(\[(?:[^\[\]]+|\[[^\[\]]*\])+\]\s?\([^)\s]+\))\*\*/g;
function stripBoldLinkWrappers(text) {
  return text.replace(BOLD_LINK_RE, '$1');
}

function renderTextChunk(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
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

function renderInline(text, keyPrefix) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...renderTextChunk(text.slice(last, m.index), `${keyPrefix}-${i}`));
      i += 1;
    }
    const [, label, href] = m;
    if (SAFE_HREF.test(href)) {
      out.push(
        <a
          key={`${keyPrefix}-a-${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[color:var(--color-accent)] decoration-1 underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>,
      );
    } else {
      out.push(<span key={`${keyPrefix}-a-${i}`}>{m[0]}</span>);
    }
    i += 1;
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(...renderTextChunk(text.slice(last), `${keyPrefix}-${i}`));
  }
  return out;
}

function renderContent(content) {
  const lines = stripBoldLinkWrappers(content).split(/\r?\n/);
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

export default function MessageBubble({ role, content, streaming = false, avatar = '/gemel.svg' }) {
  const isUser = role === 'user';
  const wrapper = isUser ? 'justify-end' : 'justify-start';
  const bubble = isUser
    ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)] rounded-2xl rounded-br-sm'
    : 'bg-[color:var(--color-surface)] text-[color:var(--color-text)] border border-[color:var(--color-border)] rounded-2xl rounded-bl-sm';

  // Append a blinking cursor while tokens are still arriving.
  const displayContent = streaming ? content + '▋' : content;

  return (
    <div className={`flex w-full items-end gap-2 ${wrapper}`}>
      {!isUser && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-0.5"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <div
        className={`max-w-[82%] space-y-2 px-4 py-3 text-[15px] leading-relaxed sm:max-w-[74%] ${bubble}`}
      >
        {renderContent(displayContent)}
      </div>
    </div>
  );
}
