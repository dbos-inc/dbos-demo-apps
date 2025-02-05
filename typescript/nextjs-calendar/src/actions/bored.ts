import { DBOSBored } from "@/dbos/operations";

export async function dbosBored() {
  return await DBOSBored.getActivity();
}