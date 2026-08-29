/**
 * The QA accounts, and the one place their ids live.
 *
 * These are REAL, fully working accounts in production, created so
 * authenticated screens can be verified by using them rather than by
 * reading the code. Everything else about them is ordinary: the seller
 * signs in, lists, uploads and is prompted exactly as any other seller is.
 *
 * What is NOT ordinary is that they are excluded from the operational
 * views, so they never inflate a number someone acts on: the public seller
 * count, the outreach queue, and the no-video backlog. That exclusion is
 * client side on purpose, so nothing about the database's own behaviour
 * differs for them and a bug cannot hide behind a special case.
 *
 * Sign in with the password kept alongside these accounts. If either row is
 * ever deleted, delete the matching id here too, or the filters below start
 * silently hiding a real person who inherits the id.
 */

/** marketplace_sellers.id */
export const TEST_SELLER_IDS = ["aaaaaaaa-0000-4000-8000-000000000021"] as const;

/** customers.id, for the buyer AND the seller's own customer row. */
export const TEST_CUSTOMER_IDS = [
  "1a43d51f-09f8-43b1-bccb-a32ba88838fe", // qa-seller@bundledmum.test
  "8c823bfd-cab8-462d-b363-3cadf0b20b24", // qa-buyer@bundledmum.test
] as const;

/** Anything the outreach queue might key on: it returns seller ids for
 * seller rows and customer ids for buyer rows. */
const EXCLUDED = new Set<string>([...TEST_SELLER_IDS, ...TEST_CUSTOMER_IDS]);

export function isTestAccountId(id: string | null | undefined): boolean {
  return !!id && EXCLUDED.has(id);
}

/** A PostgREST `in` list, for filtering server side without fetching rows. */
export function testSellerIdList(): string {
  return `(${TEST_SELLER_IDS.join(",")})`;
}
