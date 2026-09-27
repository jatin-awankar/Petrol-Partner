import type {PoolClient} from "pg";
import {AppError} from "../../shared/errors/app-error";
import {hasActiveRestriction} from "./account-restrictions.repo";

export async function assertNoAccountRestriction(client:PoolClient,userId:string,
  role:"driver"|"passenger"){
  if(await hasActiveRestriction(client,userId,role))
    throw new AppError(403,"Account travel permission is restricted",
    "ACCOUNT_RESTRICTED");
}
