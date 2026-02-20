// Compatibility re-export module.
//
// Several parts of the app import messaging helpers from:
//   - "@/app/messaging/messagesController"
//   - "../messagesController"
//
// The actual implementation lives in "./controller".
// This file keeps those imports working and prevents TS2307 module-not-found errors.

export * from './controller';
export { default } from './controller';
