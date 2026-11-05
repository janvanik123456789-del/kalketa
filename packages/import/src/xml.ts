/**
 * A small XML reader for files that may come from anyone: no DTD, no entities of its own, nothing loaded from outside,
 * limits on size and depth. Enough for what a worksheet holds; anything else is an error, not a guess.
 */

export interface XmlNode {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlNode[];
  readonly text: string;
}

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 200;
const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export class XmlError extends Error {}

function decoded(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });
}

export function parseXml(source: string): XmlNode {
  if (source.length > MAX_BYTES) throw new XmlError('too large');
  let pos = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack: { name: string; attributes: Map<string, string>; children: XmlNode[]; text: string }[] = [];
  let root: XmlNode | undefined;
  while (pos < source.length) {
    const open = source.indexOf('<', pos);
    const text = open < 0 ? source.slice(pos) : source.slice(pos, open);
    if (stack.length > 0) stack[stack.length - 1]!.text += decoded(text);
    else if (text.trim() !== '') throw new XmlError('text outside the root');
    if (open < 0) break;
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open);
      if (end < 0) throw new XmlError('open comment');
      pos = end + 3;
    } else if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open);
      if (end < 0 || stack.length === 0) throw new XmlError('open CDATA');
      stack[stack.length - 1]!.text += source.slice(open + 9, end);
      pos = end + 3;
    } else if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open);
      if (end < 0) throw new XmlError('open instruction');
      pos = end + 2;
    } else if (source.startsWith('<!', open)) {
      // A DTD could define entities that grow without end: not read at all.
      throw new XmlError('a DTD');
    } else if (source.startsWith('</', open)) {
      const end = source.indexOf('>', open);
      if (end < 0) throw new XmlError('open tag');
      const name = source.slice(open + 2, end).trim();
      const node = stack.pop();
      if (!node || node.name !== name) throw new XmlError(`closing ${name}`);
      const done: XmlNode = { name: node.name, attributes: node.attributes, children: node.children, text: node.text };
      if (stack.length > 0) stack[stack.length - 1]!.children.push(done);
      else root = done;
      pos = end + 1;
    } else {
      // Quotes may hold a >: the end of the tag is looked for past them.
      let end = open + 1;
      let quote = '';
      for (; end < source.length; end++) {
        const c = source[end]!;
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (end >= source.length) throw new XmlError('open tag');
      const empty = source[end - 1] === '/';
      const inside = source.slice(open + 1, empty ? end - 1 : end);
      const m = /^[^\s/>]+/.exec(inside);
      if (!m) throw new XmlError('a tag without a name');
      const attributes = new Map<string, string>();
      for (const a of inside.slice(m[0].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attributes.set(a[1]!, decoded(a[3] ?? a[4] ?? ''));
      if (empty) {
        const done: XmlNode = { name: m[0], attributes, children: [], text: '' };
        if (stack.length > 0) stack[stack.length - 1]!.children.push(done);
        else root = done;
      } else {
        if (stack.length >= MAX_DEPTH) throw new XmlError('too deep');
        stack.push({ name: m[0], attributes, children: [], text: '' });
      }
      pos = end + 1;
    }
  }
  if (stack.length > 0 || !root) throw new XmlError('unfinished');
  return root;
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}
