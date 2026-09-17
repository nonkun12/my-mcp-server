import { z } from "zod";

export const MAX_ID = 128;
export const MAX_INSTRUCTION = 4000;
export const MAX_ITEMS = 32;
export const UNSAFE_CHARS = /[\u0000-\u001f\u007f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/u;

export const safeText = (max) =>
  z.string()
    .transform((value) => value.normalize("NFKC"))
    .pipe(
      z.string().trim().min(1).max(max).refine(
        (value) => !UNSAFE_CHARS.test(value),
        "control, invisible, or bidi characters are not allowed"
      )
    );

export const resourcesSchema = z.array(safeText(256)).max(MAX_ITEMS);
export const dependsOnSchema = z.array(safeText(MAX_ID)).max(MAX_ITEMS);
