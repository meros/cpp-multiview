// The lesson stepper (tablet and phone): the same list laid out as a horizontal row of numbered circles.
import { mountNav } from "./nav.js";

export function mountStepper(ctx) {
  mountNav({ ...ctx, variant: "stepper" });
}
