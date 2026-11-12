import { load } from "cheerio";
import type { PublicProfileMetadata } from "./types.js";

/** Only metadata explicitly published in the public page; no inferred account facts. */
export function extractProfileMetadata(html: string): PublicProfileMetadata {
  const $ = load(html);
  const clean = (value: string | undefined): string | null =>
    value
      ? [...value]
          .map((character) => {
            const code = character.codePointAt(0)!;
            return code < 32 || (code >= 127 && code <= 159) ? " " : character;
          })
          .join("")
          .trim() || null
      : null;
  return {
    name: clean(
      $('meta[property="og:title"]').attr("content") ?? $("title").text(),
    ),
    description: clean(
      $('meta[property="og:description"]').attr("content") ??
        $('meta[name="description"]').attr("content"),
    ),
    type: clean($('meta[property="og:type"]').attr("content")),
  };
}
