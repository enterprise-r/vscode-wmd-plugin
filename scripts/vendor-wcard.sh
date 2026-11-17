#!/usr/bin/env bash
# Copies the work card stylesheet and the palette from project-wcard.
# The preview has no runs and no editing, so run-state styles (blur,
# grayscale, hover-reveal, run marks and glow), guard.js, rows.js, the
# app shell and the fonts stay in wcard and are not copied.
#
#   scripts/vendor-wcard.sh [ref] [checkout]
#     ref defaults to main (a branch, tag or commit)
#     checkout, if set, is a local project-wcard repo used instead of a fetch
#
# The copied files carry no commit id. The script prints the commit it
# copied from, for the commit message.
set -euo pipefail

ref=${1:-main}
checkout=${2:-}
repo=https://github.com/enterprise-r/project-wcard.git
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [[ -n $checkout ]]; then
  git -C "$checkout" rev-parse --is-inside-work-tree >/dev/null
  git -C "$checkout" cat-file -e "$ref^{commit}"
  src=$tmp/src
  mkdir -p "$src"
  git -C "$checkout" archive --format=tar "$ref" | tar -C "$src" -xf -
  commit=$(git -C "$checkout" rev-parse "$ref^{commit}")
else
  src=$tmp/src
  mkdir -p "$src"
  git -C "$tmp" init -q src
  git -C "$src" fetch -q --depth 1 "$repo" "$ref"
  git -C "$src" checkout -q FETCH_HEAD
  commit=$(git -C "$src" rev-parse HEAD)
fi

palette=$src/vendor/theme/palette.css
style=$src/vendor/wmd/style.css
wcard=$src/page/wcard.css
for f in "$palette" "$style" "$wcard"; do
  [[ -f $f ]] || { echo "vendor-wcard.sh: missing $f in $ref" >&2; exit 1; }
done

# Fail before writing if the copy is not in the shape the edits expect.
grep -q '^\.wmd {' "$style" || { echo "style.css: no '.wmd {' scope" >&2; exit 1; }
grep -q '&:is(.wmd-full, .wmd-screen, .wmd-flow, .wmd-receipt)' "$style" ||
  { echo "style.css: print rule not found" >&2; exit 1; }
grep -q '& :is(blockquote, .frontmatter, .frontmatter-error) { display: none; }' "$style" ||
  { echo "style.css: flow front-matter hide not found" >&2; exit 1; }
grep -q 'in \*, out \*, record \*, \.wmd-record \*, \.wmd-schema \*, \.wmd-check \*,$' "$style" ||
  { echo "style.css: flow :not() list not found" >&2; exit 1; }

cp "$palette" "$here/media/palette.css"

{
  echo "/* Vendored from enterprise-r/project-wcard vendor/wmd/style.css by"
  echo "   scripts/vendor-wcard.sh."
  echo "   Edits for the preview: the scope is body.wmd, so only a .w.md"
  echo "   preview is styled; document is included in the print rule; and"
  echo "   the flow view keeps the front matter. Colors per VS Code theme"
  echo "   live in media/colors.css. Card drawing that wcard adds on top"
  echo "   of this sheet, other than run-state styles, is in media/draw.css. */"
  # Drop the "vendored from the plugin" header and the wcard print note,
  # restore the preview scope, print document, and show flow front matter.
  sed -e '1,/^\/\* Applies only when/{ /^\/\* Applies only when/!d; }' \
      -e 's/^\.wmd {/body.wmd {/' \
      -e '/wcard: document prints as the document/d' \
      -e 's/\&:is(.wmd-full, .wmd-screen, .wmd-flow, .wmd-receipt)/\&:is(.wmd-full, .wmd-screen, .wmd-document, .wmd-flow, .wmd-receipt)/' \
      -e 's|& :is(blockquote, .frontmatter, .frontmatter-error) { display: none; }|\& blockquote { display: none; }|' \
      -e 's|Flow: only the enabled elements; quotes, front matter and freestanding text go|Flow: the front matter and the enabled elements; quotes and freestanding text go|' \
      -e 's|in \*, out \*, record \*, \.wmd-record \*, \.wmd-schema \*, \.wmd-check \*,$|.frontmatter, .frontmatter-error,\n             in *, out *, record *, .wmd-record *, .wmd-schema *, .wmd-check *, .frontmatter *, .frontmatter-error *,|' \
      "$style"
} > "$here/media/style.css"

python3 - "$wcard" "$here/media/draw.css" << 'PY'
import re, sys

src_path, out_path = sys.argv[1], sys.argv[2]
css = open(src_path, encoding="utf-8").read()

KEEP = (
    "An agent's prompt and a schema share the notice's box",
    "Code in the plugin's bubbles and schema box is 85%",
    "The compact schema on flow is indented",
    "An agent's inputs sit side by side",
    "A form's line is double, an agent's is dashed",
    "LCARS elbows:",
    "The check bubble is solid",
    "Screen: an agent's",
    "Document: a clean, printable document",
    "A text field is a line to write on",
    "A list is a table: a row per item",
    "Receipt: the card as written gives an example receipt",
    "The value is the placeholder, gray italic",
)

def comment_keeps(text):
    body = text[2:-2].strip()
    return any(body.startswith(prefix) for prefix in KEEP)

def is_mid_note(text):
    body = text[2:-2].strip()
    return body.startswith("On the receipt a step's run marks")

def should_skip(text):
    if re.search(r"filter\s*:|grayscale\s*\(|\bblur\s*\(|--wmd-wait-filter|--wmd-done-filter", text):
        return True
    if re.search(r"wmd-arrive|r-glow|r-rows|r-group|r-btn|#card|#stage|#doc", text):
        return True
    if re.search(r"\[data-state\b|\[data-carried\b|\[data-page\b|\[data-outcome\b|\[data-reused\b", text):
        return True
    stripped = re.sub(r":not\(\[data-status\]\)", "", text)
    if re.search(r"\[data-status", stripped):
        return True
    return False

def skip_ws(s, i):
    n = len(s)
    while i < n and s[i].isspace():
        i += 1
    return i

def read_comment(s, i):
    if not s.startswith("/*", i):
        return None, i
    end = s.find("*/", i + 2)
    if end < 0:
        raise ValueError("unclosed comment")
    return s[i:end + 2], end + 2

def read_string(s, i):
    q = s[i]
    j = i + 1
    while j < len(s):
        if s[j] == "\\":
            j += 2
            continue
        if s[j] == q:
            return s[i:j + 1], j + 1
        j += 1
    raise ValueError("unclosed string")

def read_block(s, i):
    """i is at '{'. Return the slice from '{' through the matching '}'."""
    assert s[i] == "{"
    depth = 0
    j = i
    n = len(s)
    while j < n:
        if s.startswith("/*", j):
            _, j = read_comment(s, j)
            continue
        if s[j] in "\"'":
            _, j = read_string(s, j)
            continue
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            j += 1
            if depth == 0:
                return s[i:j], j
            continue
        j += 1
    raise ValueError("unclosed block")

def read_statement(s, i):
    """Read one top-level comment, at-rule, or style rule. Skip leading whitespace."""
    i = skip_ws(s, i)
    if i >= len(s):
        return None, i
    if s.startswith("/*", i):
        text, j = read_comment(s, i)
        return ("comment", text), j
    # prelude until { or ;
    j = i
    n = len(s)
    while j < n:
        if s.startswith("/*", j):
            _, j = read_comment(s, j)
            continue
        if s[j] in "\"'":
            _, j = read_string(s, j)
            continue
        if s[j] == "{":
            block, k = read_block(s, j)
            return ("rule", s[i:k]), k
        if s[j] == ";":
            return ("rule", s[i:j + 1]), j + 1
        j += 1
    rest = s[i:].strip()
    if rest:
        raise ValueError(f"trailing CSS: {rest[:80]}")
    return None, n

def comment_text(c):
    return c[2:-2].strip()

def is_section_comment(text):
    """A top-level comment that starts a new section, not a mid-rule note."""
    body = comment_text(text)
    if not body:
        return False
    # File header and the "Where the page differs" banner.
    if body.startswith("wcard.css:") or body.startswith("----"):
        return True
    # Section comments in this file are prose sentences or "LCARS elbows:".
    return True

def filter_atrule(text):
    """Keep an @media/@container if any inner rules survive."""
    brace = text.find("{")
    if brace < 0:
        return None if should_skip(text) else text
    prelude, inner = text[:brace + 1], text[brace + 1:-1]
    if should_skip(prelude):
        return None
    kept = []
    i, n = 0, len(inner)
    pending_comments = []
    while True:
        item, i = read_statement(inner, i)
        if item is None:
            break
        kind, body = item
        if kind == "comment":
            pending_comments.append(body)
            continue
        # Nested at-rule or style rule
        chunk = body
        if body.lstrip().startswith("@"):
            chunk = filter_atrule(body)
            if not chunk:
                pending_comments.clear()
                continue
        elif should_skip(body):
            pending_comments.clear()
            continue
        kept.extend(pending_comments)
        pending_comments.clear()
        kept.append(chunk)
    if not kept:
        return None
    inner_out = "\n".join(kept)
    return prelude + "\n" + inner_out + "\n}"

# Walk the file, emitting kept sections.
out = []
i, n = 0, len(css)
keeping = False
pending = []  # comments belonging to the current keep stretch

while True:
    item, i = read_statement(css, i)
    if item is None:
        break
    kind, body = item
    if kind == "comment":
        if comment_keeps(body):
            keeping = True
            pending.append(body)
        elif keeping and is_mid_note(body):
            # A note between rules of a kept section, not a new section.
            pending.append(body)
        else:
            keeping = False
            pending.clear()
        continue
    if not keeping:
        continue
    chunk = body
    if body.lstrip().startswith("@"):
        chunk = filter_atrule(body)
        if not chunk:
            continue
    elif should_skip(body):
        continue
    out.extend(pending)
    pending = []
    out.append(chunk)

def scope_wmd(text):
    # .wmd followed by a delimiter, not .wmd-full / .wmd-schema / …
    return re.sub(r"\.wmd(?=[:{\[.\s]|$)", "body.wmd", text)

header = """/* Card drawing rules from enterprise-r/project-wcard page/wcard.css,
   copied by scripts/vendor-wcard.sh. Run-state styles (blur, grayscale,
   hover-reveal, run marks and glow) are left out. Selectors use the
   preview's body.wmd scope. The box inset tokens match the card's pad,
   so the elbows and the notice box share it. */
body.wmd {
  --r-text-pad: 1rem;
  --r-box-gap: 4px;
  --r-box-pad: calc(var(--r-text-pad) - var(--r-box-gap));
  --markdown-font-size: 1em;
}
@property --markdown-font-size { syntax: "<length>"; inherits: true; initial-value: 16px; }

body.wmd:is(.wmd-full, .wmd-screen, .wmd-flow) :is(card, form, gonogo) {
  padding-inline: var(--r-box-pad);
}

"""

body = scope_wmd("\n\n".join(out).strip() + "\n")
open(out_path, "w", encoding="utf-8").write(header + body)
if not out:
    raise SystemExit("vendor-wcard.sh: no card drawing rules extracted")
PY

echo "Vendor the card stylesheet from project-wcard $ref at ${commit:0:7}"
