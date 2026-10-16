import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { DesignConflictError } from "./service.server";

/** Zoals apiErrorResponse, maar met de actuele serverstaat bij een revisieconflict. */
export function designErrorResponse(error: unknown) {
  if (error instanceof DesignConflictError) {
    return NextResponse.json(
      { error: error.message, conflict: { revision: error.current.revision, formData: error.current.formData, updatedAt: error.current.updatedAt } },
      { status: 409 }
    );
  }
  return apiErrorResponse(error);
}
