import fs from "fs";
const path = "C:/dev/quanto-clone/src/data/finance.ts";
let src = fs.readFileSync(path, "utf8");

const orphan = `/* Generate a bill for a credit card account (manual trigger).
   Moves the specified amount from unbilled to billed \u2014 does NOT auto-sweep everything.
   Must be called inside a MUTATE. amountPaie is in paise. */
export function isBillMoveTxn(t: Txn): boolean {`;
const fixed = `export function isBillMoveTxn(t: Txn): boolean {`;
if (!src.includes(orphan)) throw new Error("orphan not found");
src = src.split(orphan).join(fixed);

const anchor = `export function generateCardBill(doc: Doc, accountId: string, today: string, amountPaie: number): boolean {`;
const comment = `/* Generate a bill for a credit card account (manual trigger).
   Moves the specified amount from unbilled to billed \u2014 does NOT auto-sweep everything.
   Must be called inside a MUTATE. amountPaie is in paise. */
`;
if (!src.includes(anchor)) throw new Error("anchor not found");
src = src.replace(anchor, comment + anchor);

fs.writeFileSync(path, src, "utf8");
console.log("FINANCE_COMMENT_OK");