/**
 * Undoing Gmail's dialect: a written query in, provider-neutral terms out.
 *
 * The manual attach path is full of strings that were written as Gmail queries
 * — a learned Partner pattern stored as `from:amazon.de invoice`, a Gemini
 * suggestion prompted in Gmail's syntax, whatever the user typed into the
 * search box. #240 lowers all of them to MailSearchTerms before they reach a
 * mailbox, so one operator cannot mean a search on Gmail and a literal word
 * on IMAP.
 *
 * The counterpart is mail/gmail-query.ts, which compiles terms back into a
 * Gmail query for the mailbox that does speak it.
 */

import type { MailSearchTerms } from "./provider";

/**
 * Words and quotes, with a quoted phrase kept whole — including the phrase an
 * operator introduces, so `subject:"Ihre Rechnung"` stays one term instead of
 * splitting into a broken operator and a stray word.
 */
const TOKEN = /(?:[A-Za-z]+\s*:\s*)?"[^"]*"|\S+/g;

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

/**
 * Read one written query as terms.
 *
 * Operators that have a neutral equivalent become it (`from:`, `filename:`,
 * `has:attachment`). `subject:` lowers to a plain keyword — no provider term
 * says "in the subject only", and dropping the word instead would lose the
 * search. A negated term is dropped, because no provider term says "not" and a
 * literal "-word" would match nothing. Anything else is free text.
 *
 * Gmail's grouping punctuation (parens, a bare `OR`) carries no meaning once
 * the terms are ORed by construction, so it is stripped rather than honoured.
 */
export function termsFromQuery(query: string): MailSearchTerms {
  const keywords: string[] = [];
  const filenames: string[] = [];
  let from: string | undefined;
  let hasAttachment: boolean | undefined;

  for (const raw of query.match(TOKEN) ?? []) {
    const token = raw.replace(/^\(+|\)+$/g, "").trim();
    if (!token || token === "OR" || token === "AND") continue;

    // A leading `-` is Gmail's negation, and nothing in the neutral vocabulary
    // says "not". Kept as a keyword it would search for a literal "-word" and
    // find nothing; dropped, the search is only wider than the writer asked
    // for. Wider is the honest failure of the two.
    if (token.startsWith("-")) continue;

    const operator = /^(from|filename|subject|has)\s*:\s*(.+)$/i.exec(token);
    if (!operator) {
      const text = unquote(token);
      if (text) keywords.push(text);
      continue;
    }

    const value = unquote(operator[2]);
    switch (operator[1].toLowerCase()) {
      case "from":
        from = value;
        break;
      case "filename":
        filenames.push(value);
        break;
      case "subject":
        if (value) keywords.push(value);
        break;
      default:
        // `has:attachment`; any other `has:` value is Gmail-only and dropped.
        if (value.toLowerCase() === "attachment") hasAttachment = true;
    }
  }

  return {
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(from ? { from } : {}),
    ...(filenames.length > 0 ? { filenames } : {}),
    ...(hasAttachment !== undefined ? { hasAttachment } : {}),
  };
}
