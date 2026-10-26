import * as fs from "fs";
import type { PackageJson } from "@/interfaces/package-info.js";

const raw = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");

export const PACKAGE_VERSION: string = (JSON.parse(raw) as PackageJson).version;
