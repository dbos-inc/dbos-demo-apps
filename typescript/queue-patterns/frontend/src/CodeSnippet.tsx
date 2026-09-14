// A tiny TypeScript highlighter for the short, fixed snippets shown in the UI.
// It only needs to recognize the constructs those snippets use, so it avoids
// pulling in a full syntax-highlighting library.

const TOKEN_PATTERN =
  /(\/\/.*)|('(?:[^'\\]|\\.)*')|(\b\d+\b)|(\b(?:await|async|const|let|new|function|return)\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;

type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'function' | 'class' | 'property' | 'plain';

interface Token {
  text: string;
  kind: TokenKind;
}

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const [text, comment, str, num, keyword, ident] = match;
    let kind: TokenKind = 'plain';
    if (comment) kind = 'comment';
    else if (str) kind = 'string';
    else if (num) kind = 'number';
    else if (keyword) kind = 'keyword';
    else if (ident) {
      // Classify identifiers by what follows them: calls, object keys, or type-like names.
      const rest = code.slice((match.index ?? 0) + text.length);
      if (/^\s*\(/.test(rest)) kind = 'function';
      else if (/^\s*:/.test(rest)) kind = 'property';
      else if (/^[A-Z]/.test(ident)) kind = 'class';
    }
    tokens.push({ text, kind });
  }
  return tokens;
}

export function CodeSnippet({ code }: { code: string }) {
  return (
    <pre className="code-block">
      <code>
        {tokenize(code).map((token, i) =>
          token.kind === 'plain' ? (
            token.text
          ) : (
            <span key={i} className={`tok-${token.kind}`}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}
