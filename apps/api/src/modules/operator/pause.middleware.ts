import type { RequestHandler } from "express";
import { pauseService, type Capability } from "./pause.service";

export function requirePilotActivity(capability: Capability): RequestHandler {
  return (_req, _res, next) => {
    pauseService.assertAvailable(capability).then(() => next(), next);
  };
}
