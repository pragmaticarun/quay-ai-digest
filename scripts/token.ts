import { editorTokenPath, ensureEditorToken } from "../src/lib/auth";

const token = ensureEditorToken();
console.log(`Editor token file: ${editorTokenPath()}`);
console.log(token);
