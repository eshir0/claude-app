import "server-only";
import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  code: string,
  message: string,
  fieldErrors?: unknown,
) {
  return NextResponse.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status },
  );
}
