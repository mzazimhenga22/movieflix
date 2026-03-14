// Compatibility re-export module.
//
// Several parts of the app import messaging helpers from:
//   - "@/app/messaging/messagesController"
//   - "../messagesController"
//
// The actual implementation lives in "./controller".
// This file keeps those imports working and prevents TS2307 module-not-found errors.
//
// NOTE: Only named re-exports here. The DummyTsRoute default is required by expo-router
// (which picks up all .ts/.tsx files in the app/ directory as routes).
// export { default } was removed because you cannot have two default exports.

export * from './controller';

export default function DummyTsRoute() { return null; }
