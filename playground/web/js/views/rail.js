// The lesson rail (desktop, 1200 px and wider): a vertical list of the seven lessons and free play.
import { mountNav } from "./nav.js";

export function mountRail(ctx) {
  mountNav({ ...ctx, variant: "rail" });
}
