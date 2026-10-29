// Plain-language compile errors (spec 4.4). Pure: message in, text out.

const ANSWERS = "`.count()`, `.exists()`, `.first()`, `.sumAmount()`, `update` or `churn`";

// error: { message, line?, col? } as compile() returns it. Returns { text, line }.
export function explainError(error) {
  const raw = String((error && error.message) || error || "");
  const line = error && error.line ? error.line : null;
  const at = line ? `Line ${line}` : "The script";
  const didYou = /; did you mean `([^`]+)`\?/.exec(raw);

  let m = /^(\w+) is not defined/.exec(raw);
  if (m) {
    return { line, text: `\`${m[1]}\` is not a word this table knows. ${didYou ? `Did you mean \`${didYou[1]}\`?` : "Open Syntax for the list."}` };
  }
  m = /(?:\.|^)(\w+) is not a function/.exec(raw);
  if (m) {
    return { line, text: `\`${m[1]}\` cannot be called here. After a field use \`.eq\`, \`.ge\`, \`.gt\`, \`.le\`, \`.lt\` or \`.between\`; after \`where(...)\` use \`.orderBy\`, \`.limit\` or an answer.${didYou ? ` Did you mean \`${didYou[1]}\`?` : ""}` };
  }
  if (/Unexpected (token|identifier|end|string|number)|expected expression|unexpected|missing \)|syntax ?error/i.test(raw) && !/^(Missing|Unterminated|Unexpected `)/.test(raw)) {
    return { line, text: `${at} does not read as code. Check the brackets, commas and quotes on it.` };
  }
  if (/Cannot read propert(y|ies) of (undefined|null)|is undefined|is null/.test(raw)) {
    return { line, text: `${at} uses something that has no value yet. Check the spelling of the names on it.` };
  }
  if (/recorded no operations/.test(raw)) {
    return { line: null, text: `Nothing ran: no line ends with ${ANSWERS}.` };
  }
  // The compile() message is already plain (brackets, strings, limits): keep it, with its line.
  return { line, text: line && !/^Line \d+/.test(raw) ? `Line ${line}: ${raw}` : raw };
}
