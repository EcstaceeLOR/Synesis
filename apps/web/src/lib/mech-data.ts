import {
  discoveredMechSchema,
  mechDirectorySchema,
  type DiscoveredMech,
  type MechDirectory,
} from "@synesis/domain";
import type { ViewState } from "@synesis/ui";

import { demoMechDirectory } from "./demo-data";

const apiOrigin = () =>
  process.env.SYNESIS_API_INTERNAL_URL ?? "http://localhost:4000";

export async function loadMechDirectory(): Promise<ViewState<MechDirectory>> {
  if (process.env.SYNESIS_MODE !== "live") {
    return {
      status: "ready",
      data: demoMechDirectory,
    };
  }
  try {
    const response = await fetch(new URL("/api/v1/mechs", apiOrigin()), {
      cache: "no-store",
    });
    if (!response.ok)
      return {
        status: "error",
        message: "The live Olas directory is temporarily unavailable.",
      };
    const directory = mechDirectorySchema.parse(await response.json());
    if (directory.mechs.length === 0)
      return {
        status: "empty",
        data: directory,
        message:
          "Olas returned no active Base Mechs. Nothing has been substituted.",
      };
    return directory.status === "degraded"
      ? {
          status: "partial",
          data: directory,
          message:
            "Some Mechs could not be fully inspected and have been excluded from selection.",
        }
      : { status: "ready", data: directory };
  } catch {
    return {
      status: "error",
      message:
        "The live Olas directory returned an invalid or unreachable response.",
    };
  }
}

export async function loadMech(
  address: string,
): Promise<ViewState<DiscoveredMech>> {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address))
    return { status: "empty", message: "That is not a full EVM Mech address." };
  if (process.env.SYNESIS_MODE !== "live") {
    const demoMech = demoMechDirectory.mechs.find(
      (mech) => mech.address.toLowerCase() === address.toLowerCase(),
    );
    return demoMech
      ? {
          status: "ready",
          data: demoMech,
        }
      : { status: "empty", message: "Mech not found in the demo snapshot." };
  }
  try {
    const response = await fetch(
      new URL(`/api/v1/mechs/${encodeURIComponent(address)}`, apiOrigin()),
      { cache: "no-store" },
    );
    if (response.status === 404)
      return {
        status: "empty",
        message: "This address is not in the current live Base discovery set.",
      };
    if (!response.ok) return { status: "error" };
    return {
      status: "ready",
      data: discoveredMechSchema.parse(await response.json()),
    };
  } catch {
    return {
      status: "error",
      message: "The live Mech profile could not be loaded.",
    };
  }
}
