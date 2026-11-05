/**
 * The nickname feature's public entry for other features (ARCHITECTURE
 * §2.2). The field and its words are extension points of their own
 * (`@/features/nickname/nickname-field`, `@/features/nickname/copy`); this
 * entry holds the client half of the slur filter, which every field that
 * takes text for others to see can share (Group names, room names, quiz
 * fields; §8.13). Nothing re-exported here is a client module, and the
 * term list itself loads only when `loadTextFilter` is first called.
 */
export { loadTextFilter, type TextFilter } from "./filter";
