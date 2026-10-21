import { App } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("找不到 #app");
new App(root);
