/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    OPENAI_API_KEY?: string;
    CONVEX_URL?: string;
    CONVEX_DEPLOY_KEY?: string;
    [key: string]: string | undefined;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
