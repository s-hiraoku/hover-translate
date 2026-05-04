import { beforeEach } from "vitest";
import { installChromeMock } from "./chrome-mock";

beforeEach(() => {
  installChromeMock();
});
