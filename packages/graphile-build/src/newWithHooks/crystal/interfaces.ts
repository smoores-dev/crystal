import { Batch } from "./batch";

export type GraphQLRootValue = any;
export type GraphQLVariables = { [key: string]: unknown };
export type GraphQLArguments = { [key: string]: unknown };

export const $$plan = Symbol("plan");
export const $$data = Symbol("data");
export const $$root = Symbol("root");
// Used to ease creation of PathIdentity
export const $$path = Symbol("path");

/**
 * e.g. `Query.allUsers>UsersConnection.nodes>User.username`
 */
export type PathIdentity = string;

export interface BatchResult {
  [$$root]: Batch;
  [$$data]: unknown;
  [$$path]: PathIdentity;
}

export interface Plan {}
