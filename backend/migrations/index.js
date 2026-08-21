// The migration list, in dependency order (DB-010).
//
// The order is the one the remediation plan specifies and it is not arbitrary:
//
//   001 indexes            — nothing depends on it, everything is faster for it
//   002 order snapshots    — must precede the transactional path, which writes
//                            snapshots, and precede 004, which converts prices
//                            that only exist once 002 has written them
//   003 order-number counter and its unique index — must precede the
//                            transactional path, which allocates inside it
//   004 minor units        — after 002, so lines exist to convert
//   005 inventoryV2        — the largest change; independent of the money work
//   006 refs + archive     — after 002, so order history is self-contained
//                            before product references start being enforced
//   007 schema tightening  — backfills fields the tightened schemas declare
//   008 showcase           — last; additive homepage-selection metadata, which
//                            nothing else depends on
//
// `down()` therefore runs in reverse, which `runMigrations` does for you.
//
// **Executing any of these is authorised only against an ephemeral loopback
// MongoDB created by the test process.** There is no CLI in this directory.

import m001 from './001_indexes.js'
import m002 from './002_order_snapshots.js'
import m003 from './003_order_number_counter.js'
import m004 from './004_money_minor_units.js'
import m005 from './005_inventory_v2.js'
import m006 from './006_refs_and_archive.js'
import m007 from './007_schema_tightening.js'
import m008 from './008_showcase.js'

/** Every migration, in the order `up()` must run. */
export const migrations = [m001, m002, m003, m004, m005, m006, m007, m008]

export default migrations

export { m001, m002, m003, m004, m005, m006, m007, m008 }
