/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
/*
 * Regular forum. Except, some forums are private.
 *
 * Forums are owned by an organization.
 *
 * Users can only see posts in a private forum if:
 * 1. they are a member of the parent organization, and
 * 2. the organization's subscription is active.
 *
 * To assert the parent organization is up to date with their subscription, we
 * check with Stripe. (Poor example, we'd normally do this with database
 * column, but shows integration of external data into query planning.)
 */

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLList,
  graphql,
  GraphQLString,
  GraphQLObjectTypeConfig,
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
} from "graphql";
import { inspect } from "util";
import sql, { SQL } from "../../pg-sql2/dist";
import { TrackedObject } from "../src/trackedObject";
import { enforceCrystal } from "../src";

const isDev = process.env.NODE_ENV === "development";

/*+--------------------------------------------------------------------------+
  |                            TYPESCRIPT STUFF                              |
  +--------------------------------------------------------------------------+*/

/**
 * It's going to be a TObj, but only containing the things that were actually
 * requested. We should never need to refer to it directly.
 */
type Opaque<TObj extends { [key: string]: any }> = Partial<TObj>;

interface POJOList extends Array<POJOValue> {}
interface POJORecord {
  [key: string]: POJOValue;
}
type POJOValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | POJOList
  | POJORecord;

/**
 * Clones a POJO. Equivalent to `JSON.parse(JSON.stringify(value))`, but
 * hopefully faster for small objects?
 *
 * TODO: benchmark.
 */
function deepClone<TValue extends POJOValue>(value: TValue): TValue {
  const type = typeof value;
  if (
    value == null ||
    type === "boolean" ||
    type === "string" ||
    type === "number"
  ) {
    return value;
  } else if (Array.isArray(value)) {
    return value.map(deepClone) as TValue;
  } else if (type === "object" /* already asserted value isn't null-ish */) {
    const replacement: Partial<TValue> = {};
    for (const key in value) {
      const keyValue = value[key];
      // @ts-ignore s'all good.
      replacement[key] = deepClone(keyValue);
    }
    return replacement as TValue;
  } else {
    throw new Error(
      `The plan object contains disallowed values; expected boolean | string | number | array | object; received ${inspect(
        value,
      )}`,
    );
  }
}

/**
 * Deep freezes a POJO. Expensive, only do during development.
 */
function deepFreeze<TValue extends POJOValue>(value: TValue): void {
  const type = typeof value;
  if (
    value == null ||
    type === "boolean" ||
    type === "string" ||
    type === "number"
  ) {
    /* noop */
  } else if (Array.isArray(value)) {
    Object.freeze(value);
    value.map(deepFreeze);
  } else if (type === "object" /* already asserted value isn't null-ish */) {
    Object.freeze(value);
    for (const key in value) {
      const keyValue = value[key];
      deepFreeze((keyValue as unknown) as POJOValue);
    }
  } else {
    throw new Error(
      `The plan object contains disallowed values; expected boolean | string | number | array | object; received ${inspect(
        value,
      )}`,
    );
  }
}

/*+--------------------------------------------------------------------------+
  |                             GRAPHQL STUFF                                |
  +--------------------------------------------------------------------------+*/

// These are what the generics extend from
export type BaseGraphQLRootValue = any;
export interface BaseGraphQLContext {}
export interface BaseGraphQLVariables {
  [key: string]: unknown;
}
export interface BaseGraphQLArguments {
  [key: string]: unknown;
}

// This is the actual runtime context; we should not use a global for this.
interface GraphileResolverContext extends BaseGraphQLContext {}

/*+--------------------------------------------------------------------------+
  |                               DATA SOURCES                               |
  +--------------------------------------------------------------------------+*/

/**
 * PG data source represents a PostgreSQL data source. This could be a table,
 * view, materialized view, function call, join, etc. Anything table-like.
 */
class PgDataSource<TTable extends { [key: string]: any }> {
  /**
   * TypeScript hack so that we can retrieve the TTable type from a data source
   * at a later time - needed so we can have strong typing on `.get()` and
   * similar methods.
   *
   * @internal
   */
  TTable!: TTable;

  /**
   * @param tableIdentifier - the SQL for the `FROM` clause (without any
   * aliasing). If this is a subquery don't forget to wrap it in parens.
   * @param name - a nickname for this data source. Doesn't need to be unique
   * (but should be). Used for making the SQL query and debug messages easier
   * to understand.
   */
  constructor(public tableIdentifier: SQL, public name: string) {}
}

const messageSource = new PgDataSource<{
  id: string;
  body: string;
  author_id: string;
  created_at: Date;
}>(sql`app_public.messages`, "messages");

const userSource = new PgDataSource<{
  id: string;
  username: string;
  gravatar_url?: string;
  created_at: Date;
}>(sql`app_public.users`, "users");

const forumSource = new PgDataSource<{
  id: string;
  name: string;
}>(sql`app_public.forums`, "forums");

// Convenience so we don't have to type these out each time. These used to be
// separate plans, but required too much maintenance.
type MessagePlan = PgClassSelectPlan<typeof userSource>;
type UserPlan = PgClassSelectPlan<typeof userSource>;
type ForumPlan = PgClassSelectPlan<typeof forumSource>;

/*+--------------------------------------------------------------------------+
  |                            PLANS SPECS                                   |
  +--------------------------------------------------------------------------+*/

/**
 * This is the serializable format of the plan. Note it has to be JSON
 * compatible, so no recursion! Note that we cannot always fully plan an
 * operation without variable values, for example `@skip` / `@include`
 * directives may affect the plan. So we need variables to build the first
 * plan, but we can track these variables so we know which ones affect the plan
 * and we can then re-use these plans if future relevant variables match. Note
 * these are typically booleans, so we don't typically have many combinations.
 * Theoretically we could serialize these plans to `redis` or disk or whatever
 * and share them between instances for distributed optimisation.
 */
interface PlanPOJO<TOperation extends keyof Operations> {
  /** The operation this plan relates to */
  operation: TOperation;

  /**
   * The list of plans this plan is dependent on; the internal identifier may
   * be used inside `data` so must be preserved and not edited; however the
   * external identifier (the value) may be manipulated (e.g. as part of
   * merging plans/optimisation).
   */
  dependencies: {
    [internalIdentifier: string]: string;
  };

  /** Data specific to the operation (each operation has it's own representation) */
  data: OperationData[TOperation];
}

/*+--------------------------------------------------------------------------+
  |                          GRAPHQL HELPERS                                 |
  +--------------------------------------------------------------------------+*/

/**
 * Plan resolvers are like regular resolvers except they're called beforehand,
 * they return plans rather than values, and they only run once for lists
 * rather than for each item in the list.
 *
 * The idea is that the plan resolver returns a plan object which later will
 * process the data and feed that into the actual resolver functions
 * (preferably using the default resolver function?).
 *
 * They are stored onto `<field>.extensions.graphile.plan`
 */
export type PlanResolver<
  TContext extends BaseGraphQLContext,
  TSource extends Plan<any>,
  TResult extends Plan<any>,
  TArgs extends BaseGraphQLArguments
> = (
  $parentPlan: TSource,
  args: TrackedObject<TArgs>,
  context: TrackedObject<TContext>,
) => TResult;

/**
 * Basically GraphQLFieldConfig but with an easy to access `plan` method.
 */
type GraphileCrystalFieldConfig<
  TContext extends BaseGraphQLContext,
  TSource extends Plan<any>,
  TResult extends Plan<any> = Plan<any>,
  TArgs extends BaseGraphQLArguments = BaseGraphQLArguments
> = GraphQLFieldConfig<any, any> & {
  plan?: PlanResolver<TContext, TSource, TResult, TArgs>;
};

/**
 * Saves us having to write `extensions: {graphile: {...}}` everywhere.
 */
function objectFieldSpec<
  TContext extends BaseGraphQLContext,
  TSource extends Plan<any>,
  TResult extends Plan<any> = Plan<any>,
  TArgs extends BaseGraphQLArguments = BaseGraphQLArguments
>(
  graphileSpec: GraphileCrystalFieldConfig<TContext, TSource, TResult>,
): GraphQLFieldConfig<any, TContext, TArgs> {
  const { plan, ...spec } = graphileSpec;
  return {
    ...spec,
    extensions: {
      graphile: {
        plan,
      },
    },
  };
}

/**
 * Saves us having to write `extensions: {graphile: {...}}` everywhere.
 */
function objectSpec<
  TContext extends BaseGraphQLContext,
  TSource extends Plan<any>
>(
  spec: GraphQLObjectTypeConfig<any, TContext> & {
    fields: {
      [key: string]: GraphileCrystalFieldConfig<TContext, TSource>;
    };
  },
): GraphQLObjectTypeConfig<any, TContext> {
  const modifiedFields = Object.keys(spec.fields).reduce((o, key) => {
    o[key] = objectFieldSpec<TContext, TSource>(spec.fields[key]);
    return o;
  }, {} as GraphQLFieldConfigMap<any, TContext>);
  const modifiedSpec: GraphQLObjectTypeConfig<any, TContext> = {
    ...spec,
    fields: modifiedFields,
  };
  return modifiedSpec;
}

/*+--------------------------------------------------------------------------+
  |                           BASE OPERATIONS                                |
  +--------------------------------------------------------------------------+*/

class Operation {}

/**
 * The root operation is the plan for the root of a query, mutation or
 * subscription operation. It's a NOOP.
 */
class RootOperation extends Operation {}

/**
 * (Global) registry for operations (interface to allow declaration merging).
 *
 * `{ [key: string]: Operation<key> }`
 */
interface Operations {
  RootOperation: typeof RootOperation;
}

/**
 * (Global) registry for operation data definitions (interface to allow declaration merging).
 *
 * `{ [key in keyof Operations]: { ...data definition here... } }`
 */
interface OperationData {
  RootOperation: {};
}

/**
 * (Global) registry for operations (the actual implementations).
 */
export const operations: Partial<Operations> = {
  RootOperation,
};

/*+--------------------------------------------------------------------------+
  |                          CUSTOM OPERATIONS                               |
  +--------------------------------------------------------------------------+*/

class PgClassSelectOperation extends Operation {}
interface Operations {
  PgClassSelectOperation: PgClassSelectOperation;
}
interface OperationData {
  PgClassSelectOperation: {
    /* TODO */
  };
}
operations.PgClassSelectOperation = PgClassSelectOperation;

// TODO:
// assertIsOperations(operations); // Turn `Partial<Operations>` to `Operations`

/*+--------------------------------------------------------------------------+
  |                                PLANS                                     |
  +--------------------------------------------------------------------------+*/

interface ExportHelpers {
  idForPlan(plan: Plan<any>): string;
}

/**
 * A plan represents a method to fetch a "future value". Plans are mutable,
 * they may be mutated directly (via the methods they expose), or indirectly
 * (e.g. the optimisation phase might squash plans together, etc). They must
 * not be mutated after they are finalized.
 *
 * **IMPORTANT**: Plans must **ONLY** store data within `this.data`.
 * **IMPORTANT**: `this.data` must be a POJO with no cycles.
 */
export abstract class Plan<TOperation extends keyof Operations> {
  protected readonly operation: TOperation;
  protected readonly data: OperationData[TOperation];
  private finalized = false;
  private dependencyCounter = 0;
  private dependencies: {
    [internalIdentifier: string]: Plan<any>;
  } = {};

  constructor(operation: TOperation, data: OperationData[TOperation] = {}) {
    this.operation = operation;
    this.data = data;
  }

  /**
   * Adds this plan as a dependency, returning an internal identifier (that
   * will not be rewritten) which we can use to refer to this plan.
   */
  protected addDependency(plan: Plan<any>): string {
    this.assertNotFinalized();
    const id = String(this.dependencyCounter++);
    this.dependencies[id] = plan;
    return id;
  }

  /**
   * Throws an error if the plan is already finalized. All subclasses must call
   * this before mutating the plan.
   */
  protected assertNotFinalized() {
    if (this.finalized) {
      throw new Error("Plan is already finalized, it cannot be modified");
    }
  }

  /**
   * Prevents any further modifications to this plan; use before cloning,
   * exporting, etc.
   */
  protected finalize() {
    if (!this.finalized) {
      this.finalized = true;
      Object.freeze(this.dependencies);
      Object.freeze(this.data);
      if (isDev) {
        deepFreeze(this.data);
      }
    }
  }

  /**
   * Clones this plan.
   */
  public clone() {
    // Proof of ts-ignore:
    // ```js
    // class A { constructor() {this.meaning = 42;} clone() {return new this.constructor()}}
    // class B extends A { constructor() {super(); this.life = true;} }
    // console.dir(new B().clone().life); // true
    // ```
    // @ts-ignore Constructing via this.constructor is fine. Leave me alone.
    return new this.constructor(this.operation, deepClone(this.data));
  }

  /**
   * Exports the plan in a format suitable for writing to disk or similar storage via JSON.
   */
  public export({ idForPlan }: ExportHelpers): PlanPOJO<TOperation> {
    this.finalize();
    return {
      operation: this.operation,
      dependencies: Object.keys(this.dependencies).reduce((memo, depName) => {
        memo[depName] = idForPlan(this.dependencies[depName]);
        return memo;
      }, {}),
      data: this.data /* Shouldn't be necessary to clone this (frozen) */,
    };
  }
}

class RootPlan extends Plan<"RootOperation"> {}

/**
 * Not really sure about this... Added it with the intent of maybe adding a
 * `.toSQL()` method to it or something... But currently it's just a proxy for
 * Plan except it makes the `TData` available.
 */
/*
class PgPlan<TData> extends Plan<TData> {
  TData!: TData;
}
*/

/**
 * A plan for selecting a column. Keep in mind that a column might not be a
 * scalar (could be a list, compound type, JSON, geometry, etc), so this might
 * not be a "leaf"; it might be used as the input of another layer of plan.
 */
/*
DISABLED BECAUSE: there's no operation associated with this? It's just a
FutureValue?

class PgColumnSelectPlan<
  TDataSource extends PgDataSource<any>,
  TColumn extends keyof TDataSource["TTable"]
> extends Plan<"PgColumnSelectOperation"> {
  constructor(
    public table: PgClassSelectPlan<TDataSource>,
    public attr: TColumn,
  ) {
    super();
  }
}
*/

/**
 * This represents selecting from a class-like entity (table, view, etc); i.e.
 * it represents `SELECT <columns>, <cursor?> FROM <table>`.  It's not
 * currently clear if it also includes `WHERE <conditions>`,
 * `ORDER BY <order>`, `LEFT JOIN <join>`, etc within its scope. `GROUP BY` is
 * definitely not in scope, because that would invalidate the identifiers.
 *
 * I currently don't expect this to be used to select sets of scalars, but it
 * could be used for that purpose so long as we name the scalars (i.e. create
 * records from them).
 */
class PgClassSelectPlan<TDataSource extends PgDataSource<any>> extends Plan<
  "PgClassSelectOperation"
> {
  symbol: symbol;

  /** = sql.identifier(this.symbol) */
  alias: SQL;

  /**
   * The data source from which we are selecting: table, view, etc
   */
  dataSource: TDataSource;

  /**
   * Since this is effectively like a DataLoader it processes the data for many
   * different resolvers at once. This list of (hopefully scalar) plans is used
   * to identify which records in the result set should be returned to which
   * GraphQL resolvers.
   */
  identifiers: Array<Plan<any>>;

  /**
   * This is the list of SQL fragments in the result that are compared to the
   * above `identifiers` to determine if there's a match or not. Typically this
   * will be a list of columns (e.g. primary or foreign keys on the table).
   */
  identifierMatches: SQL[];

  /**
   * If true, we're expecting each identifier to have 0-n results (i.e. a
   * list).  If false, we're expecting each identifier to get one result (or
   * null).
   */
  many: boolean;

  constructor(
    dataSource: TDataSource,
    identifiers: Plan<any>[],
    identifierMatchesThunk: (alias: SQL) => SQL[],
    many = false,
  ) {
    super();
    this.dataSource = dataSource;
    this.symbol = Symbol(dataSource.name);
    this.alias = sql.identifier(this.symbol);
    this.identifiers = identifiers;
    this.identifierMatches = identifierMatchesThunk(this.alias);
    if (this.identifiers.length !== this.identifierMatches.length) {
      throw new Error(
        `'identifiers' and 'identifierMatches' lengths must match (${this.identifiers.length} != ${this.identifierMatches.length})`,
      );
    }
    this.many = many;
    return this;
  }

  /**
   * We only want to fetch each column once (since columns don't accept any
   * parameters), so this memo keeps track of which columns we've selected so
   * their plans can be easily reused.
   */
  colPlans: {
    [key in keyof TDataSource["TTable"]]?: PgColumnSelectPlan<TDataSource, key>;
  } = {};

  /**
   * Returns a plan representing a named attribute (e.g. column) from the class
   * (e.g. table).
   */
  get<TAttr extends keyof TDataSource["TTable"]>(
    attr: TAttr,
  ): PgColumnSelectPlan<TDataSource, TAttr> {
    // Only one plan per column
    if (!this.colPlans[attr]) {
      this.colPlans[attr] = new PgColumnSelectPlan(this, attr);
    }
    return this.colPlans[attr]!;
  }

  /**
   * Not sure about this at all. When selecting a connection we need to be able
   * to get the cursor. The cursor is built from the values of the `ORDER BY`
   * clause so that we can find nodes before/after it. This may or may not be
   * the right place for this.
   */
  cursor() {
    return this.get("TODO_cursor_here");
  }
}

class ConnectionPlan<TSubplan extends Plan<any>> extends Plan<Opaque<any>> {
  constructor(public readonly subplan: TSubplan) {
    super();
  }

  /*
  executeWith(deps: any) {
    /*
     * Connection doesn't do anything itself; so `connection { __typename }` is
     * basically a no-op. However subfields will need access to the deps so
     * that they may determine which fetched rows relate to them.
     * /
    return { ...deps };
  }
  */
}

class PgConnectionPlan<
  TSubplan extends /* PgPlan? */ Plan<any>
> extends ConnectionPlan<TSubplan> {
  constructor(public readonly subplan: TSubplan) {
    super(subplan);
  }

  nodes(): TSubplan {
    return this.subplan.clone();
  }
}

/*+--------------------------------------------------------------------------+
  |                             THE EXAMPLE                                  |
  +--------------------------------------------------------------------------+*/

const User = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, UserPlan>({
    name: "User",
    fields: {
      username: {
        type: GraphQLString,
        plan($user) {
          return $user.get("username");
        },
      },
      gravatarUrl: {
        type: GraphQLString,
        plan($user) {
          return $user.get("gravatar_url");
        },
        /*
        resolve(parent) {
          return parent.gravatar_url;
        },
        extensions: {
          graphile: {
            dependencies: ["gravatar_url"],
          },
        },
        */
      },
    },
  }),
);

const Message = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, PgClassSelectPlan<typeof messageSource>>({
    name: "Message",
    fields: {
      body: {
        type: GraphQLString,
        plan($message) {
          return $message.get("body");
        },
      },
      author: {
        type: User,
        plan($message) {
          const $user = new PgClassSelectPlan(
            userSource,
            [$message.get("author_id")],
            (alias) => [sql`${alias}.id`],
            false, // just one
          );
          return $user;
        },
      },
    },
  }),
);

const MessageEdge = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, MessagePlan>({
    name: "MessageEdge",
    fields: {
      cursor: {
        type: GraphQLString,
        plan($node) {
          return $node.cursor();
        },
      },
      node: {
        type: Message,
        plan($node) {
          return $node;
        },
      },
    },
  }),
);

const MessagesConnection = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, PgConnectionPlan<MessagePlan>>({
    name: "MessagesConnection",
    fields: {
      edges: {
        type: new GraphQLList(MessageEdge),
        plan($connection) {
          return $connection.nodes();
        },
      },
      nodes: {
        type: new GraphQLList(Message),
        plan($connection) {
          return $connection.nodes();
        },
        /*
      extensions: {
        graphile: {
          plan($deps) {
            // This already contains identity information
            const plan = $deps.collection({ pagination: true, cursors: false });
            return plan;
          },
        },
      },
      */
      },
    },
  }),
);

const Forum = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, ForumPlan>({
    name: "Forum",
    fields: {
      name: {
        type: GraphQLString,
        plan($forum) {
          return $forum.get("name");
        },
      },
      messagesConnection: {
        type: MessagesConnection,
        plan($forum) {
          const $messages = new PgClassSelectPlan(
            messageSource,
            [$forum.get("id")],
            (alias) => [sql`${alias}.forum_id`],
            true, // many
          );
          // $messages.leftJoin(...);
          // $messages.innerJoin(...);
          // $messages.relation('fk_messages_author_id')
          // $messages.where(...);
          const $connectionPlan = new PgConnectionPlan($messages);
          // $connectionPlan.orderBy... ?
          // DEFINITELY NOT $messages.orderBy BECAUSE we don't want that applied to aggregates.
          // DEFINITELY NOT $messages.limit BECAUSE we don't want those limits applied to aggregates or page info.
          return $connectionPlan;
        },
      },
    },
  }),
);

const Query = new GraphQLObjectType(
  objectSpec<GraphileResolverContext, RootPlan>({
    name: "Query",
    fields: {
      forums: {
        type: new GraphQLList(Forum),
        plan() {
          const $forums = new PgClassSelectPlan(
            forumSource,
            [],
            () => [],
            true,
          );
          return $forums;
        },
      },
    },
  }),
);

const schema = enforceCrystal(
  new GraphQLSchema({
    query: Query,
  }),
);

async function main() {
  //console.log(printSchema(schema));

  const query = /* GraphQL */ `
    {
      forums {
        name
      }
    }
  `;

  const query2 = /* GraphQL */ `
    {
      forums {
        name
        messagesConnection(
          limit: 5
          condition: { active: true }
          includeArchived: INHERIT
        ) {
          nodes {
            body
            author {
              username
              gravatarUrl
            }
          }
        }
      }
    }
  `;

  const result = await graphql({
    schema,
    source: query,
    variableValues: {},
    contextValue: {},
    rootValue: null,
  });

  console.dir(result);

  const result2 = await graphql({
    schema,
    source: query2,
    variableValues: {},
    contextValue: {},
    rootValue: null,
  });

  console.dir(result2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
