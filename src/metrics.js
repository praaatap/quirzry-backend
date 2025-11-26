import client from "prom-client";

export const controllerCallCounter = new client.Counter({
  name: "api_controller_calls_total",
  help: "Total number of calls received by each API controller",
  labelNames: ["controller", "method", "status_code"],
});
