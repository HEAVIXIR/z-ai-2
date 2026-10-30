/**
 * STEP 17.81 — type-only delegate and transaction compatibility proof.
 *
 * The STEP 17.80 whole-client assertions failed because the generated clients
 * expose different runtime-level surfaces. This probe deliberately tests only
 * Prisma's public Args/Result contract for delegates and operations consumed
 * by HEAVIX. It imports all four clients as types only; no runtime client is
 * added to a Node or Worker module graph.
 *
 * Every pair is checked in both directions. A failed assertion is a blocker:
 * do not add casts, any, or suppressions to make this file compile.
 */
import type { Prisma as MainNodePrisma, PrismaClient as MainNodeClient } from "@prisma/client";
import type { Prisma as MainWorkerPrisma, PrismaClient as MainWorkerClient } from "@/lib/generated/client/client";
import type { Prisma as StoreNodePrisma, PrismaClient as StoreNodeClient } from "@/lib/generated/store-node-client";
import type { Prisma as StoreWorkerPrisma, PrismaClient as StoreWorkerClient } from "@/lib/generated/store-client/client";

type Equivalent<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<Value extends true> = Value;
type AssertEquivalent<A, B> = AssertTrue<Equivalent<A, B>>;

// Delegate operation argument and result contracts. These are compile-time
// comparisons of generated Prisma public types, not handwritten approximations.
type Main_brand_findUnique_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "findUnique">;
type Main_brand_findUnique_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "findUnique">;
type Main_brand_findUnique_ArgsCompatible = AssertEquivalent<Main_brand_findUnique_NodeArgs, Main_brand_findUnique_WorkerArgs>;
type Main_brand_findUnique_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_findUnique_NodeArgs, "findUnique">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_findUnique_WorkerArgs, "findUnique">
>;
type Main_brand_findFirst_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "findFirst">;
type Main_brand_findFirst_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "findFirst">;
type Main_brand_findFirst_ArgsCompatible = AssertEquivalent<Main_brand_findFirst_NodeArgs, Main_brand_findFirst_WorkerArgs>;
type Main_brand_findFirst_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_findFirst_NodeArgs, "findFirst">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_findFirst_WorkerArgs, "findFirst">
>;
type Main_brand_findMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "findMany">;
type Main_brand_findMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "findMany">;
type Main_brand_findMany_ArgsCompatible = AssertEquivalent<Main_brand_findMany_NodeArgs, Main_brand_findMany_WorkerArgs>;
type Main_brand_findMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_findMany_NodeArgs, "findMany">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_findMany_WorkerArgs, "findMany">
>;
type Main_brand_count_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "count">;
type Main_brand_count_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "count">;
type Main_brand_count_ArgsCompatible = AssertEquivalent<Main_brand_count_NodeArgs, Main_brand_count_WorkerArgs>;
type Main_brand_count_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_count_NodeArgs, "count">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_count_WorkerArgs, "count">
>;
type Main_brand_create_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "create">;
type Main_brand_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "create">;
type Main_brand_create_ArgsCompatible = AssertEquivalent<Main_brand_create_NodeArgs, Main_brand_create_WorkerArgs>;
type Main_brand_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_create_WorkerArgs, "create">
>;
type Main_brand_update_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "update">;
type Main_brand_update_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "update">;
type Main_brand_update_ArgsCompatible = AssertEquivalent<Main_brand_update_NodeArgs, Main_brand_update_WorkerArgs>;
type Main_brand_update_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_update_NodeArgs, "update">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_update_WorkerArgs, "update">
>;
type Main_brand_updateMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "updateMany">;
type Main_brand_updateMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "updateMany">;
type Main_brand_updateMany_ArgsCompatible = AssertEquivalent<Main_brand_updateMany_NodeArgs, Main_brand_updateMany_WorkerArgs>;
type Main_brand_updateMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_updateMany_NodeArgs, "updateMany">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_updateMany_WorkerArgs, "updateMany">
>;
type Main_brand_upsert_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "upsert">;
type Main_brand_upsert_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "upsert">;
type Main_brand_upsert_ArgsCompatible = AssertEquivalent<Main_brand_upsert_NodeArgs, Main_brand_upsert_WorkerArgs>;
type Main_brand_upsert_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_upsert_NodeArgs, "upsert">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_upsert_WorkerArgs, "upsert">
>;
type Main_brand_delete_NodeArgs = MainNodePrisma.Args<MainNodeClient["brand"], "delete">;
type Main_brand_delete_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["brand"], "delete">;
type Main_brand_delete_ArgsCompatible = AssertEquivalent<Main_brand_delete_NodeArgs, Main_brand_delete_WorkerArgs>;
type Main_brand_delete_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["brand"], Main_brand_delete_NodeArgs, "delete">,
  MainWorkerPrisma.Result<MainWorkerClient["brand"], Main_brand_delete_WorkerArgs, "delete">
>;
type Main_listing_findUnique_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "findUnique">;
type Main_listing_findUnique_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "findUnique">;
type Main_listing_findUnique_ArgsCompatible = AssertEquivalent<Main_listing_findUnique_NodeArgs, Main_listing_findUnique_WorkerArgs>;
type Main_listing_findUnique_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_findUnique_NodeArgs, "findUnique">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_findUnique_WorkerArgs, "findUnique">
>;
type Main_listing_findFirst_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "findFirst">;
type Main_listing_findFirst_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "findFirst">;
type Main_listing_findFirst_ArgsCompatible = AssertEquivalent<Main_listing_findFirst_NodeArgs, Main_listing_findFirst_WorkerArgs>;
type Main_listing_findFirst_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_findFirst_NodeArgs, "findFirst">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_findFirst_WorkerArgs, "findFirst">
>;
type Main_listing_findMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "findMany">;
type Main_listing_findMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "findMany">;
type Main_listing_findMany_ArgsCompatible = AssertEquivalent<Main_listing_findMany_NodeArgs, Main_listing_findMany_WorkerArgs>;
type Main_listing_findMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_findMany_NodeArgs, "findMany">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_findMany_WorkerArgs, "findMany">
>;
type Main_listing_count_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "count">;
type Main_listing_count_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "count">;
type Main_listing_count_ArgsCompatible = AssertEquivalent<Main_listing_count_NodeArgs, Main_listing_count_WorkerArgs>;
type Main_listing_count_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_count_NodeArgs, "count">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_count_WorkerArgs, "count">
>;
type Main_listing_create_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "create">;
type Main_listing_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "create">;
type Main_listing_create_ArgsCompatible = AssertEquivalent<Main_listing_create_NodeArgs, Main_listing_create_WorkerArgs>;
type Main_listing_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_create_WorkerArgs, "create">
>;
type Main_listing_update_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "update">;
type Main_listing_update_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "update">;
type Main_listing_update_ArgsCompatible = AssertEquivalent<Main_listing_update_NodeArgs, Main_listing_update_WorkerArgs>;
type Main_listing_update_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_update_NodeArgs, "update">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_update_WorkerArgs, "update">
>;
type Main_listing_updateMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "updateMany">;
type Main_listing_updateMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "updateMany">;
type Main_listing_updateMany_ArgsCompatible = AssertEquivalent<Main_listing_updateMany_NodeArgs, Main_listing_updateMany_WorkerArgs>;
type Main_listing_updateMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_updateMany_NodeArgs, "updateMany">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_updateMany_WorkerArgs, "updateMany">
>;
type Main_listing_upsert_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "upsert">;
type Main_listing_upsert_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "upsert">;
type Main_listing_upsert_ArgsCompatible = AssertEquivalent<Main_listing_upsert_NodeArgs, Main_listing_upsert_WorkerArgs>;
type Main_listing_upsert_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_upsert_NodeArgs, "upsert">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_upsert_WorkerArgs, "upsert">
>;
type Main_listing_delete_NodeArgs = MainNodePrisma.Args<MainNodeClient["listing"], "delete">;
type Main_listing_delete_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["listing"], "delete">;
type Main_listing_delete_ArgsCompatible = AssertEquivalent<Main_listing_delete_NodeArgs, Main_listing_delete_WorkerArgs>;
type Main_listing_delete_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["listing"], Main_listing_delete_NodeArgs, "delete">,
  MainWorkerPrisma.Result<MainWorkerClient["listing"], Main_listing_delete_WorkerArgs, "delete">
>;
type Main_user_findUnique_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "findUnique">;
type Main_user_findUnique_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "findUnique">;
type Main_user_findUnique_ArgsCompatible = AssertEquivalent<Main_user_findUnique_NodeArgs, Main_user_findUnique_WorkerArgs>;
type Main_user_findUnique_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_findUnique_NodeArgs, "findUnique">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_findUnique_WorkerArgs, "findUnique">
>;
type Main_user_findFirst_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "findFirst">;
type Main_user_findFirst_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "findFirst">;
type Main_user_findFirst_ArgsCompatible = AssertEquivalent<Main_user_findFirst_NodeArgs, Main_user_findFirst_WorkerArgs>;
type Main_user_findFirst_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_findFirst_NodeArgs, "findFirst">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_findFirst_WorkerArgs, "findFirst">
>;
type Main_user_findMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "findMany">;
type Main_user_findMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "findMany">;
type Main_user_findMany_ArgsCompatible = AssertEquivalent<Main_user_findMany_NodeArgs, Main_user_findMany_WorkerArgs>;
type Main_user_findMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_findMany_NodeArgs, "findMany">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_findMany_WorkerArgs, "findMany">
>;
type Main_user_count_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "count">;
type Main_user_count_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "count">;
type Main_user_count_ArgsCompatible = AssertEquivalent<Main_user_count_NodeArgs, Main_user_count_WorkerArgs>;
type Main_user_count_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_count_NodeArgs, "count">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_count_WorkerArgs, "count">
>;
type Main_user_create_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "create">;
type Main_user_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "create">;
type Main_user_create_ArgsCompatible = AssertEquivalent<Main_user_create_NodeArgs, Main_user_create_WorkerArgs>;
type Main_user_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_create_WorkerArgs, "create">
>;
type Main_user_update_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "update">;
type Main_user_update_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "update">;
type Main_user_update_ArgsCompatible = AssertEquivalent<Main_user_update_NodeArgs, Main_user_update_WorkerArgs>;
type Main_user_update_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_update_NodeArgs, "update">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_update_WorkerArgs, "update">
>;
type Main_user_updateMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "updateMany">;
type Main_user_updateMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "updateMany">;
type Main_user_updateMany_ArgsCompatible = AssertEquivalent<Main_user_updateMany_NodeArgs, Main_user_updateMany_WorkerArgs>;
type Main_user_updateMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_updateMany_NodeArgs, "updateMany">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_updateMany_WorkerArgs, "updateMany">
>;
type Main_user_upsert_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "upsert">;
type Main_user_upsert_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "upsert">;
type Main_user_upsert_ArgsCompatible = AssertEquivalent<Main_user_upsert_NodeArgs, Main_user_upsert_WorkerArgs>;
type Main_user_upsert_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_upsert_NodeArgs, "upsert">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_upsert_WorkerArgs, "upsert">
>;
type Main_user_delete_NodeArgs = MainNodePrisma.Args<MainNodeClient["user"], "delete">;
type Main_user_delete_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["user"], "delete">;
type Main_user_delete_ArgsCompatible = AssertEquivalent<Main_user_delete_NodeArgs, Main_user_delete_WorkerArgs>;
type Main_user_delete_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["user"], Main_user_delete_NodeArgs, "delete">,
  MainWorkerPrisma.Result<MainWorkerClient["user"], Main_user_delete_WorkerArgs, "delete">
>;
type Main_auditLog_findUnique_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "findUnique">;
type Main_auditLog_findUnique_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "findUnique">;
type Main_auditLog_findUnique_ArgsCompatible = AssertEquivalent<Main_auditLog_findUnique_NodeArgs, Main_auditLog_findUnique_WorkerArgs>;
type Main_auditLog_findUnique_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_findUnique_NodeArgs, "findUnique">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_findUnique_WorkerArgs, "findUnique">
>;
type Main_auditLog_findFirst_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "findFirst">;
type Main_auditLog_findFirst_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "findFirst">;
type Main_auditLog_findFirst_ArgsCompatible = AssertEquivalent<Main_auditLog_findFirst_NodeArgs, Main_auditLog_findFirst_WorkerArgs>;
type Main_auditLog_findFirst_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_findFirst_NodeArgs, "findFirst">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_findFirst_WorkerArgs, "findFirst">
>;
type Main_auditLog_findMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "findMany">;
type Main_auditLog_findMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "findMany">;
type Main_auditLog_findMany_ArgsCompatible = AssertEquivalent<Main_auditLog_findMany_NodeArgs, Main_auditLog_findMany_WorkerArgs>;
type Main_auditLog_findMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_findMany_NodeArgs, "findMany">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_findMany_WorkerArgs, "findMany">
>;
type Main_auditLog_count_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "count">;
type Main_auditLog_count_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "count">;
type Main_auditLog_count_ArgsCompatible = AssertEquivalent<Main_auditLog_count_NodeArgs, Main_auditLog_count_WorkerArgs>;
type Main_auditLog_count_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_count_NodeArgs, "count">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_count_WorkerArgs, "count">
>;
type Main_auditLog_create_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "create">;
type Main_auditLog_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "create">;
type Main_auditLog_create_ArgsCompatible = AssertEquivalent<Main_auditLog_create_NodeArgs, Main_auditLog_create_WorkerArgs>;
type Main_auditLog_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_create_WorkerArgs, "create">
>;
type Main_auditLog_update_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "update">;
type Main_auditLog_update_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "update">;
type Main_auditLog_update_ArgsCompatible = AssertEquivalent<Main_auditLog_update_NodeArgs, Main_auditLog_update_WorkerArgs>;
type Main_auditLog_update_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_update_NodeArgs, "update">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_update_WorkerArgs, "update">
>;
type Main_auditLog_updateMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "updateMany">;
type Main_auditLog_updateMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "updateMany">;
type Main_auditLog_updateMany_ArgsCompatible = AssertEquivalent<Main_auditLog_updateMany_NodeArgs, Main_auditLog_updateMany_WorkerArgs>;
type Main_auditLog_updateMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_updateMany_NodeArgs, "updateMany">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_updateMany_WorkerArgs, "updateMany">
>;
type Main_auditLog_upsert_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "upsert">;
type Main_auditLog_upsert_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "upsert">;
type Main_auditLog_upsert_ArgsCompatible = AssertEquivalent<Main_auditLog_upsert_NodeArgs, Main_auditLog_upsert_WorkerArgs>;
type Main_auditLog_upsert_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_upsert_NodeArgs, "upsert">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_upsert_WorkerArgs, "upsert">
>;
type Main_auditLog_delete_NodeArgs = MainNodePrisma.Args<MainNodeClient["auditLog"], "delete">;
type Main_auditLog_delete_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["auditLog"], "delete">;
type Main_auditLog_delete_ArgsCompatible = AssertEquivalent<Main_auditLog_delete_NodeArgs, Main_auditLog_delete_WorkerArgs>;
type Main_auditLog_delete_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["auditLog"], Main_auditLog_delete_NodeArgs, "delete">,
  MainWorkerPrisma.Result<MainWorkerClient["auditLog"], Main_auditLog_delete_WorkerArgs, "delete">
>;
type Main_role_findUnique_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "findUnique">;
type Main_role_findUnique_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "findUnique">;
type Main_role_findUnique_ArgsCompatible = AssertEquivalent<Main_role_findUnique_NodeArgs, Main_role_findUnique_WorkerArgs>;
type Main_role_findUnique_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_findUnique_NodeArgs, "findUnique">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_findUnique_WorkerArgs, "findUnique">
>;
type Main_role_findFirst_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "findFirst">;
type Main_role_findFirst_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "findFirst">;
type Main_role_findFirst_ArgsCompatible = AssertEquivalent<Main_role_findFirst_NodeArgs, Main_role_findFirst_WorkerArgs>;
type Main_role_findFirst_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_findFirst_NodeArgs, "findFirst">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_findFirst_WorkerArgs, "findFirst">
>;
type Main_role_findMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "findMany">;
type Main_role_findMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "findMany">;
type Main_role_findMany_ArgsCompatible = AssertEquivalent<Main_role_findMany_NodeArgs, Main_role_findMany_WorkerArgs>;
type Main_role_findMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_findMany_NodeArgs, "findMany">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_findMany_WorkerArgs, "findMany">
>;
type Main_role_count_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "count">;
type Main_role_count_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "count">;
type Main_role_count_ArgsCompatible = AssertEquivalent<Main_role_count_NodeArgs, Main_role_count_WorkerArgs>;
type Main_role_count_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_count_NodeArgs, "count">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_count_WorkerArgs, "count">
>;
type Main_role_create_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "create">;
type Main_role_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "create">;
type Main_role_create_ArgsCompatible = AssertEquivalent<Main_role_create_NodeArgs, Main_role_create_WorkerArgs>;
type Main_role_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_create_WorkerArgs, "create">
>;
type Main_role_update_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "update">;
type Main_role_update_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "update">;
type Main_role_update_ArgsCompatible = AssertEquivalent<Main_role_update_NodeArgs, Main_role_update_WorkerArgs>;
type Main_role_update_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_update_NodeArgs, "update">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_update_WorkerArgs, "update">
>;
type Main_role_updateMany_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "updateMany">;
type Main_role_updateMany_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "updateMany">;
type Main_role_updateMany_ArgsCompatible = AssertEquivalent<Main_role_updateMany_NodeArgs, Main_role_updateMany_WorkerArgs>;
type Main_role_updateMany_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_updateMany_NodeArgs, "updateMany">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_updateMany_WorkerArgs, "updateMany">
>;
type Main_role_upsert_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "upsert">;
type Main_role_upsert_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "upsert">;
type Main_role_upsert_ArgsCompatible = AssertEquivalent<Main_role_upsert_NodeArgs, Main_role_upsert_WorkerArgs>;
type Main_role_upsert_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_upsert_NodeArgs, "upsert">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_upsert_WorkerArgs, "upsert">
>;
type Main_role_delete_NodeArgs = MainNodePrisma.Args<MainNodeClient["role"], "delete">;
type Main_role_delete_WorkerArgs = MainWorkerPrisma.Args<MainWorkerClient["role"], "delete">;
type Main_role_delete_ArgsCompatible = AssertEquivalent<Main_role_delete_NodeArgs, Main_role_delete_WorkerArgs>;
type Main_role_delete_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeClient["role"], Main_role_delete_NodeArgs, "delete">,
  MainWorkerPrisma.Result<MainWorkerClient["role"], Main_role_delete_WorkerArgs, "delete">
>;
type Store_customer_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "findUnique">;
type Store_customer_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "findUnique">;
type Store_customer_findUnique_ArgsCompatible = AssertEquivalent<Store_customer_findUnique_NodeArgs, Store_customer_findUnique_WorkerArgs>;
type Store_customer_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_findUnique_WorkerArgs, "findUnique">
>;
type Store_customer_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "findFirst">;
type Store_customer_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "findFirst">;
type Store_customer_findFirst_ArgsCompatible = AssertEquivalent<Store_customer_findFirst_NodeArgs, Store_customer_findFirst_WorkerArgs>;
type Store_customer_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_findFirst_WorkerArgs, "findFirst">
>;
type Store_customer_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "findMany">;
type Store_customer_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "findMany">;
type Store_customer_findMany_ArgsCompatible = AssertEquivalent<Store_customer_findMany_NodeArgs, Store_customer_findMany_WorkerArgs>;
type Store_customer_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_findMany_WorkerArgs, "findMany">
>;
type Store_customer_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "count">;
type Store_customer_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "count">;
type Store_customer_count_ArgsCompatible = AssertEquivalent<Store_customer_count_NodeArgs, Store_customer_count_WorkerArgs>;
type Store_customer_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_count_WorkerArgs, "count">
>;
type Store_customer_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "create">;
type Store_customer_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "create">;
type Store_customer_create_ArgsCompatible = AssertEquivalent<Store_customer_create_NodeArgs, Store_customer_create_WorkerArgs>;
type Store_customer_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_create_WorkerArgs, "create">
>;
type Store_customer_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "update">;
type Store_customer_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "update">;
type Store_customer_update_ArgsCompatible = AssertEquivalent<Store_customer_update_NodeArgs, Store_customer_update_WorkerArgs>;
type Store_customer_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_update_WorkerArgs, "update">
>;
type Store_customer_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "updateMany">;
type Store_customer_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "updateMany">;
type Store_customer_updateMany_ArgsCompatible = AssertEquivalent<Store_customer_updateMany_NodeArgs, Store_customer_updateMany_WorkerArgs>;
type Store_customer_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_updateMany_WorkerArgs, "updateMany">
>;
type Store_customer_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "upsert">;
type Store_customer_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "upsert">;
type Store_customer_upsert_ArgsCompatible = AssertEquivalent<Store_customer_upsert_NodeArgs, Store_customer_upsert_WorkerArgs>;
type Store_customer_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_upsert_WorkerArgs, "upsert">
>;
type Store_customer_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["customer"], "delete">;
type Store_customer_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["customer"], "delete">;
type Store_customer_delete_ArgsCompatible = AssertEquivalent<Store_customer_delete_NodeArgs, Store_customer_delete_WorkerArgs>;
type Store_customer_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["customer"], Store_customer_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["customer"], Store_customer_delete_WorkerArgs, "delete">
>;
type Store_order_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "findUnique">;
type Store_order_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "findUnique">;
type Store_order_findUnique_ArgsCompatible = AssertEquivalent<Store_order_findUnique_NodeArgs, Store_order_findUnique_WorkerArgs>;
type Store_order_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_findUnique_WorkerArgs, "findUnique">
>;
type Store_order_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "findFirst">;
type Store_order_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "findFirst">;
type Store_order_findFirst_ArgsCompatible = AssertEquivalent<Store_order_findFirst_NodeArgs, Store_order_findFirst_WorkerArgs>;
type Store_order_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_findFirst_WorkerArgs, "findFirst">
>;
type Store_order_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "findMany">;
type Store_order_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "findMany">;
type Store_order_findMany_ArgsCompatible = AssertEquivalent<Store_order_findMany_NodeArgs, Store_order_findMany_WorkerArgs>;
type Store_order_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_findMany_WorkerArgs, "findMany">
>;
type Store_order_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "count">;
type Store_order_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "count">;
type Store_order_count_ArgsCompatible = AssertEquivalent<Store_order_count_NodeArgs, Store_order_count_WorkerArgs>;
type Store_order_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_count_WorkerArgs, "count">
>;
type Store_order_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "create">;
type Store_order_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "create">;
type Store_order_create_ArgsCompatible = AssertEquivalent<Store_order_create_NodeArgs, Store_order_create_WorkerArgs>;
type Store_order_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_create_WorkerArgs, "create">
>;
type Store_order_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "update">;
type Store_order_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "update">;
type Store_order_update_ArgsCompatible = AssertEquivalent<Store_order_update_NodeArgs, Store_order_update_WorkerArgs>;
type Store_order_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_update_WorkerArgs, "update">
>;
type Store_order_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "updateMany">;
type Store_order_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "updateMany">;
type Store_order_updateMany_ArgsCompatible = AssertEquivalent<Store_order_updateMany_NodeArgs, Store_order_updateMany_WorkerArgs>;
type Store_order_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_updateMany_WorkerArgs, "updateMany">
>;
type Store_order_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "upsert">;
type Store_order_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "upsert">;
type Store_order_upsert_ArgsCompatible = AssertEquivalent<Store_order_upsert_NodeArgs, Store_order_upsert_WorkerArgs>;
type Store_order_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_upsert_WorkerArgs, "upsert">
>;
type Store_order_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["order"], "delete">;
type Store_order_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["order"], "delete">;
type Store_order_delete_ArgsCompatible = AssertEquivalent<Store_order_delete_NodeArgs, Store_order_delete_WorkerArgs>;
type Store_order_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["order"], Store_order_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["order"], Store_order_delete_WorkerArgs, "delete">
>;
type Store_part_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "findUnique">;
type Store_part_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "findUnique">;
type Store_part_findUnique_ArgsCompatible = AssertEquivalent<Store_part_findUnique_NodeArgs, Store_part_findUnique_WorkerArgs>;
type Store_part_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_findUnique_WorkerArgs, "findUnique">
>;
type Store_part_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "findFirst">;
type Store_part_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "findFirst">;
type Store_part_findFirst_ArgsCompatible = AssertEquivalent<Store_part_findFirst_NodeArgs, Store_part_findFirst_WorkerArgs>;
type Store_part_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_findFirst_WorkerArgs, "findFirst">
>;
type Store_part_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "findMany">;
type Store_part_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "findMany">;
type Store_part_findMany_ArgsCompatible = AssertEquivalent<Store_part_findMany_NodeArgs, Store_part_findMany_WorkerArgs>;
type Store_part_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_findMany_WorkerArgs, "findMany">
>;
type Store_part_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "count">;
type Store_part_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "count">;
type Store_part_count_ArgsCompatible = AssertEquivalent<Store_part_count_NodeArgs, Store_part_count_WorkerArgs>;
type Store_part_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_count_WorkerArgs, "count">
>;
type Store_part_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "create">;
type Store_part_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "create">;
type Store_part_create_ArgsCompatible = AssertEquivalent<Store_part_create_NodeArgs, Store_part_create_WorkerArgs>;
type Store_part_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_create_WorkerArgs, "create">
>;
type Store_part_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "update">;
type Store_part_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "update">;
type Store_part_update_ArgsCompatible = AssertEquivalent<Store_part_update_NodeArgs, Store_part_update_WorkerArgs>;
type Store_part_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_update_WorkerArgs, "update">
>;
type Store_part_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "updateMany">;
type Store_part_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "updateMany">;
type Store_part_updateMany_ArgsCompatible = AssertEquivalent<Store_part_updateMany_NodeArgs, Store_part_updateMany_WorkerArgs>;
type Store_part_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_updateMany_WorkerArgs, "updateMany">
>;
type Store_part_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "upsert">;
type Store_part_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "upsert">;
type Store_part_upsert_ArgsCompatible = AssertEquivalent<Store_part_upsert_NodeArgs, Store_part_upsert_WorkerArgs>;
type Store_part_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_upsert_WorkerArgs, "upsert">
>;
type Store_part_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["part"], "delete">;
type Store_part_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["part"], "delete">;
type Store_part_delete_ArgsCompatible = AssertEquivalent<Store_part_delete_NodeArgs, Store_part_delete_WorkerArgs>;
type Store_part_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["part"], Store_part_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["part"], Store_part_delete_WorkerArgs, "delete">
>;
type Store_payment_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "findUnique">;
type Store_payment_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "findUnique">;
type Store_payment_findUnique_ArgsCompatible = AssertEquivalent<Store_payment_findUnique_NodeArgs, Store_payment_findUnique_WorkerArgs>;
type Store_payment_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_findUnique_WorkerArgs, "findUnique">
>;
type Store_payment_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "findFirst">;
type Store_payment_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "findFirst">;
type Store_payment_findFirst_ArgsCompatible = AssertEquivalent<Store_payment_findFirst_NodeArgs, Store_payment_findFirst_WorkerArgs>;
type Store_payment_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_findFirst_WorkerArgs, "findFirst">
>;
type Store_payment_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "findMany">;
type Store_payment_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "findMany">;
type Store_payment_findMany_ArgsCompatible = AssertEquivalent<Store_payment_findMany_NodeArgs, Store_payment_findMany_WorkerArgs>;
type Store_payment_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_findMany_WorkerArgs, "findMany">
>;
type Store_payment_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "count">;
type Store_payment_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "count">;
type Store_payment_count_ArgsCompatible = AssertEquivalent<Store_payment_count_NodeArgs, Store_payment_count_WorkerArgs>;
type Store_payment_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_count_WorkerArgs, "count">
>;
type Store_payment_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "create">;
type Store_payment_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "create">;
type Store_payment_create_ArgsCompatible = AssertEquivalent<Store_payment_create_NodeArgs, Store_payment_create_WorkerArgs>;
type Store_payment_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_create_WorkerArgs, "create">
>;
type Store_payment_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "update">;
type Store_payment_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "update">;
type Store_payment_update_ArgsCompatible = AssertEquivalent<Store_payment_update_NodeArgs, Store_payment_update_WorkerArgs>;
type Store_payment_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_update_WorkerArgs, "update">
>;
type Store_payment_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "updateMany">;
type Store_payment_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "updateMany">;
type Store_payment_updateMany_ArgsCompatible = AssertEquivalent<Store_payment_updateMany_NodeArgs, Store_payment_updateMany_WorkerArgs>;
type Store_payment_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_updateMany_WorkerArgs, "updateMany">
>;
type Store_payment_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "upsert">;
type Store_payment_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "upsert">;
type Store_payment_upsert_ArgsCompatible = AssertEquivalent<Store_payment_upsert_NodeArgs, Store_payment_upsert_WorkerArgs>;
type Store_payment_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_upsert_WorkerArgs, "upsert">
>;
type Store_payment_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["payment"], "delete">;
type Store_payment_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["payment"], "delete">;
type Store_payment_delete_ArgsCompatible = AssertEquivalent<Store_payment_delete_NodeArgs, Store_payment_delete_WorkerArgs>;
type Store_payment_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["payment"], Store_payment_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["payment"], Store_payment_delete_WorkerArgs, "delete">
>;
type Store_return_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "findUnique">;
type Store_return_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "findUnique">;
type Store_return_findUnique_ArgsCompatible = AssertEquivalent<Store_return_findUnique_NodeArgs, Store_return_findUnique_WorkerArgs>;
type Store_return_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_findUnique_WorkerArgs, "findUnique">
>;
type Store_return_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "findFirst">;
type Store_return_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "findFirst">;
type Store_return_findFirst_ArgsCompatible = AssertEquivalent<Store_return_findFirst_NodeArgs, Store_return_findFirst_WorkerArgs>;
type Store_return_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_findFirst_WorkerArgs, "findFirst">
>;
type Store_return_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "findMany">;
type Store_return_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "findMany">;
type Store_return_findMany_ArgsCompatible = AssertEquivalent<Store_return_findMany_NodeArgs, Store_return_findMany_WorkerArgs>;
type Store_return_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_findMany_WorkerArgs, "findMany">
>;
type Store_return_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "count">;
type Store_return_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "count">;
type Store_return_count_ArgsCompatible = AssertEquivalent<Store_return_count_NodeArgs, Store_return_count_WorkerArgs>;
type Store_return_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_count_WorkerArgs, "count">
>;
type Store_return_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "create">;
type Store_return_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "create">;
type Store_return_create_ArgsCompatible = AssertEquivalent<Store_return_create_NodeArgs, Store_return_create_WorkerArgs>;
type Store_return_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_create_WorkerArgs, "create">
>;
type Store_return_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "update">;
type Store_return_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "update">;
type Store_return_update_ArgsCompatible = AssertEquivalent<Store_return_update_NodeArgs, Store_return_update_WorkerArgs>;
type Store_return_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_update_WorkerArgs, "update">
>;
type Store_return_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "updateMany">;
type Store_return_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "updateMany">;
type Store_return_updateMany_ArgsCompatible = AssertEquivalent<Store_return_updateMany_NodeArgs, Store_return_updateMany_WorkerArgs>;
type Store_return_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_updateMany_WorkerArgs, "updateMany">
>;
type Store_return_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "upsert">;
type Store_return_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "upsert">;
type Store_return_upsert_ArgsCompatible = AssertEquivalent<Store_return_upsert_NodeArgs, Store_return_upsert_WorkerArgs>;
type Store_return_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_upsert_WorkerArgs, "upsert">
>;
type Store_return_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["return"], "delete">;
type Store_return_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["return"], "delete">;
type Store_return_delete_ArgsCompatible = AssertEquivalent<Store_return_delete_NodeArgs, Store_return_delete_WorkerArgs>;
type Store_return_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["return"], Store_return_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["return"], Store_return_delete_WorkerArgs, "delete">
>;
type Store_inventoryBalance_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "findUnique">;
type Store_inventoryBalance_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "findUnique">;
type Store_inventoryBalance_findUnique_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_findUnique_NodeArgs, Store_inventoryBalance_findUnique_WorkerArgs>;
type Store_inventoryBalance_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_findUnique_WorkerArgs, "findUnique">
>;
type Store_inventoryBalance_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "findFirst">;
type Store_inventoryBalance_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "findFirst">;
type Store_inventoryBalance_findFirst_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_findFirst_NodeArgs, Store_inventoryBalance_findFirst_WorkerArgs>;
type Store_inventoryBalance_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_findFirst_WorkerArgs, "findFirst">
>;
type Store_inventoryBalance_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "findMany">;
type Store_inventoryBalance_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "findMany">;
type Store_inventoryBalance_findMany_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_findMany_NodeArgs, Store_inventoryBalance_findMany_WorkerArgs>;
type Store_inventoryBalance_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_findMany_WorkerArgs, "findMany">
>;
type Store_inventoryBalance_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "count">;
type Store_inventoryBalance_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "count">;
type Store_inventoryBalance_count_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_count_NodeArgs, Store_inventoryBalance_count_WorkerArgs>;
type Store_inventoryBalance_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_count_WorkerArgs, "count">
>;
type Store_inventoryBalance_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "create">;
type Store_inventoryBalance_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "create">;
type Store_inventoryBalance_create_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_create_NodeArgs, Store_inventoryBalance_create_WorkerArgs>;
type Store_inventoryBalance_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_create_WorkerArgs, "create">
>;
type Store_inventoryBalance_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "update">;
type Store_inventoryBalance_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "update">;
type Store_inventoryBalance_update_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_update_NodeArgs, Store_inventoryBalance_update_WorkerArgs>;
type Store_inventoryBalance_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_update_WorkerArgs, "update">
>;
type Store_inventoryBalance_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "updateMany">;
type Store_inventoryBalance_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "updateMany">;
type Store_inventoryBalance_updateMany_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_updateMany_NodeArgs, Store_inventoryBalance_updateMany_WorkerArgs>;
type Store_inventoryBalance_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_updateMany_WorkerArgs, "updateMany">
>;
type Store_inventoryBalance_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "upsert">;
type Store_inventoryBalance_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "upsert">;
type Store_inventoryBalance_upsert_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_upsert_NodeArgs, Store_inventoryBalance_upsert_WorkerArgs>;
type Store_inventoryBalance_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_upsert_WorkerArgs, "upsert">
>;
type Store_inventoryBalance_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["inventoryBalance"], "delete">;
type Store_inventoryBalance_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["inventoryBalance"], "delete">;
type Store_inventoryBalance_delete_ArgsCompatible = AssertEquivalent<Store_inventoryBalance_delete_NodeArgs, Store_inventoryBalance_delete_WorkerArgs>;
type Store_inventoryBalance_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["inventoryBalance"], Store_inventoryBalance_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["inventoryBalance"], Store_inventoryBalance_delete_WorkerArgs, "delete">
>;
type Store_warehouse_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "findUnique">;
type Store_warehouse_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "findUnique">;
type Store_warehouse_findUnique_ArgsCompatible = AssertEquivalent<Store_warehouse_findUnique_NodeArgs, Store_warehouse_findUnique_WorkerArgs>;
type Store_warehouse_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_findUnique_WorkerArgs, "findUnique">
>;
type Store_warehouse_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "findFirst">;
type Store_warehouse_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "findFirst">;
type Store_warehouse_findFirst_ArgsCompatible = AssertEquivalent<Store_warehouse_findFirst_NodeArgs, Store_warehouse_findFirst_WorkerArgs>;
type Store_warehouse_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_findFirst_WorkerArgs, "findFirst">
>;
type Store_warehouse_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "findMany">;
type Store_warehouse_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "findMany">;
type Store_warehouse_findMany_ArgsCompatible = AssertEquivalent<Store_warehouse_findMany_NodeArgs, Store_warehouse_findMany_WorkerArgs>;
type Store_warehouse_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_findMany_WorkerArgs, "findMany">
>;
type Store_warehouse_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "count">;
type Store_warehouse_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "count">;
type Store_warehouse_count_ArgsCompatible = AssertEquivalent<Store_warehouse_count_NodeArgs, Store_warehouse_count_WorkerArgs>;
type Store_warehouse_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_count_WorkerArgs, "count">
>;
type Store_warehouse_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "create">;
type Store_warehouse_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "create">;
type Store_warehouse_create_ArgsCompatible = AssertEquivalent<Store_warehouse_create_NodeArgs, Store_warehouse_create_WorkerArgs>;
type Store_warehouse_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_create_WorkerArgs, "create">
>;
type Store_warehouse_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "update">;
type Store_warehouse_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "update">;
type Store_warehouse_update_ArgsCompatible = AssertEquivalent<Store_warehouse_update_NodeArgs, Store_warehouse_update_WorkerArgs>;
type Store_warehouse_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_update_WorkerArgs, "update">
>;
type Store_warehouse_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "updateMany">;
type Store_warehouse_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "updateMany">;
type Store_warehouse_updateMany_ArgsCompatible = AssertEquivalent<Store_warehouse_updateMany_NodeArgs, Store_warehouse_updateMany_WorkerArgs>;
type Store_warehouse_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_updateMany_WorkerArgs, "updateMany">
>;
type Store_warehouse_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "upsert">;
type Store_warehouse_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "upsert">;
type Store_warehouse_upsert_ArgsCompatible = AssertEquivalent<Store_warehouse_upsert_NodeArgs, Store_warehouse_upsert_WorkerArgs>;
type Store_warehouse_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_upsert_WorkerArgs, "upsert">
>;
type Store_warehouse_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["warehouse"], "delete">;
type Store_warehouse_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["warehouse"], "delete">;
type Store_warehouse_delete_ArgsCompatible = AssertEquivalent<Store_warehouse_delete_NodeArgs, Store_warehouse_delete_WorkerArgs>;
type Store_warehouse_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["warehouse"], Store_warehouse_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["warehouse"], Store_warehouse_delete_WorkerArgs, "delete">
>;
type Store_stockMovement_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "findUnique">;
type Store_stockMovement_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "findUnique">;
type Store_stockMovement_findUnique_ArgsCompatible = AssertEquivalent<Store_stockMovement_findUnique_NodeArgs, Store_stockMovement_findUnique_WorkerArgs>;
type Store_stockMovement_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_findUnique_WorkerArgs, "findUnique">
>;
type Store_stockMovement_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "findFirst">;
type Store_stockMovement_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "findFirst">;
type Store_stockMovement_findFirst_ArgsCompatible = AssertEquivalent<Store_stockMovement_findFirst_NodeArgs, Store_stockMovement_findFirst_WorkerArgs>;
type Store_stockMovement_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_findFirst_WorkerArgs, "findFirst">
>;
type Store_stockMovement_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "findMany">;
type Store_stockMovement_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "findMany">;
type Store_stockMovement_findMany_ArgsCompatible = AssertEquivalent<Store_stockMovement_findMany_NodeArgs, Store_stockMovement_findMany_WorkerArgs>;
type Store_stockMovement_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_findMany_WorkerArgs, "findMany">
>;
type Store_stockMovement_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "count">;
type Store_stockMovement_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "count">;
type Store_stockMovement_count_ArgsCompatible = AssertEquivalent<Store_stockMovement_count_NodeArgs, Store_stockMovement_count_WorkerArgs>;
type Store_stockMovement_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_count_WorkerArgs, "count">
>;
type Store_stockMovement_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "create">;
type Store_stockMovement_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "create">;
type Store_stockMovement_create_ArgsCompatible = AssertEquivalent<Store_stockMovement_create_NodeArgs, Store_stockMovement_create_WorkerArgs>;
type Store_stockMovement_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_create_WorkerArgs, "create">
>;
type Store_stockMovement_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "update">;
type Store_stockMovement_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "update">;
type Store_stockMovement_update_ArgsCompatible = AssertEquivalent<Store_stockMovement_update_NodeArgs, Store_stockMovement_update_WorkerArgs>;
type Store_stockMovement_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_update_WorkerArgs, "update">
>;
type Store_stockMovement_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "updateMany">;
type Store_stockMovement_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "updateMany">;
type Store_stockMovement_updateMany_ArgsCompatible = AssertEquivalent<Store_stockMovement_updateMany_NodeArgs, Store_stockMovement_updateMany_WorkerArgs>;
type Store_stockMovement_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_updateMany_WorkerArgs, "updateMany">
>;
type Store_stockMovement_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "upsert">;
type Store_stockMovement_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "upsert">;
type Store_stockMovement_upsert_ArgsCompatible = AssertEquivalent<Store_stockMovement_upsert_NodeArgs, Store_stockMovement_upsert_WorkerArgs>;
type Store_stockMovement_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_upsert_WorkerArgs, "upsert">
>;
type Store_stockMovement_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["stockMovement"], "delete">;
type Store_stockMovement_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["stockMovement"], "delete">;
type Store_stockMovement_delete_ArgsCompatible = AssertEquivalent<Store_stockMovement_delete_NodeArgs, Store_stockMovement_delete_WorkerArgs>;
type Store_stockMovement_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["stockMovement"], Store_stockMovement_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["stockMovement"], Store_stockMovement_delete_WorkerArgs, "delete">
>;
type Store_auditOutbox_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "findUnique">;
type Store_auditOutbox_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "findUnique">;
type Store_auditOutbox_findUnique_ArgsCompatible = AssertEquivalent<Store_auditOutbox_findUnique_NodeArgs, Store_auditOutbox_findUnique_WorkerArgs>;
type Store_auditOutbox_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_findUnique_WorkerArgs, "findUnique">
>;
type Store_auditOutbox_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "findFirst">;
type Store_auditOutbox_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "findFirst">;
type Store_auditOutbox_findFirst_ArgsCompatible = AssertEquivalent<Store_auditOutbox_findFirst_NodeArgs, Store_auditOutbox_findFirst_WorkerArgs>;
type Store_auditOutbox_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_findFirst_WorkerArgs, "findFirst">
>;
type Store_auditOutbox_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "findMany">;
type Store_auditOutbox_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "findMany">;
type Store_auditOutbox_findMany_ArgsCompatible = AssertEquivalent<Store_auditOutbox_findMany_NodeArgs, Store_auditOutbox_findMany_WorkerArgs>;
type Store_auditOutbox_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_findMany_WorkerArgs, "findMany">
>;
type Store_auditOutbox_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "count">;
type Store_auditOutbox_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "count">;
type Store_auditOutbox_count_ArgsCompatible = AssertEquivalent<Store_auditOutbox_count_NodeArgs, Store_auditOutbox_count_WorkerArgs>;
type Store_auditOutbox_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_count_WorkerArgs, "count">
>;
type Store_auditOutbox_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "create">;
type Store_auditOutbox_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "create">;
type Store_auditOutbox_create_ArgsCompatible = AssertEquivalent<Store_auditOutbox_create_NodeArgs, Store_auditOutbox_create_WorkerArgs>;
type Store_auditOutbox_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_create_WorkerArgs, "create">
>;
type Store_auditOutbox_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "update">;
type Store_auditOutbox_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "update">;
type Store_auditOutbox_update_ArgsCompatible = AssertEquivalent<Store_auditOutbox_update_NodeArgs, Store_auditOutbox_update_WorkerArgs>;
type Store_auditOutbox_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_update_WorkerArgs, "update">
>;
type Store_auditOutbox_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "updateMany">;
type Store_auditOutbox_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "updateMany">;
type Store_auditOutbox_updateMany_ArgsCompatible = AssertEquivalent<Store_auditOutbox_updateMany_NodeArgs, Store_auditOutbox_updateMany_WorkerArgs>;
type Store_auditOutbox_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_updateMany_WorkerArgs, "updateMany">
>;
type Store_auditOutbox_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "upsert">;
type Store_auditOutbox_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "upsert">;
type Store_auditOutbox_upsert_ArgsCompatible = AssertEquivalent<Store_auditOutbox_upsert_NodeArgs, Store_auditOutbox_upsert_WorkerArgs>;
type Store_auditOutbox_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_upsert_WorkerArgs, "upsert">
>;
type Store_auditOutbox_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["auditOutbox"], "delete">;
type Store_auditOutbox_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["auditOutbox"], "delete">;
type Store_auditOutbox_delete_ArgsCompatible = AssertEquivalent<Store_auditOutbox_delete_NodeArgs, Store_auditOutbox_delete_WorkerArgs>;
type Store_auditOutbox_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["auditOutbox"], Store_auditOutbox_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["auditOutbox"], Store_auditOutbox_delete_WorkerArgs, "delete">
>;
type Store_coupon_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "findUnique">;
type Store_coupon_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "findUnique">;
type Store_coupon_findUnique_ArgsCompatible = AssertEquivalent<Store_coupon_findUnique_NodeArgs, Store_coupon_findUnique_WorkerArgs>;
type Store_coupon_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_findUnique_WorkerArgs, "findUnique">
>;
type Store_coupon_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "findFirst">;
type Store_coupon_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "findFirst">;
type Store_coupon_findFirst_ArgsCompatible = AssertEquivalent<Store_coupon_findFirst_NodeArgs, Store_coupon_findFirst_WorkerArgs>;
type Store_coupon_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_findFirst_WorkerArgs, "findFirst">
>;
type Store_coupon_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "findMany">;
type Store_coupon_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "findMany">;
type Store_coupon_findMany_ArgsCompatible = AssertEquivalent<Store_coupon_findMany_NodeArgs, Store_coupon_findMany_WorkerArgs>;
type Store_coupon_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_findMany_WorkerArgs, "findMany">
>;
type Store_coupon_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "count">;
type Store_coupon_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "count">;
type Store_coupon_count_ArgsCompatible = AssertEquivalent<Store_coupon_count_NodeArgs, Store_coupon_count_WorkerArgs>;
type Store_coupon_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_count_WorkerArgs, "count">
>;
type Store_coupon_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "create">;
type Store_coupon_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "create">;
type Store_coupon_create_ArgsCompatible = AssertEquivalent<Store_coupon_create_NodeArgs, Store_coupon_create_WorkerArgs>;
type Store_coupon_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_create_WorkerArgs, "create">
>;
type Store_coupon_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "update">;
type Store_coupon_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "update">;
type Store_coupon_update_ArgsCompatible = AssertEquivalent<Store_coupon_update_NodeArgs, Store_coupon_update_WorkerArgs>;
type Store_coupon_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_update_WorkerArgs, "update">
>;
type Store_coupon_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "updateMany">;
type Store_coupon_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "updateMany">;
type Store_coupon_updateMany_ArgsCompatible = AssertEquivalent<Store_coupon_updateMany_NodeArgs, Store_coupon_updateMany_WorkerArgs>;
type Store_coupon_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_updateMany_WorkerArgs, "updateMany">
>;
type Store_coupon_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "upsert">;
type Store_coupon_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "upsert">;
type Store_coupon_upsert_ArgsCompatible = AssertEquivalent<Store_coupon_upsert_NodeArgs, Store_coupon_upsert_WorkerArgs>;
type Store_coupon_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_upsert_WorkerArgs, "upsert">
>;
type Store_coupon_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["coupon"], "delete">;
type Store_coupon_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["coupon"], "delete">;
type Store_coupon_delete_ArgsCompatible = AssertEquivalent<Store_coupon_delete_NodeArgs, Store_coupon_delete_WorkerArgs>;
type Store_coupon_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["coupon"], Store_coupon_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["coupon"], Store_coupon_delete_WorkerArgs, "delete">
>;
type Store_walletTransaction_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "findUnique">;
type Store_walletTransaction_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "findUnique">;
type Store_walletTransaction_findUnique_ArgsCompatible = AssertEquivalent<Store_walletTransaction_findUnique_NodeArgs, Store_walletTransaction_findUnique_WorkerArgs>;
type Store_walletTransaction_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_findUnique_WorkerArgs, "findUnique">
>;
type Store_walletTransaction_findFirst_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "findFirst">;
type Store_walletTransaction_findFirst_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "findFirst">;
type Store_walletTransaction_findFirst_ArgsCompatible = AssertEquivalent<Store_walletTransaction_findFirst_NodeArgs, Store_walletTransaction_findFirst_WorkerArgs>;
type Store_walletTransaction_findFirst_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_findFirst_NodeArgs, "findFirst">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_findFirst_WorkerArgs, "findFirst">
>;
type Store_walletTransaction_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "findMany">;
type Store_walletTransaction_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "findMany">;
type Store_walletTransaction_findMany_ArgsCompatible = AssertEquivalent<Store_walletTransaction_findMany_NodeArgs, Store_walletTransaction_findMany_WorkerArgs>;
type Store_walletTransaction_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_findMany_WorkerArgs, "findMany">
>;
type Store_walletTransaction_count_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "count">;
type Store_walletTransaction_count_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "count">;
type Store_walletTransaction_count_ArgsCompatible = AssertEquivalent<Store_walletTransaction_count_NodeArgs, Store_walletTransaction_count_WorkerArgs>;
type Store_walletTransaction_count_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_count_NodeArgs, "count">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_count_WorkerArgs, "count">
>;
type Store_walletTransaction_create_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "create">;
type Store_walletTransaction_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "create">;
type Store_walletTransaction_create_ArgsCompatible = AssertEquivalent<Store_walletTransaction_create_NodeArgs, Store_walletTransaction_create_WorkerArgs>;
type Store_walletTransaction_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_create_WorkerArgs, "create">
>;
type Store_walletTransaction_update_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "update">;
type Store_walletTransaction_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "update">;
type Store_walletTransaction_update_ArgsCompatible = AssertEquivalent<Store_walletTransaction_update_NodeArgs, Store_walletTransaction_update_WorkerArgs>;
type Store_walletTransaction_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_update_WorkerArgs, "update">
>;
type Store_walletTransaction_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "updateMany">;
type Store_walletTransaction_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "updateMany">;
type Store_walletTransaction_updateMany_ArgsCompatible = AssertEquivalent<Store_walletTransaction_updateMany_NodeArgs, Store_walletTransaction_updateMany_WorkerArgs>;
type Store_walletTransaction_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_updateMany_WorkerArgs, "updateMany">
>;
type Store_walletTransaction_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "upsert">;
type Store_walletTransaction_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "upsert">;
type Store_walletTransaction_upsert_ArgsCompatible = AssertEquivalent<Store_walletTransaction_upsert_NodeArgs, Store_walletTransaction_upsert_WorkerArgs>;
type Store_walletTransaction_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_upsert_WorkerArgs, "upsert">
>;
type Store_walletTransaction_delete_NodeArgs = StoreNodePrisma.Args<StoreNodeClient["walletTransaction"], "delete">;
type Store_walletTransaction_delete_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerClient["walletTransaction"], "delete">;
type Store_walletTransaction_delete_ArgsCompatible = AssertEquivalent<Store_walletTransaction_delete_NodeArgs, Store_walletTransaction_delete_WorkerArgs>;
type Store_walletTransaction_delete_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeClient["walletTransaction"], Store_walletTransaction_delete_NodeArgs, "delete">,
  StoreWorkerPrisma.Result<StoreWorkerClient["walletTransaction"], Store_walletTransaction_delete_WorkerArgs, "delete">
>;

/**
 * Interactive transaction callback clients are a distinct surface from the
 * root clients. Derive the transaction clients from each generated signature
 * and compare the operations actually used inside Store and Main callbacks.
 */
type MainNodeTransaction = Parameters<Parameters<MainNodeClient["$transaction"]>[0]>[0];
type MainWorkerTransaction = Parameters<Parameters<MainWorkerClient["$transaction"]>[0]>[0];
type StoreNodeTransaction = Parameters<Parameters<StoreNodeClient["$transaction"]>[0]>[0];
type StoreWorkerTransaction = Parameters<Parameters<StoreWorkerClient["$transaction"]>[0]>[0];

type MainTx_auditLog_create_NodeArgs = MainNodePrisma.Args<MainNodeTransaction["auditLog"], "create">;
type MainTx_auditLog_create_WorkerArgs = MainWorkerPrisma.Args<MainWorkerTransaction["auditLog"], "create">;
type MainTx_auditLog_create_ArgsCompatible = AssertEquivalent<MainTx_auditLog_create_NodeArgs, MainTx_auditLog_create_WorkerArgs>;
type MainTx_auditLog_create_ResultsCompatible = AssertEquivalent<
  MainNodePrisma.Result<MainNodeTransaction["auditLog"], MainTx_auditLog_create_NodeArgs, "create">,
  MainWorkerPrisma.Result<MainWorkerTransaction["auditLog"], MainTx_auditLog_create_WorkerArgs, "create">
>;
type StoreTx_order_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["order"], "create">;
type StoreTx_order_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["order"], "create">;
type StoreTx_order_create_ArgsCompatible = AssertEquivalent<StoreTx_order_create_NodeArgs, StoreTx_order_create_WorkerArgs>;
type StoreTx_order_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["order"], StoreTx_order_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["order"], StoreTx_order_create_WorkerArgs, "create">
>;
type StoreTx_order_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["order"], "findUnique">;
type StoreTx_order_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["order"], "findUnique">;
type StoreTx_order_findUnique_ArgsCompatible = AssertEquivalent<StoreTx_order_findUnique_NodeArgs, StoreTx_order_findUnique_WorkerArgs>;
type StoreTx_order_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["order"], StoreTx_order_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["order"], StoreTx_order_findUnique_WorkerArgs, "findUnique">
>;
type StoreTx_order_update_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["order"], "update">;
type StoreTx_order_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["order"], "update">;
type StoreTx_order_update_ArgsCompatible = AssertEquivalent<StoreTx_order_update_NodeArgs, StoreTx_order_update_WorkerArgs>;
type StoreTx_order_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["order"], StoreTx_order_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["order"], StoreTx_order_update_WorkerArgs, "update">
>;
type StoreTx_part_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["part"], "findUnique">;
type StoreTx_part_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["part"], "findUnique">;
type StoreTx_part_findUnique_ArgsCompatible = AssertEquivalent<StoreTx_part_findUnique_NodeArgs, StoreTx_part_findUnique_WorkerArgs>;
type StoreTx_part_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["part"], StoreTx_part_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["part"], StoreTx_part_findUnique_WorkerArgs, "findUnique">
>;
type StoreTx_part_update_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["part"], "update">;
type StoreTx_part_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["part"], "update">;
type StoreTx_part_update_ArgsCompatible = AssertEquivalent<StoreTx_part_update_NodeArgs, StoreTx_part_update_WorkerArgs>;
type StoreTx_part_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["part"], StoreTx_part_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["part"], StoreTx_part_update_WorkerArgs, "update">
>;
type StoreTx_customer_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["customer"], "findUnique">;
type StoreTx_customer_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["customer"], "findUnique">;
type StoreTx_customer_findUnique_ArgsCompatible = AssertEquivalent<StoreTx_customer_findUnique_NodeArgs, StoreTx_customer_findUnique_WorkerArgs>;
type StoreTx_customer_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["customer"], StoreTx_customer_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["customer"], StoreTx_customer_findUnique_WorkerArgs, "findUnique">
>;
type StoreTx_customer_update_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["customer"], "update">;
type StoreTx_customer_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["customer"], "update">;
type StoreTx_customer_update_ArgsCompatible = AssertEquivalent<StoreTx_customer_update_NodeArgs, StoreTx_customer_update_WorkerArgs>;
type StoreTx_customer_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["customer"], StoreTx_customer_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["customer"], StoreTx_customer_update_WorkerArgs, "update">
>;
type StoreTx_payment_findMany_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["payment"], "findMany">;
type StoreTx_payment_findMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["payment"], "findMany">;
type StoreTx_payment_findMany_ArgsCompatible = AssertEquivalent<StoreTx_payment_findMany_NodeArgs, StoreTx_payment_findMany_WorkerArgs>;
type StoreTx_payment_findMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["payment"], StoreTx_payment_findMany_NodeArgs, "findMany">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["payment"], StoreTx_payment_findMany_WorkerArgs, "findMany">
>;
type StoreTx_payment_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["payment"], "create">;
type StoreTx_payment_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["payment"], "create">;
type StoreTx_payment_create_ArgsCompatible = AssertEquivalent<StoreTx_payment_create_NodeArgs, StoreTx_payment_create_WorkerArgs>;
type StoreTx_payment_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["payment"], StoreTx_payment_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["payment"], StoreTx_payment_create_WorkerArgs, "create">
>;
type StoreTx_payment_update_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["payment"], "update">;
type StoreTx_payment_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["payment"], "update">;
type StoreTx_payment_update_ArgsCompatible = AssertEquivalent<StoreTx_payment_update_NodeArgs, StoreTx_payment_update_WorkerArgs>;
type StoreTx_payment_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["payment"], StoreTx_payment_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["payment"], StoreTx_payment_update_WorkerArgs, "update">
>;
type StoreTx_return_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["return"], "findUnique">;
type StoreTx_return_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["return"], "findUnique">;
type StoreTx_return_findUnique_ArgsCompatible = AssertEquivalent<StoreTx_return_findUnique_NodeArgs, StoreTx_return_findUnique_WorkerArgs>;
type StoreTx_return_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["return"], StoreTx_return_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["return"], StoreTx_return_findUnique_WorkerArgs, "findUnique">
>;
type StoreTx_return_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["return"], "updateMany">;
type StoreTx_return_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["return"], "updateMany">;
type StoreTx_return_updateMany_ArgsCompatible = AssertEquivalent<StoreTx_return_updateMany_NodeArgs, StoreTx_return_updateMany_WorkerArgs>;
type StoreTx_return_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["return"], StoreTx_return_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["return"], StoreTx_return_updateMany_WorkerArgs, "updateMany">
>;
type StoreTx_return_update_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["return"], "update">;
type StoreTx_return_update_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["return"], "update">;
type StoreTx_return_update_ArgsCompatible = AssertEquivalent<StoreTx_return_update_NodeArgs, StoreTx_return_update_WorkerArgs>;
type StoreTx_return_update_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["return"], StoreTx_return_update_NodeArgs, "update">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["return"], StoreTx_return_update_WorkerArgs, "update">
>;
type StoreTx_inventoryBalance_findUnique_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["inventoryBalance"], "findUnique">;
type StoreTx_inventoryBalance_findUnique_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["inventoryBalance"], "findUnique">;
type StoreTx_inventoryBalance_findUnique_ArgsCompatible = AssertEquivalent<StoreTx_inventoryBalance_findUnique_NodeArgs, StoreTx_inventoryBalance_findUnique_WorkerArgs>;
type StoreTx_inventoryBalance_findUnique_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["inventoryBalance"], StoreTx_inventoryBalance_findUnique_NodeArgs, "findUnique">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["inventoryBalance"], StoreTx_inventoryBalance_findUnique_WorkerArgs, "findUnique">
>;
type StoreTx_inventoryBalance_updateMany_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["inventoryBalance"], "updateMany">;
type StoreTx_inventoryBalance_updateMany_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["inventoryBalance"], "updateMany">;
type StoreTx_inventoryBalance_updateMany_ArgsCompatible = AssertEquivalent<StoreTx_inventoryBalance_updateMany_NodeArgs, StoreTx_inventoryBalance_updateMany_WorkerArgs>;
type StoreTx_inventoryBalance_updateMany_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["inventoryBalance"], StoreTx_inventoryBalance_updateMany_NodeArgs, "updateMany">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["inventoryBalance"], StoreTx_inventoryBalance_updateMany_WorkerArgs, "updateMany">
>;
type StoreTx_inventoryBalance_upsert_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["inventoryBalance"], "upsert">;
type StoreTx_inventoryBalance_upsert_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["inventoryBalance"], "upsert">;
type StoreTx_inventoryBalance_upsert_ArgsCompatible = AssertEquivalent<StoreTx_inventoryBalance_upsert_NodeArgs, StoreTx_inventoryBalance_upsert_WorkerArgs>;
type StoreTx_inventoryBalance_upsert_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["inventoryBalance"], StoreTx_inventoryBalance_upsert_NodeArgs, "upsert">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["inventoryBalance"], StoreTx_inventoryBalance_upsert_WorkerArgs, "upsert">
>;
type StoreTx_inventoryBalance_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["inventoryBalance"], "create">;
type StoreTx_inventoryBalance_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["inventoryBalance"], "create">;
type StoreTx_inventoryBalance_create_ArgsCompatible = AssertEquivalent<StoreTx_inventoryBalance_create_NodeArgs, StoreTx_inventoryBalance_create_WorkerArgs>;
type StoreTx_inventoryBalance_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["inventoryBalance"], StoreTx_inventoryBalance_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["inventoryBalance"], StoreTx_inventoryBalance_create_WorkerArgs, "create">
>;
type StoreTx_stockMovement_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["stockMovement"], "create">;
type StoreTx_stockMovement_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["stockMovement"], "create">;
type StoreTx_stockMovement_create_ArgsCompatible = AssertEquivalent<StoreTx_stockMovement_create_NodeArgs, StoreTx_stockMovement_create_WorkerArgs>;
type StoreTx_stockMovement_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["stockMovement"], StoreTx_stockMovement_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["stockMovement"], StoreTx_stockMovement_create_WorkerArgs, "create">
>;
type StoreTx_walletTransaction_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["walletTransaction"], "create">;
type StoreTx_walletTransaction_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["walletTransaction"], "create">;
type StoreTx_walletTransaction_create_ArgsCompatible = AssertEquivalent<StoreTx_walletTransaction_create_NodeArgs, StoreTx_walletTransaction_create_WorkerArgs>;
type StoreTx_walletTransaction_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["walletTransaction"], StoreTx_walletTransaction_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["walletTransaction"], StoreTx_walletTransaction_create_WorkerArgs, "create">
>;
type StoreTx_auditOutbox_create_NodeArgs = StoreNodePrisma.Args<StoreNodeTransaction["auditOutbox"], "create">;
type StoreTx_auditOutbox_create_WorkerArgs = StoreWorkerPrisma.Args<StoreWorkerTransaction["auditOutbox"], "create">;
type StoreTx_auditOutbox_create_ArgsCompatible = AssertEquivalent<StoreTx_auditOutbox_create_NodeArgs, StoreTx_auditOutbox_create_WorkerArgs>;
type StoreTx_auditOutbox_create_ResultsCompatible = AssertEquivalent<
  StoreNodePrisma.Result<StoreNodeTransaction["auditOutbox"], StoreTx_auditOutbox_create_NodeArgs, "create">,
  StoreWorkerPrisma.Result<StoreWorkerTransaction["auditOutbox"], StoreTx_auditOutbox_create_WorkerArgs, "create">
>;

/**
 * Root lifecycle and raw-query APIs are not part of the delegate contract.
 * Their signatures are checked separately because health and shutdown paths
 * use them outside model delegates.
 */
type MainRawQueryArgsCompatible = AssertEquivalent<
  Parameters<MainNodeClient["$queryRaw"]>,
  Parameters<MainWorkerClient["$queryRaw"]>
>;
type StoreRawQueryArgsCompatible = AssertEquivalent<
  Parameters<StoreNodeClient["$queryRaw"]>,
  Parameters<StoreWorkerClient["$queryRaw"]>
>;
type MainDisconnectCompatible = AssertEquivalent<
  ReturnType<MainNodeClient["$disconnect"]>,
  ReturnType<MainWorkerClient["$disconnect"]>
>;
type StoreDisconnectCompatible = AssertEquivalent<
  ReturnType<StoreNodeClient["$disconnect"]>,
  ReturnType<StoreWorkerClient["$disconnect"]>
>;
